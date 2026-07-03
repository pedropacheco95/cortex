/**
 * Atomic tests — anatomy.refresh-fast internals: git diff-tree name-status
 * parsing (renames → delete+add), Rule 5 edge replacement scoping, Rule 2
 * exclusion filtering, Rule 4 atomic row writes, and the unchanged-hash
 * byte-identity guarantee. Sandboxed tmp git fixtures with real commits.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseNameStatus, replaceEdges, runRefreshFast } from '../../../src/anatomy/refresh-fast.js';
import type { GraphEdge } from '../../../src/anatomy/refresh-fast.js';
import { scan } from '../../../src/anatomy/scan.js';
import { readHookErrorEntries } from '../../../src/hooks/errors.js';
import {
  makeTmpDir,
  cleanTmp,
  gitInit,
  gitCommitAll,
  makeCortexSkeleton,
  readRows,
  row,
  filesMdPath,
  graphPath,
} from '../../fixtures/anatomy-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`fast-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** Git repo + committed src files + a real scanner-produced anatomy. */
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

// ---------------------------------------------------------------------------
// diff-tree parsing
// ---------------------------------------------------------------------------

describe('parseNameStatus: git diff-tree --name-status output', () => {
  it('M and A land in changed, D in deleted; blank lines ignored', () => {
    const scope = parseNameStatus('M\tsrc/a.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\n\n');
    expect(scope.changed).toEqual(['src/a.ts', 'src/new.ts']);
    expect(scope.deleted).toEqual(['src/old.ts']);
  });

  it('renames (R<score>, two paths) are treated as delete(old) + add(new)', () => {
    const scope = parseNameStatus('R100\tsrc/old-name.ts\tsrc/new-name.ts\n');
    expect(scope.deleted).toEqual(['src/old-name.ts']);
    expect(scope.changed).toEqual(['src/new-name.ts']);
  });

  it('copies (C<score>) add the destination and keep the source', () => {
    const scope = parseNameStatus('C75\tsrc/a.ts\tsrc/copy.ts\n');
    expect(scope.changed).toEqual(['src/copy.ts']);
    expect(scope.deleted).toEqual([]);
  });

  it('unknown statuses and malformed lines are ignored', () => {
    const scope = parseNameStatus('X\tsrc/weird.ts\nnot-a-status-line\nM\n');
    expect(scope.changed).toEqual([]);
    expect(scope.deleted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// edge replacement scoping (Rule 5)
// ---------------------------------------------------------------------------

describe('replaceEdges: only changed-from edges replaced, deleted endpoints dropped', () => {
  const edges: GraphEdge[] = [
    { from: 'src/a.ts', to: 'src/b.ts', kind: 'import' },
    { from: 'src/c.ts', to: 'src/b.ts', kind: 'import' },
    { from: 'src/c.ts', to: 'src/old.ts', kind: 'import' },
    { from: 'src/old.ts', to: 'src/b.ts', kind: 'import' },
  ];

  it('edges from unchanged files survive byte-identically; changed-from edges are replaced', () => {
    const next = replaceEdges(
      edges,
      new Set(['src/a.ts']),
      new Set(),
      [{ from: 'src/a.ts', to: 'src/d.ts', kind: 'import' }],
    );
    expect(next).toContainEqual({ from: 'src/a.ts', to: 'src/d.ts', kind: 'import' });
    expect(next).not.toContainEqual({ from: 'src/a.ts', to: 'src/b.ts', kind: 'import' });
    expect(next.filter((e) => e.from === 'src/c.ts')).toHaveLength(2);
  });

  it('deleted files lose every edge — from AND to — even in fresh results', () => {
    const next = replaceEdges(edges, new Set(), new Set(['src/old.ts']), [
      { from: 'src/a.ts', to: 'src/old.ts', kind: 'import' },
    ]);
    expect(next.some((e) => e.from === 'src/old.ts' || e.to === 'src/old.ts')).toBe(false);
  });

  it('output is sorted by from, then to (scanner determinism convention)', () => {
    const next = replaceEdges(edges, new Set(), new Set(), [{ from: 'src/0.ts', to: 'src/z.ts', kind: 'import' }]);
    const keys = next.map((e) => `${e.from} ${e.to}`);
    expect(keys).toEqual([...keys].sort());
  });
});

// ---------------------------------------------------------------------------
// exclusion filtering (Rule 2)
// ---------------------------------------------------------------------------

describe('exclusion filtering: ignored paths in the commit never touch anatomy', () => {
  it(
    'a commit touching only a .gitignore-excluded file leaves files.md byte-identical',
    async () => {
      const root = await makeScannedRepo('excl', { 'src/a.ts': 'export const a = 1;\n' });
      fs.appendFileSync(path.join(root, '.gitignore'), 'vendor/\n');
      fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
      fs.writeFileSync(path.join(root, 'vendor', 'lib.js'), 'ignored');
      gitCommitAll(root, 'vendor only'); // commits .gitignore (dotfile) + vendor/lib.js (ignored)
      const before = fs.readFileSync(filesMdPath(root), 'utf-8');
      expect(await runRefreshFast(root)).toBe(0);
      // vendor/lib.js is .gitignore-excluded and .gitignore itself is a dotfile
      // (scanner dot:false scope) → nothing in the commit is anatomy scope.
      expect(row(root, 'vendor/lib.js')).toBeUndefined();
      expect(row(root, '.gitignore')).toBeUndefined();
      expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
    },
    TEST_TIMEOUT,
  );

  it(
    'anatomy.exclude config patterns are honoured too',
    async () => {
      const root = await makeScannedRepo('excl-cfg', { 'src/a.ts': 'export const a = 1;\n' });
      fs.writeFileSync(
        path.join(root, '.cortex', 'cortex.config.json'),
        JSON.stringify({ schemaVersion: '1.0', anatomy: { exclude: ['generated/**'] } }, null, 2),
      );
      fs.mkdirSync(path.join(root, 'generated'), { recursive: true });
      fs.writeFileSync(path.join(root, 'generated', 'out.ts'), 'export const g = 1;\n');
      gitCommitAll(root, 'generated only');
      expect(await runRefreshFast(root)).toBe(0);
      expect(row(root, 'generated/out.ts')).toBeUndefined();
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// atomic row writes (Rule 4) + unchanged-hash byte identity
// ---------------------------------------------------------------------------

describe('atomic row write: last_seen moves only together with the other touched fields', () => {
  it(
    'changed row re-emitted once with tokens+sha256+flag+last_seen; unchanged rows byte-identical',
    async () => {
      const root = await makeScannedRepo('atomic', {
        'src/a.ts': '/** A. */\nexport const a = 1;\n',
        'src/b.ts': '/** B. */\nexport const b = 2;\n',
      });
      const beforeA = row(root, 'src/a.ts');
      const beforeB = row(root, 'src/b.ts');
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x'.repeat(200));
      gitCommitAll(root, 'change a');
      expect(await runRefreshFast(root)).toBe(0);

      const afterA = row(root, 'src/a.ts');
      const afterB = row(root, 'src/b.ts');
      // The full row moved as ONE write: every cheap field plus last_seen.
      expect(afterA?.tokens).toBe(50);
      expect(afterA?.sha256).not.toBe(beforeA?.sha256);
      expect(afterA?.lastSeen).not.toBe(beforeA?.lastSeen);
      expect(afterA?.flagged).toBe(true);
      expect(afterA?.purpose).toBe(beforeA?.purpose); // untouched fields carried
      expect(afterA?.specLinks).toBe(beforeA?.specLinks);
      // The untouched sibling row is byte-identical (no lone last_seen stamp).
      expect(afterB?.raw).toBe(beforeB?.raw);
    },
    TEST_TIMEOUT,
  );

  it(
    'a committed file whose recorded hash already matches stays byte-identical (no lone last_seen)',
    async () => {
      // scan() ran AFTER the baseline commit, so HEAD's files match files.md.
      const root = await makeScannedRepo('nochange', { 'src/a.ts': 'export const a = 1;\n' });
      const before = fs.readFileSync(filesMdPath(root), 'utf-8');
      expect(await runRefreshFast(root)).toBe(0);
      expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before);
    },
    TEST_TIMEOUT,
  );
});

describe('new-file append follows scanner/post-write conventions', () => {
  it(
    'appended row: placeholder purpose, "-" spec_links, flag true',
    async () => {
      const root = await makeScannedRepo('append', { 'src/a.ts': 'export const a = 1;\n' });
      fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const fresh = true;\n');
      gitCommitAll(root, 'add new');
      expect(await runRefreshFast(root)).toBe(0);
      const added = row(root, 'src/new.ts');
      expect(added?.purpose).toBe('(needs purpose)');
      expect(added?.specLinks).toBe('-');
      expect(added?.flagged).toBe(true);
      expect(/^[0-9a-f]{64}$/.test(added?.sha256 ?? '')).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

describe('corrupt graph.json degrades: files.md still refreshed, pulse entry, exit 0', () => {
  it(
    'unparseable graph.json → row refresh happens, graph untouched, hook-errors names it',
    async () => {
      const root = await makeScannedRepo('badgraph', { 'src/a.ts': 'export const a = 1;\n' });
      fs.writeFileSync(graphPath(root), '{not json');
      fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 2;\n');
      gitCommitAll(root, 'change a');
      expect(await runRefreshFast(root)).toBe(0);
      expect(row(root, 'src/a.ts')?.flagged).toBe(true);
      expect(fs.readFileSync(graphPath(root), 'utf-8')).toBe('{not json');
      const entries = readHookErrorEntries(root);
      expect(entries.some((e) => e.includes('anatomy-refresh-fast') && e.includes('graph.json'))).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

describe('rename in a real commit lands as delete+add through the full runner', () => {
  it(
    'git mv → old row gone, new row appended flagged',
    async () => {
      const root = await makeScannedRepo('rename', { 'src/old-name.ts': 'export const v = 1;\n' });
      expect(row(root, 'src/old-name.ts')).toBeDefined();
      fs.renameSync(path.join(root, 'src', 'old-name.ts'), path.join(root, 'src', 'new-name.ts'));
      gitCommitAll(root, 'rename');
      expect(await runRefreshFast(root)).toBe(0);
      expect(row(root, 'src/old-name.ts')).toBeUndefined();
      const renamed = row(root, 'src/new-name.ts');
      expect(renamed?.flagged).toBe(true);
      expect(readRows(root).filter((r) => r.path === 'src/new-name.ts')).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});
