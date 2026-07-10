/**
 * Constellation renderer server (spec constellation.renderer;
 * schema §4.9 v3.0; design §12.7-§12.8).
 *
 * A localhost-only, read-only Node HTTP server over `.cortex/constellation.json`:
 * re-reads the compiled map per request (Rule: a fresh scan is visible on
 * reload), filters it server-side through the locked presets, and serves the
 * self-contained single-page canvas renderer (a deep-space map whose groups
 * dissolve into their member artefacts on zoom — see `spa.ts`). Never writes,
 * never invokes the compiler — a stale or missing map is reported (`404` +
 * "run cortex scan"), not rebuilt (renderer Rule 3/4).
 *
 * v3.0 (build-order-v3 step 7): the two anatomy-defined lenses (`anatomy-only`,
 * `knowledge-only`) retire with the anatomy node kind (schema §4.9 v3.0 module
 * enum). build-order-v3 step 10 (the constellation insight preset, previously
 * deferred at design §11 Q2, now shipped — see `constellation.insight-preset-v3`)
 * adds a fourth preset, `insight`: a wholly separate, self-contained map over
 * `.cortex/insight/graph.json` + `clusters.json`, composed at request time by
 * `composeInsightPreset` below. It is NOT a join/overlay onto the curated
 * `constellation.json` (that v2 design retired with build-order-v3 step 7 —
 * see the superseded `constellation.insight-preset` lineage record) — it never
 * reads `constellation.json` at all, so `?preset=insight` is checked and
 * short-circuited before the curated file read in `handleApi` below.
 */
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { AddressInfo } from 'net';
import type { Constellation, ConstellationGroup, ConstellationGroupChild, ConstellationNode } from './compile.js';
import { SPA_HTML } from './spa.js';
import { locateInsight, loadUnifiedGraph, fileQuery, conceptQuery, mainPlayers } from '../insight/query.js';
import { parseGraphV3, parseClustersV3, type ClusterV3 } from '../insight/storage.js';

/** The locked preset set (renderer Rule 6) — never extended ad hoc. */
export const PRESET_NAMES = ['default', 'orphans', 'domain', 'insight'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

/** The subset `applyPreset` itself filters — curated lenses over the compiled
 *  `constellation.json` (Rule 6). `insight` composes an entirely separate
 *  graph (`composeInsightPreset`) and never reaches this function in the
 *  live server — `handleApi` branches on it before the curated file read —
 *  so it is deliberately excluded from `applyPreset`'s own switch. Kept
 *  private: `PRESET_NAMES` above is the one public, switcher-facing set. */
const CURATED_PRESET_NAMES = ['default', 'orphans', 'domain'] as const;
type CuratedPresetName = (typeof CURATED_PRESET_NAMES)[number];

/** Default port, fixed at implementation (renderer Rule 1). */
export const DEFAULT_PORT = 4747;

export type PresetResult =
  | { ok: true; constellation: Constellation }
  | { ok: false; status: 400; error: string };

/** Domain segment of a spec node id: `spec:schema.validator` → `schema` (Rule 6). */
function domainSegment(node: ConstellationNode): string {
  const idPart = node.id.slice(node.id.indexOf(':') + 1);
  const dot = idPart.indexOf('.');
  return dot > 0 ? idPart.slice(0, dot) : idPart;
}

/**
 * Filter a compiled constellation through one of the locked presets
 * (Rule 6) with full filter closure (Rule 7): edges are kept iff both
 * endpoints survive; groups/children are pruned to those with at least one
 * remaining node; counters are recomputed over the filtered sets
 * (`droppedRefs` passes through — it is a property of compilation, not of the
 * lens). Pure: never mutates its input, never restyles or summarises (Rule 5).
 * A `domain` value matching nothing is an honest empty lens, not an error.
 */
export function applyPreset(constellation: Constellation, preset: string, domain?: string): PresetResult {
  if (!(CURATED_PRESET_NAMES as readonly string[]).includes(preset)) {
    return {
      ok: false,
      status: 400,
      error: `Unknown preset "${preset}". Valid presets: ${PRESET_NAMES.join(', ')}.`,
    };
  }
  if (preset === 'domain' && domain === undefined) {
    return {
      ok: false,
      status: 400,
      error: 'The domain preset requires a ?domain=<d> query parameter.',
    };
  }

  let keep: (node: ConstellationNode) => boolean;
  switch (preset as CuratedPresetName) {
    case 'default':
      keep = () => true;
      break;
    case 'orphans': {
      // Zero connected edges in EITHER direction (spec Notes: deliberate
      // widening of "zero incoming"), computed over the full edge set.
      const connected = new Set<string>();
      for (const e of constellation.edges) {
        connected.add(e.from);
        connected.add(e.to);
      }
      keep = (n) => !connected.has(n.id);
      break;
    }
    case 'domain':
      keep = (n) =>
        (n.module === 'spec-dev' || n.module === 'spec-business') && domainSegment(n) === domain;
      break;
  }

  const nodes = constellation.nodes.filter(keep);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Closure: an edge survives iff BOTH endpoints survive (Rule 7).
  const edges = constellation.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  // Closure: children pruned to those with ≥1 remaining node; top groups
  // pruned when nothing remains under them (Rule 7).
  const usedGroups = new Set(nodes.map((n) => n.group));
  const groups = constellation.groups
    .map((g) => ({ ...g, children: g.children.filter((c) => usedGroups.has(c.id)) }))
    .filter((g) => g.children.length > 0 || usedGroups.has(g.id));

  const counters = {
    compass: nodes.filter((n) => n.module === 'rule' || n.module === 'bug' || n.module === 'compass').length,
    atlas: nodes.filter((n) => n.module === 'atlas').length,
    specs: nodes.filter((n) => n.module === 'spec-dev' || n.module === 'spec-business').length,
    edges: edges.length,
    droppedRefs: constellation.counters.droppedRefs,
  };

  return {
    ok: true,
    constellation: {
      schemaVersion: constellation.schemaVersion,
      generated: constellation.generated,
      groups,
      nodes,
      edges,
      counters,
    },
  };
}

// ===========================================================================
// The `insight` preset (constellation.insight-preset-v3; schema §4.9,
// §4.10.6): a wholly separate, self-contained composition over
// `.cortex/insight/graph.json` + `clusters.json`, built fresh per request.
// Never touches `constellation.json` (Rule 6/`R-001`) and never fails on
// absent/empty insight data — an honest empty result, not an error.
// ===========================================================================

export const INSIGHT_EMPTY_HINT = 'no insight extracted yet — run cortex-extract-insight';

export interface InsightPresetNode {
  id: string;
  label: string;
  /** The graph node kind (`file | element | concept`) — carried as `module`
   *  so the client can legend/color by kind, the same field name the
   *  curated presets use for their own module enum. */
  module: 'file' | 'element' | 'concept';
  /** Owning cluster id, or the synthetic `cluster:uncategorized` catch-all. */
  group: string;
  /** Derived from the node id (the part after the `kind:` prefix). */
  ref: string;
  /** `file` nodes only: the entry's `## Purpose` section body, when found. */
  purpose?: string;
  /** `file` nodes only: the `cortex insight file <path>` query pointer. */
  cliPointer?: string;
  /** `concept` nodes only: an excerpt of the concept doc (body minus the
   *  `# title` heading and any `## `-titled section, e.g. `## Files`). */
  conceptExcerpt?: string;
  /** `concept` nodes only: project-relative paths of files touching it,
   *  sourced from `implements-concept`/`co-clustered` edges. */
  touchingFiles?: string[];
  /** `element` nodes only: the project-relative path of the owning file. */
  owningFile?: string;
  /** `element` nodes only: `"<start>-<end>"` when cheaply extractable from
   *  the owning file's `## Main players` bullet; omitted otherwise (§4.10.6
   *  graph nodes carry no line range of their own). */
  range?: string;
}

export interface InsightPresetEdge {
  from: string;
  to: string;
  /** The `edge_type` (§4.10.6), reused as `kind` for the shared field name. */
  kind: string;
  /** Always `true` — every insight edge renders dashed, non-negotiably
   *  (ungated/inferred discipline), regardless of confidence tier. */
  dashed: true;
  confidence: string;
  evidence: string;
}

export interface InsightPresetResult {
  schemaVersion: string;
  generated: string;
  groups: ConstellationGroup[];
  nodes: InsightPresetNode[];
  edges: InsightPresetEdge[];
  counters: {
    files: number;
    elements: number;
    concepts: number;
    clusters: number;
    edges: number;
    droppedRefs: number;
  };
  /** Present only when there is no insight data to show (Rule 2) — a
   *  client-consumable hint, never an error. */
  emptyHint?: string;
}

const EMPTY_INSIGHT_GENERATED = '1970-01-01T00:00:00.000Z';

function emptyInsightResult(): InsightPresetResult {
  return {
    schemaVersion: '3.0',
    generated: EMPTY_INSIGHT_GENERATED,
    groups: [],
    nodes: [],
    edges: [],
    counters: { files: 0, elements: 0, concepts: 0, clusters: 0, edges: 0, droppedRefs: 0 },
    emptyHint: INSIGHT_EMPTY_HINT,
  };
}

/** `id.slice(id.indexOf(':') + 1)` — the part after the `kind:` prefix. */
function stripKindPrefix(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

/** The body text between the `# title` heading and the first `## `-titled
 *  section (e.g. `## Files`) of a concept doc — a short, honest excerpt. */
function conceptExcerpt(doc: string): string {
  const out: string[] = [];
  for (const line of doc.split('\n')) {
    if (/^#\s+/.test(line)) continue;
    if (/^##\s+/.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** `"lines 98–508"` / `"lines 98-508"` → `"98-508"`; undefined when the
 *  Main-players bullet carries no line range (§4.10.6 note). */
function extractLineRange(bullet: string): string | undefined {
  const m = /lines?\s+(\d+)\s*[-–—]\s*(\d+)/i.exec(bullet);
  return m ? `${m[1]}-${m[2]}` : undefined;
}

function loadClusters(insightDir: string): ClusterV3[] {
  const p = path.join(insightDir, 'clusters.json');
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = parseClustersV3(fs.readFileSync(p, 'utf-8'));
    // Tolerant (mirrors the compiler's own dropped-ref tolerance): a
    // malformed clusters.json degrades to "no clusters" rather than failing
    // the whole preset — every node still renders, under `cluster:uncategorized`.
    return parsed.ok && parsed.value ? parsed.value.clusters : [];
  } catch {
    return [];
  }
}

function loadTopGraphMeta(insightDir: string): { schemaVersion: string; generated: string } | undefined {
  const p = path.join(insightDir, 'graph.json');
  if (!fs.existsSync(p)) return undefined;
  try {
    const parsed = parseGraphV3(fs.readFileSync(p, 'utf-8'));
    return parsed.ok && parsed.value ? { schemaVersion: parsed.value.schemaVersion, generated: parsed.value.generated } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Compose the `insight` preset for `root`: the code-understanding graph
 * (`.cortex/insight/graph.json` + `clusters.json`, scoped or unscoped
 * transparently via `insight/query.ts`'s `locateInsight`/`loadUnifiedGraph`)
 * rendered as its own self-contained map — one synthetic top-level group
 * (`insight`) whose children are the declared clusters plus a synthetic
 * `cluster:uncategorized` catch-all for any graph node no cluster claims
 * (constellation.insight-preset-v3 Rule 3). Every edge renders dashed
 * (Rule 5); an edge endpoint absent from the node set is dropped-and-counted,
 * not errored (Rule 4, mirroring the compiler's own tolerance). Deterministic:
 * `generated` is read from the insight graph's own `generated` field (never
 * wall-clock), so identical insight files + identical request produce a
 * byte-identical response (Rule 7).
 */
export function composeInsightPreset(root: string): InsightPresetResult {
  const loc = locateInsight(root);
  if (!loc) return emptyInsightResult();

  const unified = loadUnifiedGraph(loc);
  if (unified.nodes.size === 0) return emptyInsightResult();

  const meta = loadTopGraphMeta(loc.insightDir);
  const clusters = loadClusters(loc.insightDir);

  // member node id -> owning cluster id (first cluster wins on overlap).
  const memberToCluster = new Map<string, string>();
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      if (!memberToCluster.has(member)) memberToCluster.set(member, cluster.id);
    }
  }

  const sortedNodeIds = [...unified.nodes.keys()].sort();
  const uncategorizedCount = sortedNodeIds.filter((id) => !memberToCluster.has(id)).length;

  const children: ConstellationGroupChild[] = clusters.map((c) => ({ id: c.id, label: c.label }));
  if (uncategorizedCount > 0) children.push({ id: 'cluster:uncategorized', label: 'Uncategorized' });
  const groups: ConstellationGroup[] = [{ id: 'insight', label: 'Insight', children }];

  const nodes: InsightPresetNode[] = sortedNodeIds.map((id) => {
    const gn = unified.nodes.get(id)!;
    const group = memberToCluster.get(id) ?? 'cluster:uncategorized';
    const ref = stripKindPrefix(id);
    const node: InsightPresetNode = { id, label: gn.label, module: gn.kind as InsightPresetNode['module'], group, ref };

    if (gn.kind === 'file') {
      const fq = fileQuery(root, ref);
      if (fq.found && fq.sections?.['Purpose']) node.purpose = fq.sections['Purpose'];
      node.cliPointer = `cortex insight file ${ref}`;
    } else if (gn.kind === 'concept') {
      const cq = conceptQuery(root, ref);
      if (cq.found) {
        if (cq.doc !== undefined) node.conceptExcerpt = conceptExcerpt(cq.doc);
        node.touchingFiles = (cq.files ?? []).map((f) => f.path);
      }
    } else if (gn.kind === 'element') {
      const hash = ref.indexOf('#');
      const owningFile = hash >= 0 ? ref.slice(0, hash) : ref;
      const name = hash >= 0 ? ref.slice(hash + 1) : ref;
      node.owningFile = owningFile;
      const fq = fileQuery(root, owningFile);
      const playersSection = fq.found ? fq.sections?.['Main players'] : undefined;
      if (playersSection !== undefined) {
        const bullet = mainPlayers(playersSection).get(name);
        const range = bullet !== undefined ? extractLineRange(bullet) : undefined;
        if (range !== undefined) node.range = range;
      }
    }
    return node;
  });

  const sortedEdges = [...unified.edges.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges: InsightPresetEdge[] = [];
  let droppedRefs = 0;
  for (const e of sortedEdges) {
    if (!unified.nodes.has(e.source) || !unified.nodes.has(e.target)) {
      droppedRefs++;
      continue;
    }
    edges.push({ from: e.source, to: e.target, kind: e.edge_type, dashed: true, confidence: e.confidence, evidence: e.evidence });
  }

  const counters = {
    files: nodes.filter((n) => n.module === 'file').length,
    elements: nodes.filter((n) => n.module === 'element').length,
    concepts: nodes.filter((n) => n.module === 'concept').length,
    clusters: clusters.length,
    edges: edges.length,
    droppedRefs,
  };

  return {
    schemaVersion: meta?.schemaVersion ?? '3.0',
    generated: meta?.generated ?? EMPTY_INSIGHT_GENERATED,
    groups,
    nodes,
    edges,
    counters,
  };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n');
}

function handleApi(root: string, url: URL, res: http.ServerResponse): void {
  const preset = url.searchParams.get('preset') ?? 'default';
  const domain = url.searchParams.get('domain') ?? undefined;

  // `insight` is checked and short-circuited BEFORE the curated
  // constellation.json read (constellation.insight-preset-v3 Rule 2): it is a
  // wholly separate composition over `.cortex/insight/`, not a filter over
  // the curated map, and must not depend on `constellation.json` existing at
  // all. Absent/empty insight data is an honest empty result (200), never
  // the curated-map's 404.
  if (preset === 'insight') {
    const insightResult = composeInsightPreset(root);
    // Deterministic at the contract (Rule 7): a pure function of the
    // insight files' bytes — same input, byte-identical response.
    sendJson(res, 200, JSON.stringify(insightResult, null, 2) + '\n');
    return;
  }

  const mapPath = path.join(root, '.cortex', 'constellation.json');
  // Re-read per request so a fresh scan is visible on reload (Entities: READS).
  let raw: string;
  try {
    raw = fs.readFileSync(mapPath, 'utf-8');
  } catch {
    sendJson(res, 404, {
      error: 'No compiled constellation found at .cortex/constellation.json — run cortex scan first.',
    });
    return;
  }
  let constellation: Constellation;
  try {
    constellation = JSON.parse(raw) as Constellation;
  } catch {
    sendJson(res, 500, {
      error: '.cortex/constellation.json is not valid JSON — run cortex scan to recompile it.',
    });
    return;
  }

  const result = applyPreset(constellation, preset, domain);
  if (!result.ok) {
    sendJson(res, result.status, { error: result.error });
    return;
  }
  // Deterministic at the contract (Rule 9): the body is a pure function of
  // the file bytes and the query — same input, byte-identical response.
  sendJson(res, 200, JSON.stringify(result.constellation, null, 2) + '\n');
}

/**
 * Build the (unlistened) HTTP server for `root`. Strictly read-only over the
 * project (Rule 3): handlers only ever read `.cortex/constellation.json`.
 * Exported unlistened so tests can drive it on an ephemeral port;
 * `serveConstellation` binds it for the CLI.
 */
export function createServer(root: string): http.Server {
  const absRoot = path.resolve(root);
  return http.createServer((req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed — the constellation is read-only.' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SPA_HTML);
    } else if (url.pathname === '/api/constellation') {
      handleApi(absRoot, url, res);
    } else {
      sendJson(res, 404, { error: 'Not found.' });
    }
  });
}

/**
 * `cortex constellation [--port N]` (Rule 1): bind `127.0.0.1` exclusively
 * (Rule 2 — never 0.0.0.0), print the full URL, never auto-open a browser.
 * Resolves with the listening server; the CLI awaits its `close`.
 */
export function serveConstellation(
  root: string,
  port: number = DEFAULT_PORT,
  log: (line: string) => void = console.log,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(root);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      log(`Cortex constellation serving at http://127.0.0.1:${address.port} (Ctrl-C to stop)`);
      resolve(server);
    });
  });
}
