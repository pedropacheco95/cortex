---
path: src/schema/checks/insight.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 3
size_lines: 433
size_tokens: 4420
centrality: high
built_at_commit: "bcbda52"
source_sha256: "b28a944e850bf19ac4fcb2f5b5b8ea79a4b69349f51bb4bd19989315f4cc8fa2"
---
# src/schema/checks/insight.ts

## Purpose
Implements the full v3 insight-module validator suite (schema Appendix A, spec insight.storage-format Rule 8): `checkInsightIndex` (warning-level, insight `_index.md` must state the ungated/unreviewed trust model and reference the `cortex insight` CLI), `checkInsightEntry` (error-level, walks every per-file understanding entry under `anatomy/` and each `scopes/<scope>/anatomy/` and validates it via the shared `parseEntry` parser — this replaces v2's retired `check.insight-prose`), `checkInsightScopeRegistry` (error-level shape/path-resolution checks on `scope-registry.yaml`, asymmetry between `depends_on`/`shared_by` is only a warning), `checkInsightLedger` (validates both `ledger.json` and `reverse-index.json` under one check id since they're a matched pair), `checkInsightGraph` (validates the module-root and every per-scope `graph.json`, plus `tags.json` and `clusters.json` — node-id uniqueness and malformed shapes are errors, dangling edge endpoints and non-total-ordered serialization are only warnings), and — new since commit 8248c76 — `checkInsightObservations` (error-level, validates every `insight/observations/<theme>.md` entry's frontmatter shape: `kind`, `updated`, `salient`, and a non-empty `sessions` list of well-formed claude-sessions refs, reusing `check.provenance`'s ref grammar rather than re-deriving it). Every check tolerates the whole `insight/` module being absent, and a legacy v2 `insight/map/` directory on disk is tolerated (warn-only, never validated against the v3 contract) as sanctioned interim dogfood per design §8.4 until it's retired.

## Main players
- `checkInsightIndex` (lines 70–95) — validates the trust-model + CLI-reference line in `insight/_index.md`. [supporting]
- `checkInsightEntry` (lines 124–162) — walks and validates every per-file understanding entry against the v3 entry contract; also warns on legacy `insight/map/` presence. [critical]
- `checkInsightScopeRegistry` (lines 168–213) — validates `scope-registry.yaml` shape, path resolution, and `depends_on`/`shared_by` symmetry. [critical]
- `checkInsightLedger` (lines 220–258) — validates `ledger.json` and `reverse-index.json` shapes under a single check id. [critical]
- `checkInsightGraph` (lines 276–372) — validates `graph.json` (root + per-scope), `tags.json`, and `clusters.json` shapes, node uniqueness, edge resolution, and serialization ordering. [critical]
- `checkInsightObservations` (lines 392–433) — new since 8248c76: validates every `insight/observations/*.md` entry's frontmatter (`kind === 'insight-observation'`, ISO `updated`, boolean `salient`, non-empty `sessions` of well-formed claude-sessions refs); tolerant of the directory being entirely absent; does not re-check `_index.md` (layout.ts's job). [critical]
- `walkMarkdownFiles` (lines 102–109), `entryDirs` (lines 113–122), `declaredScopeIds` (lines 268–274), `tryJson` (lines 57–64), `observationEntryFiles` (lines 379–390) — internal helpers for tree-walking and lenient JSON parsing. [supporting]

## Insights
- This is the file the extraction skill's own output (the entries being written by this very agent run) must satisfy — the `parseEntry` contract this check enforces IS the shape of the `.md` files this insight-extraction pass is currently producing. A malformed frontmatter/section-order in the file you're writing right now would fail this exact check.
- A dangling edge endpoint in `graph.json` is a warning, not an error — the module tolerates references to nodes not yet extracted (partial/incremental extraction is expected, not a corruption signal).
- The legacy `insight/map/` tolerance is explicitly time-boxed ("until steps 5c/5e retire its producers") — this is scaffolding for a migration in progress, not a permanent exemption.
- `checkInsightObservations` deliberately reuses `CLAUDE_SESSION_REF_PATTERN` from `../provenance-index.js` — the exact same grammar `check.provenance` uses elsewhere — rather than defining its own claude-sessions ref regex, so the two checks can never silently drift apart on what counts as a well-formed session reference.
- `checkInsightObservations` is now also consumed directly (not just run standalone via `cortex validate`) by `src/insight/session-observe.ts`'s `auditEnrichments` — a caller outside the schema validator itself reuses this exact function to gate its own `--apply` run, so a signature change here has a second, non-obvious consumer beyond `validate.ts`.
- `observationEntryFiles` is a flat (non-recursive) directory listing, unlike `walkMarkdownFiles`/`entryDirs` above it — `insight/observations/` is documented as a flat themed-file layout with no nested subdirectories, so no recursive walk is needed here.

## Connections
Uses:
- src/insight/entry.ts: `parseEntry` — the actual per-file entry frontmatter/section parser.
- src/insight/storage.ts: `parseGraphV3`, `parseTagsV3`, `parseClustersV3`, `parseLedger`, `parseReverseIndex`, `parseScopeRegistry`, `scopeRegistryAsymmetries`, `orderingIssues`, `isNodeId`, `isIsoDatetime` — the full set of shape parsers this check delegates to, keeping shape logic out of the validator itself.
- src/schema/provenance-index.ts: `CLAUDE_SESSION_REF_PATTERN` — the claude-sessions ref grammar `checkInsightObservations` reuses for `sessions` entries.
- src/schema/types.ts: `Violation` type.

Used by:
- src/insight/session-observe.ts: `checkInsightObservations` — reused directly inside `auditEnrichments` to gate `--apply`'s enrichment audit on the same §4.10.11 frontmatter contract.
- src/insight/refresh-full.ts: reuses this module (likely to re-validate after a full insight regeneration).
- src/schema/validate.ts: calls all six exported check functions.

## Query pointers
If you need to understand the insight entry frontmatter contract this check enforces, also read: src/insight/entry.ts and src/insight/storage.ts (the parsers), and the entries this very extraction pass writes under `.cortex/insight/anatomy/`. If you need to change the `insight/observations/` frontmatter contract, read `checkInsightObservations` here AND src/insight/session-observe.ts's `auditEnrichments` together — they must stay in lockstep since the loop reuses this function directly rather than re-implementing the rule.
