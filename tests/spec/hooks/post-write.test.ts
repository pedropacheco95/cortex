/**
 * Spec-level tests — hooks.post-write under schema §5 v3.0 (row: "Nothing").
 *
 * The v2 anatomy fast-tier writeback (row refresh / append / flag) was removed
 * with the anatomy module at build-order-v3 step 7. The hook stays registered
 * — its registration is part of init's settings.json contract — and is a pure
 * no-op. Driven through the `cortex hook post-write` dispatch (runHook) with
 * raw stdin JSON, exactly as Claude Code invokes it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runHook } from '../../../src/hooks/cli.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeInsightEntry,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function stdinJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ session_id: 'spec-session', ...fields });
}

function postWriteStdin(root: string, filePath: string): string {
  return stdinJson({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: '(ignored — the hook does nothing)' },
    cwd: root,
  });
}

/** Recursive path → content snapshot of a directory tree. */
function snapshotDir(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string): void => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const stat = fs.lstatSync(p);
      if (stat.isDirectory()) walk(p);
      else out.set(p, fs.readFileSync(p, 'utf-8'));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** Fixture: initialised project with insight entries and real source files. */
function makeExtractedProject(label: string): string {
  const root = tmp(label);
  makeCortexProject(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  writeInsightEntry(root, 'src/a.ts', { purpose: 'Handles the A concern.' });
  return root;
}

describe('AC post-write.1: pure no-op — silent envelope on every input', () => {
  it('a Write that changed a tracked file → exit 0, empty stdout', async () => {
    const root = makeExtractedProject('po1');
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'y'.repeat(400)); // content now diverges from the entry
    const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('a Write creating a brand-new file → exit 0, empty stdout, no entry fabricated', async () => {
    const root = makeExtractedProject('po2');
    fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const fresh = true;\n');
    const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/new.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'anatomy', 'src', 'new.ts.md'))).toBe(false);
  });

  it('uninitialised project (no .cortex/) → exit 0, empty stdout', async () => {
    const root = tmp('po3');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const result = await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
  });

  it('crash-shaped stdin → exit 0, empty stdout', async () => {
    expect(await runHook('post-write', 'not even json')).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('post-write', '{}')).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('post-write', stdinJson({ tool_input: {} }))).toEqual({ exitCode: 0, stdout: '' });
  });
});

describe('AC post-write.2: zero filesystem effects — never creates or modifies anything', () => {
  it('the whole project tree is byte-identical after fires on changed, new, and excluded-looking paths', async () => {
    const root = makeExtractedProject('po4');
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'changed body');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'out.js'), 'built');
    const before = snapshotDir(root);
    for (const target of [
      path.join(root, 'src/a.ts'),
      path.join(root, 'src/never-created.ts'),
      path.join(root, 'dist/out.js'),
      '/etc/hosts',
    ]) {
      await runHook('post-write', postWriteStdin(root, target));
    }
    expect(snapshotDir(root)).toEqual(before);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('intra-commit change tracking is NOT this hook’s job any more (fast tier owns it): the insight entry stays stale', async () => {
    const root = makeExtractedProject('po5');
    const entryPath = path.join(root, '.cortex', 'insight', 'anatomy', 'src', 'a.ts.md');
    const entryBefore = fs.readFileSync(entryPath, 'utf-8');
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'totally new content the entry has never seen');
    await runHook('post-write', postWriteStdin(root, path.join(root, 'src/a.ts')));
    expect(fs.readFileSync(entryPath, 'utf-8')).toBe(entryBefore);
  });
});
