/**
 * Atomic tests — the §4.1 `purpose_source` provenance round across every
 * files.md writer: the 8-column row round-trip (emit → split → parse), the
 * scanner's docstring/placeholder/migration-backfill values, the fast tier's
 * carry-the-column rewrites, the deep tier's `scanner-llm` applies plus the
 * read-time trust-ordering guard, and the post-write hook's preserve/append
 * behaviour. Sandboxed tmp projects throughout.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  emitFilesMdRow,
  splitDataRowCells,
  parseFilesMdTable,
  purposeSourceCell,
  isDataRowShape,
  computeSha256,
  computeTokens,
  FILES_MD_TABLE_HEADER,
  FILES_MD_TABLE_SEP,
  FILES_MD_COLUMNS,
} from '../../../src/anatomy/files-md.js';
import { scan } from '../../../src/anatomy/scan.js';
import { runRefreshFast } from '../../../src/anatomy/refresh-fast.js';
import { collectPurposeWorklist, applyPurposeResults } from '../../../src/anatomy/refresh-deep.js';
import { run as postWrite } from '../../../src/hooks/post-write.js';
import {
  makeTmpDir,
  cleanTmp,
  gitInit,
  gitCommitAll,
  makeCortexSkeleton,
  readRows,
  row,
  filesMdPath,
  worklistPath,
} from '../../fixtures/anatomy-harness.js';

const TEST_TIMEOUT = 30_000;
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`psource-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const HEADER8 = FILES_MD_TABLE_HEADER;
const SEP8 = FILES_MD_TABLE_SEP;
const SEEN = '2026-06-30T14:00:00.000Z';

function writeFilesMdRaw(root: string, rows: string[]): void {
  const p = filesMdPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    `---\nkind: anatomy-files\nlast_full_scan: ${SEEN}\nfile_count: ${rows.length}\n---\n\n${[HEADER8, SEP8, ...rows].join('\n')}\n`,
  );
}

// ---------------------------------------------------------------------------
// 8-column round-trip (the coordinated parser/writer contract)
// ---------------------------------------------------------------------------

describe('8-column row round-trip: emit → split → parse', () => {
  it('emitFilesMdRow emits 8 cells and splitDataRowCells reads them back verbatim', () => {
    const line = emitFilesMdRow({
      path: 'src/a.ts',
      purpose: 'Does A.',
      tokens: 12,
      sha256: 'a'.repeat(64),
      lastSeen: SEEN,
      specLinksCell: 'core.a',
      needsPurposeRefresh: false,
      purposeSource: 'read-time',
    });
    const cells = splitDataRowCells(line);
    expect(cells).toHaveLength(FILES_MD_COLUMNS);
    expect(cells![7]).toBe('read-time');
    expect(purposeSourceCell(cells!)).toBe('read-time');
    expect(isDataRowShape(cells!)).toBe(true);
  });

  it('the header and separator constants both carry the purpose_source column', () => {
    expect(HEADER8).toContain('| purpose_source |');
    expect(HEADER8.split('|').filter((c) => c.trim()).length).toBe(FILES_MD_COLUMNS);
    expect(SEP8.split('|').filter((c) => c.trim()).length).toBe(FILES_MD_COLUMNS);
  });

  it('parseFilesMdTable accepts 8-column rows and tolerates legacy 7-column rows', () => {
    const raw =
      `---\nkind: anatomy-files\nlast_full_scan: ${SEEN}\n---\n\n` +
      [
        HEADER8,
        SEP8,
        `| src/a.ts | Does A. | 12 | ${'a'.repeat(64)} | ${SEEN} | - | false | docstring |`,
        `| src/legacy.ts | Old purpose. | 9 | ${'b'.repeat(64)} | ${SEEN} | - | false |`,
      ].join('\n') + '\n';
    const table = parseFilesMdTable(raw);
    expect(table).not.toBeNull();
    expect(table!.rowIdxByPath.has('src/a.ts')).toBe(true);
    expect(table!.rowIdxByPath.has('src/legacy.ts')).toBe(true);
    const legacyCells = splitDataRowCells(table!.lines[table!.rowIdxByPath.get('src/legacy.ts')!] ?? '');
    expect(purposeSourceCell(legacyCells!)).toBe('-'); // absent → the '-' empty state
  });

  it('parseFilesMdTable still rejects truly malformed rows (6 cells)', () => {
    const raw =
      `---\nkind: anatomy-files\nlast_full_scan: ${SEEN}\n---\n\n` +
      [HEADER8, SEP8, `| src/a.ts | Does A. | 12 | ${'a'.repeat(64)} | ${SEEN} | - |`].join('\n') + '\n';
    expect(parseFilesMdTable(raw)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scanner provenance (anatomy.scanner)
// ---------------------------------------------------------------------------

describe('scan: provenance per derivation path', () => {
  it('docstring-derived purpose → purpose_source: docstring; placeholder → "-"', async () => {
    const root = tmp('scan-doc');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'doc.ts'), '/** Documented module. */\nexport const d = 1;\n');
    fs.writeFileSync(path.join(root, 'src', 'bare.ts'), 'export const b = 2;\n');
    await scan(root);
    expect(row(root, 'src/doc.ts')?.purposeSource).toBe('docstring');
    expect(row(root, 'src/doc.ts')?.purpose).toBe('Documented module.');
    expect(row(root, 'src/bare.ts')?.purposeSource).toBe('-');
    expect(row(root, 'src/bare.ts')?.flagged).toBe(true);
  }, TEST_TIMEOUT);

  it('MIGRATION: cached legacy 7-column row with a real purpose is backfilled scanner-llm on scan', async () => {
    const root = tmp('scan-migrate');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    // Legacy pre-provenance cache row: real purpose, matching sha, NO 8th column.
    writeFilesMdRaw(root, [
      `| src/a.ts | Curated real purpose. | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | false |`,
    ]);
    await scan(root);
    const r = row(root, 'src/a.ts');
    expect(r?.purpose).toBe('Curated real purpose.'); // cache hit keeps the purpose
    expect(r?.purposeSource).toBe('scanner-llm'); // …and backfills provenance
  }, TEST_TIMEOUT);

  it('MIGRATION: cached 8-column row with "-" provenance and a real purpose is also backfilled', async () => {
    const root = tmp('scan-migrate8');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMdRaw(root, [
      `| src/a.ts | Curated real purpose. | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | false | - |`,
    ]);
    await scan(root);
    expect(row(root, 'src/a.ts')?.purposeSource).toBe('scanner-llm');
  }, TEST_TIMEOUT);

  it('cached placeholder rows are NOT backfilled (purpose_source stays "-")', async () => {
    const root = tmp('scan-placeholder');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMdRaw(root, [
      `| src/a.ts | (needs purpose) | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | true |`,
    ]);
    await scan(root);
    expect(row(root, 'src/a.ts')?.purposeSource).toBe('-');
    expect(row(root, 'src/a.ts')?.flagged).toBe(true);
  }, TEST_TIMEOUT);

  it('cached read-time provenance is retained on a cache hit (never downgraded by scan)', async () => {
    const root = tmp('scan-readtime');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMdRaw(root, [
      `| src/a.ts | Witnessed purpose. | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | false | read-time |`,
    ]);
    await scan(root);
    expect(row(root, 'src/a.ts')?.purposeSource).toBe('read-time');
    expect(row(root, 'src/a.ts')?.purpose).toBe('Witnessed purpose.');
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// fast tier (anatomy.refresh-fast)
// ---------------------------------------------------------------------------

describe('refresh-fast: the column rides along', () => {
  it('a changed row carries its purpose_source unchanged; a new file appends "-"', async () => {
    const root = tmp('fast-carry');
    makeCortexSkeleton(root);
    fs.writeFileSync(path.join(root, '.gitignore'), '.cortex/\n');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), '/** Does A. */\nexport const a = 1;\n');
    gitInit(root);
    gitCommitAll(root, 'baseline');
    await scan(root);
    // Mark the row read-time (as post-read would), then commit a change + a new file.
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    fs.writeFileSync(filesMdPath(root), before.replace('| docstring |', '| read-time |'));
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), '/** Does A. */\nexport const a = 2;\n');
    fs.writeFileSync(path.join(root, 'src', 'fresh.ts'), 'export const f = 1;\n');
    gitCommitAll(root, 'change + add');
    await runRefreshFast(root);
    const changed = row(root, 'src/a.ts');
    expect(changed?.flagged).toBe(true); // content moved → contest reset
    expect(changed?.purposeSource).toBe('read-time'); // …but provenance carried, not rewritten
    const fresh = row(root, 'src/fresh.ts');
    expect(fresh?.purpose).toBe('(needs purpose)');
    expect(fresh?.purposeSource).toBe('-');
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// deep tier (anatomy.refresh-deep)
// ---------------------------------------------------------------------------

describe('refresh-deep apply: provenance and trust ordering', () => {
  function seedProject(label: string, rows: (content: string) => string[]): { root: string; content: string } {
    const root = tmp(label);
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMdRaw(root, rows(content));
    return { root, content };
  }

  it('an applied purpose lands with purpose_source: scanner-llm', () => {
    const { root, content } = seedProject('deep-apply', (c) => [
      `| src/a.ts | (needs purpose) | ${computeTokens(c)} | ${computeSha256(c)} | ${SEEN} | - | true | - |`,
    ]);
    collectPurposeWorklist(root);
    const app = applyPurposeResults(root, [{ path: 'src/a.ts', purpose: 'Judged purpose.' }]);
    expect(app.applied).toBe(1);
    const r = row(root, 'src/a.ts');
    expect(r?.purpose).toBe('Judged purpose.');
    expect(r?.purposeSource).toBe('scanner-llm');
    expect(r?.flagged).toBe(false);
  });

  it('TRUST ORDERING: read-time + needs_purpose_refresh:false is NEVER overwritten by apply', () => {
    const { root, content } = seedProject('deep-trust', (c) => [
      `| src/a.ts | Witnessed purpose. | ${computeTokens(c)} | ${computeSha256(c)} | ${SEEN} | - | false | read-time |`,
    ]);
    // Handcrafted worklist naming the path with the row's own sha — even a
    // worklist that (wrongly) contains the row cannot force a lower-trust write.
    fs.mkdirSync(path.dirname(worklistPath(root)), { recursive: true });
    fs.writeFileSync(
      worklistPath(root),
      JSON.stringify({
        kind: 'purpose-worklist',
        generated: SEEN,
        batches: [[{ path: 'src/a.ts', tokens: computeTokens(content), excerpt: content, sha256: computeSha256(content) }]],
      }),
    );
    const before = fs.readFileSync(filesMdPath(root), 'utf-8');
    const app = applyPurposeResults(root, [{ path: 'src/a.ts', purpose: 'Lower-trust overwrite.' }]);
    expect(app.applied).toBe(0);
    expect(app.deferred).toBe(1);
    expect(fs.readFileSync(filesMdPath(root), 'utf-8')).toBe(before); // byte-identical
  });

  it('read-time + needs_purpose_refresh:true (content changed) IS overwritable — the contest resets to scanner-llm', () => {
    const { root } = seedProject('deep-reset', (c) => [
      `| src/a.ts | Witnessed purpose. | ${computeTokens(c)} | ${computeSha256(c)} | ${SEEN} | - | true | read-time |`,
    ]);
    collectPurposeWorklist(root);
    const app = applyPurposeResults(root, [{ path: 'src/a.ts', purpose: 'Re-derived after change.' }]);
    expect(app.applied).toBe(1);
    const r = row(root, 'src/a.ts');
    expect(r?.purpose).toBe('Re-derived after change.');
    expect(r?.purposeSource).toBe('scanner-llm');
  });
});

// ---------------------------------------------------------------------------
// post-write hook (hooks.post-write)
// ---------------------------------------------------------------------------

describe('post-write: preserves the column on rewrites, appends "-" on new rows', () => {
  it('a rewritten row keeps its read-time purpose_source', async () => {
    const root = tmp('pw-preserve');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMdRaw(root, [
      `| src/a.ts | Witnessed purpose. | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | false | read-time |`,
    ]);
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 42;\n'); // content moved
    const result = await postWrite({ cwd: root, tool_name: 'Write', tool_input: { file_path: path.join(root, 'src/a.ts') } });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const r = row(root, 'src/a.ts');
    expect(r?.flagged).toBe(true);
    expect(r?.purposeSource).toBe('read-time'); // preserved, not rewritten
    expect(r?.purpose).toBe('Witnessed purpose.');
  });

  it('a legacy 7-column row rewritten by post-write becomes 8-column with "-" provenance', async () => {
    const root = tmp('pw-legacy');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMdRaw(root, [
      `| src/a.ts | Old purpose. | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | false |`,
    ]);
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 42;\n');
    await postWrite({ cwd: root, tool_name: 'Write', tool_input: { file_path: path.join(root, 'src/a.ts') } });
    const r = row(root, 'src/a.ts');
    expect(splitDataRowCells(r!.raw)).toHaveLength(FILES_MD_COLUMNS);
    expect(r?.purposeSource).toBe('-'); // absent provenance carried as the empty state (scan backfills)
  });

  it('a new file appends an 8-column placeholder row ending in "-"', async () => {
    const root = tmp('pw-append');
    makeCortexSkeleton(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const content = 'export const a = 1;\n';
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), content);
    writeFilesMdRaw(root, [
      `| src/a.ts | Does A. | ${computeTokens(content)} | ${computeSha256(content)} | ${SEEN} | - | false | docstring |`,
    ]);
    fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'export const b = 2;\n');
    await postWrite({ cwd: root, tool_name: 'Write', tool_input: { file_path: path.join(root, 'src/b.ts') } });
    const r = row(root, 'src/b.ts');
    expect(r?.purpose).toBe('(needs purpose)');
    expect(r?.purposeSource).toBe('-');
    expect(splitDataRowCells(r!.raw)).toHaveLength(FILES_MD_COLUMNS);
  });
});
