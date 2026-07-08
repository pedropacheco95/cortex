/**
 * Spec-level tests — constellation.insight-preset (schema §4.9 insight preset).
 * One labeled describe per acceptance criterion, driving the REAL read-only
 * HTTP server on an ephemeral 127.0.0.1 port over a real compiled fixture
 * (`scan()` → `compile()` in a sandboxed tmp project) plus handcrafted ungated
 * `insight/map/*.json` overlay files. The overlay is composed at SERVE time and
 * never compiled into constellation.json; visual choreography (dashed styling,
 * region colours) is deliberately untested here (journey tier, deferred — spec
 * Notes).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type * as http from 'http';
import type { AddressInfo } from 'net';
import { createServer, applyPreset } from '../../../src/constellation/server.js';
import { checkConstellation } from '../../../src/schema/checks/constellation.js';
import { scan } from '../../../src/anatomy/scan.js';
import type { Constellation } from '../../../src/constellation/compile.js';
import type { InsightOverlay } from '../../../src/constellation/insight-overlay.js';
import {
  makeTmpDir,
  cleanTmp,
  makeCortexProject,
  writeDevSpec,
  writeBizSpec,
  readConstellation,
} from '../../fixtures/constellation-harness.js';

const TEST_TIMEOUT = 30_000;

type Body = Constellation & { overlay?: InsightOverlay; error?: string };

const CURATED_SPEC = 'spec:insight.cli';
const CURATED_ANATOMY = 'anatomy:src/insight/query.ts';
const CURATED_BIZ = 'business:insight.navigate';

/**
 * Scannable project whose curated node set includes `spec:insight.cli`
 * (an implements edge to `business:insight.navigate` — a solid curated edge)
 * and `anatomy:src/insight/query.ts` — the two endpoints the overlay joins on.
 */
function insightFixture(root: string): void {
  makeCortexProject(root);
  fs.mkdirSync(path.join(root, 'src', 'insight'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'insight', 'query.ts'),
    '/** Deterministic insight query surface. */\nexport const q = 1;\n',
  );
  writeDevSpec(
    root,
    'insight/cli.spec.md',
    `id: insight.cli\nstatus: draft\nimplements: ../../specs-business/insight/navigate.business.md`,
  );
  writeBizSpec(
    root,
    'insight/navigate.business.md',
    `id: insight.navigate\nstatus: draft\nimplemented_by:\n  - ../../specs/insight/cli.spec.md`,
  );
}

/** The canonical, fully-resolvable overlay: one inferred edge + one cluster. */
function canonicalGraph(): unknown {
  return {
    schemaVersion: '2.0',
    generated: '2026-07-05T10:00:00.000Z',
    rebuild: 'full',
    nodes: [
      { id: CURATED_SPEC, module: 'spec', label: 'insight.cli' },
      { id: CURATED_ANATOMY, module: 'anatomy', label: 'query.ts' },
    ],
    edges: [
      {
        from: CURATED_SPEC,
        to: CURATED_ANATOMY,
        kind: 'semantically-related',
        confidence: 'high',
        rationale: 'The CLI query surface reads and shapes the insight map.',
      },
    ],
  };
}

function canonicalClusters(): unknown {
  return {
    schemaVersion: '2.0',
    generated: '2026-07-05T10:00:00.000Z',
    clusters: [
      {
        id: 'cluster:insight-layer',
        label: 'Insight layer',
        members: [CURATED_SPEC, CURATED_ANATOMY],
        rationale: 'Both artefacts constitute the ungated insight layer.',
      },
    ],
  };
}

let root: string;
let server: http.Server;
let base: string;
let compiled: Constellation;
let mapDir: string;
let graphPath: string;
let clustersPath: string;

async function listen(s: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

function writeOverlay(graph: unknown, clusters: unknown): void {
  fs.mkdirSync(mapDir, { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n');
  fs.writeFileSync(clustersPath, JSON.stringify(clusters, null, 2) + '\n');
}

function removeOverlay(): void {
  for (const p of [graphPath, clustersPath]) if (fs.existsSync(p)) fs.rmSync(p);
}

/** content-hash snapshot of every file under root (read-only assertions). */
function snapshotTree(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshotTree(abs, out);
    else if (entry.isFile()) out.set(abs, crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'));
  }
  return out;
}

async function raw(query: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${base}/api/constellation${query}`);
  return { status: res.status, text: await res.text() };
}

async function api(query: string): Promise<{ status: number; body: Body }> {
  const { status, text } = await raw(query);
  return { status, body: JSON.parse(text) as Body };
}

beforeAll(async () => {
  root = makeTmpDir('spec-insight-preset');
  insightFixture(root);
  await scan(root); // real compile: scan invokes the constellation compiler
  compiled = readConstellation(root);
  mapDir = path.join(root, '.cortex', 'insight', 'map');
  graphPath = path.join(mapDir, 'graph.json');
  clustersPath = path.join(mapDir, 'clusters.json');
  writeOverlay(canonicalGraph(), canonicalClusters());
  server = createServer(root);
  base = await listen(server);
}, TEST_TIMEOUT);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  cleanTmp(root);
});

// Fixture sanity: the two join endpoints really are curated nodes, and the
// implements edge really is a curated (solid) edge.
describe('fixture sanity', () => {
  it('emits both overlay endpoints as curated nodes and a curated implements edge', () => {
    const ids = new Set(compiled.nodes.map((n) => n.id));
    expect(ids.has(CURATED_SPEC)).toBe(true);
    expect(ids.has(CURATED_ANATOMY)).toBe(true);
    expect(compiled.edges).toContainEqual({ from: CURATED_SPEC, to: CURATED_BIZ, kind: 'implements' });
  });
});

// ===========================================================================
// AC 1: the insight preset overlays dashed edges and cluster regions
// ===========================================================================

describe('AC insight.1: the insight preset overlays dashed edges and cluster regions', () => {
  it('carries curated nodes/edges PLUS the inferred edge (dashed) and the cluster region', async () => {
    const { status, body } = await api('?preset=insight');
    expect(status).toBe(200);

    // Curated §4.9 keys + the additive overlay block.
    expect(Object.keys(body).sort()).toEqual([
      'counters', 'edges', 'generated', 'groups', 'nodes', 'overlay', 'schemaVersion',
    ]);
    const ids = new Set(body.nodes.map((n) => n.id));
    expect(ids.has(CURATED_SPEC)).toBe(true);
    expect(ids.has(CURATED_ANATOMY)).toBe(true);

    // The curated implements edge remains present and SOLID (no inferred marker).
    const curatedEdge = body.edges.find((e) => e.from === CURATED_SPEC && e.to === CURATED_BIZ);
    expect(curatedEdge).toEqual({ from: CURATED_SPEC, to: CURATED_BIZ, kind: 'implements' });
    for (const e of body.edges) {
      expect(e).not.toHaveProperty('inferred');
      expect(e).not.toHaveProperty('style');
    }

    // The inferred edge is marked dashed.
    expect(body.overlay?.inferredEdges).toEqual([
      {
        from: CURATED_SPEC,
        to: CURATED_ANATOMY,
        kind: 'semantically-related',
        confidence: 'high',
        rationale: 'The CLI query surface reads and shapes the insight map.',
        inferred: true,
        style: 'dashed',
      },
    ]);

    // The cluster is a background region over its (curated) members.
    expect(body.overlay?.clusters).toEqual([
      {
        id: 'cluster:insight-layer',
        label: 'Insight layer',
        members: [CURATED_ANATOMY, CURATED_SPEC].sort(),
        rationale: 'Both artefacts constitute the ungated insight layer.',
      },
    ]);
    expect(body.overlay?.dropped).toEqual({ edges: 0, clusterMembers: 0, clusters: 0 });
  });
});

// ===========================================================================
// AC 2: the switcher now names six presets
// ===========================================================================

describe('AC insight.2: the switcher now names exactly six presets', () => {
  it('GET / serves the SPA naming default, anatomy-only, knowledge-only, orphans, domain, insight', async () => {
    const html = await (await fetch(`${base}/`)).text();
    for (const name of ['default', 'anatomy-only', 'knowledge-only', 'orphans', 'domain', 'insight']) {
      expect(html).toContain(`data-preset="${name}"`);
    }
    expect(html.match(/data-preset="/g)).toHaveLength(6); // exactly six, no extras
  });
});

// ===========================================================================
// AC 3: the default preset is byte-unchanged from v1
// ===========================================================================

describe('AC insight.3: the default preset is byte-identical to the v1 curated-only default', () => {
  it('preset=default has no overlay, no dashed edges, and equals the v1 curated body byte-for-byte', async () => {
    const { status, text } = await raw('?preset=default');
    expect(status).toBe(200);
    // The v1 server produced exactly this: applyPreset(default) → pretty JSON + \n.
    const v1Body = JSON.stringify(applyPreset(compiled, 'default').ok
      ? (applyPreset(compiled, 'default') as { constellation: Constellation }).constellation
      : null, null, 2) + '\n';
    expect(text).toBe(v1Body);
    const body = JSON.parse(text) as Body;
    expect(body).not.toHaveProperty('overlay');
    expect(Object.keys(body).sort()).toEqual(['counters', 'edges', 'generated', 'groups', 'nodes', 'schemaVersion']);
  });
});

// ===========================================================================
// AC 4: constellation.json stays curated-only after serving insight
// ===========================================================================

describe('AC insight.4: constellation.json stays curated-only', () => {
  it('after serving insight, check.constellation is clean, the file has no overlay, and no project file changed', async () => {
    const before = snapshotTree(root);
    await fetch(`${base}/api/constellation?preset=insight`);
    await fetch(`${base}/api/constellation?preset=insight`);
    const after = snapshotTree(root);
    expect(Object.fromEntries(after)).toEqual(Object.fromEntries(before)); // nothing changed

    expect(checkConstellation(root)).toEqual([]); // still validates curated-only
    const onDisk = readConstellation(root) as Constellation & { overlay?: unknown };
    expect(onDisk).not.toHaveProperty('overlay');
    expect(onDisk.edges.every((e) => Object.keys(e).sort().join() === 'from,kind,to')).toBe(true);
  });
});

// ===========================================================================
// AC 5: absent insight files yield an empty overlay, not an error
// ===========================================================================

describe('AC insight.5: absent insight files yield an empty overlay, not an error', () => {
  it('constellation.json but no insight/map/graph.json → curated graph + empty overlay, status 200', async () => {
    removeOverlay();
    try {
      const { status, body } = await api('?preset=insight');
      expect(status).toBe(200);
      expect(body.nodes.length).toBe(compiled.nodes.length); // full curated graph
      expect(body.overlay).toEqual({ inferredEdges: [], clusters: [], dropped: { edges: 0, clusterMembers: 0, clusters: 0 } });
    } finally {
      writeOverlay(canonicalGraph(), canonicalClusters());
    }
  });
});

// ===========================================================================
// AC 6: an inferred edge to a non-curated node is dropped, not errored
// ===========================================================================

describe('AC insight.6: an inferred edge to a non-curated node is dropped-and-counted', () => {
  it('the resolvable inferred edge renders; the dangling one is counted, not an error', async () => {
    const graph = canonicalGraph() as { edges: unknown[] };
    graph.edges.push({
      from: CURATED_SPEC,
      to: 'anatomy:src/nonexistent.ts', // well-formed id, but not a curated node
      kind: 'semantically-related',
      confidence: 'medium',
      rationale: 'Points at a node the compiler never emitted.',
    });
    writeOverlay(graph, canonicalClusters());
    try {
      const { status, body } = await api('?preset=insight');
      expect(status).toBe(200);
      // Only the resolvable edge survives; the dangling one is counted.
      expect(body.overlay?.inferredEdges.map((e) => e.to)).toEqual([CURATED_ANATOMY]);
      expect(body.overlay?.dropped.edges).toBe(1);
    } finally {
      writeOverlay(canonicalGraph(), canonicalClusters());
    }
  });
});

// ===========================================================================
// AC 7: the overlay response is deterministic
// ===========================================================================

describe('AC insight.7: the overlay response is deterministic', () => {
  it('preset=insight twice over unchanged inputs → byte-identical bodies', async () => {
    const first = Buffer.from(await (await fetch(`${base}/api/constellation?preset=insight`)).arrayBuffer());
    const second = Buffer.from(await (await fetch(`${base}/api/constellation?preset=insight`)).arrayBuffer());
    expect(first.equals(second)).toBe(true);
  });
});
