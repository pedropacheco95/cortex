/**
 * Atomic tests — hooks.post-write as the schema §5 v3.0 row specifies it:
 * "Nothing". The v2 anatomy fast-tier row writeback was removed with the
 * anatomy module (build-order-v3 step 7); the hook stays registered and is a
 * pure no-op — always exit 0, empty stdout, zero filesystem effects.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run } from '../../../src/hooks/post-write.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeInsightEntry,
} from '../../fixtures/hooks-harness.js';

const NOW = new Date('2026-07-02T15:30:00.000Z');
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(label);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function stdinFor(root: string, filePath: string, toolName = 'Write'): Record<string, unknown> {
  return {
    session_id: 's1',
    cwd: root,
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input:
      toolName === 'Edit'
        ? { file_path: filePath, old_string: 'a', new_string: 'b' }
        : { file_path: filePath, content: 'whatever was written' },
  };
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

describe('pure no-op: silent on every input (schema §5 v3 row: "Nothing")', () => {
  it('a fully initialised project with a changed file → exit 0, empty stdout', async () => {
    const root = tmp('noop-full');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.' });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'changed content');
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW })).toEqual({ exitCode: 0, stdout: '' });
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts'), 'Edit'), { now: NOW })).toEqual({ exitCode: 0, stdout: '' });
  });

  it('no .cortex/ at all → exit 0, empty stdout', async () => {
    const root = tmp('noop-bare');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    expect(await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW })).toEqual({ exitCode: 0, stdout: '' });
  });

  it('crash-shaped stdin (null, number, string, missing tool_input) → exit 0, empty stdout', async () => {
    const root = tmp('noop-garbage');
    makeCortexProject(root);
    for (const stdin of [null, 42, 'garbage', {}, { cwd: root }, { cwd: root, tool_input: {} }]) {
      expect(await run(stdin, { cwd: root, now: NOW })).toEqual({ exitCode: 0, stdout: '' });
    }
  });
});

describe('zero filesystem effects: never creates or modifies anything', () => {
  it('the whole project tree is byte-identical after a fire on a changed file', async () => {
    const root = tmp('noop-fs');
    makeCortexProject(root);
    writeInsightEntry(root, 'src/a.ts', { purpose: 'Does A.', sha256: 'b'.repeat(64) });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'content that no longer matches the entry sha');
    const before = snapshotDir(root);
    await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    await run(stdinFor(root, path.join(root, 'src/new.ts')), { now: NOW }); // even a brand-new path
    expect(snapshotDir(root)).toEqual(before);
  });

  it('no hook-errors entry, no pulse artefacts — not even on crash-shaped stdin', async () => {
    const root = tmp('noop-nolog');
    makeCortexProject(root);
    const before = snapshotDir(path.join(root, '.cortex'));
    await run(null, { cwd: root, now: NOW });
    await run({ cwd: root, tool_input: { file_path: 42 } }, { now: NOW });
    expect(snapshotDir(path.join(root, '.cortex'))).toEqual(before);
  });
});
