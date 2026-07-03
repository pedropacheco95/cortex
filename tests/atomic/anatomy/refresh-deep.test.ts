/**
 * Atomic tests — anatomy.refresh-deep internals: batch chunking (≤25),
 * excerpt budgeting (~60 lines, char-capped), Rule 2 purpose validation and
 * sanitization, the Rule 3 mid-flight sha256 guard, and the atomic row write.
 * Sandboxed tmp fixtures over handcrafted files.md tables.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  chunkBatches,
  headExcerpt,
  validatePurposeResult,
  collectPurposeWorklist,
  applyPurposeResults,
  PURPOSE_BATCH_SIZE,
  EXCERPT_MAX_LINES,
  EXCERPT_MAX_CHARS,
  PURPOSE_MAX_CHARS,
} from '../../../src/anatomy/refresh-deep.js';
import type { PurposeWorklist } from '../../../src/anatomy/refresh-deep.js';
import { computeSha256, computeTokens } from '../../../src/anatomy/files-md.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexSkeleton,
  readRows,
  row,
  filesMdPath,
  worklistPath,
} from '../../fixtures/anatomy-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`deep-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const HEADER = '| path | purpose | tokens | sha256 | last_seen | spec_links | needs_purpose_refresh |';
const SEP = '|------|---------|--------|--------|-----------|------------|-----------------------|';

/** Fixture: real files on disk + a handcrafted files.md over them. */
function makeFlaggedProject(label: string, files: { rel: string; content: string; flagged: boolean }[]): string {
  const root = tmp(label);
  makeCortexSkeleton(root);
  const rows: string[] = [];
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f.rel)), { recursive: true });
    fs.writeFileSync(path.join(root, f.rel), f.content);
    rows.push(
      `| ${f.rel} | ${f.flagged ? '(needs purpose)' : 'Existing purpose.'} | ${computeTokens(f.content)} | ${computeSha256(f.content)} | 2026-06-30T14:00:00.000Z | - | ${f.flagged} |`,
    );
  }
  const anatomyDir = path.join(root, '.cortex', 'anatomy');
  fs.mkdirSync(anatomyDir, { recursive: true });
  fs.writeFileSync(
    path.join(anatomyDir, 'files.md'),
    `---\nkind: anatomy-files\nlast_full_scan: 2026-06-30T14:00:00.000Z\nfile_count: ${rows.length}\n---\n\n${[HEADER, SEP, ...rows].join('\n')}\n`,
  );
  return root;
}

function readWorklist(root: string): PurposeWorklist {
  return JSON.parse(fs.readFileSync(worklistPath(root), 'utf-8')) as PurposeWorklist;
}

// ---------------------------------------------------------------------------
// batch chunking (Rule 1)
// ---------------------------------------------------------------------------

describe('chunkBatches: ≤25 entries per batch', () => {
  it('60 entries → 3 batches of 25/25/10', () => {
    const batches = chunkBatches(Array.from({ length: 60 }, (_, i) => i));
    expect(batches.map((b) => b.length)).toEqual([25, 25, 10]);
    expect(PURPOSE_BATCH_SIZE).toBe(25);
  });

  it('0 entries → no batches; exactly 25 → one full batch', () => {
    expect(chunkBatches([])).toEqual([]);
    expect(chunkBatches(Array.from({ length: 25 }, (_, i) => i)).map((b) => b.length)).toEqual([25]);
  });
});

// ---------------------------------------------------------------------------
// excerpt budget
// ---------------------------------------------------------------------------

describe('headExcerpt: head ~60 lines, char-capped', () => {
  it('a 200-line file yields exactly the first 60 lines', () => {
    const content = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const excerpt = headExcerpt(content);
    expect(excerpt.split('\n')).toHaveLength(EXCERPT_MAX_LINES);
    expect(excerpt.startsWith('line 0\n')).toBe(true);
    expect(excerpt.endsWith('line 59')).toBe(true);
  });

  it('very long lines are capped at the char budget', () => {
    const excerpt = headExcerpt('x'.repeat(EXCERPT_MAX_CHARS * 3));
    expect(excerpt.length).toBe(EXCERPT_MAX_CHARS);
  });
});

// ---------------------------------------------------------------------------
// purpose validation + sanitization (Rule 2)
// ---------------------------------------------------------------------------

describe('validatePurposeResult: Rule 2 result grammar', () => {
  it('valid {path, purpose} passes through sanitized', () => {
    expect(validatePurposeResult({ path: 'src/a.ts', purpose: 'Does the A thing.' })).toEqual({
      path: 'src/a.ts',
      purpose: 'Does the A thing.',
    });
  });

  it('empty and whitespace-only purposes are invalid', () => {
    expect(validatePurposeResult({ path: 'src/a.ts', purpose: '' })).toBeNull();
    expect(validatePurposeResult({ path: 'src/a.ts', purpose: '   ' })).toBeNull();
  });

  it('multi-line purposes are invalid (skipped, never flattened)', () => {
    expect(validatePurposeResult({ path: 'src/a.ts', purpose: 'line one\nline two' })).toBeNull();
  });

  it('pipes and separator runs are sanitized to the row grammar', () => {
    const result = validatePurposeResult({ path: 'src/a.ts', purpose: 'a | b --- c' });
    expect(result?.purpose).toBe('a / b — c');
  });

  it('over-long purposes are capped at 120 chars', () => {
    const result = validatePurposeResult({ path: 'src/a.ts', purpose: 'p'.repeat(400) });
    expect(result?.purpose).toHaveLength(PURPOSE_MAX_CHARS);
  });

  it('missing/non-string path or purpose, and non-object results, are invalid', () => {
    expect(validatePurposeResult({ purpose: 'x' })).toBeNull();
    expect(validatePurposeResult({ path: 'src/a.ts' })).toBeNull();
    expect(validatePurposeResult({ path: 42, purpose: 'x' })).toBeNull();
    expect(validatePurposeResult('not an object')).toBeNull();
    expect(validatePurposeResult(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// collect internals
// ---------------------------------------------------------------------------

describe('collect: worklist entries carry path/tokens/excerpt + the collect-time sha256 guard', () => {
  it('flagged rows only; entries carry the guard hash', () => {
    const root = makeFlaggedProject('collect', [
      { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
      { rel: 'src/b.ts', content: 'export const b = 2;\n', flagged: false },
    ]);
    const result = collectPurposeWorklist(root);
    expect(result.flagged).toBe(1);
    const wl = readWorklist(root);
    expect(wl.kind).toBe('purpose-worklist');
    expect(wl.batches).toHaveLength(1);
    const entry = wl.batches[0]?.[0];
    expect(entry?.path).toBe('src/a.ts');
    expect(entry?.tokens).toBe(computeTokens('export const a = 1;\n'));
    expect(entry?.excerpt).toContain('export const a = 1;');
    expect(entry?.sha256).toBe(computeSha256('export const a = 1;\n'));
  });

  it('a flagged row whose file vanished is skipped (stays flagged for the next cycle)', () => {
    const root = makeFlaggedProject('vanish', [
      { rel: 'src/gone.ts', content: 'export const g = 1;\n', flagged: true },
    ]);
    fs.rmSync(path.join(root, 'src', 'gone.ts'));
    const result = collectPurposeWorklist(root);
    expect(result.flagged).toBe(0);
    expect(readWorklist(root).batches).toEqual([]);
    expect(row(root, 'src/gone.ts')?.flagged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// apply internals: mid-flight guard + atomic row write
// ---------------------------------------------------------------------------

describe('apply: Rule 3 mid-flight sha256 guard', () => {
  it('row sha moved after collect → deferred, row byte-untouched, still flagged', () => {
    const root = makeFlaggedProject('guard', [
      { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
    ]);
    collectPurposeWorklist(root);
    // Simulate the fast tier refreshing the row mid-flight (new sha).
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    const moved = before.replace(computeSha256('export const a = 1;\n'), computeSha256('changed content'));
    fs.writeFileSync(filesMdPath(root), moved);

    const app = applyPurposeResults(root, [{ path: 'src/a.ts', purpose: 'Fresh purpose.' }]);
    expect(app.deferred).toBe(1);
    expect(app.applied).toBe(0);
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(moved);
    expect(row(root, 'src/a.ts')?.flagged).toBe(true);
  });

  it('a row already un-flagged since collect is deferred, not overwritten', () => {
    const root = makeFlaggedProject('unflagged', [
      { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
    ]);
    collectPurposeWorklist(root);
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    fs.writeFileSync(filesMdPath(root), before.replace('| true |', '| false |'));
    const snapshot = fs.readFileSync(filesMdPath(root), 'utf-8');
    const app = applyPurposeResults(root, [{ path: 'src/a.ts', purpose: 'Late purpose.' }]);
    expect(app.deferred).toBe(1);
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(snapshot);
  });
});

describe('apply: atomic row write (coordination pin)', () => {
  it('purpose + flag false + fresh last_seen land in ONE row; sha/tokens/spec_links untouched; siblings byte-identical', () => {
    const root = makeFlaggedProject('atomic', [
      { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
      { rel: 'src/b.ts', content: 'export const b = 2;\n', flagged: false },
    ]);
    collectPurposeWorklist(root);
    const beforeA = row(root, 'src/a.ts');
    const beforeB = row(root, 'src/b.ts');

    const app = applyPurposeResults(root, [{ path: 'src/a.ts', purpose: 'Owns the A concern.' }]);
    expect(app.applied).toBe(1);

    const afterA = row(root, 'src/a.ts');
    expect(afterA?.purpose).toBe('Owns the A concern.');
    expect(afterA?.flagged).toBe(false);
    expect(afterA?.lastSeen).not.toBe(beforeA?.lastSeen);
    expect(Number.isNaN(Date.parse(afterA?.lastSeen ?? ''))).toBe(false);
    expect(afterA?.sha256).toBe(beforeA?.sha256);
    expect(afterA?.tokens).toBe(beforeA?.tokens);
    expect(afterA?.specLinks).toBe(beforeA?.specLinks);
    expect(row(root, 'src/b.ts')?.raw).toBe(beforeB?.raw);
    // Exactly one row moved — no intermediate/partial state on disk.
    expect(readRows(root).filter((r) => r.raw !== (r.path === 'src/a.ts' ? beforeA?.raw : beforeB?.raw))).toHaveLength(1);
  });

  it('unknown paths and duplicate results are skipped and counted', () => {
    const root = makeFlaggedProject('unknown', [
      { rel: 'src/a.ts', content: 'export const a = 1;\n', flagged: true },
    ]);
    collectPurposeWorklist(root);
    const app = applyPurposeResults(root, [
      { path: 'src/a.ts', purpose: 'First wins.' },
      { path: 'src/a.ts', purpose: 'Duplicate loses.' },
      { path: 'src/never-seen.ts', purpose: 'No such row.' },
    ]);
    expect(app.applied).toBe(1);
    expect(app.skipped).toBe(2);
    expect(row(root, 'src/a.ts')?.purpose).toBe('First wins.');
  });
});
