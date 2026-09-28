---
path: src/schema/checks/insight.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 449
size_tokens: 4602
centrality: medium
built_at_commit: "a66041b"
source_sha256: "4b87fb6d1d38caa6cb2ea8addc73c6b5f5c55254033da685bcd710842c697be3"
---
# src/schema/checks/insight.ts

## Purpose
Implements the full v3 insight-module validator suite (schema Appendix A, spec insight.storage-format Rule 8): `checkInsightIndex` (warning-level, `insight/_index.md` must state the ungated/unreviewed trust model and reference the `cortex insight` CLI); `checkInsightEntry` (error-level, walks every per-file understanding entry under `anatomy/` and each `scopes/<scope>/anatomy/` and validates it via the shared `parseEntry` parser — this is the exact contract the entries this very extraction pass writes must satisfy); `checkInsightScopeRegistry` (error-level shape/path-resolution checks on `scope-registry.yaml`, with `depends_on`/`shared_by` asymmetry only a warning); `checkInsightLedger` (validates both `ledger.json` and `reverse-index.json` under one check id, since they're a matched pair); `checkInsightGraph` (validates the module-root and every per-scope `graph.json`, plus `tags.json` and `clusters.json` — node-id uniqueness and malformed shapes are errors, dangling edge endpoints and non-total-ordered serialization only warnings); and `checkInsightObservations` (error-level, validates every `insight/observations/<theme>.md` entry's frontmatter: `kind`, `updated`, `salient`, a non-empty `sessions` list of well-formed claude-sessions refs reusing `check.provenance`'s ref grammar, and an optional shape-only `bears_on`). Every check tolerates the whole `insight/` module being absent, and a legacy v2 `insight/map/` directory on disk is tolerated (warn-only, never validated against the v3 contract) as sanctioned interim dogfood per design §8.4.

## Connections
Uses:
- src/insight/entry.ts: `parseEntry` — the per-file entry frontmatter/section parser `checkInsightEntry` delegates to.
- src/insight/storage.ts: `parseGraphV3`, `parseTagsV3`, `parseClustersV3`, `parseLedger`, `parseReverseIndex`, `parseScopeRegistry`, `scopeRegistryAsymmetries`, `orderingIssues`, `isNodeId`, `isIsoDatetime` — the full set of shape parsers this file's checks wrap, keeping shape logic out of the validator itself.
- src/schema/provenance-index.ts: `CLAUDE_SESSION_REF_PATTERN` — the claude-sessions ref grammar `checkInsightObservations` reuses for `sessions` entries rather than redefining.
- src/schema/types.ts: `Violation` type.

Used by:
- src/insight/refresh-full.ts: reuses this module, likely to re-validate after a full insight regeneration.
- src/insight/session-observe.ts: reuses `checkInsightObservations` directly inside `auditEnrichments` to gate `--apply`'s enrichment audit on the same §4.10.11 frontmatter contract — a consumer of this file's logic outside `validate.ts`.
- src/schema/validate.ts: calls all six exported check functions.

Semantically related (not imports):
- Every other file in src/schema/checks/ shares this file's "pure structural inspection, no LLM, no network, read-only (R-001)" convention and the `check<Name>(root, ...) => Violation[]` shape — this is the broadest cross-file pattern in the scope, not specific to insight.ts.

## Query pointers
If you need to understand the insight entry frontmatter contract this check enforces, also read: src/insight/entry.ts and src/insight/storage.ts (the parsers), and the entries this extraction pass writes under `.cortex/insight/anatomy/`. If you need to change the `insight/observations/` frontmatter contract, read `checkInsightObservations` here AND src/insight/session-observe.ts's `auditEnrichments` together — they must stay in lockstep since the loop reuses this function directly rather than re-implementing the rule.
