---
path: src/insight/refresh-daily.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 3
size_lines: 680
size_tokens: 6503
centrality: high
built_at_commit: "8248c76"
source_sha256: "950b0e2d4a00c732ae96f7ff48c2555eebc60f2f663594a10b3807beb50e26fd"
---
# src/insight/refresh-daily.ts

## Purpose

Implements `cortex loop-insight-refresh --daily`, the middle tier of the three insight-refresh loops: deterministic Core bookends around the agentic middle run by the shipped `cortex-loop-insight-refresh-daily` skill. `--collect` reads the fast tier's worklist and the ledger, deterministically splits flagged files into unchanged/cosmetic-dropped, L2-due, L3-due, and Haiku-triage buckets, and surfaces the anti-silent-drift work (stale concept/edge references and confidence-aged edges). `--apply` validates re-extracted entries, reconciles `ledger.json`, re-confirms L4 edges touching L3-refreshed files, marks newly-invalidated references stale for the next cycle, rebuilds `reverse-index.json`, and writes the pulse report.

## Main players

- `collectDaily` (lines 268–409) — the `--collect` bookend: classifies each flagged file (new/unchanged/real/significant/uncertain) via `classifyChange`, builds the scope-scoped invalidation plan and cross-scope edge list, and writes the daily worklist. [critical]
- `applyDaily` (lines 463–625) — the `--apply` bookend: validates re-extracted candidates against the ledger sha, reconciles `ledger.json`, removes deleted-file rows, computes reverse-dependency staleness, re-confirms L4 edges touching L3-refreshed files, advances `cycle_commits`, prunes the fast worklist, and writes the pulse report. [critical]
- `agedEdges` (lines 238–250) — the confidence-aging check: inferred/ambiguous edges whose `confirmed_at_commit` isn't among the last N refresh-cycle commits. [critical]
- `rebuildReverseIndex` (lines 425–445) — rebuilds `referenced_by` per entity from the current graph's edges. [critical]
- `owningScope` (lines 134–146) — longest-prefix scope match for a path, operating on a plain `ScopeRegistry`. [supporting]
- `readConfidenceAgingCycles` (lines 75–86) — reads `insight.confidenceAgingCycles` from cortex.config.json, defaulting to 3. [supporting]
- `headCommit` (lines 120–130) — short HEAD sha via `git rev-parse`, `'unknown'` on failure. [supporting]

## Insights

This file contains a SECOND, independent implementation of `owningScope`/`entityPath` distinct from query.ts's (same longest-prefix logic, different input shape — a plain `ScopeRegistry` here vs an `InsightLocation` there) — not a shared helper, so scope-resolution semantics can drift between the two call sites if only one is updated. Ledger rows for files outside the current worklist are left byte-untouched by design (spec Rule 5) — `applyDaily` only rewrites entries for candidates actually in the worklist, so untouched scopes stay cached. The reverse-dependency staleness update is a two-phase handshake across cycles: references surfaced THIS cycle are cleared from `ledger.stale`, and only NEW invalidations from this cycle's refreshed/removed paths are added for the NEXT cycle to re-verify (lines 528–543) — the surfaced set and the newly-added set are never the same set. The L4 "neighbourhood update" only re-confirms edges touching L3-refreshed files (line 550, `refreshedL3`) — an L2-only refresh never advances any edge's `confirmed_at_commit`.

## File map

- Lines 1–97: module doc, imports, worklist/report constants, `readConfidenceAgingCycles`, `insightDir`/`pulseDir` path helpers.
- Lines 99–162: shared insight-module readers (`readGraph`, `readReverseIndex`, `readScopeRegistry`, `headCommit`, `owningScope`, `entityPath`, `edgeTouchesPath`).
- Lines 164–409: collect phase — worklist types (`DailyFileEntry`, `DailyWorklist`, etc.), `agedEdges`, `collectDaily`.
- Lines 411–625: apply phase — `entryFileFor`, `rebuildReverseIndex`, `applyDaily` (ledger reconciliation, L4 re-confirmation, pulse report).
- Lines 627–679: `runRefreshDaily` — the `--collect`/`--apply`/bare dispatcher.

## Connections

Uses:
- src/insight/entry.ts: `parseEntry` to validate each re-extracted candidate entry.
- src/insight/l1-triage.ts: `languageForExt` to pick the significance-filter language.
- src/insight/refresh-fast.ts: `readLedger`, `readWorklist`, `writeWorklist`, `gitShow`, `sha256Of`, `INSIGHT_WORKLIST_FILE` — reuses the fast tier's worklist plumbing rather than duplicating it.
- src/insight/significance.ts: `classifyChange` to classify each flagged file's change.
- src/insight/storage.ts: graph/ledger/reverse-index parse+serialize functions and `CONCEPT_NODE_ID_PATTERN`.
- src/loops/report.ts: `writePulseReport` to emit the always-write pulse report.

Used by:
- src/insight/refresh-full.ts: reuses `agedEdges`, `headCommit`, `readConfidenceAgingCycles`, `readGraph`, `readScopeRegistry`, `rebuildReverseIndex`, and the shared report file/kind constants.

## Query pointers

If you need to change the daily collect/apply contract, also read: src/insight/refresh-fast.ts (the upstream worklist this consumes), src/insight/significance.ts (the classifier), src/insight/storage.ts (the ledger/graph/reverse-index shapes). If you're touching confidence-aging or the reverse-dependency staleness handshake, also read src/insight/refresh-full.ts, which reuses `agedEdges` and shares the aging-window semantics.
