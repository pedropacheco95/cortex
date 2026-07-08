/**
 * Spec-level tests — insight.refresh-loop (schema §4.10.2/.3, §9). Exercises
 * the three entry modes and the deterministic bookends: full rebuild →
 * schema-valid trio, determinism + carry-over (byte-identical but for
 * `generated`), cluster-id carry-over across membership churn, incremental
 * collect over the changed subset, write-lane refusal, subprocess degradation,
 * and the watermark's full-vs-incremental decision. The deterministic-half ACs
 * drive `--apply <derivation.json>` directly (no real claude subprocess).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  runRefresh,
  applyDerivation,
  collectWorklist,
  readLastFull,
  WORKLIST_FILE,
  LAST_FULL_FILE,
} from '../../../src/insight/refresh.js';
import { checkInsightGraph } from '../../../src/schema/checks/insight.js';
import { FILES_MD_TABLE_HEADER, FILES_MD_TABLE_SEP } from '../../../src/anatomy/files-md.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`insight-refresh-${label}`);
  dirs.push(d);
  return d;
}

let out: string[] = [];
let err: string[] = [];
let originalCwd: string;
beforeEach(() => {
  originalCwd = process.cwd();
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')));
});
afterEach(() => {
  process.chdir(originalCwd);
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
  vi.restoreAllMocks();
});

function makeProject(label: string): string {
  const root = tmp(label);
  fs.mkdirSync(path.join(root, '.cortex', 'pulse'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'insight', 'map'), { recursive: true });
  fs.mkdirSync(path.join(root, '.cortex', 'anatomy'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.cortex', 'cortex.config.json'),
    JSON.stringify({ schemaVersion: '2.0', insight: { clusterCarryOverJaccard: 0.5 } }, null, 2),
    'utf-8',
  );
  return root;
}

interface Row {
  path: string;
  lastSeen: string;
}
function writeFilesMd(root: string, rows: Row[]): void {
  const lines = ['---', 'kind: anatomy-files', 'generated: 2026-07-01T00:00:00Z', '---', '', FILES_MD_TABLE_HEADER, FILES_MD_TABLE_SEP];
  for (const r of rows) {
    lines.push(`| ${r.path} | a purpose | 100 | deadbeef | ${r.lastSeen} | - | false | scanner-llm |`);
  }
  fs.writeFileSync(path.join(root, '.cortex', 'anatomy', 'files.md'), lines.join('\n') + '\n', 'utf-8');
}

const NODES = [
  { id: 'anatomy:src/pulse/review.ts', module: 'anatomy', label: 'review.ts' },
  { id: 'spec:insight.cli', module: 'spec-dev', label: 'insight.cli' },
  { id: 'rule:R-001', module: 'rule', label: 'R-001' },
];

const FULL_DERIVATION = {
  rebuild: 'full',
  nodes: NODES,
  tags: {
    'anatomy:src/pulse/review.ts': ['pulse', 'review'],
    'spec:insight.cli': ['insight', 'cli'],
    'rule:R-001': ['determinism'],
  },
  edges: [
    {
      from: 'anatomy:src/pulse/review.ts',
      to: 'spec:insight.cli',
      kind: 'mentions-same-entity',
      confidence: 'medium',
      rationale: 'both concern the pulse/insight CLI surface',
    },
    {
      from: 'spec:insight.cli',
      to: 'rule:R-001',
      kind: 'semantically-related',
      confidence: 'high',
      rationale: 'the CLI half is deterministic Core per R-001',
    },
  ],
  clusters: [
    {
      label: 'Insight surface',
      members: ['anatomy:src/pulse/review.ts', 'spec:insight.cli'],
      rationale: 'the queryable insight/pulse surface',
    },
  ],
};

function writeDerivation(root: string, obj: unknown): string {
  const p = path.join(tmp('deriv'), 'derivation.json');
  fs.writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}

function readMapFile(root: string, name: string): string {
  return fs.readFileSync(path.join(root, '.cortex', 'insight', 'map', name), 'utf-8');
}
/** Strip the per-run-varying `generated` line for determinism comparison. */
function stripGenerated(text: string): string {
  return text.replace(/"generated": "[^"]*"/g, '"generated": "<G>"');
}

describe('insight.refresh-loop', () => {
  it('AC: a full rebuild produces schema-valid graph/tags/clusters JSON', async () => {
    const root = makeProject('full-valid');
    const app = applyDerivation(root, FULL_DERIVATION, new Date('2026-07-06T10:00:00Z'));
    expect(app.rebuild).toBe('full');

    for (const name of ['graph.json', 'tags.json', 'clusters.json']) {
      expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'map', name))).toBe(true);
    }
    // The written trio passes check.insight-graph — closed kind enum,
    // high|medium|low confidence, non-empty rationale, well-formed cluster ids.
    const violations = checkInsightGraph(root);
    expect(violations.filter((v) => v.severity === 'error')).toEqual([]);

    const graph = JSON.parse(readMapFile(root, 'graph.json'));
    expect(graph.rebuild).toBe('full');
    expect(graph.edges.every((e: { rationale: string }) => e.rationale.trim().length > 0)).toBe(true);
  });

  it('AC: a second full run over unchanged input is byte-identical but for `generated`', () => {
    const root = makeProject('determinism');
    applyDerivation(root, FULL_DERIVATION, new Date('2026-07-06T10:00:00Z'));
    const first = ['graph.json', 'tags.json', 'clusters.json'].map((n) => readMapFile(root, n));

    applyDerivation(root, FULL_DERIVATION, new Date('2026-07-09T11:22:33Z'));
    const second = ['graph.json', 'tags.json', 'clusters.json'].map((n) => readMapFile(root, n));

    for (let i = 0; i < 3; i++) {
      // The only diff is the generated timestamp.
      expect(first[i]).not.toBe(second[i]);
      expect(stripGenerated(first[i] as string)).toBe(stripGenerated(second[i] as string));
    }
  });

  it('AC: cluster ids carry over across a membership change (Jaccard ≥ threshold)', () => {
    const root = makeProject('carry-over');
    // Seed an existing clusters.json with cluster:pulse-gate.
    fs.writeFileSync(
      path.join(root, '.cortex', 'insight', 'map', 'clusters.json'),
      JSON.stringify(
        {
          schemaVersion: '2.0',
          generated: '2026-07-01T00:00:00Z',
          clusters: [
            {
              id: 'cluster:pulse-gate',
              label: 'Pulse gate',
              members: ['spec:pulse.review-cli', 'spec:insight.promotion-mechanism'],
              rationale: 'the review gate cluster',
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const derivation = {
      rebuild: 'full',
      nodes: [
        { id: 'spec:pulse.review-cli', module: 'spec-dev', label: 'pulse.review-cli' },
        { id: 'spec:insight.promotion-mechanism', module: 'spec-dev', label: 'insight.promotion-mechanism' },
        { id: 'spec:insight.gaps-loop', module: 'spec-dev', label: 'insight.gaps-loop' },
      ],
      tags: {},
      edges: [],
      // Deliberately a DIFFERENT label/slug (review-gate) to prove carry-over,
      // not slug coincidence; members are the churned set (Jaccard 0.67).
      clusters: [
        {
          label: 'Review gate',
          members: ['spec:pulse.review-cli', 'spec:insight.promotion-mechanism', 'spec:insight.gaps-loop'],
          rationale: 're-derived over the churned member set',
        },
      ],
    };
    applyDerivation(root, derivation, new Date('2026-07-06T10:00:00Z'));

    const clusters = JSON.parse(readMapFile(root, 'clusters.json'));
    expect(clusters.clusters).toHaveLength(1);
    expect(clusters.clusters[0].id).toBe('cluster:pulse-gate'); // id carried, not freshly minted
    expect(clusters.clusters[0].label).toBe('Pulse gate'); // label carried verbatim (Rule 4)
    expect(clusters.clusters[0].members).toEqual([
      'spec:insight.gaps-loop',
      'spec:insight.promotion-mechanism',
      'spec:pulse.review-cli',
    ]); // the new churned set, sorted
  });

  it('AC: incremental collect touches only the changed subset', async () => {
    const root = makeProject('incremental');
    // Watermark 1 day old → incremental. query.ts changed since; other.ts did not.
    const now = new Date('2026-07-06T10:00:00Z');
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', LAST_FULL_FILE),
      new Date(now.getTime() - 1 * DAY_MS).toISOString() + '\n',
      'utf-8',
    );
    writeFilesMd(root, [
      { path: 'src/insight/query.ts', lastSeen: '2026-07-06T09:00:00Z' }, // after watermark → changed
      { path: 'src/anatomy/scan.ts', lastSeen: '2026-07-04T00:00:00Z' }, // before watermark → unchanged
    ]);

    const result = await collectWorklist(root, now);
    expect(result.rebuild).toBe('incremental');

    const worklist = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'pulse', WORKLIST_FILE), 'utf-8'));
    expect(worklist.rebuild).toBe('incremental');
    const ids = worklist.nodes.map((n: { id: string }) => n.id);
    expect(ids).toContain('anatomy:src/insight/query.ts');
    expect(ids).not.toContain('anatomy:src/anatomy/scan.ts'); // unchanged, no edge → excluded
  });

  it('AC: --apply refuses a prose (.md) write target (write-lane enforcement)', async () => {
    const root = makeProject('write-lane');
    const derivationFile = writeDerivation(root, {
      ...FULL_DERIVATION,
      writes: ['insight/map/setup.md'],
    });
    const code = await runRefresh(root, { applyFile: derivationFile, now: new Date('2026-07-06T10:00:00Z') });
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/out-of-lane/);
    // Nothing was written.
    expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'map', 'graph.json'))).toBe(false);
  });

  it('AC: subprocess degradation (no claude binary, no --no-llm) exits 0 and retains the worklist', async () => {
    const root = makeProject('degrade');
    writeFilesMd(root, [{ path: 'src/a.ts', lastSeen: '2026-07-06T00:00:00Z' }]);
    const code = await runRefresh(root, {
      claudeBin: path.join(root, 'no-such-claude-binary'),
      now: new Date('2026-07-06T10:00:00Z'),
    });
    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/skipped/);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', WORKLIST_FILE))).toBe(true); // retained
    // Degraded run wrote no map JSON (the judgment never ran).
    expect(fs.existsSync(path.join(root, '.cortex', 'insight', 'map', 'graph.json'))).toBe(false);
  });

  it('AC: an 8-day-old watermark forces a full rebuild whose apply advances it', async () => {
    const root = makeProject('watermark');
    const now = new Date('2026-07-06T10:00:00Z');
    fs.writeFileSync(
      path.join(root, '.cortex', 'pulse', LAST_FULL_FILE),
      new Date(now.getTime() - 8 * DAY_MS).toISOString() + '\n',
      'utf-8',
    );
    writeFilesMd(root, [{ path: 'src/a.ts', lastSeen: '2026-07-01T00:00:00Z' }]);

    const collected = await collectWorklist(root, now);
    expect(collected.rebuild).toBe('full'); // 8 days ≥ 7 → full

    const before = readLastFull(root);
    applyDerivation(root, FULL_DERIVATION, now);
    const after = readLastFull(root);
    expect(after).toBe(now.getTime()); // watermark advanced to now
    expect(after).not.toBe(before);
  });
});
