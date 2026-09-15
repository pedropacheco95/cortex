/**
 * Atomic tests for the insight fast tier (spec insight.refresh-loops Rules 1,
 * 2, 7): worklist correctness on a fixture git repo, ledger-sha comparison
 * with the structural filter ruling out cosmetic commits, hook safety, and
 * the no-LLM / ledger-untouched guarantees.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  makeTmpDir,
  cleanTmp,
  gitInit,
  gitCommitAll,
  headShort,
  writeConfig,
  writeLedgerFor,
} from '../../fixtures/insight-refresh-harness.js';
import {
  runInsightRefreshFast,
  readWorklist,
  INSIGHT_WORKLIST_FILE,
} from '../../../src/insight/refresh-fast.js';

// The recall compiler, wrapped so one test can make it throw (spec Rule 9's
// degradation path); every other call goes straight to the real writer.
const recallStub = vi.hoisted(() => ({ fail: null as Error | null }));
vi.mock('../../../src/recall/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/recall/index.js')>();
  return {
    ...actual,
    writeRecallIndex: async (root: string) => {
      if (recallStub.fail !== null) throw recallStub.fail;
      return actual.writeRecallIndex(root);
    },
  };
});

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`insight-fast-${label}`);
  dirs.push(d);
  return d;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

/** Repo with two committed source files, extracted at the baseline commit. */
function makeProject(label: string): { root: string; baseline: string } {
  const root = tmp(label);
  gitInit(root);
  writeConfig(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function a() {\n  return 1;\n}\n', 'utf-8');
  fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'export function b() {\n  return 2;\n}\n', 'utf-8');
  gitCommitAll(root, 'baseline');
  const baseline = headShort(root);
  writeLedgerFor(root, [{ path: 'src/a.ts', level: 3 }, { path: 'src/b.ts', level: 2 }], baseline);
  return { root, baseline };
}

describe('fast tier: a commit flags the right files, no LLM, ledger untouched (spec AC 1)', () => {
  it('a real change to src/a.ts is flagged; untouched src/b.ts is not; ledger.json byte-identical', async () => {
    const { root } = makeProject('flags');
    const ledgerPath = path.join(root, '.cortex', 'insight', 'ledger.json');
    const ledgerBefore = fs.readFileSync(ledgerPath, 'utf-8');

    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function a() {\n  return 999;\n}\n', 'utf-8');
    gitCommitAll(root, 'change a');

    expect(await runInsightRefreshFast(root)).toBe(0);
    const flagged = readWorklist(root);
    expect(flagged.map((f) => f.path)).toEqual(['src/a.ts']);
    // Ledger is NOT updated by the fast tier — that happens on re-extraction.
    expect(fs.readFileSync(ledgerPath, 'utf-8')).toBe(ledgerBefore);
  });

  it('a formatting-only commit is ruled out by the structural filter — nothing flagged', async () => {
    const { root } = makeProject('cosmetic');
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function a()\n{\n    return 1;\n}\n', 'utf-8');
    gitCommitAll(root, 'reformat a');

    expect(await runInsightRefreshFast(root)).toBe(0);
    expect(readWorklist(root)).toEqual([]);
  });

  it('a commit that restores the extracted content clears an earlier flag (sha back in sync)', async () => {
    const { root } = makeProject('sync');
    const original = fs.readFileSync(path.join(root, 'src', 'a.ts'), 'utf-8');
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export function a() {\n  return 42;\n}\n', 'utf-8');
    gitCommitAll(root, 'change a');
    await runInsightRefreshFast(root);
    expect(readWorklist(root).map((f) => f.path)).toEqual(['src/a.ts']);

    fs.writeFileSync(path.join(root, 'src', 'a.ts'), original, 'utf-8');
    gitCommitAll(root, 'revert a');
    await runInsightRefreshFast(root);
    expect(readWorklist(root)).toEqual([]);
  });

  it('a new file (no ledger entry) is flagged "new"; a deleted extracted file is flagged "deleted"', async () => {
    const { root } = makeProject('new-del');
    fs.writeFileSync(path.join(root, 'src', 'c.ts'), 'export const c = 3;\n', 'utf-8');
    fs.rmSync(path.join(root, 'src', 'b.ts'));
    gitCommitAll(root, 'add c, delete b');

    await runInsightRefreshFast(root);
    const flagged = readWorklist(root);
    expect(flagged).toEqual([
      { path: 'src/b.ts', reason: 'deleted', detail: expect.any(String) },
      { path: 'src/c.ts', reason: 'new', detail: expect.any(String) },
    ]);
  });

  it('a new-export commit is flagged with the significant reason (L3 heuristics carried to the worklist)', async () => {
    const { root } = makeProject('sig');
    fs.writeFileSync(
      path.join(root, 'src', 'a.ts'),
      'export function a() {\n  return 1;\n}\nexport function extra() {\n  return 7;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'new export');
    await runInsightRefreshFast(root);
    const flagged = readWorklist(root);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.reason).toBe('significant');
  });
});

describe('fast tier: hook safety (spec Rule 7 — no-op and degradation paths)', () => {
  it('unextracted project (no ledger) → silent no-op, exit 0, no worklist', async () => {
    const root = tmp('no-ledger');
    gitInit(root);
    writeConfig(root);
    fs.writeFileSync(path.join(root, 'x.ts'), 'export const x = 1;\n', 'utf-8');
    gitCommitAll(root, 'c');
    expect(await runInsightRefreshFast(root)).toBe(0);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', INSIGHT_WORKLIST_FILE))).toBe(false);
  });

  it('non-git project → silent no-op, exit 0', async () => {
    const root = tmp('no-git');
    writeConfig(root);
    fs.writeFileSync(path.join(root, 'x.ts'), 'export const x = 1;\n', 'utf-8');
    writeLedgerFor(root, [{ path: 'x.ts', level: 2 }], 'abc1234');
    expect(await runInsightRefreshFast(root)).toBe(0);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', INSIGHT_WORKLIST_FILE))).toBe(false);
  });

  it('skip-listed / ignored paths in the commit never enter the worklist', async () => {
    const { root } = makeProject('excluded');
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf-8');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'out.js'), 'x', 'utf-8');
    gitCommitAll(root, 'lockfile + dist');
    await runInsightRefreshFast(root);
    expect(readWorklist(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 9 (3.4): the recall index is rebuilt before the ledger gate
// ---------------------------------------------------------------------------
describe('fast tier: rebuilds the recall index before its ledger gate (spec Rule 9, 3.4)', () => {
  /** A committed repo with a `.cortex/` holding one decision bearing on R-001 and NO ledger. */
  function makeUnextractedProject(label: string): string {
    const root = tmp(label);
    gitInit(root);
    writeConfig(root);
    fs.mkdirSync(path.join(root, '.cortex', 'compass', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex', 'compass', 'rules', 'R-001-x.md'), '---\nid: R-001\ntitle: x\n---\n', 'utf-8');
    fs.mkdirSync(path.join(root, '.cortex', 'atlas', 'decisions'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'atlas', 'decisions', '2026-09-15-d.md'),
      '---\nid: decision.2026-09-15-d\ntitle: d\ndate: 2026-09-15T00:00:00Z\nbears_on: [R-001]\n---\n\n# d\n',
      'utf-8',
    );
    fs.writeFileSync(path.join(root, 'x.ts'), 'export const x = 1;\n', 'utf-8');
    gitCommitAll(root, 'c');
    return root;
  }

  it('no ledger: the index exists with subjects["R-001"].decided naming the decision, exit 0, no worklist', async () => {
    const root = makeUnextractedProject('recall-rebuild');
    expect(await runInsightRefreshFast(root)).toBe(0);
    const indexPath = path.join(root, '.cortex', 'recall-index.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    const doc = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as { subjects: Record<string, { decided: string[] }> };
    expect(doc.subjects['R-001']?.decided).toEqual(['decision.2026-09-15-d']);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', INSIGHT_WORKLIST_FILE))).toBe(false);
  });

  it('the recall compiler throws: exit 0, one hook-errors.md entry naming insight-refresh-fast and the recall index', async () => {
    const root = makeUnextractedProject('recall-throws');
    recallStub.fail = new Error('recall boom');
    try {
      expect(await runInsightRefreshFast(root)).toBe(0);
    } finally {
      recallStub.fail = null;
    }
    expect(fs.existsSync(path.join(root, '.cortex', 'recall-index.json'))).toBe(false);
    const log = fs.readFileSync(path.join(root, '.cortex', 'pulse', 'reports', 'hook-errors.md'), 'utf-8');
    const entries = log.split('\n').filter((l) => l.startsWith('- hook: '));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('insight-refresh-fast');
    expect(entries[0]).toContain('recall-index.json');
    expect(entries[0]).toContain('recall boom');
  });

  it('a non-Cortex repo (no .cortex/) stays untouched — no index is written', async () => {
    const root = tmp('recall-no-cortex');
    gitInit(root);
    fs.writeFileSync(path.join(root, 'x.ts'), 'export const x = 1;\n', 'utf-8');
    gitCommitAll(root, 'c');
    expect(await runInsightRefreshFast(root)).toBe(0);
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
  });
});
