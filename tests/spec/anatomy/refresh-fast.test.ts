/**
 * Spec-level tests — anatomy.refresh-fast, driven through the real CLI entry
 * (`run` in src/cli/cli.ts) over sandboxed tmp git fixtures with real commits
 * and a real scanner-produced anatomy. One describe per spec AC, plus the
 * Rule 1 invocation-surface pins (`cortex anatomy-refresh-fast` — the exact
 * string the installed git hook calls — and `cortex loop-anatomy-refresh
 * --fast` dispatching identically).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { run } from '../../../src/cli/cli.js';
import { GIT_HOOK_INVOCATION } from '../../../src/cli/init.js';
import { scan } from '../../../src/anatomy/scan.js';
import { validate } from '../../../src/schema/validate.js';
import { readHookErrorEntries } from '../../../src/hooks/errors.js';
import {
  makeTmpDir,
  cleanTmp,
  gitInit,
  gitCommitAll,
  makeCortexSkeleton,
  row,
  readRows,
  filesMdPath,
  graphPath,
  readGraph,
} from '../../fixtures/anatomy-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`fast-spec-${label}`);
  dirs.push(d);
  return d;
}

let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

function sha(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Git repo + committed src files + real scanner-produced anatomy artefacts. */
async function makeScannedRepo(label: string, files: Record<string, string>): Promise<string> {
  const root = tmp(label);
  makeCortexSkeleton(root);
  fs.writeFileSync(path.join(root, '.gitignore'), '.cortex/\n');
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  gitInit(root);
  gitCommitAll(root, 'baseline');
  await scan(root);
  return root;
}

async function anatomyViolations(root: string): Promise<string[]> {
  const report = await validate(root, { root });
  return report.violations
    .filter((v) => v.severity === 'error' && v.check.startsWith('check.anatomy'))
    .map((v) => `${v.check}: ${v.message}`);
}

describe('AC: commit-scoped refresh flags exactly the changed files', () => {
  it(
    'commit modifies src/a.ts to 400 chars → tokens 100, new sha256, fresh last_seen, flag true; src/b.ts row byte-identical',
    async () => {
      const root = await makeScannedRepo('ac1', {
        'src/a.ts': '/** Handles the A concern. */\nexport const a = 1;\n',
        'src/b.ts': '/** Handles the B concern. */\nexport const b = 2;\n',
      });
      const beforeA = row(root, 'src/a.ts');
      const beforeB = row(root, 'src/b.ts');
      const newContent = 'y'.repeat(400);
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), newContent);
      gitCommitAll(root, 'change a');

      process.chdir(root);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);

      const afterA = row(root, 'src/a.ts');
      expect(afterA?.tokens).toBe(100);
      expect(afterA?.sha256).toBe(sha(newContent));
      expect(afterA?.lastSeen).not.toBe(beforeA?.lastSeen);
      expect(Number.isNaN(Date.parse(afterA?.lastSeen ?? ''))).toBe(false);
      expect(afterA?.flagged).toBe(true);
      expect(row(root, 'src/b.ts')?.raw).toBe(beforeB?.raw);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: atomic row write (coordination regression)', () => {
  it(
    'the refreshed row moves as ONE write — full-row before/after: last_seen never moves alone, and never lags the other fields',
    async () => {
      const root = await makeScannedRepo('ac2', {
        'src/a.ts': '/** A. */\nexport const a = 1;\n',
        'src/b.ts': '/** B. */\nexport const b = 2;\n',
      });
      const before = new Map(readRows(root).map((r) => [r.path, r]));
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'z'.repeat(80));
      gitCommitAll(root, 'change a');

      process.chdir(root);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);

      for (const after of readRows(root)) {
        const prev = before.get(after.path);
        if (after.raw === prev?.raw) continue; // untouched rows: fully byte-identical
        // Any touched row carries EVERY touched field together with last_seen.
        expect(after.path).toBe('src/a.ts');
        expect(after.lastSeen).not.toBe(prev?.lastSeen);
        expect(after.sha256).not.toBe(prev?.sha256);
        expect(after.tokens).not.toBe(prev?.tokens);
        expect(after.flagged).toBe(true);
      }
      // No intermediate state observable on disk after the run: exactly one row moved.
      const movedRows = readRows(root).filter((r) => r.raw !== before.get(r.path)?.raw);
      expect(movedRows).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: added and deleted files handled', () => {
  it(
    'commit adds src/new.ts and deletes src/old.ts → placeholder row appended flagged, old row gone, no edge touches src/old.ts',
    async () => {
      const root = await makeScannedRepo('ac3', {
        'src/a.ts': 'import { o } from "./old";\nexport const a = o;\n',
        'src/old.ts': 'export const o = 1;\n',
      });
      expect(readGraph(root).edges.some((e) => e.to === 'src/old.ts')).toBe(true);
      fs.rmSync(path.join(root, 'src', 'old.ts'));
      fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const fresh = true;\n');
      gitCommitAll(root, 'add new, delete old');

      process.chdir(root);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);

      const added = row(root, 'src/new.ts');
      expect(added?.purpose).toBe('(needs purpose)');
      expect(added?.flagged).toBe(true);
      expect(row(root, 'src/old.ts')).toBeUndefined();
      const graph = readGraph(root);
      expect(graph.edges.some((e) => e.from === 'src/old.ts' || e.to === 'src/old.ts')).toBe(false);
      expect(graph.nodes).not.toContain('src/old.ts');
      expect(graph.nodes).toContain('src/new.ts');
    },
    TEST_TIMEOUT,
  );
});

describe('AC: edges replaced only for changed files', () => {
  it(
    "src/a.ts's outgoing edges reflect its new imports; src/c.ts's edges untouched; artefacts pass check.anatomy-*",
    async () => {
      const root = await makeScannedRepo('ac4', {
        'src/a.ts': 'import { b } from "./b";\nexport const a = b;\n',
        'src/b.ts': 'export const b = 2;\n',
        'src/c.ts': 'import { b } from "./b";\nexport const c = b;\n',
      });
      const edgesBefore = readGraph(root).edges;
      expect(edgesBefore).toContainEqual({ from: 'src/a.ts', to: 'src/b.ts', kind: 'import' });
      const cEdgesBefore = edgesBefore.filter((e) => e.from === 'src/c.ts');

      // a.ts now imports c.ts instead of b.ts.
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'import { c } from "./c";\nexport const a = c;\n');
      gitCommitAll(root, 'reroute a');

      process.chdir(root);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);

      const edgesAfter = readGraph(root).edges;
      expect(edgesAfter).toContainEqual({ from: 'src/a.ts', to: 'src/c.ts', kind: 'import' });
      expect(edgesAfter).not.toContainEqual({ from: 'src/a.ts', to: 'src/b.ts', kind: 'import' });
      expect(edgesAfter.filter((e) => e.from === 'src/c.ts')).toEqual(cEdgesBefore);

      expect(await anatomyViolations(root)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: hook-safe degradation', () => {
  it(
    'corrupt files.md → exit 0, nothing written to anatomy, one pulse/hook-errors.md entry',
    async () => {
      const root = await makeScannedRepo('ac5', { 'src/a.ts': 'export const a = 1;\n' });
      const corrupt = fs.readFileSync(filesMdPath(root), 'utf-8').slice(0, -60);
      fs.writeFileSync(filesMdPath(root), corrupt);
      const graphBefore = fs.readFileSync(graphPath(root), 'utf-8');
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 2;\n');
      gitCommitAll(root, 'change a');

      process.chdir(root);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);

      expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(corrupt);
      expect(fs.readFileSync(graphPath(root), 'utf-8')).toBe(graphBefore);
      const entries = readHookErrorEntries(root);
      expect(entries.filter((e) => e.includes('anatomy-refresh-fast') && e.includes('files.md'))).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});

describe('AC: non-repo and unscanned no-ops', () => {
  it('never-scanned project (no files.md) → exit 0, nothing written', async () => {
    const root = tmp('unscanned');
    makeCortexSkeleton(root);
    gitInit(root);
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
    gitCommitAll(root, 'baseline');
    process.chdir(root);
    expect(await run(['anatomy-refresh-fast'])).toBe(0);
    expect(fs.existsSync(filesMdPath(root))).toBe(false);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'hook-errors.md'))).toBe(false);
  });

  it(
    'non-git (and no-commit) project → exit 0, anatomy byte-identical',
    async () => {
      const root = tmp('norepo');
      makeCortexSkeleton(root);
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
      await scan(root);
      const before = fs.readFileSync(filesMdPath(root), 'utf-8');
      process.chdir(root);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);
      expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);

      // no commit yet: a fresh repo without HEAD is equally silent
      gitInit(root);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);
      expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
    },
    TEST_TIMEOUT,
  );
});

describe('Rule 1: both invocation names dispatch identically', () => {
  it('GIT_HOOK_INVOCATION is exactly "cortex anatomy-refresh-fast" and maps to the CLI branch', () => {
    expect(GIT_HOOK_INVOCATION).toBe('cortex anatomy-refresh-fast');
  });

  it(
    'cortex loop-anatomy-refresh --fast produces the same refresh as cortex anatomy-refresh-fast',
    async () => {
      const make = async (label: string): Promise<string> => {
        const root = await makeScannedRepo(label, { 'src/a.ts': '/** A. */\nexport const a = 1;\n' });
        fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'w'.repeat(120));
        gitCommitAll(root, 'change a');
        return root;
      };
      const rootHook = await make('alias-hook');
      const rootLoop = await make('alias-loop');

      process.chdir(rootHook);
      expect(await run(['anatomy-refresh-fast'])).toBe(0);
      process.chdir(rootLoop);
      expect(await run(['loop-anatomy-refresh', '--fast'])).toBe(0);

      const rowsHook = readRows(rootHook).map((r) => ({ ...r, lastSeen: '(t)', raw: '(raw)' }));
      const rowsLoop = readRows(rootLoop).map((r) => ({ ...r, lastSeen: '(t)', raw: '(raw)' }));
      expect(rowsLoop).toEqual(rowsHook);
      expect(row(rootLoop, 'src/a.ts')?.flagged).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it('loop-anatomy-refresh without --fast/--deep (or with both) is refused', async () => {
    const root = tmp('flags');
    makeCortexSkeleton(root);
    process.chdir(root);
    expect(await run(['loop-anatomy-refresh'])).toBe(1);
    expect(await run(['loop-anatomy-refresh', '--fast', '--deep'])).toBe(1);
  });
});
