/**
 * Insight module formats — the shape definitions and deterministic parse/guard
 * helpers for the ungated `insight/` layer (spec insight.module-contract;
 * cortex-schema.md §4.10). This is the single source of truth the CLI
 * (insight.cli), the loops (insight.refresh-loop / insight.gaps-loop), and the
 * validator (schema.validator-insight-checks) all build against.
 *
 * Pure module: NO fs, NO LLM (R-001). Callers read files; these helpers only
 * inspect already-in-memory content (an object or a raw string).
 */
import matter from 'gray-matter';

// ---------------------------------------------------------------------------
// Closed enums (§4.10.2) — extending either is a MINOR schema bump.
// ---------------------------------------------------------------------------

/** Inferred concept-edge kinds (§4.10.2, closed at 2.0). */
export const EDGE_KINDS = ['semantically-related', 'same-cluster', 'mentions-same-entity'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Edge confidence levels (§4.10.2, Decision 17). */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** Rebuild provenance recorded on graph.json (§4.10.2). */
export const REBUILD_KINDS = ['full', 'incremental'] as const;
export type RebuildKind = (typeof REBUILD_KINDS)[number];

/** Prose-file frontmatter `kind` const (§4.10.1). */
export const INSIGHT_PROSE_KIND = 'insight-prose';

// ---------------------------------------------------------------------------
// Id / trailer grammars.
// ---------------------------------------------------------------------------

/** Cluster id form: `cluster:<label-slug>` (§4.10.2, Decision 14). */
export const CLUSTER_ID_PATTERN = /^cluster:[a-z0-9-]+$/;

/**
 * Node ids reuse the constellation node-id grammar (§4.9): a module prefix
 * (`anatomy | rule | bug | cerebrum | atlas | spec | business`) then a
 * non-empty body. Identity is borrowed from the constellation compiler, so this
 * only asserts the well-formed shape, not global existence.
 */
export const NODE_ID_PATTERN = /^(anatomy|rule|bug|cerebrum|atlas|spec|business):.+$/;

/**
 * Provenance trailer on a loop-appended prose entry (§4.10.1):
 * `_(observed <iso-date>, signal <n>, sessions: <id>, <id>)_`.
 */
export const PROVENANCE_TRAILER_PATTERN =
  /^_\(observed \d{4}-\d{2}-\d{2}, signal \d+, sessions: .+\)_$/;

/**
 * Promoted trailer left on an insight entry after a `promotion` accept (§4.10.4):
 * `_(promoted <iso-date> → <gated-target-path> via S-NNN)_`.
 */
export const PROMOTED_TRAILER_PATTERN =
  /^_\(promoted \d{4}-\d{2}-\d{2} → .+ via S-\d+\)_$/;

// ---------------------------------------------------------------------------
// Interfaces.
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  module: string;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  confidence: Confidence;
  rationale: string;
}

export interface InsightGraph {
  schemaVersion: string;
  generated: string;
  rebuild: RebuildKind;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TagsFile {
  schemaVersion: string;
  generated: string;
  /** node-id → concept label list. */
  tags: Record<string, string[]>;
}

export interface Cluster {
  /** `cluster:<label-slug>`. */
  id: string;
  label: string;
  members: string[];
  rationale: string;
}

export interface ClustersFile {
  schemaVersion: string;
  generated: string;
  clusters: Cluster[];
}

/** Prose frontmatter (§4.10.1) — deliberately lean (Decision 16). */
export interface ProseFrontmatter {
  kind: typeof INSIGHT_PROSE_KIND;
  updated: string;
  topic?: string;
  related_specs?: string[];
}

/** The uniform parse/guard result the validator and CLI both consume. */
export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Primitive guards.
// ---------------------------------------------------------------------------

export function isEdgeKind(v: unknown): v is EdgeKind {
  return typeof v === 'string' && (EDGE_KINDS as readonly string[]).includes(v);
}

export function isConfidence(v: unknown): v is Confidence {
  return typeof v === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(v);
}

export function isRebuildKind(v: unknown): v is RebuildKind {
  return typeof v === 'string' && (REBUILD_KINDS as readonly string[]).includes(v);
}

export function isClusterId(v: unknown): v is string {
  return typeof v === 'string' && CLUSTER_ID_PATTERN.test(v);
}

export function isNodeId(v: unknown): v is string {
  return typeof v === 'string' && NODE_ID_PATTERN.test(v);
}

/**
 * Non-empty ISO-8601-ish datetime. Accepts a string a `Date` accepts
 * (e.g. `2026-07-05T10:00:00Z`) OR a `Date` — YAML frontmatter parsers coerce an
 * unquoted ISO datetime to a `Date`, so prose `updated` arrives either way.
 */
export function isIsoDatetime(v: unknown): v is string | Date {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v !== 'string' || v.trim() === '') return false;
  return !Number.isNaN(Date.parse(v));
}

// ---------------------------------------------------------------------------
// Shared coercion: accept a raw JSON string or an already-parsed object.
// ---------------------------------------------------------------------------

function asObject(input: unknown): { obj?: Record<string, unknown>; error?: string } {
  let candidate: unknown = input;
  if (typeof input === 'string') {
    try {
      candidate = JSON.parse(input);
    } catch (e) {
      return { error: `invalid JSON: ${(e as Error).message}` };
    }
  }
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { error: 'expected a JSON object' };
  }
  return { obj: candidate as Record<string, unknown> };
}

function checkVersionAndGenerated(obj: Record<string, unknown>, errors: string[]): void {
  if (typeof obj['schemaVersion'] !== 'string' || obj['schemaVersion'] === '') {
    errors.push('missing or non-string "schemaVersion"');
  }
  if (!isIsoDatetime(obj['generated'])) {
    errors.push('missing or non-ISO "generated"');
  }
}

// ---------------------------------------------------------------------------
// parseGraph / parseTags / parseClusters — deterministic, pure.
// ---------------------------------------------------------------------------

export function parseGraph(input: unknown): ParseResult<InsightGraph> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkVersionAndGenerated(obj, errors);

  if (!isRebuildKind(obj['rebuild'])) {
    errors.push(`"rebuild" must be one of ${REBUILD_KINDS.join(' | ')}`);
  }

  const nodes = obj['nodes'];
  if (!Array.isArray(nodes)) {
    errors.push('"nodes" must be an array');
  } else {
    nodes.forEach((n, i) => {
      const node = n as Record<string, unknown>;
      if (!node || typeof node !== 'object') {
        errors.push(`nodes[${i}]: not an object`);
        return;
      }
      if (!isNodeId(node['id'])) errors.push(`nodes[${i}].id: not a well-formed node id`);
      if (typeof node['module'] !== 'string') errors.push(`nodes[${i}].module: missing`);
      if (typeof node['label'] !== 'string') errors.push(`nodes[${i}].label: missing`);
    });
  }

  const edges = obj['edges'];
  if (!Array.isArray(edges)) {
    errors.push('"edges" must be an array');
  } else {
    edges.forEach((e, i) => {
      const edge = e as Record<string, unknown>;
      if (!edge || typeof edge !== 'object') {
        errors.push(`edges[${i}]: not an object`);
        return;
      }
      if (!isNodeId(edge['from'])) errors.push(`edges[${i}].from: not a well-formed node id`);
      if (!isNodeId(edge['to'])) errors.push(`edges[${i}].to: not a well-formed node id`);
      if (!isEdgeKind(edge['kind'])) errors.push(`edges[${i}].kind: not in the closed edge-kind enum`);
      if (!isConfidence(edge['confidence'])) errors.push(`edges[${i}].confidence: not high|medium|low`);
      if (typeof edge['rationale'] !== 'string' || edge['rationale'].trim() === '') {
        errors.push(`edges[${i}].rationale: must be a non-empty string`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as InsightGraph };
}

export function parseTags(input: unknown): ParseResult<TagsFile> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkVersionAndGenerated(obj, errors);

  const tags = obj['tags'];
  if (tags === null || typeof tags !== 'object' || Array.isArray(tags)) {
    errors.push('"tags" must be an object mapping node ids to label lists');
  } else {
    for (const [key, value] of Object.entries(tags as Record<string, unknown>)) {
      if (!isNodeId(key)) errors.push(`tags["${key}"]: key is not a well-formed node id`);
      if (!Array.isArray(value) || value.some((t) => typeof t !== 'string')) {
        errors.push(`tags["${key}"]: value must be an array of strings`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as TagsFile };
}

export function parseClusters(input: unknown): ParseResult<ClustersFile> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkVersionAndGenerated(obj, errors);

  const clusters = obj['clusters'];
  if (!Array.isArray(clusters)) {
    errors.push('"clusters" must be an array');
  } else {
    const seen = new Set<string>();
    clusters.forEach((c, i) => {
      const cluster = c as Record<string, unknown>;
      if (!cluster || typeof cluster !== 'object') {
        errors.push(`clusters[${i}]: not an object`);
        return;
      }
      if (!isClusterId(cluster['id'])) {
        errors.push(`clusters[${i}].id: not a well-formed cluster:<slug> id`);
      } else {
        if (seen.has(cluster['id'] as string)) errors.push(`clusters[${i}].id: duplicate "${cluster['id'] as string}"`);
        seen.add(cluster['id'] as string);
      }
      if (typeof cluster['label'] !== 'string') errors.push(`clusters[${i}].label: missing`);
      const members = cluster['members'];
      if (!Array.isArray(members)) {
        errors.push(`clusters[${i}].members: must be an array`);
      } else {
        members.forEach((m, j) => {
          if (!isNodeId(m)) errors.push(`clusters[${i}].members[${j}]: not a well-formed node id`);
        });
      }
      if (typeof cluster['rationale'] !== 'string' || cluster['rationale'].trim() === '') {
        errors.push(`clusters[${i}].rationale: must be a non-empty string`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as ClustersFile };
}

// ---------------------------------------------------------------------------
// Prose frontmatter guard (§4.10.1). Accepts either the raw file content
// (frontmatter is extracted with gray-matter) or an already-parsed
// frontmatter object. Pure — no fs.
// ---------------------------------------------------------------------------

export function isProseFrontmatter(data: unknown): data is ProseFrontmatter {
  return parseProseFrontmatter(data).ok;
}

export function parseProseFrontmatter(input: unknown): ParseResult<ProseFrontmatter> {
  let data: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      data = matter(input).data as Record<string, unknown>;
    } catch (e) {
      return { ok: false, errors: [`unparseable frontmatter: ${(e as Error).message}`] };
    }
  } else if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    data = input as Record<string, unknown>;
  } else {
    return { ok: false, errors: ['expected raw prose content or a frontmatter object'] };
  }

  const errors: string[] = [];
  if (data['kind'] !== INSIGHT_PROSE_KIND) {
    errors.push(`frontmatter "kind" must be "${INSIGHT_PROSE_KIND}"`);
  }
  if (!isIsoDatetime(data['updated'])) {
    errors.push('frontmatter "updated" must be a non-empty ISO datetime');
  }
  if (data['topic'] !== undefined && typeof data['topic'] !== 'string') {
    errors.push('frontmatter "topic" must be a string when present');
  }
  if (data['related_specs'] !== undefined) {
    const rs = data['related_specs'];
    if (!Array.isArray(rs) || rs.some((s) => typeof s !== 'string')) {
      errors.push('frontmatter "related_specs" must be a list of ids when present');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  // Normalise `updated` to an ISO string (a YAML parser may have coerced it to a Date).
  const updated = data['updated'];
  const value = {
    ...data,
    updated: updated instanceof Date ? updated.toISOString() : (updated as string),
  } as unknown as ProseFrontmatter;
  return { ok: true, value };
}
