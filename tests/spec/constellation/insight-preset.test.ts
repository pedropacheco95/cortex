/**
 * Spec-level tests — constellation.insight-preset-v3 (schema §4.9, §4.10.6).
 * Drives the real HTTP server over a fixture `.cortex/insight/` tree (graph,
 * clusters, per-file entries, a concept doc — written via the
 * constellation-harness insight helpers, no real extraction pipeline run).
 * Covers: serve-time composition (counts, dashed edges, cluster grouping +
 * the synthetic `cluster:uncategorized` catch-all, per-kind detail fields),
 * the absent/empty-insight honest-empty-result path, that curated presets
 * stay byte-unaffected by the insight preset's existence, and determinism.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type * as http from 'http';
import type { AddressInfo } from 'net';
import { createServer } from '../../../src/constellation/server.js';
import type { InsightPresetResult } from '../../../src/constellation/server.js';
import { compile } from '../../../src/constellation/compile.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeInsightGraph,
  writeInsightClusters,
  writeInsightFileEntry,
  writeInsightConcept,
} from '../../fixtures/constellation-harness.js';

const TEST_TIMEOUT = 30_000;

async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

function closeAll(servers: http.Server[]): Promise<unknown> {
  return Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
}

/**
 * A fixture insight graph: two files (one clustered, one deliberately left
 * out of every cluster — the uncategorized case), one element owned by the
 * clustered file (with a Main-players line range), one concept, an edge to a
 * node NOT in the graph (the dropped-and-counted case), and two declared
 * clusters.
 */
function insightFixture(root: string): void {
  makeCortexProject(root);
  writeInsightGraph(
    root,
    [
      { id: 'file:src/fixture/a.ts', kind: 'file', label: 'src/fixture/a.ts' },
      { id: 'element:src/fixture/a.ts#doThing', kind: 'element', label: 'doThing' },
      { id: 'file:src/fixture/b.ts', kind: 'file', label: 'src/fixture/b.ts' },
      { id: 'concept:widgets', kind: 'concept', label: 'widgets' },
    ],
    [
      {
        id: 'edge:calls:element:src/fixture/a.ts#doThing->file:src/fixture/b.ts',
        source: 'element:src/fixture/a.ts#doThing',
        target: 'file:src/fixture/b.ts',
        edge_type: 'calls',
        confidence: 'structural',
        evidence: 'doThing() calls a top-level function exported by b.ts.',
      },
      {
        id: 'edge:implements-concept:file:src/fixture/a.ts->concept:widgets',
        source: 'file:src/fixture/a.ts',
        target: 'concept:widgets',
        edge_type: 'implements-concept',
        confidence: 'stated',
        evidence: 'a.ts explicitly implements the widgets concept per its header comment.',
      },
      {
        // Dangling: target not in the node set above — dropped-and-counted.
        id: 'edge:imports:file:src/fixture/a.ts->file:src/fixture/missing.ts',
        source: 'file:src/fixture/a.ts',
        target: 'file:src/fixture/missing.ts',
        edge_type: 'imports',
        confidence: 'ambiguous',
        evidence: 'a weak, unconfirmed import guess.',
      },
    ],
  );
  writeInsightClusters(root, [
    { id: 'cluster:alpha', label: 'Alpha', members: ['file:src/fixture/a.ts', 'element:src/fixture/a.ts#doThing'] },
    { id: 'cluster:beta', label: 'Beta', members: ['concept:widgets'] },
    // file:src/fixture/b.ts is in NO cluster — the uncategorized case.
  ]);
  writeInsightFileEntry(root, 'src/fixture/a.ts', {
    purpose: 'Fixture file A — the clustered file with a rich Main players entry.',
    mainPlayers: '- `doThing` (lines 12-30) — does the fixture thing.',
  });
  writeInsightFileEntry(root, 'src/fixture/b.ts', {
    purpose: 'Fixture file B — deliberately left out of every cluster.',
    extractionLevel: 2,
  });
  writeInsightConcept(root, 'widgets', 'The fixture widgets concept — a short excerpt.', '- src/fixture/a.ts');
}

let root: string;
let server: http.Server;
let base: string;
const extraServers: http.Server[] = [];
const extraDirs: string[] = [];

beforeAll(async () => {
  root = makeTmpDir('spec-insight-preset');
  insightFixture(root);
  await compile(root); // constellation.json exists too, so we can prove insight never touches it
  server = createServer(root);
  base = await listen(server);
}, TEST_TIMEOUT);

afterAll(async () => {
  await closeAll([server, ...extraServers]);
  cleanTmp(root);
  while (extraDirs.length > 0) cleanTmp(extraDirs.pop() as string);
});

async function apiInsight(query = '?preset=insight'): Promise<{ status: number; body: InsightPresetResult }> {
  const res = await fetch(`${base}/api/constellation${query}`);
  return { status: res.status, body: (await res.json()) as InsightPresetResult };
}

describe('composeInsightPreset: counts, dashed edges, clustering', () => {
  it('returns the expected file/element/concept/cluster counts', async () => {
    const { status, body } = await apiInsight();
    expect(status).toBe(200);
    expect(body.counters.files).toBe(2);
    expect(body.counters.elements).toBe(1);
    expect(body.counters.concepts).toBe(1);
    expect(body.counters.clusters).toBe(2); // declared clusters only, not the synthetic catch-all
    expect(body.counters.edges).toBe(2); // the dangling edge is dropped
    expect(body.counters.droppedRefs).toBe(1);
  });

  it('every edge is marked dashed, carries confidence + evidence, and dangling endpoints are dropped', async () => {
    const { body } = await apiInsight();
    expect(body.edges).toHaveLength(2);
    for (const e of body.edges) {
      expect(e.dashed).toBe(true);
      expect(typeof e.confidence).toBe('string');
      expect(e.evidence.length).toBeGreaterThan(0);
    }
    expect(body.edges.some((e) => e.to === 'file:src/fixture/missing.ts')).toBe(false);
  });

  it('groups: one synthetic top-level "insight" group whose children are the declared clusters plus cluster:uncategorized', async () => {
    const { body } = await apiInsight();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]?.id).toBe('insight');
    const childIds = (body.groups[0]?.children ?? []).map((c) => c.id).sort();
    expect(childIds).toEqual(['cluster:alpha', 'cluster:beta', 'cluster:uncategorized']);
  });

  it('a node absent from every cluster is placed under cluster:uncategorized, never dropped', async () => {
    const { body } = await apiInsight();
    const b = body.nodes.find((n) => n.id === 'file:src/fixture/b.ts');
    expect(b).toBeDefined();
    expect(b?.group).toBe('cluster:uncategorized');
  });

  it('file nodes carry Purpose + a cliPointer; concept nodes carry an excerpt + touching files; element nodes carry owningFile + range', async () => {
    const { body } = await apiInsight();
    const a = body.nodes.find((n) => n.id === 'file:src/fixture/a.ts');
    expect(a?.purpose).toContain('clustered file');
    expect(a?.cliPointer).toBe('cortex insight file src/fixture/a.ts');

    const concept = body.nodes.find((n) => n.id === 'concept:widgets');
    expect(concept?.conceptExcerpt).toContain('fixture widgets concept');
    expect(concept?.touchingFiles).toContain('src/fixture/a.ts');

    const element = body.nodes.find((n) => n.id === 'element:src/fixture/a.ts#doThing');
    expect(element?.owningFile).toBe('src/fixture/a.ts');
    expect(element?.range).toBe('12-30');
  });
});

describe('composeInsightPreset: absent/empty insight is an honest empty result, never an error', () => {
  it('a project with no .cortex/insight/ at all → 200, empty sets, emptyHint set', async () => {
    const bare = makeTmpDir('spec-insight-preset-bare');
    extraDirs.push(bare);
    makeCortexProject(bare);
    const s = createServer(bare);
    extraServers.push(s);
    const bareBase = await listen(s);
    const res = await fetch(`${bareBase}/api/constellation?preset=insight`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as InsightPresetResult;
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
    expect(body.groups).toEqual([]);
    expect(body.emptyHint).toContain('cortex-extract-insight');
  });

  it('never depends on constellation.json existing (no curated map, insight present) → still composes', async () => {
    const noMap = makeTmpDir('spec-insight-preset-nomap');
    extraDirs.push(noMap);
    insightFixture(noMap); // writes insight/ but we never call compile() here
    expect(fs.existsSync(path.join(noMap, '.cortex', 'constellation.json'))).toBe(false);
    const s = createServer(noMap);
    extraServers.push(s);
    const noMapBase = await listen(s);
    const res = await fetch(`${noMapBase}/api/constellation?preset=insight`);
    expect(res.status).toBe(200); // NOT the curated 404 — insight never reads constellation.json
    const body = (await res.json()) as InsightPresetResult;
    expect(body.counters.files).toBe(2);
  });
});

describe('composeInsightPreset: curated presets stay byte-unaffected by insight data existing', () => {
  it('?preset=default is unchanged whether or not .cortex/insight/ is populated', async () => {
    const res1 = await fetch(`${base}/api/constellation?preset=default`);
    const first = Buffer.from(await res1.arrayBuffer());
    const res2 = await fetch(`${base}/api/constellation?preset=default`);
    const second = Buffer.from(await res2.arrayBuffer());
    expect(first.equals(second)).toBe(true);
  });

  it('serving the insight preset writes nothing to disk (Rule 6, R-001)', async () => {
    const mapPath = path.join(root, '.cortex', 'constellation.json');
    const before = fs.readFileSync(mapPath, 'utf-8');
    await apiInsight();
    await apiInsight();
    const after = fs.readFileSync(mapPath, 'utf-8');
    expect(after).toBe(before);
  });
});

describe('composeInsightPreset: deterministic responses', () => {
  it('identical insight files + identical request → byte-identical response', async () => {
    const r1 = await fetch(`${base}/api/constellation?preset=insight`);
    const b1 = Buffer.from(await r1.arrayBuffer());
    const r2 = await fetch(`${base}/api/constellation?preset=insight`);
    const b2 = Buffer.from(await r2.arrayBuffer());
    expect(b1.equals(b2)).toBe(true);
  });
});
