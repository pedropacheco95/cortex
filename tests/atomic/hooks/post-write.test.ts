/**
 * Atomic tests — hooks.post-write (fast-tier row refresh, byte-identity
 * guarantees, exclusions, silence/corruption degradation paths).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { run } from '../../../src/hooks/post-write.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeFilesMd,
  readFilesMdRows,
  hookErrorsPath,
} from '../../fixtures/hooks-harness.js';

const NOW = new Date('2026-07-02T15:30:00.000Z');
const OLD_SEEN = '2026-06-30T14:00:00.000Z';
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(label);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function sha(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function row(p: string, purpose: string, contentSha: string, flagged = false, specLinks = '-', purposeSource = 'scanner-llm'): string {
  return `| ${p} | ${purpose} | 10 | ${contentSha} | ${OLD_SEEN} | ${specLinks} | ${flagged} | ${purposeSource} |`;
}

function stdinFor(root: string, filePath: string, toolName = 'Write'): Record<string, unknown> {
  return {
    session_id: 's1',
    cwd: root,
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input:
      toolName === 'Edit'
        ? { file_path: filePath, old_string: 'a', new_string: 'b' }
        : { file_path: filePath, content: 'ignored — the hook reads disk state' },
  };
}

function filesMdPath(root: string): string {
  return path.join(root, '.cortex', 'anatomy', 'files.md');
}

describe('changed file → fast-tier row refresh (Rule 3)', () => {
  it('recomputes tokens (chars/4), sha256, last_seen and flags needs_purpose_refresh', async () => {
    const root = tmp('refresh');
    makeCortexProject(root);
    const content = 'x'.repeat(400);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMd(root, [row('src/a.ts', 'Does things.', sha('OLD CONTENT'), false, 'core-cli.init')]);

    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });

    const rows = readFilesMdRows(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokens).toBe(100);
    expect(rows[0]?.sha256).toBe(sha(content));
    expect(rows[0]?.lastSeen).toBe(NOW.toISOString());
    expect(rows[0]?.flagged).toBe(true);
    // purpose and spec_links survive the fast tier untouched:
    expect(rows[0]?.purpose).toBe('Does things.');
    expect(rows[0]?.specLinks).toBe('core-cli.init');
  });

  it('Edit tool also refreshes from disk state', async () => {
    const root = tmp('edit');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'new body');
    writeFilesMd(root, [row('src/a.ts', 'P.', sha('old body'))]);
    await run(stdinFor(root, path.join(root, 'src/a.ts'), 'Edit'), { now: NOW });
    expect(readFilesMdRows(root)[0]?.sha256).toBe(sha('new body'));
  });

  it('other rows stay byte-identical when one row changes', async () => {
    const root = tmp('otherrows');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'changed');
    fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'stable');
    const bRow = row('src/b.ts', 'Stable file.', sha('stable'));
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('old')), bRow]);
    await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toContain(bRow);
  });

  it('frontmatter (last_full_scan) is never rewritten by the fast tier', async () => {
    const root = tmp('frontmatter');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'changed');
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('old'))]);
    await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toContain(`last_full_scan: ${OLD_SEEN}`);
  });
});

describe('unchanged content is a no-op (Rule 4)', () => {
  it('sha match → files.md byte-identical, flag and last_seen untouched', async () => {
    const root = tmp('unchanged');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'same');
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('same'), false)]);
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
  });
});

describe('new files are appended (Rule 5)', () => {
  it('appends a placeholder row with needs_purpose_refresh: true', async () => {
    const root = tmp('append');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'existing');
    fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'brand new file');
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('existing'))]);
    await run(stdinFor(root, path.join(root, 'src/new.ts')), { now: NOW });
    const rows = readFilesMdRows(root);
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/new.ts']);
    const added = rows[1];
    expect(added?.purpose).toBe('(needs purpose)');
    expect(added?.flagged).toBe(true);
    expect(added?.sha256).toBe(sha('brand new file'));
    expect(added?.specLinks).toBe('-');
  });
});

describe('exclusions are a no-op (Rule 6)', () => {
  it('.gitignore-matched path → files.md byte-identical', async () => {
    const root = tmp('gitignore');
    makeCortexProject(root);
    fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'out.js'), 'built');
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('x'))]);
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    await run(stdinFor(root, path.join(root, 'dist/out.js')), { now: NOW });
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
  });

  it('anatomy.exclude-matched path → no-op', async () => {
    const root = tmp('configexclude');
    makeCortexProject(root, {
      config: { schemaVersion: '1.0', anatomy: { exclude: ['generated/**'] } },
    });
    fs.mkdirSync(path.join(root, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(root, 'generated', 'g.ts'), 'gen');
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('x'))]);
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    await run(stdinFor(root, path.join(root, 'generated/g.ts')), { now: NOW });
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
  });

  it('path outside the project root → no-op', async () => {
    const root = tmp('outside');
    const elsewhere = tmp('elsewhere');
    makeCortexProject(root);
    fs.writeFileSync(path.join(elsewhere, 'x.ts'), 'outside');
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('x'))]);
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    await run(stdinFor(root, path.join(elsewhere, 'x.ts')), { now: NOW });
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
  });

  it('hard-excluded segment (.cortex itself) → no-op', async () => {
    const root = tmp('hardexcl');
    makeCortexProject(root);
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('x'))]);
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    await run(stdinFor(root, path.join(root, '.cortex/anatomy/files.md')), { now: NOW });
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
  });
});

describe('missing substrate is silence, corruption is a log (Rule 7)', () => {
  it('no anatomy/files.md → silent no-op: nothing created, NO pulse entry', async () => {
    const root = tmp('unscanned');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(filesMdPath(root))).toBe(false);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('no .cortex/ at all → silent no-op', async () => {
    const root = tmp('nocortex');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
  });

  it('corrupt files.md → byte-identical, exit 0, hook-errors entry names the hook and failure', async () => {
    const root = tmp('corrupt');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const corrupt =
      '---\nkind: anatomy-files\nlast_full_scan: 2026-06-30T14:00:00.000Z\n---\n\n' +
      '| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh | purpose_source |\n' +
      '|------|---------|--------|--------|-----------|------------|-----------------------|----------------|\n' +
      '| src/a.ts | truncated row | 12 | abc\n'; // truncated: 4 cells, no closing pipes
    const p = filesMdPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, corrupt);
    const result = await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(p, 'utf-8')).toBe(corrupt);
    const log = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    expect(log).toContain('hook: post-write');
    expect(log).toContain('files.md');
    expect(log).toContain('could not be parsed');
  });

  it('files.md with wrong kind header → treated as corrupt, never written', async () => {
    const root = tmp('wrongkind');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    const p = filesMdPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const content = '---\nkind: something-else\n---\n\n| path | x |\n';
    fs.writeFileSync(p, content);
    await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(fs.readFileSync(p, 'utf-8')).toBe(content);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(true);
  });
});

describe('no graph or purpose work in the fast tier (Rule 3)', () => {
  it('graph.json byte-identical; purpose text unchanged; only the flag flips', async () => {
    const root = tmp('nograph');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'import "./b";\nnew content');
    writeFilesMd(root, [row('src/a.ts', 'Original purpose.', sha('old'))]);
    const graphPath = path.join(root, '.cortex', 'anatomy', 'graph.json');
    const graph = JSON.stringify({ nodes: ['src/a.ts'], edges: [] }, null, 2);
    fs.writeFileSync(graphPath, graph);
    await run(stdinFor(root, path.join(root, 'src/a.ts')), { now: NOW });
    expect(fs.readFileSync(graphPath, 'utf-8')).toBe(graph);
    const rows = readFilesMdRows(root);
    expect(rows[0]?.purpose).toBe('Original purpose.');
    expect(rows[0]?.flagged).toBe(true);
  });
});

describe('always silent (Rule 2)', () => {
  it('every path returns exit 0 and empty stdout', async () => {
    const root = tmp('silent');
    makeCortexProject(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    writeFilesMd(root, [row('src/a.ts', 'A.', sha('old'))]);
    for (const target of [path.join(root, 'src/a.ts'), path.join(root, 'nope/missing.ts')]) {
      const result = await run(stdinFor(root, target), { now: NOW });
      expect(result).toEqual({ exitCode: 0, stdout: '' });
    }
    // even with garbage stdin:
    expect(await run(null, { cwd: root })).toEqual({ exitCode: 0, stdout: '' });
    expect(await run({ cwd: root, tool_input: {} })).toEqual({ exitCode: 0, stdout: '' });
  });
});
