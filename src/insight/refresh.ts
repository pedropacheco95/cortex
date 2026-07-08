/**
 * `cortex loop-insight-refresh` — the inferred-map maintainer (spec
 * insight.refresh-loop; schema §4.10.2/.3, v2 design §4.1). The JSON producer:
 * it maintains `insight/map/graph.json`, `tags.json`, `clusters.json` — and
 * nothing else. Same deterministic-bookends idiom as distil / anatomy-refresh:
 *
 *  - `--collect`   assembles the node set (full: all §4.9 nodes; incremental:
 *                  the changed subset + neighbourhood) into
 *                  `pulse/.insight-refresh-worklist.json`, deciding full-vs-
 *                  incremental against its own watermark
 *                  `pulse/.insight-refresh-last-full`.
 *  - `--apply <f>` validates a derivation (tags/edges/clusters judgment output),
 *                  applies cluster-id carry-over, preserves rationale/confidence
 *                  verbatim for re-derived entries, serializes deterministically,
 *                  and writes the three JSON files atomically. Refuses any
 *                  out-of-lane write target (§4.10.3 defence-in-depth). A full
 *                  rebuild updates the watermark.
 *  - bare          collect → spawn the Claude CLI headless for the judgment
 *                  (core-cli.init Rule 6 subprocess boundary; same degradation
 *                  as distil: `--no-llm`/absent/timeout → exit 0 + notice, retain
 *                  worklist; auth → named exit 3) → apply.
 *
 * The shipped `skills/cortex-loop-insight-refresh/SKILL.md` runs collect, does
 * the judgment in-session (no nested subprocess), then apply.
 *
 * WRITES only: map/graph.json, map/tags.json, map/clusters.json;
 * pulse/.insight-refresh-last-full; the transient
 * pulse/.insight-refresh-worklist.json. Core halves deterministic (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { assembleConstellation } from '../constellation/compile.js';
import type { ConstellationNode } from '../constellation/compile.js';
import { splitDataRowCells } from '../anatomy/files-md.js';
import { AUTH_FAILURE_PATTERN } from '../cli/claude-auth.js';
import {
  EDGE_KINDS,
  CONFIDENCE_LEVELS,
  isEdgeKind,
  isConfidence,
  isNodeId,
  isClusterId,
} from './formats.js';
import type {
  GraphNode,
  GraphEdge,
  InsightGraph,
  TagsFile,
  ClustersFile,
  Cluster,
  RebuildKind,
} from './formats.js';

export const WORKLIST_FILE = '.insight-refresh-worklist.json';
export const LAST_FULL_FILE = '.insight-refresh-last-full';
export const GRAPH_FILE = 'graph.json';
export const TAGS_FILE = 'tags.json';
export const CLUSTERS_FILE = 'clusters.json';

/** The permitted `map/` write basenames — the §4.10.3 write lane (JSON side). */
export const PERMITTED_WRITE_BASENAMES = [GRAPH_FILE, TAGS_FILE, CLUSTERS_FILE] as const;

/** Full rebuild cadence (spec Rule 6): full when ≥7 days since the last full. */
export const FULL_REBUILD_INTERVAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_JACCARD = 0.5;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_SCHEMA_VERSION = '2.0';

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function insightMapDir(root: string): string {
  return path.join(root, '.cortex', 'insight', 'map');
}
function pulseDir(root: string): string {
  return path.join(root, '.cortex', 'pulse');
}

/** `schemaVersion` from cortex.config.json (tolerant fallback), like the compiler. */
function readSchemaVersion(root: string): string {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    if (typeof config['schemaVersion'] === 'string' && config['schemaVersion']) {
      return config['schemaVersion'];
    }
  } catch {
    /* missing/unparseable → default */
  }
  return DEFAULT_SCHEMA_VERSION;
}

/** `insight.clusterCarryOverJaccard` from config (default 0.5, spec Rule 4). */
export function readCarryOverJaccard(root: string): number {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as { insight?: { clusterCarryOverJaccard?: unknown } };
    const value = config.insight?.clusterCarryOverJaccard;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) return value;
  } catch {
    /* missing/unparseable → default */
  }
  return DEFAULT_JACCARD;
}

/** The last-full watermark timestamp (ms), or null when never run. */
export function readLastFull(root: string): number | null {
  const p = path.join(pulseDir(root), LAST_FULL_FILE);
  if (!fs.existsSync(p)) return null;
  const parsed = Date.parse(fs.readFileSync(p, 'utf-8').trim());
  return Number.isNaN(parsed) ? null : parsed;
}

/** Map a constellation node to the lean §4.10.2 graph node. */
function toGraphNode(n: ConstellationNode): GraphNode {
  return { id: n.id, module: n.module, label: n.label };
}

/**
 * Anatomy paths whose files.md `last_seen` (col 4) parses to a moment strictly
 * after `sinceMs` — the incremental change signal (spec Rule 6). The node id is
 * `anatomy:<relpath>`.
 */
export function changedAnatomyNodeIds(root: string, sinceMs: number): Set<string> {
  const changed = new Set<string>();
  const filesPath = path.join(root, '.cortex', 'anatomy', 'files.md');
  if (!fs.existsSync(filesPath)) return changed;
  let content: string;
  try {
    content = fs.readFileSync(filesPath, 'utf-8');
  } catch {
    return changed;
  }
  for (const line of content.split('\n')) {
    const cells = splitDataRowCells(line);
    if (cells === null || cells.length < 7 || !cells[0]) continue;
    const lastSeen = Date.parse(cells[4] ?? '');
    if (!Number.isNaN(lastSeen) && lastSeen > sinceMs) changed.add(`anatomy:${cells[0]}`);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// collect — deterministic first bookend
// ---------------------------------------------------------------------------

export interface RefreshWorklist {
  kind: 'insight-refresh-worklist';
  generated: string;
  rebuild: RebuildKind;
  /** The node set to derive over: full → all nodes; incremental → changed subset + neighbourhood. */
  nodes: GraphNode[];
  nodeCount: number;
}

export interface CollectResult {
  worklistPath: string;
  rebuild: RebuildKind;
  nodeCount: number;
  totalNodes: number;
}

/**
 * `--collect` (spec Rule 1 + Rule 6): assemble the node set via the
 * constellation compiler's node-emission path (`assembleConstellation`, so ids
 * are shared, §4.10.2). Full when ≥7 days since the watermark (or never run);
 * else incremental — the anatomy nodes changed since the watermark plus their
 * constellation-edge neighbourhood.
 */
export async function collectWorklist(root: string, now: Date = new Date()): Promise<CollectResult> {
  const absRoot = path.resolve(root);
  const constellation = await assembleConstellation(absRoot);
  const allNodes = constellation.nodes.map(toGraphNode);

  const lastFull = readLastFull(absRoot);
  const full = lastFull === null || now.getTime() - lastFull >= FULL_REBUILD_INTERVAL_DAYS * DAY_MS;
  const rebuild: RebuildKind = full ? 'full' : 'incremental';

  let nodes: GraphNode[];
  if (full) {
    nodes = allNodes;
  } else {
    // Incremental neighbourhood (spec Rule 6, §4.10.2 left the exact definition
    // to spec time): the changed anatomy nodes, unioned with every node one
    // constellation-edge away (either direction).
    const changed = changedAnatomyNodeIds(absRoot, lastFull as number);
    const include = new Set<string>(changed);
    for (const edge of constellation.edges) {
      if (changed.has(edge.from)) include.add(edge.to);
      if (changed.has(edge.to)) include.add(edge.from);
    }
    nodes = allNodes.filter((n) => include.has(n.id));
  }
  nodes = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const worklist: RefreshWorklist = {
    kind: 'insight-refresh-worklist',
    generated: now.toISOString(),
    rebuild,
    nodes,
    nodeCount: nodes.length,
  };
  fs.mkdirSync(pulseDir(absRoot), { recursive: true });
  const worklistPath = path.join(pulseDir(absRoot), WORKLIST_FILE);
  fs.writeFileSync(worklistPath, JSON.stringify(worklist, null, 2) + '\n', 'utf-8');
  return { worklistPath, rebuild, nodeCount: nodes.length, totalNodes: allNodes.length };
}

// ---------------------------------------------------------------------------
// derivation shape (the in-session judgment output contract, spec Rule 1/3)
// ---------------------------------------------------------------------------

interface RawCluster {
  id?: string;
  label: string;
  members: string[];
  rationale: string;
}

export interface Derivation {
  rebuild?: RebuildKind;
  /** The node set (optional; falls back to the worklist's nodes). */
  nodes?: GraphNode[];
  tags: Record<string, string[]>;
  edges: GraphEdge[];
  clusters: RawCluster[];
  /** OPTIONAL explicit output targets — a malformed judgment tripping the write lane. */
  writes?: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** A basename is in-lane iff it is one of the three permitted JSON files (§4.10.3). */
export function isInWriteLane(target: string): boolean {
  if (target.includes('..') || path.isAbsolute(target)) return false;
  const base = path.posix.basename(target.replace(/\\/g, '/'));
  return (PERMITTED_WRITE_BASENAMES as readonly string[]).includes(base);
}

export interface DerivationValidation {
  ok: boolean;
  value?: Derivation;
  error?: string;
}

/** Validate the derivation's shape (spec Rule 1: `--apply` validates before writing). */
export function validateDerivation(raw: unknown): DerivationValidation {
  if (!isRecord(raw)) return { ok: false, error: 'derivation must be a JSON object' };
  const tags = raw['tags'];
  const edges = raw['edges'];
  const clusters = raw['clusters'];
  if (!isRecord(tags)) return { ok: false, error: '"tags" must be an object mapping node ids to label lists' };
  for (const [k, v] of Object.entries(tags)) {
    if (!isNodeId(k)) return { ok: false, error: `tags key "${k}" is not a well-formed node id` };
    if (!isStringArray(v)) return { ok: false, error: `tags["${k}"] must be an array of strings` };
  }
  if (!Array.isArray(edges)) return { ok: false, error: '"edges" must be an array' };
  const cleanEdges: GraphEdge[] = [];
  for (const e of edges) {
    if (!isRecord(e)) return { ok: false, error: 'each edge must be an object' };
    if (!isNodeId(e['from']) || !isNodeId(e['to'])) return { ok: false, error: 'edge from/to must be well-formed node ids' };
    if (!isEdgeKind(e['kind'])) return { ok: false, error: `edge kind must be one of ${EDGE_KINDS.join('|')}` };
    if (!isConfidence(e['confidence'])) return { ok: false, error: `edge confidence must be one of ${CONFIDENCE_LEVELS.join('|')}` };
    if (typeof e['rationale'] !== 'string' || e['rationale'].trim() === '') {
      return { ok: false, error: 'every edge must carry a non-empty rationale (explainability invariant)' };
    }
    cleanEdges.push({ from: e['from'], to: e['to'], kind: e['kind'], confidence: e['confidence'], rationale: e['rationale'] });
  }
  if (!Array.isArray(clusters)) return { ok: false, error: '"clusters" must be an array' };
  const cleanClusters: RawCluster[] = [];
  for (const c of clusters) {
    if (!isRecord(c)) return { ok: false, error: 'each cluster must be an object' };
    if (typeof c['label'] !== 'string' || c['label'].trim() === '') return { ok: false, error: 'cluster label must be a non-empty string' };
    if (!isStringArray(c['members'])) return { ok: false, error: 'cluster members must be an array of strings' };
    for (const m of c['members']) if (!isNodeId(m)) return { ok: false, error: `cluster member "${m}" is not a well-formed node id` };
    if (typeof c['rationale'] !== 'string' || c['rationale'].trim() === '') return { ok: false, error: 'cluster rationale must be a non-empty string' };
    const cluster: RawCluster = { label: c['label'], members: c['members'], rationale: c['rationale'] };
    if (typeof c['id'] === 'string' && c['id'] !== '') cluster.id = c['id'];
    cleanClusters.push(cluster);
  }
  const value: Derivation = { tags: tags as Record<string, string[]>, edges: cleanEdges, clusters: cleanClusters };
  if (raw['rebuild'] === 'full' || raw['rebuild'] === 'incremental') value.rebuild = raw['rebuild'];
  if (isStringArray(raw['nodes'])) {
    // nodes given as strings is invalid; nodes must be node objects.
  }
  if (Array.isArray(raw['nodes'])) {
    const nodes: GraphNode[] = [];
    for (const n of raw['nodes']) {
      if (isRecord(n) && isNodeId(n['id']) && typeof n['module'] === 'string' && typeof n['label'] === 'string') {
        nodes.push({ id: n['id'], module: n['module'], label: n['label'] });
      }
    }
    value.nodes = nodes;
  }
  if (isStringArray(raw['writes'])) value.writes = raw['writes'];
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// cluster-id carry-over + deterministic serialization (spec Rules 4 + 5)
// ---------------------------------------------------------------------------

function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'cluster' : slug;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

interface ExistingCluster {
  id: string;
  label: string;
  rationale: string;
  members: Set<string>;
}

/**
 * Assign ids to newly-derived clusters (spec Rule 4). On a full rebuild, reuse
 * an existing cluster's id+label (and preserve its rationale verbatim, Rule 5)
 * when member-set Jaccard ≥ threshold; highest match wins, ties by existing-id
 * lexical order, each existing id reused at most once. Unmatched clusters mint
 * `cluster:<label-slug>` (deduped).
 */
export function assignClusterIds(
  derived: RawCluster[],
  existing: ExistingCluster[],
  threshold: number,
): Cluster[] {
  // Candidate matches ≥ threshold, ranked deterministically.
  interface Cand { di: number; ei: number; j: number; eid: string }
  const cands: Cand[] = [];
  derived.forEach((d, di) => {
    const dmembers = new Set(d.members);
    existing.forEach((e, ei) => {
      const j = jaccard(dmembers, e.members);
      if (j >= threshold) cands.push({ di, ei, j, eid: e.id });
    });
  });
  cands.sort((a, b) => {
    if (a.j !== b.j) return b.j - a.j; // highest Jaccard first
    if (a.eid !== b.eid) return a.eid < b.eid ? -1 : 1; // ties by existing-id lexical
    return a.di - b.di;
  });
  const derivedToExisting = new Map<number, number>();
  const usedExisting = new Set<number>();
  for (const c of cands) {
    if (derivedToExisting.has(c.di) || usedExisting.has(c.ei)) continue;
    derivedToExisting.set(c.di, c.ei);
    usedExisting.add(c.ei);
  }

  const out: Cluster[] = [];
  const usedIds = new Set<string>();
  derived.forEach((d, di) => {
    const members = [...new Set(d.members)].sort();
    const match = derivedToExisting.get(di);
    if (match !== undefined) {
      const e = existing[match] as ExistingCluster;
      out.push({ id: e.id, label: e.label, members, rationale: e.rationale }); // Rule 4 (id+label) + Rule 5 (rationale verbatim)
      usedIds.add(e.id);
      return;
    }
    // Mint a fresh id from the label slug (Decision 14), deduped.
    const explicit = d.id && isClusterId(d.id) ? d.id : `cluster:${slugify(d.label)}`;
    let id = explicit;
    let n = 2;
    while (usedIds.has(id)) id = `${explicit}-${n++}`;
    usedIds.add(id);
    out.push({ id, label: d.label, members, rationale: d.rationale });
  });
  return out;
}

/** Load existing clusters (for carry-over); tolerant of an absent/garbled file. */
function loadExistingClusters(root: string): ExistingCluster[] {
  const p = path.join(insightMapDir(root), CLUSTERS_FILE);
  if (!fs.existsSync(p)) return [];
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as { clusters?: unknown };
    if (!Array.isArray(doc.clusters)) return [];
    const out: ExistingCluster[] = [];
    for (const c of doc.clusters) {
      if (isRecord(c) && typeof c['id'] === 'string' && typeof c['label'] === 'string' && isStringArray(c['members'])) {
        out.push({
          id: c['id'],
          label: c['label'],
          rationale: typeof c['rationale'] === 'string' ? c['rationale'] : '',
          members: new Set(c['members']),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Existing edges keyed by `from|to|kind` → {confidence, rationale} (Rule 5 carry-over). */
function loadExistingEdgeText(root: string): Map<string, { confidence: string; rationale: string }> {
  const map = new Map<string, { confidence: string; rationale: string }>();
  const p = path.join(insightMapDir(root), GRAPH_FILE);
  if (!fs.existsSync(p)) return map;
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as { edges?: unknown };
    if (!Array.isArray(doc.edges)) return map;
    for (const e of doc.edges) {
      if (isRecord(e) && typeof e['from'] === 'string' && typeof e['to'] === 'string' && typeof e['kind'] === 'string') {
        const key = `${e['from']}|${e['to']}|${e['kind']}`;
        map.set(key, {
          confidence: typeof e['confidence'] === 'string' ? e['confidence'] : '',
          rationale: typeof e['rationale'] === 'string' ? e['rationale'] : '',
        });
      }
    }
  } catch {
    /* garbled existing graph → no carry-over */
  }
  return map;
}

function loadExistingGraphNodes(root: string): GraphNode[] {
  const p = path.join(insightMapDir(root), GRAPH_FILE);
  if (!fs.existsSync(p)) return [];
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as { nodes?: unknown };
    if (!Array.isArray(doc.nodes)) return [];
    const out: GraphNode[] = [];
    for (const n of doc.nodes) {
      if (isRecord(n) && isNodeId(n['id']) && typeof n['module'] === 'string' && typeof n['label'] === 'string') {
        out.push({ id: n['id'], module: n['module'], label: n['label'] });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function loadExistingTags(root: string): Record<string, string[]> {
  const p = path.join(insightMapDir(root), TAGS_FILE);
  if (!fs.existsSync(p)) return {};
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as { tags?: unknown };
    if (isRecord(doc.tags)) {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(doc.tags)) if (isStringArray(v)) out[k] = v;
      return out;
    }
  } catch {
    /* garbled → none */
  }
  return {};
}

function sortNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Set<string>();
  const unique: GraphNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    unique.push(n);
  }
  return unique.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to < b.to ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return 0;
}

/** Atomic file write: write a sibling `.tmp` then rename over the target. */
function atomicWrite(target: string, content: string): void {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, target);
}

// ---------------------------------------------------------------------------
// apply — deterministic last bookend
// ---------------------------------------------------------------------------

export interface ApplyResult {
  rebuild: RebuildKind;
  nodes: number;
  edges: number;
  clusters: number;
  tags: number;
  watermarkUpdated: boolean;
}

/**
 * `--apply`: validate, carry over, sort, and write the three files atomically
 * (spec Rules 2/4/5/7). Throws on a malformed derivation or an out-of-lane
 * write target (§4.10.3 defence-in-depth). A successful FULL rebuild advances
 * the watermark.
 */
export function applyDerivation(root: string, raw: unknown, now: Date = new Date()): ApplyResult {
  const absRoot = path.resolve(root);

  const validation = validateDerivation(raw);
  if (!validation.ok || !validation.value) {
    throw new Error(validation.error ?? 'invalid derivation');
  }
  const derivation = validation.value;

  // Rule 2 — write-lane enforcement (defence in depth): the loop writes only
  // the three named .json; any .md or foreign basename in an explicit target
  // list is refused before anything lands.
  for (const target of derivation.writes ?? PERMITTED_WRITE_BASENAMES) {
    if (!isInWriteLane(target)) {
      throw new Error(
        `refused out-of-lane write target "${target}": the refresh loop writes only ${PERMITTED_WRITE_BASENAMES.join(', ')} in insight/map/ (§4.10.3)`,
      );
    }
  }

  // Node set: the derivation's, else the worklist's.
  let nodes = derivation.nodes ?? readWorklistNodes(absRoot);
  const rebuild: RebuildKind = derivation.rebuild ?? readWorklistRebuild(absRoot) ?? 'full';
  const schemaVersion = readSchemaVersion(absRoot);
  const generated = now.toISOString();

  // Carry-over sources (existing map).
  const existingClusters = loadExistingClusters(absRoot);
  const existingEdgeText = loadExistingEdgeText(absRoot);
  const threshold = readCarryOverJaccard(absRoot);

  // Edges: Rule 5 — re-derived identical edge identity keeps existing
  // confidence+rationale verbatim (git-noise mitigation).
  let edges: GraphEdge[] = derivation.edges.map((e) => {
    const carried = existingEdgeText.get(`${e.from}|${e.to}|${e.kind}`);
    return carried ? { ...e, confidence: carried.confidence as GraphEdge['confidence'], rationale: carried.rationale } : e;
  });

  // Tags.
  let tags: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(derivation.tags)) tags[k] = [...v].sort();

  // Clusters: Rule 4 id carry-over (full only; incremental keeps derived ids).
  let clusters: Cluster[] =
    rebuild === 'full'
      ? assignClusterIds(derivation.clusters, existingClusters, threshold)
      : assignClusterIds(derivation.clusters, [], threshold);

  // Incremental overlay merge (§4.10.2 leaves incremental apply underspecified;
  // resolved as: union nodes; drop existing edges touching a changed node then
  // add the derived ones; overlay tags; clusters replace when derived).
  if (rebuild === 'incremental') {
    const touched = new Set(nodes.map((n) => n.id));
    nodes = [...loadExistingGraphNodes(absRoot), ...nodes];
    const keptEdges = loadExistingEdgeText(absRoot);
    const keep: GraphEdge[] = [];
    for (const [key, text] of keptEdges) {
      const [from, to, kind] = key.split('|');
      if (touched.has(from as string) || touched.has(to as string)) continue;
      if (!isEdgeKind(kind) || !isConfidence(text.confidence)) continue;
      keep.push({ from: from as string, to: to as string, kind, confidence: text.confidence, rationale: text.rationale });
    }
    edges = [...keep, ...edges];
    tags = { ...loadExistingTags(absRoot), ...tags };
    if (derivation.clusters.length === 0) {
      clusters = existingClusters.map((e) => ({ id: e.id, label: e.label, members: [...e.members].sort(), rationale: e.rationale }));
    }
  }

  // Deterministic serialization (Rule 5): stable order; only `generated` varies.
  const sortedNodes = sortNodes(nodes);
  const dedupEdges = new Map<string, GraphEdge>();
  for (const e of edges) dedupEdges.set(`${e.from}|${e.to}|${e.kind}`, e);
  const sortedEdges = [...dedupEdges.values()].sort(compareEdges);
  const sortedTagKeys = Object.keys(tags).sort();
  const sortedTags: Record<string, string[]> = {};
  for (const k of sortedTagKeys) sortedTags[k] = tags[k] as string[];
  const sortedClusters = [...clusters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const graph: InsightGraph = { schemaVersion, generated, rebuild, nodes: sortedNodes, edges: sortedEdges };
  const tagsFile: TagsFile = { schemaVersion, generated, tags: sortedTags };
  const clustersFile: ClustersFile = { schemaVersion, generated, clusters: sortedClusters };

  const mapDir = insightMapDir(absRoot);
  fs.mkdirSync(mapDir, { recursive: true });
  atomicWrite(path.join(mapDir, GRAPH_FILE), JSON.stringify(graph, null, 2) + '\n');
  atomicWrite(path.join(mapDir, TAGS_FILE), JSON.stringify(tagsFile, null, 2) + '\n');
  atomicWrite(path.join(mapDir, CLUSTERS_FILE), JSON.stringify(clustersFile, null, 2) + '\n');

  // Rule 6 — a successful full rebuild advances the watermark.
  let watermarkUpdated = false;
  if (rebuild === 'full') {
    fs.mkdirSync(pulseDir(absRoot), { recursive: true });
    fs.writeFileSync(path.join(pulseDir(absRoot), LAST_FULL_FILE), `${generated}\n`, 'utf-8');
    watermarkUpdated = true;
  }

  return {
    rebuild,
    nodes: sortedNodes.length,
    edges: sortedEdges.length,
    clusters: sortedClusters.length,
    tags: sortedTagKeys.length,
    watermarkUpdated,
  };
}

function readWorklist(root: string): RefreshWorklist | null {
  const p = path.join(pulseDir(root), WORKLIST_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as RefreshWorklist;
  } catch {
    return null;
  }
}
function readWorklistNodes(root: string): GraphNode[] {
  const w = readWorklist(root);
  return w && Array.isArray(w.nodes) ? w.nodes : [];
}
function readWorklistRebuild(root: string): RebuildKind | null {
  const w = readWorklist(root);
  return w && (w.rebuild === 'full' || w.rebuild === 'incremental') ? w.rebuild : null;
}

// ---------------------------------------------------------------------------
// bare mode — the Rule 6 subprocess boundary (Core makes NO LLM calls)
// ---------------------------------------------------------------------------

interface SubprocessOutcome {
  kind: 'ok' | 'no-binary' | 'timeout' | 'auth' | 'error';
  stdout: string;
  detail: string;
}

function runClaudeJudgment(bin: string, prompt: string, cwd: string, timeoutMs: number): Promise<SubprocessOutcome> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-p', prompt],
      { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const out = stdout ?? '';
        const combined = `${out}\n${stderr ?? ''}`;
        if (AUTH_FAILURE_PATTERN.test(combined)) {
          resolve({ kind: 'auth', stdout: out, detail: 'the Claude CLI reported it is not authenticated' });
          return;
        }
        if (!error) {
          resolve({ kind: 'ok', stdout: out, detail: '' });
          return;
        }
        const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: unknown };
        if (err.code === 'ENOENT') {
          resolve({ kind: 'no-binary', stdout: out, detail: `claude binary not found (${bin})` });
        } else if (err.killed || err.signal === 'SIGKILL' || err.signal === 'SIGTERM') {
          resolve({ kind: 'timeout', stdout: out, detail: `subprocess timed out after ${timeoutMs}ms` });
        } else {
          resolve({ kind: 'error', stdout: out, detail: `subprocess exited with code ${String(err.code ?? 'unknown')}` });
        }
      },
    );
  });
}

/** Extract the first balanced JSON object embedded in the judgment's stdout. */
export function parseDerivationFromOutput(output: string): unknown | null {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(output.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function judgmentPrompt(): string {
  return (
    `Read .cortex/pulse/${WORKLIST_FILE} — the node set for the inferred concept map. ` +
    `For that node set derive: (1) per-node concept tags, (2) typed edges between related nodes, ` +
    `(3) domain clusters. Use ONLY explainable inference — every edge and cluster carries a one-line, ` +
    `non-empty rationale; NO embeddings, NO opaque similarity. ` +
    `Output ONLY a JSON object shaped {"tags": {"<node-id>": ["label"]}, ` +
    `"edges": [{"from": "<node-id>", "to": "<node-id>", "kind": "${EDGE_KINDS.join('|')}", ` +
    `"confidence": "${CONFIDENCE_LEVELS.join('|')}", "rationale": "<one line>"}], ` +
    `"clusters": [{"label": "<name>", "members": ["<node-id>"], "rationale": "<one line>"}]}. ` +
    `Do not write any files.`
  );
}

// ---------------------------------------------------------------------------
// entry — the three modes (spec Rule 1)
// ---------------------------------------------------------------------------

export interface RefreshOptions {
  collect?: boolean;
  applyFile?: string;
  noLlm?: boolean;
  /** Testability seams (never LLM behaviour — the subprocess stays opaque). */
  claudeBin?: string;
  timeoutMs?: number;
  now?: Date;
}

export async function runRefresh(root = '.', opts: RefreshOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.applyFile !== undefined) {
    console.error('cortex loop-insight-refresh: --collect and --apply are mutually exclusive.');
    return 1;
  }

  // Mode 1 — collect only (the shipped skill's first step).
  if (opts.collect) {
    const result = await collectWorklist(absRoot, now);
    console.log(
      `cortex loop-insight-refresh: ${result.rebuild} rebuild — ${result.nodeCount} node(s) ` +
        `(of ${result.totalNodes}) written to .cortex/pulse/${WORKLIST_FILE}.`,
    );
    return 0;
  }

  // Mode 2 — apply only (the shipped skill's last step).
  if (opts.applyFile !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(opts.applyFile, 'utf-8')) as unknown;
    } catch (err) {
      console.error(`cortex loop-insight-refresh: cannot read derivation file ${opts.applyFile}: ${(err as Error).message}`);
      return 1;
    }
    try {
      const app = applyDerivation(absRoot, raw, now);
      console.log(
        `cortex loop-insight-refresh: ${app.rebuild} rebuild written — ${app.nodes} node(s), ${app.edges} edge(s), ` +
          `${app.clusters} cluster(s), ${app.tags} tagged node(s)${app.watermarkUpdated ? '; watermark advanced' : ''}.`,
      );
      return 0;
    } catch (err) {
      console.error(`cortex loop-insight-refresh: ${(err as Error).message}`);
      return 1;
    }
  }

  // Mode 3 — bare: collect → headless judgment subprocess → apply.
  const collected = await collectWorklist(absRoot, now);

  const degrade = (notice: string, exitCode: number): number => {
    console.log(`cortex loop-insight-refresh: ${notice}`);
    return exitCode;
  };

  if (opts.noLlm) {
    return degrade(
      `judgment pass skipped (--no-llm); ${collected.rebuild} worklist retained at .cortex/pulse/${WORKLIST_FILE} for the scheduled skill run.`,
      0,
    );
  }

  const outcome = await runClaudeJudgment(
    opts.claudeBin ?? 'claude',
    judgmentPrompt(),
    absRoot,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  switch (outcome.kind) {
    case 'auth':
      console.error(
        `cortex loop-insight-refresh: judgment pass failed: ${outcome.detail}. Authenticate the Claude CLI ` +
          `(run \`claude\` and log in via /login), then re-run — worklist retained at .cortex/pulse/${WORKLIST_FILE}.`,
      );
      return 3;
    case 'no-binary':
    case 'timeout':
    case 'error':
      return degrade(
        `judgment pass skipped (${outcome.detail}); worklist retained at .cortex/pulse/${WORKLIST_FILE} for the scheduled skill run.`,
        0,
      );
    case 'ok': {
      const derivation = parseDerivationFromOutput(outcome.stdout);
      if (derivation === null) {
        return degrade(
          `judgment pass produced no usable derivation JSON; worklist retained at .cortex/pulse/${WORKLIST_FILE} for the scheduled skill run.`,
          0,
        );
      }
      try {
        const app = applyDerivation(absRoot, derivation, now);
        console.log(
          `cortex loop-insight-refresh: ${app.rebuild} rebuild written — ${app.nodes} node(s), ${app.edges} edge(s), ` +
            `${app.clusters} cluster(s).`,
        );
        return 0;
      } catch (err) {
        return degrade(
          `judgment pass output rejected (${(err as Error).message}); worklist retained at .cortex/pulse/${WORKLIST_FILE}.`,
          0,
        );
      }
    }
  }
}
