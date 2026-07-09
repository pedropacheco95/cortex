---
path: src/insight/storage.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 3
size_lines: 885
size_tokens: 8598
centrality: high
built_at_commit: "8248c76"
source_sha256: "59fc7b6091a8edac90cdc33fa49b412582b0fd7e8a7ad8164d0bf9d890f706d6"
---
# src/insight/storage.ts

## Purpose

Owns every insight v3 JSON/YAML shape definition and its deterministic serializer: the path-derived node-id grammar (`file:`/`element:`/`concept:`), the closed `edge_type` and 4-tier `confidence` enums, `graph.json`/`tags.json`/`clusters.json`, the staleness ledger (`ledger.json`), the reverse-dependency index (`reverse-index.json`), and `scope-registry.yaml`. The per-file markdown entry contract itself lives in entry.ts, not here. Parse/guard helpers are pure; only the shrink-guard write API at the bottom touches the filesystem, and no vector/embedding/similarity field is tolerated anywhere in this layer.

## Main players

- `writeInsightJson` (lines 847–884) — writes graph/tags/clusters JSON with total-ordered serialization and the refuse-to-shrink guard (crashed-refresh protection), bypassable only with `force`. [critical]
- `parseGraphV3` / `parseTagsV3` / `parseClustersV3` (lines 274–435) — shape-validating parsers for the three core JSON stores, enforcing the node-id grammar, closed enums, non-empty edge evidence, and the no-vector-fields rule. [critical]
- `parseLedger` / `parseReverseIndex` (lines 441–517) — shape-validating parsers for the staleness ledger and reverse-dependency index, including the optional 5e-ii `stale`/`cycle_commits` fields. [critical]
- `parseScopeRegistry` / `findDependsOnCycle` (lines 525–615) — YAML parser for the scope tree plus `depends_on` cycle detection (a hard error), distinct from `shared_by`/`depends_on` asymmetry (a warning via `scopeRegistryAsymmetries`). [critical]
- `deriveEdgeId` (lines 118–120) — the stable `edge:<type>:<source>->target>` id derivation used wherever an edge is constructed. [supporting]
- `checkNoVectorFields` (lines 262–268) — rejects any embedding/vector/similarity-score-named field across all four JSON shapes; the sole enforcement point for the "no embeddings" design invariant. [critical]
- `orderingIssues` / `unsortedAt` (lines 753–784) — detects non-total-ordered serialization in an already-shape-valid document, consumed by the schema check layer. [supporting]

## Insights

This is the one file in the module allowed to touch the filesystem — the module header states parse/guard helpers are pure, and only `writeInsightJson`'s write path does fs I/O, a deliberate purity boundary the rest of the insight module relies on. The refuse-to-shrink guard treats a corrupt/unparseable existing file as "no baseline" (lines 858–865) — a crashed refresh's already-broken store never blocks recovery; only a legitimately smaller VALID replacement of a VALID store gets refused. `confidence` is a closed 4-tier enum, never a float, by explicit design decision (Decision 25) — the schema's stance against continuous similarity-score-style confidence. `checkNoVectorFields` runs its regex against every object key across nodes/edges/vocabulary/clusters (line 260 pattern), so adding a field literally named `score` anywhere in these shapes is a hard validation error, not a style nit. YAML numeric coercion is deliberately tolerated for `schemaVersion`/`built_at_commit` in the scope registry (lines 531–538) because an all-decimal short sha parses as a number when unquoted — a documented tolerance, not an oversight.

## File map

- Lines 1–30: module doc — ownership boundaries, pure-vs-fs split, v2 legacy note.
- Lines 32–120: closed enums (`EDGE_TYPES`, `CONFIDENCE_TIERS`, `TAG_KINDS`, `NODE_KINDS`), id-grammar regexes and their type guards, `deriveEdgeId`.
- Lines 122–225: interfaces for `GraphNodeV3`/`GraphEdgeV3`/`InsightGraphV3`, `TagsFileV3`, `ClustersFileV3`, `LedgerFile`/`LedgerEntry`, `ReverseIndexFile`, `ScopeRegistry`/`ScopeEntry`.
- Lines 227–268: shared coercion/field guards (`asObject`, `checkHeader`, `checkNoVectorFields`).
- Lines 270–435: `parseGraphV3`, `parseTagsV3`, `parseClustersV3`.
- Lines 437–517: `parseLedger`, `parseReverseIndex`.
- Lines 519–636: `parseScopeRegistry`, `findDependsOnCycle`, `scopeRegistryAsymmetries`.
- Lines 638–746: deterministic serializers (`serializeGraphV3`/`TagsV3`/`ClustersV3`/`Ledger`/`ReverseIndex`).
- Lines 748–784: total-ordering detection (`unsortedAt`, `orderingIssues`).
- Lines 786–884: the refuse-to-shrink write guard (`countsFor`, `parseFor`/`serializeFor` dispatch, `writeInsightJson`).

## Connections

Uses:
- src/archive/formats.ts: `parseYamlDocument` to parse the YAML scope registry.

Used by:
- src/insight/entry.ts: `isIsoDatetime`, `isSha256`, `ParseResult` for frontmatter validation.
- src/insight/query.ts: `parseGraphV3`, `parseScopeRegistry`.
- src/insight/refresh-daily.ts: graph/ledger/reverse-index parse+serialize functions and `CONCEPT_NODE_ID_PATTERN`.
- src/insight/refresh-fast.ts: `parseLedger`.
- src/insight/refresh-full.ts: `parseTagsV3`, `parseClustersV3`, `serializeLedger`, `serializeReverseIndex`.
- src/pulse/hygiene.ts: consumes these shape guards for its sweep (outside this scope).
- src/schema/checks/insight.ts: uses the parse functions for schema-conformance checks (outside this scope).

## Query pointers

If you need to add a new node/edge/tag field, read the `parse*` functions here plus `checkNoVectorFields` (the embeddings ban). For the per-file entry contract (a separate concern from these module-level stores), read src/insight/entry.ts. For how these shapes get produced, read refresh-daily.ts/refresh-full.ts (the writers) and refresh-fast.ts (the ledger reader).
