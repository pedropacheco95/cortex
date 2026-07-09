---
path: src/schema/checks/insight.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 364
size_tokens: 3599
centrality: medium
built_at_commit: "8248c76"
source_sha256: "98878bf3ef0b8c7e834a51f7ef55ae4db9500425a4da146d898c1ec6da74d2cb"
---
# src/schema/checks/insight.ts

## Purpose
Implements the full v3 insight-module validator suite (schema Appendix A, spec insight.storage-format Rule 8): `checkInsightIndex` (warning-level, insight `_index.md` must state the ungated/unreviewed trust model and reference the `cortex insight` CLI), `checkInsightEntry` (error-level, walks every per-file understanding entry under `anatomy/` and each `scopes/<scope>/anatomy/` and validates it via the shared `parseEntry` parser — this replaces v2's retired `check.insight-prose`), `checkInsightScopeRegistry` (error-level shape/path-resolution checks on `scope-registry.yaml`, asymmetry between `depends_on`/`shared_by` is only a warning), `checkInsightLedger` (validates both `ledger.json` and `reverse-index.json` under one check id since they're a matched pair), and `checkInsightGraph` (validates the module-root and every per-scope `graph.json`, plus `tags.json` and `clusters.json` — node-id uniqueness and malformed shapes are errors, dangling edge endpoints and non-total-ordered serialization are only warnings). Every check tolerates the whole `insight/` module being absent, and a legacy v2 `insight/map/` directory on disk is tolerated (warn-only, never validated against the v3 contract) as sanctioned interim dogfood per design §8.4 until it's retired.

## Main players
- `checkInsightIndex` (lines 61–86) — validates the trust-model + CLI-reference line in `insight/_index.md`. [supporting]
- `checkInsightEntry` (lines 115–153) — walks and validates every per-file understanding entry against the v3 entry contract; also warns on legacy `insight/map/` presence. [critical]
- `checkInsightScopeRegistry` (lines 159–204) — validates `scope-registry.yaml` shape, path resolution, and `depends_on`/`shared_by` symmetry. [critical]
- `checkInsightLedger` (lines 211–249) — validates `ledger.json` and `reverse-index.json` shapes under a single check id. [critical]
- `checkInsightGraph` (lines 267–363) — validates `graph.json` (root + per-scope), `tags.json`, and `clusters.json` shapes, node uniqueness, edge resolution, and serialization ordering. [critical]
- `walkMarkdownFiles` (lines 93–100), `entryDirs` (lines 104–113), `declaredScopeIds` (lines 259–265), `tryJson` (lines 48–55) — internal helpers for tree-walking and lenient JSON parsing. [supporting]

## Insights
- This is the file the extraction skill's own output (the entries being written by this very agent run) must satisfy — the `parseEntry` contract this check enforces IS the shape of the `.md` files this insight-extraction pass is currently producing. A malformed frontmatter/section-order in the file you're writing right now would fail this exact check.
- A dangling edge endpoint in `graph.json` is a warning, not an error — the module tolerates references to nodes not yet extracted (partial/incremental extraction is expected, not a corruption signal).
- The legacy `insight/map/` tolerance is explicitly time-boxed ("until steps 5c/5e retire its producers") — this is scaffolding for a migration in progress, not a permanent exemption.

## Connections
Uses:
- src/insight/entry.ts: `parseEntry` — the actual per-file entry frontmatter/section parser.
- src/insight/storage.ts: `parseGraphV3`, `parseTagsV3`, `parseClustersV3`, `parseLedger`, `parseReverseIndex`, `parseScopeRegistry`, `scopeRegistryAsymmetries`, `orderingIssues`, `isNodeId` — the full set of shape parsers this check delegates to, keeping shape logic out of the validator itself.
- src/schema/types.ts: `Violation` type.

Used by:
- src/insight/refresh-full.ts: reuses this module (likely to re-validate after a full insight regeneration).
- src/schema/validate.ts: calls all five exported check functions.

## Query pointers
If you need to understand the insight entry frontmatter contract this check enforces, also read: src/insight/entry.ts and src/insight/storage.ts (the parsers), and the entries this very extraction pass writes under `.cortex/insight/anatomy/`.
