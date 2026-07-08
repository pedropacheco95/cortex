/**
 * Insight query/traversal engine (spec insight.cli; cortex-schema.md §4.10.5).
 * The pure, deterministic core behind the four `cortex insight` commands:
 * lexical `query`, verbatim `get`, graph `neighbors`, and `list`. Reads only
 * `insight/map/` (prose `.md` + the three `.json`), returns structured results,
 * and never calls `process.exit` — the CLI layer (insight/cli.ts) owns I/O and
 * exit codes. Deterministic Core (R-001): no LLM at query time, no network, no
 * ranking, no embeddings; a miss is an honest empty result. All ordering is
 * stable (sorted by id/name) so the CLI's `--json` is byte-stable.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import {
  parseGraph,
  parseTags,
  parseClusters,
  EDGE_KINDS,
  type GraphEdge,
  type EdgeKind,
} from './formats.js';

/** Max characters of a prose-section snippet in a query hit (whitespace-collapsed). */
export const SNIPPET_MAX = 200;

// ---------------------------------------------------------------------------
// Result shapes (structured; the CLI renders these to a table or `--json`).
// ---------------------------------------------------------------------------

export interface ProseSectionHit {
  /** `map/`-relative prose file name, e.g. `setup.md`. */
  file: string;
  /** The H2 heading text (without `## `), or null for a file's preamble. */
  heading: string | null;
  /** Whitespace-collapsed section body, truncated to SNIPPET_MAX. */
  snippet: string;
}

export interface NodeHit {
  id: string;
  /** The node's concept tags (sorted) — the tags.json labels that matched. */
  tags: string[];
}

export interface ClusterHit {
  id: string;
  label: string;
}

export interface QueryResult {
  topic: string;
  sections: ProseSectionHit[];
  nodes: NodeHit[];
  clusters: ClusterHit[];
}

export interface GetResult {
  found: boolean;
  /** `map/`-relative name requested. */
  name: string;
  /** Verbatim file bytes, present iff found. */
  bytes?: Buffer;
  /** Reason when not found (unknown name or a path that escapes map/). */
  error?: string;
}

export interface NeighborsResult {
  found: boolean;
  node: string;
  kind: EdgeKind | null;
  depth: number;
  /** Edges walked to reach the subgraph (sorted by from,to,kind). */
  edges: GraphEdge[];
  /** Distinct reached node ids, excluding the start node (sorted). */
  nodes: string[];
  /** Reason when the node id is unknown. */
  error?: string;
}

export interface ListResult {
  files: string[];
  clusters: ClusterHit[];
}

/**
 * Raised when a present `map/` JSON artefact is malformed (invalid JSON or fails
 * its §4.10.2 shape guard). The CLI surfaces this as exit 1. An *absent* artefact
 * is NOT malformed — it is an honest empty module (the scaffolded, live-repo shape).
 */
export class InsightArtefactError extends Error {
  constructor(
    public readonly file: string,
    public readonly parseErrors: string[],
  ) {
    super(`malformed ${file}: ${parseErrors.join('; ')}`);
    this.name = 'InsightArtefactError';
  }
}

// ---------------------------------------------------------------------------
// map/ readers. A missing file → the empty structure; a present-but-malformed
// file → InsightArtefactError.
// ---------------------------------------------------------------------------

function readRawIfPresent(mapDir: string, name: string): string | null {
  const p = path.join(mapDir, name);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

function loadGraph(mapDir: string): ReturnType<typeof parseGraph>['value'] | null {
  const raw = readRawIfPresent(mapDir, 'graph.json');
  if (raw === null) return null;
  const result = parseGraph(raw);
  if (!result.ok || !result.value) throw new InsightArtefactError('graph.json', result.errors ?? ['invalid']);
  return result.value;
}

function loadTags(mapDir: string): ReturnType<typeof parseTags>['value'] | null {
  const raw = readRawIfPresent(mapDir, 'tags.json');
  if (raw === null) return null;
  const result = parseTags(raw);
  if (!result.ok || !result.value) throw new InsightArtefactError('tags.json', result.errors ?? ['invalid']);
  return result.value;
}

function loadClusters(mapDir: string): ReturnType<typeof parseClusters>['value'] | null {
  const raw = readRawIfPresent(mapDir, 'clusters.json');
  if (raw === null) return null;
  const result = parseClusters(raw);
  if (!result.ok || !result.value) throw new InsightArtefactError('clusters.json', result.errors ?? ['invalid']);
  return result.value;
}

/** Sorted list of `map/*.md` prose file basenames. */
function proseFiles(mapDir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(mapDir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith('.md')).sort();
}

// ---------------------------------------------------------------------------
// Prose sectioning (H2-delimited). Frontmatter is stripped; content before the
// first H2 is a preamble section with a null heading.
// ---------------------------------------------------------------------------

interface Section {
  heading: string | null;
  body: string;
}

const H2_RE = /^##\s+(.+?)\s*$/;

function splitSections(content: string): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  let heading: string | null = null;
  let body: string[] = [];
  const flush = (): void => {
    if (heading !== null || body.some((l) => l.trim() !== '')) {
      sections.push({ heading, body: body.join('\n') });
    }
  };
  for (const line of lines) {
    const m = line.match(H2_RE);
    if (m) {
      flush();
      heading = (m[1] ?? '').trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function snippetOf(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length > SNIPPET_MAX ? collapsed.slice(0, SNIPPET_MAX) + '…' : collapsed;
}

// ---------------------------------------------------------------------------
// query — lexical, grouped, case-insensitive; no LLM, no ranking, no embeddings.
// ---------------------------------------------------------------------------

export function queryInsight(mapDir: string, topic: string): QueryResult {
  const needle = topic.toLowerCase();

  // 1) Prose sections: match against the file name, the H2 heading, or the body.
  const sections: ProseSectionHit[] = [];
  for (const file of proseFiles(mapDir)) {
    const raw = readRawIfPresent(mapDir, file);
    if (raw === null) continue;
    const content = matter(raw).content;
    const fileMatches = file.toLowerCase().includes(needle);
    for (const section of splitSections(content)) {
      const headingText = section.heading ?? '';
      const matches =
        fileMatches ||
        headingText.toLowerCase().includes(needle) ||
        section.body.toLowerCase().includes(needle);
      if (matches) {
        sections.push({ file, heading: section.heading, snippet: snippetOf(section.body) });
      }
    }
  }
  sections.sort((a, b) => a.file.localeCompare(b.file) || (a.heading ?? '').localeCompare(b.heading ?? ''));

  // 2) Nodes: match against any of a node's tags (tags.json).
  const nodes: NodeHit[] = [];
  const tagsFile = loadTags(mapDir);
  if (tagsFile) {
    for (const [id, tags] of Object.entries(tagsFile.tags)) {
      if (tags.some((t) => t.toLowerCase().includes(needle))) {
        nodes.push({ id, tags: [...tags].sort() });
      }
    }
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  // 3) Clusters: match against the cluster label (or its id slug).
  const clusters: ClusterHit[] = [];
  const clustersFile = loadClusters(mapDir);
  if (clustersFile) {
    for (const c of clustersFile.clusters) {
      if (c.label.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle)) {
        clusters.push({ id: c.id, label: c.label });
      }
    }
  }
  clusters.sort((a, b) => a.id.localeCompare(b.id));

  return { topic, sections, nodes, clusters };
}

// ---------------------------------------------------------------------------
// get — verbatim bytes of a map/-relative file, refusing any path that escapes.
// ---------------------------------------------------------------------------

export function getFile(mapDir: string, name: string): GetResult {
  const mapRoot = path.resolve(mapDir);
  const resolved = path.resolve(mapRoot, name);
  const rel = path.relative(mapRoot, resolved);
  // Reject absolute names and any traversal outside map/.
  if (path.isAbsolute(name) || rel === '' || rel.startsWith('..') || rel.split(path.sep).includes('..')) {
    return { found: false, name, error: `refusing a path outside insight/map/: ${name}` };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { found: false, name, error: `no such file in insight/map/: ${name}` };
  }
  return { found: true, name, bytes: fs.readFileSync(resolved) };
}

// ---------------------------------------------------------------------------
// neighbors — BFS over graph.json edges (undirected: a concept edge relates its
// endpoints symmetrically). `kind` filters to one closed edge kind; `depth`
// bounds the walk. Unknown node id → not-found; no matching edges → node alone.
// ---------------------------------------------------------------------------

export function neighbors(
  mapDir: string,
  nodeId: string,
  opts: { kind?: EdgeKind; depth?: number } = {},
): NeighborsResult {
  const depth = opts.depth ?? 1;
  const kind = opts.kind ?? null;
  const graph = loadGraph(mapDir);

  const empty = (found: boolean, error?: string): NeighborsResult => ({
    found,
    node: nodeId,
    kind,
    depth,
    edges: [],
    nodes: [],
    ...(error !== undefined ? { error } : {}),
  });

  if (!graph) return empty(false, `unknown node id (no graph.json): ${nodeId}`);

  // Known ids: declared nodes plus any edge endpoint (tolerant, §4.10.2).
  const known = new Set<string>();
  for (const n of graph.nodes) known.add(n.id);
  for (const e of graph.edges) {
    known.add(e.from);
    known.add(e.to);
  }
  if (!known.has(nodeId)) return empty(false, `unknown node id: ${nodeId}`);

  // BFS to `depth`, treating each edge as undirected.
  const visited = new Set<string>([nodeId]);
  const walked = new Map<string, GraphEdge>();
  const edgeKey = (e: GraphEdge): string => `${e.from} ${e.to} ${e.kind}`;
  let frontier = [nodeId];
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const e of graph.edges) {
        if (kind !== null && e.kind !== kind) continue;
        let other: string | null = null;
        if (e.from === current) other = e.to;
        else if (e.to === current) other = e.from;
        if (other === null) continue;
        walked.set(edgeKey(e), e);
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }

  const reached = [...visited].filter((id) => id !== nodeId).sort((a, b) => a.localeCompare(b));
  const edges = [...walked.values()].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind),
  );
  return { found: true, node: nodeId, kind, depth, edges, nodes: reached };
}

// ---------------------------------------------------------------------------
// list — every prose file and every cluster.
// ---------------------------------------------------------------------------

export function listInsight(mapDir: string): ListResult {
  const files = proseFiles(mapDir);
  const clustersFile = loadClusters(mapDir);
  const clusters: ClusterHit[] = clustersFile
    ? clustersFile.clusters
        .map((c) => ({ id: c.id, label: c.label }))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];
  return { files, clusters };
}

/** Re-export so the CLI can validate `--kind` against the closed enum. */
export { EDGE_KINDS };
export type { EdgeKind };
