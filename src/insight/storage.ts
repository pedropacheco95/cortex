/**
 * Insight v3 storage formats — the JSON/YAML shape definitions, deterministic
 * serializers, and the crashed-refresh shrink guard for the rebuilt `insight/`
 * module (spec insight.storage-format; cortex-schema.md §4.10.3–§4.10.6).
 *
 * Owns: the path-derived node-id grammar (`file:` / `element:` / `concept:`),
 * the closed `edge_type` + 4-tier `confidence` enums, `graph.json` /
 * `tags.json` / `clusters.json`, the staleness ledger (`ledger.json`), the
 * reverse-dependency index (`reverse-index.json`), and `scope-registry.yaml`.
 * The per-file markdown entry contract lives in ./entry.ts.
 *
 * Parse/guard helpers are pure (no fs, no LLM — R-001); only the shrink-guard
 * write API at the bottom touches the filesystem. NO embeddings anywhere in
 * this layer (design §1.3): a vector/embedding/similarity-score field is a
 * shape error, not a tolerated extra.
 *
 * The v2.0 concept-map formats (`insight/map/`) are superseded — their
 * legacy definitions remain in ./formats.ts only for the remaining v2
 * constellation-overlay consumers (design §8.4; that preset retires at
 * build-order-v3 step 10/open). The v2 refresh/gaps loops retired at 5e.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseYamlDocument } from '../archive/formats.js';

export interface ParseResult<T> {
  ok: boolean;
  value?: T;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Closed enums (§4.10.6) — extending any of these is a MINOR schema bump.
// ---------------------------------------------------------------------------

/** Edge kinds (Decision 24 / addendum A10-4). */
export const EDGE_TYPES = [
  'imports',
  'calls',
  'semantically-similar-to',
  'implements-concept',
  'co-clustered',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

/** Discrete confidence TIERS, each tied to a named evidence type — never a
 *  float (Decision 25 / addendum A10-5). */
export const CONFIDENCE_TIERS = ['structural', 'stated', 'inferred', 'ambiguous'] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

/** Typed tag vocabulary kinds (Decision 26 / addendum A10-6). */
export const TAG_KINDS = ['concern', 'technology', 'pattern', 'layer', 'domain-term'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** Graph node kinds (§4.10.6). */
export const NODE_KINDS = ['file', 'element', 'concept'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

// ---------------------------------------------------------------------------
// Id grammars (§4.10.6, Decision 27 / addendum A10-7) — path-derived, NOT the
// v2.0 constellation-borrowed grammar.
// ---------------------------------------------------------------------------

export const FILE_NODE_ID_PATTERN = /^file:[^#\s]+$/;
export const ELEMENT_NODE_ID_PATTERN = /^element:[^#\s]+#\S+$/;
export const CONCEPT_NODE_ID_PATTERN = /^concept:[a-z0-9-]+$/;
export const CLUSTER_ID_PATTERN = /^cluster:[a-z0-9-]+$/;
export const EDGE_ID_PATTERN = /^edge:.+$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function isEdgeType(v: unknown): v is EdgeType {
  return typeof v === 'string' && (EDGE_TYPES as readonly string[]).includes(v);
}

export function isConfidenceTier(v: unknown): v is ConfidenceTier {
  return typeof v === 'string' && (CONFIDENCE_TIERS as readonly string[]).includes(v);
}

export function isTagKind(v: unknown): v is TagKind {
  return typeof v === 'string' && (TAG_KINDS as readonly string[]).includes(v);
}

export function isNodeKind(v: unknown): v is NodeKind {
  return typeof v === 'string' && (NODE_KINDS as readonly string[]).includes(v);
}

/** Well-formed v3 node id: `file:<relpath>`, `element:<relpath>#<name>`, or
 *  `concept:<slug>`. */
export function isNodeId(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    (FILE_NODE_ID_PATTERN.test(v) || ELEMENT_NODE_ID_PATTERN.test(v) || CONCEPT_NODE_ID_PATTERN.test(v))
  );
}

export function isClusterId(v: unknown): v is string {
  return typeof v === 'string' && CLUSTER_ID_PATTERN.test(v);
}

/** Well-formed referencing id for reverse-index members: a concept id or an
 *  edge id (§4.10.5). */
export function isConceptOrEdgeId(v: unknown): v is string {
  return typeof v === 'string' && (CONCEPT_NODE_ID_PATTERN.test(v) || EDGE_ID_PATTERN.test(v));
}

export function isSha256(v: unknown): v is string {
  return typeof v === 'string' && SHA256_PATTERN.test(v);
}

/** Non-empty ISO-8601-ish datetime (string or YAML-coerced Date). */
export function isIsoDatetime(v: unknown): v is string | Date {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v !== 'string' || v.trim() === '') return false;
  return !Number.isNaN(Date.parse(v));
}

/** Stable edge id derived from (source, target, edge_type) — §4.10.6. */
export function deriveEdgeId(source: string, target: string, edgeType: EdgeType): string {
  return `edge:${edgeType}:${source}->${target}`;
}

// ---------------------------------------------------------------------------
// Interfaces (§4.10.4–§4.10.6).
// ---------------------------------------------------------------------------

export interface GraphNodeV3 {
  id: string;
  kind: NodeKind;
  label: string;
}

export interface GraphEdgeV3 {
  id: string;
  source: string;
  target: string;
  edge_type: EdgeType;
  confidence: ConfidenceTier;
  /** Non-empty rationale — explainability is a module invariant (design §1.3). */
  evidence: string;
  /** Last refresh that re-confirmed the edge (confidence-aging, design §5.9). */
  confirmed_at_commit: string;
}

export interface InsightGraphV3 {
  schemaVersion: string;
  generated: string;
  built_at_commit: string;
  nodes: GraphNodeV3[];
  edges: GraphEdgeV3[];
}

export interface TagVocabularyEntry {
  tag: string;
  kind: TagKind;
  aliases?: string[];
}

export interface TagsFileV3 {
  schemaVersion: string;
  generated: string;
  built_at_commit: string;
  vocabulary: TagVocabularyEntry[];
  /** node-id → tags; every tag must appear in `vocabulary`. */
  assignments: Record<string, string[]>;
}

export interface ClusterV3 {
  /** `cluster:<label-slug>`. */
  id: string;
  label: string;
  members: string[];
  rationale: string;
  /** A declared scope id, or `global`. */
  scope: string;
}

export interface ClustersFileV3 {
  schemaVersion: string;
  generated: string;
  built_at_commit: string;
  clusters: ClusterV3[];
}

/** §4.10.4 — the module-level staleness ledger. */
export interface LedgerEntry {
  source_sha256: string;
  built_at_commit: string;
  extraction_level: 2 | 3;
}

export interface LedgerFile {
  schemaVersion: string;
  built_at_commit: string;
  entries: Record<string, LedgerEntry>;
  /** OPTIONAL (insight.refresh-loops, 5e-ii): concept/edge ids invalidated by
   *  the reverse-dependency index, awaiting re-verification by the daily/full
   *  loop. Absent means none. */
  stale?: string[];
  /** OPTIONAL (insight.refresh-loops, 5e-ii): the last N refresh-cycle head
   *  commits, most recent first — the confidence-aging window. An
   *  inferred/ambiguous edge whose `confirmed_at_commit` is not in this list
   *  (once N cycles exist) is surfaced for re-verification. */
  cycle_commits?: string[];
}

/** §4.10.5 — the reverse-dependency index. */
export interface ReverseIndexFile {
  schemaVersion: string;
  built_at_commit: string;
  /** entity node id → every concept/edge id citing it. */
  referenced_by: Record<string, string[]>;
}

/** §4.10.3 — the durable scope tree (scoped extractions only). */
export interface ScopeEntry {
  path: string;
  depends_on: string[];
  shared_by?: string[];
}

export interface ScopeRegistry {
  schemaVersion: string;
  built_at_commit: string;
  scopes: Record<string, ScopeEntry>;
}

// ---------------------------------------------------------------------------
// Shared coercion + field guards.
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

function checkHeader(obj: Record<string, unknown>, errors: string[], withGenerated: boolean): void {
  if (typeof obj['schemaVersion'] !== 'string' || obj['schemaVersion'] === '') {
    errors.push('missing or non-string "schemaVersion"');
  }
  if (withGenerated && !isIsoDatetime(obj['generated'])) {
    errors.push('missing or non-ISO "generated"');
  }
  if (typeof obj['built_at_commit'] !== 'string' || obj['built_at_commit'] === '') {
    errors.push('missing or non-string "built_at_commit"');
  }
}

/** NO embeddings anywhere in this layer (design §1.3): any field whose name
 *  smells like a vector/embedding/similarity score is a shape error. */
const FORBIDDEN_FIELD_PATTERN = /^(embedding|embeddings|vector|vectors|similarity|similarity_score|score)$/i;

function checkNoVectorFields(obj: Record<string, unknown>, where: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_FIELD_PATTERN.test(key)) {
      errors.push(`${where}.${key}: embeddings/vectors/similarity scores are not permitted fields (design §1.3)`);
    }
  }
}

// ---------------------------------------------------------------------------
// parseGraphV3 / parseTagsV3 / parseClustersV3 (§4.10.6) — deterministic, pure.
// ---------------------------------------------------------------------------

export function parseGraphV3(input: unknown): ParseResult<InsightGraphV3> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkHeader(obj, errors, true);

  const nodes = obj['nodes'];
  if (!Array.isArray(nodes)) {
    errors.push('"nodes" must be an array');
  } else {
    nodes.forEach((n, i) => {
      const node = n as Record<string, unknown>;
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        errors.push(`nodes[${i}]: not an object`);
        return;
      }
      if (!isNodeId(node['id'])) {
        errors.push(`nodes[${i}].id: not a well-formed node id (file:<relpath> | element:<relpath>#<name> | concept:<slug>)`);
      }
      if (!isNodeKind(node['kind'])) errors.push(`nodes[${i}].kind: must be one of ${NODE_KINDS.join(' | ')}`);
      if (typeof node['label'] !== 'string' || node['label'] === '') errors.push(`nodes[${i}].label: missing`);
      checkNoVectorFields(node, `nodes[${i}]`, errors);
    });
  }

  const edges = obj['edges'];
  if (!Array.isArray(edges)) {
    errors.push('"edges" must be an array');
  } else {
    edges.forEach((e, i) => {
      const edge = e as Record<string, unknown>;
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
        errors.push(`edges[${i}]: not an object`);
        return;
      }
      if (typeof edge['id'] !== 'string' || !EDGE_ID_PATTERN.test(edge['id'])) {
        errors.push(`edges[${i}].id: must be a stable "edge:…" id`);
      }
      if (!isNodeId(edge['source'])) errors.push(`edges[${i}].source: not a well-formed node id`);
      if (!isNodeId(edge['target'])) errors.push(`edges[${i}].target: not a well-formed node id`);
      if (!isEdgeType(edge['edge_type'])) {
        errors.push(`edges[${i}].edge_type: not in the closed enum (${EDGE_TYPES.join(' | ')})`);
      }
      if (!isConfidenceTier(edge['confidence'])) {
        errors.push(`edges[${i}].confidence: must be a tier (${CONFIDENCE_TIERS.join(' | ')}), never a float`);
      }
      if (typeof edge['evidence'] !== 'string' || edge['evidence'].trim() === '') {
        errors.push(`edges[${i}].evidence: must be a non-empty rationale string (module invariant, design §1.3)`);
      }
      if (typeof edge['confirmed_at_commit'] !== 'string' || edge['confirmed_at_commit'] === '') {
        errors.push(`edges[${i}].confirmed_at_commit: missing`);
      }
      checkNoVectorFields(edge, `edges[${i}]`, errors);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as InsightGraphV3 };
}

export function parseTagsV3(input: unknown): ParseResult<TagsFileV3> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkHeader(obj, errors, true);

  const declared = new Set<string>();
  const vocabulary = obj['vocabulary'];
  if (!Array.isArray(vocabulary)) {
    errors.push('"vocabulary" must be an array');
  } else {
    vocabulary.forEach((v, i) => {
      const entry = v as Record<string, unknown>;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`vocabulary[${i}]: not an object`);
        return;
      }
      if (typeof entry['tag'] !== 'string' || entry['tag'] === '') {
        errors.push(`vocabulary[${i}].tag: missing`);
      } else {
        declared.add(entry['tag']);
      }
      if (!isTagKind(entry['kind'])) {
        errors.push(`vocabulary[${i}].kind: must be one of ${TAG_KINDS.join(' | ')}`);
      }
      if (entry['aliases'] !== undefined) {
        const a = entry['aliases'];
        if (!Array.isArray(a) || a.some((x) => typeof x !== 'string')) {
          errors.push(`vocabulary[${i}].aliases: must be a list of strings when present`);
        }
      }
      checkNoVectorFields(entry, `vocabulary[${i}]`, errors);
    });
  }

  const assignments = obj['assignments'];
  if (assignments === null || typeof assignments !== 'object' || Array.isArray(assignments)) {
    errors.push('"assignments" must be an object mapping node ids to tag lists');
  } else {
    for (const [key, value] of Object.entries(assignments as Record<string, unknown>)) {
      if (!isNodeId(key)) errors.push(`assignments["${key}"]: key is not a well-formed node id`);
      if (!Array.isArray(value) || value.some((t) => typeof t !== 'string')) {
        errors.push(`assignments["${key}"]: value must be an array of strings`);
        continue;
      }
      for (const tag of value as string[]) {
        if (!declared.has(tag)) {
          errors.push(`assignments["${key}"]: tag "${tag}" does not appear in the vocabulary`);
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as TagsFileV3 };
}

export function parseClustersV3(input: unknown): ParseResult<ClustersFileV3> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkHeader(obj, errors, true);

  const clusters = obj['clusters'];
  if (!Array.isArray(clusters)) {
    errors.push('"clusters" must be an array');
  } else {
    const seen = new Set<string>();
    clusters.forEach((c, i) => {
      const cluster = c as Record<string, unknown>;
      if (!cluster || typeof cluster !== 'object' || Array.isArray(cluster)) {
        errors.push(`clusters[${i}]: not an object`);
        return;
      }
      if (!isClusterId(cluster['id'])) {
        errors.push(`clusters[${i}].id: not a well-formed cluster:<slug> id`);
      } else {
        if (seen.has(cluster['id'] as string)) errors.push(`clusters[${i}].id: duplicate "${cluster['id'] as string}"`);
        seen.add(cluster['id'] as string);
      }
      if (typeof cluster['label'] !== 'string' || cluster['label'] === '') errors.push(`clusters[${i}].label: missing`);
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
      if (typeof cluster['scope'] !== 'string' || cluster['scope'] === '') {
        errors.push(`clusters[${i}].scope: must be a declared scope id or "global"`);
      }
      checkNoVectorFields(cluster, `clusters[${i}]`, errors);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as ClustersFileV3 };
}

// ---------------------------------------------------------------------------
// parseLedger / parseReverseIndex (§4.10.4, §4.10.5).
// ---------------------------------------------------------------------------

export function parseLedger(input: unknown): ParseResult<LedgerFile> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkHeader(obj, errors, false);

  const entries = obj['entries'];
  if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) {
    errors.push('"entries" must be an object keyed by source path');
  } else {
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
      const entry = value as Record<string, unknown>;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`entries["${key}"]: not an object`);
        continue;
      }
      if (!isSha256(entry['source_sha256'])) {
        errors.push(`entries["${key}"].source_sha256: must be 64 lowercase hex characters`);
      }
      if (typeof entry['built_at_commit'] !== 'string' || entry['built_at_commit'] === '') {
        errors.push(`entries["${key}"].built_at_commit: missing`);
      }
      if (entry['extraction_level'] !== 2 && entry['extraction_level'] !== 3) {
        errors.push(`entries["${key}"].extraction_level: must be 2 or 3`);
      }
    }
  }

  // Optional 5e-ii fields (insight.refresh-loops): validated when present.
  if (obj['stale'] !== undefined) {
    const stale = obj['stale'];
    if (!Array.isArray(stale)) {
      errors.push('"stale" must be an array of concept/edge ids when present');
    } else {
      stale.forEach((m, i) => {
        if (!isConceptOrEdgeId(m)) errors.push(`stale[${i}]: not a well-formed concept:<slug> or edge:… id`);
      });
    }
  }
  if (obj['cycle_commits'] !== undefined) {
    const cycles = obj['cycle_commits'];
    if (!Array.isArray(cycles) || cycles.some((c) => typeof c !== 'string' || c === '')) {
      errors.push('"cycle_commits" must be an array of non-empty commit strings when present');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as LedgerFile };
}

export function parseReverseIndex(input: unknown): ParseResult<ReverseIndexFile> {
  const { obj, error } = asObject(input);
  if (!obj) return { ok: false, errors: [error ?? 'not an object'] };
  const errors: string[] = [];
  checkHeader(obj, errors, false);

  const refs = obj['referenced_by'];
  if (refs === null || typeof refs !== 'object' || Array.isArray(refs)) {
    errors.push('"referenced_by" must be an object keyed by entity node id');
  } else {
    for (const [key, value] of Object.entries(refs as Record<string, unknown>)) {
      if (!isNodeId(key)) errors.push(`referenced_by["${key}"]: key is not a well-formed node id`);
      if (!Array.isArray(value)) {
        errors.push(`referenced_by["${key}"]: value must be an array`);
        continue;
      }
      value.forEach((m, j) => {
        if (!isConceptOrEdgeId(m)) {
          errors.push(`referenced_by["${key}"][${j}]: not a well-formed concept:<slug> or edge:… id`);
        }
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: obj as unknown as ReverseIndexFile };
}

// ---------------------------------------------------------------------------
// parseScopeRegistry (§4.10.3) — YAML, pure (path resolution is the check's
// job; it needs fs). Cycle detection is an error; shared_by/depends_on
// asymmetry is reported separately as warnings.
// ---------------------------------------------------------------------------

export function parseScopeRegistry(raw: string): ParseResult<ScopeRegistry> {
  const parsed = parseYamlDocument(raw);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  const data = parsed.value;
  const errors: string[] = [];

  if (typeof data['schemaVersion'] !== 'string' && typeof data['schemaVersion'] !== 'number') {
    errors.push('missing "schemaVersion"');
  }
  // Tolerate YAML numeric coercion (same tolerance as schemaVersion): an
  // all-decimal short sha (e.g. 8449872) parses as a number when unquoted.
  const builtAtCommit = data['built_at_commit'];
  if ((typeof builtAtCommit !== 'string' && typeof builtAtCommit !== 'number') || builtAtCommit === '') {
    errors.push('missing or non-string "built_at_commit"');
  }

  const scopesRaw = data['scopes'];
  if (scopesRaw === null || typeof scopesRaw !== 'object' || Array.isArray(scopesRaw)) {
    errors.push('"scopes" must be a mapping keyed by scope id');
    return { ok: false, errors };
  }
  const scopes = scopesRaw as Record<string, unknown>;
  const declared = new Set(Object.keys(scopes));

  for (const [id, value] of Object.entries(scopes)) {
    const scope = value as Record<string, unknown>;
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
      errors.push(`scopes.${id}: not a mapping`);
      continue;
    }
    if (typeof scope['path'] !== 'string' || scope['path'] === '') {
      errors.push(`scopes.${id}.path: required project-relative directory path`);
    }
    const dependsOn = scope['depends_on'];
    if (!Array.isArray(dependsOn) || dependsOn.some((d) => typeof d !== 'string')) {
      errors.push(`scopes.${id}.depends_on: required list of scope ids (may be empty)`);
    } else {
      for (const dep of dependsOn as string[]) {
        if (!declared.has(dep)) errors.push(`scopes.${id}.depends_on: "${dep}" is not a declared scope`);
      }
    }
    if (scope['shared_by'] !== undefined) {
      const sharedBy = scope['shared_by'];
      if (!Array.isArray(sharedBy) || sharedBy.some((s) => typeof s !== 'string')) {
        errors.push(`scopes.${id}.shared_by: must be a list of scope ids when present`);
      } else {
        for (const parent of sharedBy as string[]) {
          if (!declared.has(parent)) errors.push(`scopes.${id}.shared_by: "${parent}" is not a declared scope`);
        }
      }
    }
  }

  // depends_on acyclicity (error).
  const cycle = findDependsOnCycle(scopes);
  if (cycle) errors.push(`depends_on cycle: ${cycle.join(' -> ')}`);

  if (errors.length > 0) return { ok: false, errors };
  const value: ScopeRegistry = {
    schemaVersion: String(data['schemaVersion']),
    built_at_commit: String(data['built_at_commit']),
    scopes: scopes as unknown as Record<string, ScopeEntry>,
  };
  return { ok: true, value };
}

function findDependsOnCycle(scopes: Record<string, unknown>): string[] | undefined {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  let cycle: string[] | undefined;

  function visit(id: string): void {
    if (cycle || state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      cycle = [...stack.slice(stack.indexOf(id)), id];
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    const scope = scopes[id] as Record<string, unknown> | undefined;
    const deps = Array.isArray(scope?.['depends_on']) ? (scope['depends_on'] as unknown[]) : [];
    for (const dep of deps) {
      if (typeof dep === 'string' && dep in scopes) visit(dep);
    }
    stack.pop();
    state.set(id, 'done');
  }

  for (const id of Object.keys(scopes)) visit(id);
  return cycle;
}

/** `shared_by` should be the inverse of `depends_on` — asymmetry is a warning,
 *  not an error (§4.10.3). Returns human-readable asymmetry descriptions. */
export function scopeRegistryAsymmetries(registry: ScopeRegistry): string[] {
  const warnings: string[] = [];
  for (const [id, scope] of Object.entries(registry.scopes)) {
    for (const parent of scope.shared_by ?? []) {
      const parentScope = registry.scopes[parent];
      if (parentScope && !parentScope.depends_on.includes(id)) {
        warnings.push(`scope "${id}" declares shared_by "${parent}", but "${parent}" does not depend_on "${id}"`);
      }
    }
    for (const dep of scope.depends_on) {
      const depScope = registry.scopes[dep];
      if (depScope?.shared_by !== undefined && !depScope.shared_by.includes(id)) {
        warnings.push(`scope "${id}" depends_on "${dep}", but "${dep}"'s shared_by does not list "${id}"`);
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Deterministic total-ordered serializers (§4.10.6): nodes/edges/tags/clusters
// sorted so only `generated`/`built_at_commit` vary run-to-run and diffs are
// meaningful, not permutation noise.
// ---------------------------------------------------------------------------

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedStrings(arr: readonly string[]): string[] {
  return [...arr].sort(byString);
}

function stringify(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

export function serializeGraphV3(graph: InsightGraphV3): string {
  return stringify({
    schemaVersion: graph.schemaVersion,
    generated: graph.generated,
    built_at_commit: graph.built_at_commit,
    nodes: [...graph.nodes]
      .sort((a, b) => byString(a.id, b.id))
      .map((n) => ({ id: n.id, kind: n.kind, label: n.label })),
    edges: [...graph.edges]
      .sort((a, b) => byString(a.id, b.id))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        edge_type: e.edge_type,
        confidence: e.confidence,
        evidence: e.evidence,
        confirmed_at_commit: e.confirmed_at_commit,
      })),
  });
}

export function serializeTagsV3(tags: TagsFileV3): string {
  const assignments: Record<string, string[]> = {};
  for (const key of sortedStrings(Object.keys(tags.assignments))) {
    assignments[key] = sortedStrings(tags.assignments[key] ?? []);
  }
  return stringify({
    schemaVersion: tags.schemaVersion,
    generated: tags.generated,
    built_at_commit: tags.built_at_commit,
    vocabulary: [...tags.vocabulary]
      .sort((a, b) => byString(a.tag, b.tag))
      .map((v) => ({
        tag: v.tag,
        kind: v.kind,
        ...(v.aliases !== undefined ? { aliases: sortedStrings(v.aliases) } : {}),
      })),
    assignments,
  });
}

export function serializeClustersV3(clusters: ClustersFileV3): string {
  return stringify({
    schemaVersion: clusters.schemaVersion,
    generated: clusters.generated,
    built_at_commit: clusters.built_at_commit,
    clusters: [...clusters.clusters]
      .sort((a, b) => byString(a.id, b.id))
      .map((c) => ({
        id: c.id,
        label: c.label,
        members: sortedStrings(c.members),
        rationale: c.rationale,
        scope: c.scope,
      })),
  });
}

export function serializeLedger(ledger: LedgerFile): string {
  const entries: Record<string, LedgerEntry> = {};
  for (const key of sortedStrings(Object.keys(ledger.entries))) {
    const e = ledger.entries[key]!;
    entries[key] = {
      source_sha256: e.source_sha256,
      built_at_commit: e.built_at_commit,
      extraction_level: e.extraction_level,
    };
  }
  return stringify({
    schemaVersion: ledger.schemaVersion,
    built_at_commit: ledger.built_at_commit,
    entries,
    // Optional 5e-ii fields: `stale` total-ordered; `cycle_commits` kept in
    // recency order (the order IS the aging window).
    ...(ledger.stale !== undefined ? { stale: sortedStrings(ledger.stale) } : {}),
    ...(ledger.cycle_commits !== undefined ? { cycle_commits: [...ledger.cycle_commits] } : {}),
  });
}

export function serializeReverseIndex(index: ReverseIndexFile): string {
  const refs: Record<string, string[]> = {};
  for (const key of sortedStrings(Object.keys(index.referenced_by))) {
    refs[key] = sortedStrings(index.referenced_by[key] ?? []);
  }
  return stringify({
    schemaVersion: index.schemaVersion,
    built_at_commit: index.built_at_commit,
    referenced_by: refs,
  });
}

// ---------------------------------------------------------------------------
// Total-ordering detection — used by check.insight-graph to flag
// non-total-ordered serialization (build-order-v3 step 5b "Done when").
// ---------------------------------------------------------------------------

function unsortedAt(ids: string[]): number {
  for (let i = 1; i < ids.length; i++) {
    if (byString(ids[i - 1]!, ids[i]!) > 0) return i;
  }
  return -1;
}

/** Ordering issues for an already shape-valid graph/tags/clusters document.
 *  Returns human-readable descriptions ([] when total-ordered). */
export function orderingIssues(kind: 'graph' | 'tags' | 'clusters', doc: unknown): string[] {
  const issues: string[] = [];
  const obj = doc as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') return issues;

  if (kind === 'graph') {
    const nodes = Array.isArray(obj['nodes']) ? (obj['nodes'] as GraphNodeV3[]) : [];
    const edges = Array.isArray(obj['edges']) ? (obj['edges'] as GraphEdgeV3[]) : [];
    if (unsortedAt(nodes.map((n) => String(n?.id))) >= 0) issues.push('nodes are not total-ordered by id');
    if (unsortedAt(edges.map((e) => String(e?.id))) >= 0) issues.push('edges are not total-ordered by id');
  } else if (kind === 'tags') {
    const vocabulary = Array.isArray(obj['vocabulary']) ? (obj['vocabulary'] as TagVocabularyEntry[]) : [];
    if (unsortedAt(vocabulary.map((v) => String(v?.tag))) >= 0) issues.push('vocabulary is not total-ordered by tag');
    const assignments = obj['assignments'];
    if (assignments && typeof assignments === 'object' && !Array.isArray(assignments)) {
      if (unsortedAt(Object.keys(assignments)) >= 0) issues.push('assignment keys are not total-ordered');
    }
  } else {
    const clusters = Array.isArray(obj['clusters']) ? (obj['clusters'] as ClusterV3[]) : [];
    if (unsortedAt(clusters.map((c) => String(c?.id))) >= 0) issues.push('clusters are not total-ordered by id');
  }
  return issues;
}

// ---------------------------------------------------------------------------
// The refuse-to-shrink write guard (§4.10.6, design §5.8): a crashed refresh
// must never silently truncate the store. The ONLY fs-touching API here.
// ---------------------------------------------------------------------------

export type InsightJsonKind = 'graph' | 'tags' | 'clusters';

export interface InsightWriteResult {
  written: boolean;
  /** Present when the write was refused by the shrink guard. */
  refusal?: string;
}

interface Counts {
  [dimension: string]: number;
}

function countsFor(kind: InsightJsonKind, doc: unknown): Counts {
  const obj = doc as Record<string, unknown>;
  if (kind === 'graph') {
    return {
      nodes: Array.isArray(obj['nodes']) ? obj['nodes'].length : 0,
      edges: Array.isArray(obj['edges']) ? obj['edges'].length : 0,
    };
  }
  if (kind === 'tags') {
    const assignments = obj['assignments'];
    return {
      vocabulary: Array.isArray(obj['vocabulary']) ? obj['vocabulary'].length : 0,
      assignments:
        assignments && typeof assignments === 'object' && !Array.isArray(assignments)
          ? Object.keys(assignments).length
          : 0,
    };
  }
  return { clusters: Array.isArray(obj['clusters']) ? obj['clusters'].length : 0 };
}

function parseFor(kind: InsightJsonKind, input: unknown): ParseResult<unknown> {
  if (kind === 'graph') return parseGraphV3(input);
  if (kind === 'tags') return parseTagsV3(input);
  return parseClustersV3(input);
}

function serializeFor(kind: InsightJsonKind, value: unknown): string {
  if (kind === 'graph') return serializeGraphV3(value as InsightGraphV3);
  if (kind === 'tags') return serializeTagsV3(value as TagsFileV3);
  return serializeClustersV3(value as ClustersFileV3);
}

/**
 * Write one of the three insight JSON files with total-ordered serialization
 * and the refuse-to-shrink guard: when the target file already holds a
 * shape-valid document of the same kind and the replacement would shrink any
 * count dimension (graph: nodes/edges; tags: vocabulary/assignments;
 * clusters: clusters), the write is REFUSED unless `force` is set.
 *
 * A shape-invalid `value` throws (a producer bug, not a guard refusal). An
 * existing file that does not parse as its kind is treated as no baseline —
 * a corrupt store never blocks recovery.
 */
export function writeInsightJson(
  filePath: string,
  kind: InsightJsonKind,
  value: InsightGraphV3 | TagsFileV3 | ClustersFileV3,
  opts: { force?: boolean } = {},
): InsightWriteResult {
  const parsed = parseFor(kind, value);
  if (!parsed.ok) {
    throw new Error(`refusing to write shape-invalid ${kind}.json: ${(parsed.errors ?? []).join('; ')}`);
  }

  if (fs.existsSync(filePath) && !opts.force) {
    let existing: unknown;
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      existing = undefined;
    }
    if (existing !== undefined && parseFor(kind, existing).ok) {
      const before = countsFor(kind, existing);
      const after = countsFor(kind, value);
      const shrunk = Object.keys(before).filter((dim) => (after[dim] ?? 0) < (before[dim] ?? 0));
      if (shrunk.length > 0) {
        return {
          written: false,
          refusal:
            `refusing to shrink ${path.basename(filePath)} without --force: ` +
            shrunk.map((dim) => `${dim} ${before[dim]} -> ${after[dim] ?? 0}`).join(', ') +
            ' (crashed-refresh guard, schema §4.10.6)',
        };
      }
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeFor(kind, value), 'utf-8');
  return { written: true };
}
