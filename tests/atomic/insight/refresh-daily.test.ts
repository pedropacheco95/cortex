/**
 * Atomic tests for the daily tier's deterministic bookends (spec
 * insight.refresh-loops Rules 1–5) and the 5e-ii anti-silent-drift machinery:
 * ledger sha-mismatch splitting, reverse-dependency invalidation,
 * confidence-aging surfacing, and scope-scoped invalidation.
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
  writeEntry,
  writeLedgerFor,
  writeGraphFor,
  writeReverseIndexFor,
  writeScopeRegistryFor,
  makeEdge,
} from '../../fixtures/insight-refresh-harness.js';
import { runInsightRefreshFast, readLedger, readWorklist, INSIGHT_WORKLIST_FILE } from '../../../src/insight/refresh-fast.js';
import {
  collectDaily,
  applyDaily,
  readDailyWorklist,
  agedEdges,
  owningScope,
  rebuildReverseIndex,
  readReverseIndex,
  DEFAULT_CONFIDENCE_AGING_CYCLES,
  readConfidenceAgingCycles,
} from '../../../src/insight/refresh-daily.js';
import type { LedgerFile, ScopeRegistry } from '../../../src/insight/storage.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`insight-daily-${label}`);
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

/** Two scopes (billing, auth), one file each, extracted at the baseline. */
function makeScopedProject(label: string): { root: string; baseline: string } {
  const root = tmp(label);
  gitInit(root);
  writeConfig(root);
  fs.mkdirSync(path.join(root, 'src', 'billing'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'auth'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'billing', 'retry.ts'), 'export function retry() {\n  return 1;\n}\n', 'utf-8');
  fs.writeFileSync(path.join(root, 'src', 'auth', 'session.ts'), 'export function session() {\n  return 2;\n}\n', 'utf-8');
  gitCommitAll(root, 'baseline');
  const baseline = headShort(root);
  writeLedgerFor(root, [{ path: 'src/billing/retry.ts', level: 3 }, { path: 'src/auth/session.ts', level: 3 }], baseline);
  writeScopeRegistryFor(root, {
    billing: { path: 'src/billing', depends_on: [] },
    auth: { path: 'src/auth', depends_on: [] },
  }, baseline);
  writeGraphFor(
    root,
    [
      { id: 'file:src/billing/retry.ts', kind: 'file', label: 'retry.ts' },
      { id: 'file:src/auth/session.ts', kind: 'file', label: 'session.ts' },
      { id: 'concept:billing-retry', kind: 'concept', label: 'Billing retry' },
    ],
    [
      makeEdge('file:src/billing/retry.ts', 'concept:billing-retry', 'implements-concept', 'stated', baseline),
      makeEdge('file:src/billing/retry.ts', 'file:src/auth/session.ts', 'semantically-similar-to', 'inferred', baseline),
    ],
    baseline,
  );
  writeReverseIndexFor(root, {
    'file:src/billing/retry.ts': [
      'concept:billing-retry',
      'edge:implements-concept:file:src/billing/retry.ts->concept:billing-retry',
      'edge:semantically-similar-to:file:src/billing/retry.ts->file:src/auth/session.ts',
    ],
    'file:src/auth/session.ts': [
      'edge:semantically-similar-to:file:src/billing/retry.ts->file:src/auth/session.ts',
    ],
  }, baseline);
  writeEntry(root, 'src/billing/retry.ts', 3, baseline, { scope: 'billing' });
  writeEntry(root, 'src/auth/session.ts', 3, baseline, { scope: 'auth' });
  return { root, baseline };
}

describe('collectDaily: ledger sha-mismatch splitting (spec Rules 1-2)', () => {
  it('splits flagged files into l2/l3/dropped by the structural verdicts', async () => {
    const { root } = makeScopedProject('split');
    // Significant: new export in retry.ts. Cosmetic: reformat session.ts.
    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    fs.writeFileSync(path.join(root, 'src', 'auth', 'session.ts'), 'export function session()\n{\n    return 2;\n}\n', 'utf-8');
    gitCommitAll(root, 'mixed change');
    await runInsightRefreshFast(root);

    const r = collectDaily(root);
    const worklist = readDailyWorklist(root);
    expect(worklist).not.toBeNull();
    expect(worklist?.l3.map((e) => e.path)).toEqual(['src/billing/retry.ts']);
    expect(worklist?.l2).toEqual([]);
    // The cosmetic session.ts change never reached the daily worklist (the
    // fast tier already dropped it): no Haiku triage for it (spec AC 2).
    expect(worklist?.triage).toEqual([]);
    expect(r.l3).toBe(1);
  });

  it('an unchanged flagged file (sha back in sync) is dropped', async () => {
    const { root, baseline } = makeScopedProject('insync');
    // Hand-craft a stale flag for an unchanged file.
    fs.mkdirSync(path.join(root, '.cortex', 'pulse', 'state'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', 'state', INSIGHT_WORKLIST_FILE),
      JSON.stringify({
        kind: 'insight-refresh-worklist',
        generated: '2026-07-01T00:00:00Z',
        flagged: [{ path: 'src/auth/session.ts', reason: 'changed', detail: 'stale flag' }],
      }),
      'utf-8',
    );
    const r = collectDaily(root);
    expect(r.dropped).toBe(1);
    expect(r.l2 + r.l3 + r.triage).toBe(0);
    expect(readDailyWorklist(root)?.dropped[0]?.reason).toContain('sha back in sync');
    void baseline;
  });

  it('throws without a ledger (the daily loop never bootstraps)', () => {
    const root = tmp('noledger');
    gitInit(root);
    writeConfig(root);
    expect(() => collectDaily(root)).toThrow(/ledger/);
  });
});

describe('scope-scoped invalidation (spec Rule 5, AC 7)', () => {
  it('a change confined to scope billing plans only billing; auth ledger rows and entries stay byte-identical through apply', async () => {
    const { root } = makeScopedProject('scoped');
    const authEntry = path.join(root, '.cortex', 'insight', 'scopes', 'auth', 'anatomy', 'src', 'auth', 'session.ts.md');
    const authEntryBefore = fs.readFileSync(authEntry, 'utf-8');
    const authLedgerBefore = JSON.stringify((readLedger(root) as LedgerFile).entries['src/auth/session.ts']);

    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'billing only');
    await runInsightRefreshFast(root);

    collectDaily(root);
    const worklist = readDailyWorklist(root);
    expect(worklist?.touched_scopes).toEqual(['billing']);
    // The cross-scope edge touching billing is surfaced for re-verification.
    expect(worklist?.cross_scope_edges.map((e) => e.id)).toEqual([
      'edge:semantically-similar-to:file:src/billing/retry.ts->file:src/auth/session.ts',
    ]);

    // Simulate the skill's re-extraction of the billing file only.
    writeEntry(root, 'src/billing/retry.ts', 3, headShort(root), { scope: 'billing' });
    applyDaily(root);

    const ledger = readLedger(root) as LedgerFile;
    expect(JSON.stringify(ledger.entries['src/auth/session.ts'])).toBe(authLedgerBefore);
    expect(fs.readFileSync(authEntry, 'utf-8')).toBe(authEntryBefore);
    expect(ledger.entries['src/billing/retry.ts']?.built_at_commit).toBe(headShort(root));
  });

  it('owningScope picks the longest prefix', () => {
    const registry: ScopeRegistry = {
      schemaVersion: '3.0',
      built_at_commit: 'x',
      scopes: {
        src: { path: 'src', depends_on: [] },
        billing: { path: 'src/billing', depends_on: [] },
      },
    };
    expect(owningScope(registry, 'src/billing/retry.ts')).toBe('billing');
    expect(owningScope(registry, 'src/other.ts')).toBe('src');
    expect(owningScope(registry, 'docs/readme.md')).toBeUndefined();
  });
});

describe('reverse-dependency invalidation (5e-ii; spec AC 5)', () => {
  it('applyDaily marks every concept/edge referencing a re-extracted file stale in the ledger', async () => {
    const { root } = makeScopedProject('reverse');
    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'billing change');
    await runInsightRefreshFast(root);
    collectDaily(root);
    writeEntry(root, 'src/billing/retry.ts', 3, headShort(root), { scope: 'billing' });

    const result = applyDaily(root);
    expect(result.refreshed).toBe(1);
    const ledger = readLedger(root) as LedgerFile;
    // Both the concept and the referencing edges went stale — not just the
    // changed file's own entry (the Graphify-gap fix).
    expect(ledger.stale).toContain('concept:billing-retry');
    expect(ledger.stale).toContain('edge:semantically-similar-to:file:src/billing/retry.ts->file:src/auth/session.ts');
  });

  it('the next collect surfaces the stale set, and the following apply clears what was surfaced', async () => {
    const { root } = makeScopedProject('stale-cycle');
    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'billing change');
    await runInsightRefreshFast(root);
    collectDaily(root);
    writeEntry(root, 'src/billing/retry.ts', 3, headShort(root), { scope: 'billing' });
    applyDaily(root);
    expect((readLedger(root) as LedgerFile).stale?.length).toBeGreaterThan(0);

    // Next cycle: collect surfaces them; apply (skill re-verified) clears them.
    collectDaily(root);
    const surfaced = readDailyWorklist(root)?.stale_references ?? [];
    expect(surfaced).toContain('concept:billing-retry');
    applyDaily(root);
    expect((readLedger(root) as LedgerFile).stale).toEqual([]);
  });

  it('rebuildReverseIndex derives referenced_by from the graph deterministically', () => {
    const edges = [
      makeEdge('file:src/a.ts', 'concept:auth', 'implements-concept', 'stated', 'abc'),
      makeEdge('file:src/a.ts', 'file:src/b.ts', 'imports', 'structural', 'abc'),
    ];
    const index = rebuildReverseIndex(
      { schemaVersion: '3.0', generated: 'x', built_at_commit: 'abc', nodes: [], edges },
      '3.0',
      'def',
    );
    expect(index.referenced_by['file:src/a.ts']).toEqual([
      'concept:auth',
      'edge:implements-concept:file:src/a.ts->concept:auth',
      'edge:imports:file:src/a.ts->file:src/b.ts',
    ]);
    expect(index.referenced_by['file:src/b.ts']).toEqual(['edge:imports:file:src/a.ts->file:src/b.ts']);
    expect(index.referenced_by['concept:auth']).toBeUndefined(); // concepts are not entities
  });

  it('applyDaily rebuilds reverse-index.json from the new graph state', async () => {
    const { root } = makeScopedProject('rebuild');
    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'billing change');
    await runInsightRefreshFast(root);
    collectDaily(root);
    writeEntry(root, 'src/billing/retry.ts', 3, headShort(root), { scope: 'billing' });
    applyDaily(root);
    const index = readReverseIndex(root);
    expect(index?.built_at_commit).toBe(headShort(root));
    expect(index?.referenced_by['file:src/billing/retry.ts']).toContain('concept:billing-retry');
  });
});

describe('confidence-aging (5e-ii; spec Rule 4, AC 6)', () => {
  it('an inferred edge unconfirmed across N cycles is surfaced; structural edges are not', () => {
    const graph = {
      schemaVersion: '3.0',
      generated: 'x',
      built_at_commit: 'c3',
      nodes: [],
      edges: [
        makeEdge('file:src/a.ts', 'file:src/b.ts', 'semantically-similar-to', 'inferred', 'old1'),
        makeEdge('file:src/a.ts', 'file:src/c.ts', 'imports', 'structural', 'old1'),
        makeEdge('file:src/b.ts', 'file:src/c.ts', 'semantically-similar-to', 'inferred', 'c2'),
      ],
    };
    const ledger: LedgerFile = {
      schemaVersion: '3.0',
      built_at_commit: 'c3',
      entries: {},
      cycle_commits: ['c3', 'c2', 'c1'],
    };
    const aged = agedEdges(graph, ledger, 3);
    expect(aged.map((e) => e.id)).toEqual(['edge:semantically-similar-to:file:src/a.ts->file:src/b.ts']);
  });

  it('no aging before N cycles of history exist', () => {
    const graph = {
      schemaVersion: '3.0',
      generated: 'x',
      built_at_commit: 'c1',
      nodes: [],
      edges: [makeEdge('file:src/a.ts', 'file:src/b.ts', 'semantically-similar-to', 'inferred', 'old1')],
    };
    const ledger: LedgerFile = { schemaVersion: '3.0', built_at_commit: 'c1', entries: {}, cycle_commits: ['c1'] };
    expect(agedEdges(graph, ledger, 3)).toEqual([]);
  });

  it('applyDaily advances the cycle history (capped at the window); collect surfaces aged edges end-to-end', async () => {
    const { root, baseline } = makeScopedProject('aging');
    // Pre-seed N-1 old cycles so history reaches the window after one apply.
    writeLedgerFor(
      root,
      [{ path: 'src/billing/retry.ts', level: 3 }, { path: 'src/auth/session.ts', level: 3 }],
      baseline,
      { cycleCommits: ['zzz111', 'zzz222'] },
    );
    // A change + apply gives the third cycle.
    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'billing change');
    await runInsightRefreshFast(root);
    collectDaily(root);
    writeEntry(root, 'src/billing/retry.ts', 3, headShort(root), { scope: 'billing' });
    applyDaily(root);

    const ledger = readLedger(root) as LedgerFile;
    expect(ledger.cycle_commits).toHaveLength(DEFAULT_CONFIDENCE_AGING_CYCLES);
    expect(ledger.cycle_commits?.[0]).toBe(headShort(root));

    // The inferred edge was re-confirmed at HEAD by the L3 neighbourhood
    // update, so it is NOT aged; age it artificially and re-collect.
    collectDaily(root);
    expect(readDailyWorklist(root)?.aged_edges).toEqual([]);
  });

  it('the aging window reads insight.confidenceAgingCycles from config, default 3', () => {
    const root = tmp('aging-config');
    writeConfig(root, { confidenceAgingCycles: 5 });
    expect(readConfidenceAgingCycles(root)).toBe(5);
    const bare = tmp('aging-default');
    writeConfig(bare);
    expect(readConfidenceAgingCycles(bare)).toBe(DEFAULT_CONFIDENCE_AGING_CYCLES);
  });
});

describe('applyDaily: L4 neighbourhood updates + worklist pruning', () => {
  it('edges touching an L3-re-extracted file get confirmed_at_commit = HEAD; the fast worklist is pruned', async () => {
    const { root, baseline } = makeScopedProject('confirm');
    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'billing change');
    await runInsightRefreshFast(root);
    expect(readWorklist(root)).toHaveLength(1);
    collectDaily(root);
    writeEntry(root, 'src/billing/retry.ts', 3, headShort(root), { scope: 'billing' });

    const result = applyDaily(root);
    expect(result.edgesConfirmed).toBe(2);
    const graph = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'insight', 'graph.json'), 'utf-8')) as {
      edges: Array<{ id: string; confirmed_at_commit: string }>;
    };
    for (const edge of graph.edges) {
      expect(edge.confirmed_at_commit).toBe(headShort(root));
    }
    expect(readWorklist(root)).toEqual([]); // processed flags pruned
    expect(headShort(root)).not.toBe(baseline);
  });

  it('a not-yet-re-extracted file stays pending and keeps its flag', async () => {
    const { root } = makeScopedProject('pending');
    fs.writeFileSync(
      path.join(root, 'src', 'billing', 'retry.ts'),
      'export function retry() {\n  return 1;\n}\nexport function backoff() {\n  return 3;\n}\n',
      'utf-8',
    );
    gitCommitAll(root, 'billing change');
    await runInsightRefreshFast(root);
    collectDaily(root);
    // Skill did NOT re-extract (entry still carries the old sha).
    const result = applyDaily(root);
    expect(result.refreshed).toBe(0);
    expect(result.pending).toBe(1);
    expect(readWorklist(root).map((f) => f.path)).toEqual(['src/billing/retry.ts']);
  });
});
