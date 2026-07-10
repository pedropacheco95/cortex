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
