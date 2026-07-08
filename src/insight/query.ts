/**
 * Insight v3 query engine (spec insight.cli; cortex-schema.md §4.10.8) — the
 * pure, deterministic core behind the three `cortex insight` subcommands:
 * `file <path>`, `concept <name>`, `element <query>`. Supersedes the v2
 * query/get/neighbors/list engine entirely (design §5.6, §8.3).
 *
 * Reads the v3 shapes owned by insight.storage-format: per-file entries under
 * `anatomy/` or `scopes/<scope>/anatomy/` (entry.ts), `concepts/` files
 * (global and scope-local), `graph.json` (top-level and scope-local), and
 * `scope-registry.yaml`. The scoped-vs-flat difference is resolved HERE — the
 * CLI and its callers never see it (schema §4.10.1, design §5.8).
 *
 * Deterministic Core (RULES 3): no LLM at query time, no network, no ranking;
 * a miss is an explicit not-found result, never a crash and never a silently
 * empty success. All ordering is stable so the CLI's `--json` is byte-stable.
 * Never calls `process.exit` — the CLI layer (insight/cli.ts) owns I/O and
 * exit codes. Reads only `.cortex/insight/`; writes nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  parseGraphV3,
  parseScopeRegistry,
  type GraphEdgeV3,
  type InsightGraphV3,
  type ScopeRegistry,
} from './storage.js';
import { parseEntry, ENTRY_SECTIONS, type InsightEntry } from './entry.js';

/**
 * Raised when a present insight artefact is malformed (invalid JSON/YAML or a
 * failed §4.10 shape guard). The CLI surfaces this as exit 1. An *absent*
 * artefact is NOT malformed — it is an honest miss or an empty module.
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
// Module location + layout resolution (§4.10.1). The query layer hides the
// scoped/flat difference from every caller.
// ---------------------------------------------------------------------------

export interface InsightLocation {
  /** Absolute path of `.cortex/insight/`. */
  insightDir: string;
  /** True when `scope-registry.yaml` is present (scoped layout). */
  scoped: boolean;
  /** Parsed registry when scoped. */
  registry?: ScopeRegistry;
}

/** Locate `.cortex/insight/` under `root`; null when the module is absent. */
export function locateInsight(root: string): InsightLocation | null {
  const insightDir = path.join(root, '.cortex', 'insight');
  if (!fs.existsSync(insightDir) || !fs.statSync(insightDir).isDirectory()) return null;
  const registryPath = path.join(insightDir, 'scope-registry.yaml');
  if (!fs.existsSync(registryPath)) return { insightDir, scoped: false };
  const parsed = parseScopeRegistry(fs.readFileSync(registryPath, 'utf-8'));
  if (!parsed.ok || !parsed.value) {
    throw new InsightArtefactError('scope-registry.yaml', parsed.errors ?? ['invalid']);
  }
  return { insightDir, scoped: true, registry: parsed.value };
}

/** Declared scope ids, sorted for deterministic iteration. */
function scopeIds(loc: InsightLocation): string[] {
  return loc.registry ? Object.keys(loc.registry.scopes).sort() : [];
}

/** Normalize a project-relative source path (forward slashes, no leading ./). */
function normalizeSourcePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * The scope owning a source path — the longest registry `path` prefix match
 * (§4.10.3), or null when no scope owns it (top-level content).
 */
export function owningScope(loc: InsightLocation, sourcePath: string): string | null {
  if (!loc.registry) return null;
  const normalized = normalizeSourcePath(sourcePath);
  let best: string | null = null;
  let bestLen = -1;
  for (const id of scopeIds(loc)) {
    const scopePath = normalizeSourcePath(loc.registry.scopes[id]!.path);
    if (normalized === scopePath || normalized.startsWith(scopePath + '/')) {
      if (scopePath.length > bestLen) {
        best = id;
        bestLen = scopePath.length;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Graph loading — top-level plus every scope-local graph, unified (§4.10.8
// Rule 4: concept/element queries merge scope-local with cross-scope).
// ---------------------------------------------------------------------------

function loadGraphAt(insightDir: string, relFile: string): InsightGraphV3 | null {
  const p = path.join(insightDir, relFile);
  if (!fs.existsSync(p)) return null;
  const parsed = parseGraphV3(fs.readFileSync(p, 'utf-8'));
  if (!parsed.ok || !parsed.value) throw new InsightArtefactError(relFile, parsed.errors ?? ['invalid']);
  return parsed.value;
}

interface UnifiedGraph {
  /** node id → node, first writer wins (top-level, then scopes sorted). */
  nodes: Map<string, { id: string; kind: string; label: string }>;
  /** edge id → edge, deduplicated across graphs. */
  edges: Map<string, GraphEdgeV3>;
}

/** Merge the top-level graph with every scope-local graph (all optional). */
export function loadUnifiedGraph(loc: InsightLocation): UnifiedGraph {
  const files: string[] = ['graph.json'];
  for (const id of scopeIds(loc)) files.push(path.join('scopes', id, 'graph.json'));
  const nodes = new Map<string, { id: string; kind: string; label: string }>();
  const edges = new Map<string, GraphEdgeV3>();
  for (const file of files) {
    const graph = loadGraphAt(loc.insightDir, file);
    if (!graph) continue;
    for (const n of graph.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
    for (const e of graph.edges) if (!edges.has(e.id)) edges.set(e.id, e);
  }
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Section splitting — H2-delimited entry bodies (§4.10.2 section contract).
// ---------------------------------------------------------------------------

const H2_RE = /^##\s+(.+?)\s*$/;

/** Split a markdown body into `## `-titled sections (title → trimmed content). */
export function sectionContents(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = (): void => {
    if (current !== null) out[current] = buf.join('\n').trim();
  };
  for (const line of body.split('\n')) {
    const m = line.match(H2_RE);
    if (m) {
      flush();
      current = (m[1] ?? '').trim();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/** The entry's sections in the §4.10.2 canonical order (only those present). */
function orderedSections(body: string): Record<string, string> {
  const raw = sectionContents(body);
  const ordered: Record<string, string> = {};
  for (const title of ENTRY_SECTIONS) {
    if (raw[title] !== undefined) ordered[title] = raw[title];
  }
  // Preserve any non-canonical extras after the canonical ones, sorted.
  for (const title of Object.keys(raw).sort()) {
    if (ordered[title] === undefined) ordered[title] = raw[title]!;
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// `file <path>` (§4.10.8; insight.cli Rule 1).
// ---------------------------------------------------------------------------

export interface FileQueryResult {
  found: boolean;
  /** Normalized project-relative source path queried. */
  path: string;
  /** True when `.cortex/insight/` does not exist at all (Rule 8). */
  noInsight?: boolean;
  /** insight/-relative path of the entry file, when found. */
  entryFile?: string;
  /** Owning scope id, or null for top-level/flat content. */
  scope?: string | null;
  entry?: InsightEntry;
  /** Section title → content, canonical §4.10.2 order. */
  sections?: Record<string, string>;
  error?: string;
}

/** Candidate insight-relative entry paths for a source path, in priority order:
 *  owning scope, top-level `anatomy/`, then every other scope (sorted). */
function entryCandidates(loc: InsightLocation, sourcePath: string): Array<{ rel: string; scope: string | null }> {
  const rel = `anatomy/${sourcePath}.md`;
  const candidates: Array<{ rel: string; scope: string | null }> = [];
  const owner = owningScope(loc, sourcePath);
  if (owner !== null) candidates.push({ rel: path.join('scopes', owner, rel), scope: owner });
  candidates.push({ rel, scope: null });
  for (const id of scopeIds(loc)) {
    if (id !== owner) candidates.push({ rel: path.join('scopes', id, rel), scope: id });
  }
  return candidates;
}

export function fileQuery(root: string, sourcePath: string): FileQueryResult {
  const queried = normalizeSourcePath(sourcePath);
  const loc = locateInsight(root);
  if (!loc) {
    return { found: false, path: queried, noInsight: true, error: 'no insight data for this project (.cortex/insight/ does not exist — extraction has not run)' };
  }
  for (const candidate of entryCandidates(loc, queried)) {
    const abs = path.join(loc.insightDir, candidate.rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const parsed = parseEntry(fs.readFileSync(abs, 'utf-8'));
    if (!parsed.ok || !parsed.value) throw new InsightArtefactError(candidate.rel, parsed.errors ?? ['invalid']);
    return {
      found: true,
      path: queried,
      entryFile: candidate.rel,
      scope: candidate.scope,
      entry: parsed.value,
      sections: orderedSections(parsed.value.body),
    };
  }
  return { found: false, path: queried, error: `no insight entry for ${queried}` };
}

// ---------------------------------------------------------------------------
// `concept <name>` (§4.10.8; insight.cli Rule 2).
// ---------------------------------------------------------------------------

/** Concept-name slug (concept ids are `concept:<slug>`, §4.10.6). */
export function conceptSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export interface ConceptFileTouch {
  /** Project-relative source path of a file touching the concept. */
  path: string;
  /** The graph node the edge came from (`file:…` or `element:…`). */
  node: string;
  edge_type: string;
  evidence: string;
}

export interface RelatedConcept {
  slug: string;
  edge_type: string;
  evidence: string;
}

export interface ConceptQueryResult {
  found: boolean;
  name: string;
  slug: string;
  noInsight?: boolean;
  /** Where the concept doc came from: 'global', a scope id, or null (graph-only). */
  source?: string | null;
  /** insight/-relative path of the concept doc, when one exists. */
  docFile?: string;
  /** The concept doc's markdown content (frontmatter, if any, included). */
  doc?: string;
  /** Files touching the concept via graph edges, sorted by path. */
  files?: ConceptFileTouch[];
  /** Concept-to-concept edges, sorted by slug. */
  related?: RelatedConcept[];
  error?: string;
}

/** The source-file path behind a `file:` or `element:` node id, or null. */
function nodeFilePath(nodeId: string): string | null {
  if (nodeId.startsWith('file:')) return nodeId.slice('file:'.length);
  if (nodeId.startsWith('element:')) {
    const rest = nodeId.slice('element:'.length);
    const hash = rest.indexOf('#');
    return hash >= 0 ? rest.slice(0, hash) : rest;
  }
  return null;
}

export function conceptQuery(root: string, name: string): ConceptQueryResult {
  const slug = conceptSlug(name);
  const loc = locateInsight(root);
  if (!loc) {
    return { found: false, name, slug, noInsight: true, error: 'no insight data for this project (.cortex/insight/ does not exist — extraction has not run)' };
  }

  // Doc: global concepts/ first, then scope-local (sorted scope order).
  let docFile: string | undefined;
  let source: string | null | undefined;
  const globalDoc = path.join('concepts', `${slug}.md`);
  if (fs.existsSync(path.join(loc.insightDir, globalDoc))) {
    docFile = globalDoc;
    source = 'global';
  } else {
    for (const id of scopeIds(loc)) {
      const scoped = path.join('scopes', id, 'concepts', `${slug}.md`);
      if (fs.existsSync(path.join(loc.insightDir, scoped))) {
        docFile = scoped;
        source = id;
        break;
      }
    }
  }
  const doc = docFile !== undefined ? fs.readFileSync(path.join(loc.insightDir, docFile), 'utf-8') : undefined;

  // Graph: edges touching `concept:<slug>` across the unified graph set.
  const conceptId = `concept:${slug}`;
  const graph = loadUnifiedGraph(loc);
  const filesByPath = new Map<string, ConceptFileTouch>();
  const relatedBySlug = new Map<string, RelatedConcept>();
  for (const e of [...graph.edges.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const touches = e.source === conceptId || e.target === conceptId;
    if (!touches) continue;
    const other = e.source === conceptId ? e.target : e.source;
    if (other.startsWith('concept:')) {
      const otherSlug = other.slice('concept:'.length);
      if (!relatedBySlug.has(otherSlug)) {
        relatedBySlug.set(otherSlug, { slug: otherSlug, edge_type: e.edge_type, evidence: e.evidence });
      }
    } else {
      const filePath = nodeFilePath(other);
      if (filePath !== null && !filesByPath.has(filePath)) {
        filesByPath.set(filePath, { path: filePath, node: other, edge_type: e.edge_type, evidence: e.evidence });
      }
    }
  }

  const hasNode = graph.nodes.has(conceptId);
  const found = docFile !== undefined || hasNode || filesByPath.size > 0 || relatedBySlug.size > 0;
  if (!found) {
    return { found: false, name, slug, error: `no such concept: ${slug} (no concept doc and no concept:${slug} graph node)` };
  }
  return {
    found: true,
    name,
    slug,
    source: source ?? null,
    ...(docFile !== undefined ? { docFile } : {}),
    ...(doc !== undefined ? { doc } : {}),
    files: [...filesByPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    related: [...relatedBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

// ---------------------------------------------------------------------------
// `element <query>` (§4.10.8; insight.cli Rule 3). Query forms: plain `name`
// or `path#name`. Matched against `element:` graph nodes; the rich detail
// comes from the owning file entry's `## Main players` section.
// ---------------------------------------------------------------------------

export interface ElementConnection {
  edge_type: string;
  /** The other endpoint's node id. */
  other: string;
  /** 'out' when the element is the edge source, 'in' when the target. */
  direction: 'out' | 'in';
  confidence: string;
  evidence: string;
}

export interface ElementMatch {
  /** The `element:<relpath>#<name>` node id. */
  node: string;
  name: string;
  /** Project-relative source path the element lives in. */
  file: string;
  /** True when the owning file entry names it under `## Main players`. */
  rich: boolean;
  /** The Main-players bullet (description incl. line range), when rich. */
  description?: string;
  /** Edges touching the element node, sorted by edge id. */
  connections: ElementConnection[];
  /** The owning entry's `## Query pointers` content, when rich and present. */
  pointers?: string;
}

export interface ElementQueryResult {
  found: boolean;
  query: string;
  noInsight?: boolean;
  matches?: ElementMatch[];
  error?: string;
}

/** Parse `## Main players` bullets into name → bullet text (incl. wrapped
 *  continuation lines). Bullet names are the first `backticked` token. */
export function mainPlayers(section: string): Map<string, string> {
  const players = new Map<string, string>();
  let currentName: string | null = null;
  let buf: string[] = [];
  const flush = (): void => {
    if (currentName !== null && !players.has(currentName)) {
      players.set(currentName, buf.join('\n').trim());
    }
  };
  for (const line of section.split('\n')) {
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const name = /`([^`]+)`/.exec(bullet[1] ?? '');
      currentName = name?.[1] ?? null;
      buf = [line];
    } else if (currentName !== null && /^\s+\S/.test(line)) {
      buf.push(line);
    } else {
      flush();
      currentName = null;
      buf = [];
    }
  }
  flush();
  return players;
}

export function elementQuery(root: string, query: string): ElementQueryResult {
  const loc = locateInsight(root);
  if (!loc) {
    return { found: false, query, noInsight: true, error: 'no insight data for this project (.cortex/insight/ does not exist — extraction has not run)' };
  }

  // Parse the query form: `path#name` or plain `name`.
  const hash = query.indexOf('#');
  const wantedPath = hash >= 0 ? normalizeSourcePath(query.slice(0, hash)) : null;
  const wantedName = hash >= 0 ? query.slice(hash + 1) : query;

  const graph = loadUnifiedGraph(loc);
  const matchedIds: string[] = [];
  for (const id of [...graph.nodes.keys()].sort()) {
    if (!id.startsWith('element:')) continue;
    const rest = id.slice('element:'.length);
    const sep = rest.indexOf('#');
    if (sep < 0) continue;
    const filePath = rest.slice(0, sep);
    const elementName = rest.slice(sep + 1);
    if (elementName !== wantedName) continue;
    if (wantedPath !== null && filePath !== wantedPath) continue;
    matchedIds.push(id);
  }

  if (matchedIds.length === 0) {
    return { found: false, query, error: `no element matching "${query}" in the insight graph` };
  }

  const sortedEdges = [...graph.edges.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const matches: ElementMatch[] = matchedIds.map((node) => {
    const filePath = nodeFilePath(node) ?? '';
    const name = node.slice(node.indexOf('#') + 1);
    const connections: ElementConnection[] = [];
    for (const e of sortedEdges) {
      if (e.source === node) {
        connections.push({ edge_type: e.edge_type, other: e.target, direction: 'out', confidence: e.confidence, evidence: e.evidence });
      } else if (e.target === node) {
        connections.push({ edge_type: e.edge_type, other: e.source, direction: 'in', confidence: e.confidence, evidence: e.evidence });
      }
    }
    // Rich detail: the owning file entry's Main-players bullet, when present.
    const entryResult = fileQuery(root, filePath);
    let description: string | undefined;
    let pointers: string | undefined;
    if (entryResult.found && entryResult.sections) {
      const playersSection = entryResult.sections['Main players'];
      if (playersSection !== undefined) {
        description = mainPlayers(playersSection).get(name);
      }
      if (description !== undefined) {
        pointers = entryResult.sections['Query pointers'];
      }
    }
    const rich = description !== undefined;
    return {
      node,
      name,
      file: filePath,
      rich,
      ...(description !== undefined ? { description } : {}),
      connections,
      ...(pointers !== undefined ? { pointers } : {}),
    };
  });

  return { found: true, query, matches };
}
