---
path: src/insight/refresh-daily.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 3
size_lines: 680
size_tokens: 6530
centrality: high
built_at_commit: "fd7b55b"
source_sha256: "3f937a616074d1b00855852bb2db4696b9abb64fff0beef4785139ea81cf6d9f"
---
# src/insight/refresh-daily.ts

## Purpose

Implements `cortex loop-insight-refresh --daily`, the middle tier of the three insight-refresh loops: deterministic Core bookends around the agentic middle run by the shipped `cortex-loop-insight-refresh-daily` skill. `--collect` reads the fast tier's worklist and the ledger, deterministically splits flagged files into unchanged/cosmetic-dropped, L2-due, L3-due, and Haiku-triage buckets, and surfaces the anti-silent-drift work (stale concept/edge references and confidence-aged edges). `--apply` validates re-extracted entries, reconciles `ledger.json`, re-confirms L4 edges touching L3-refreshed files, marks newly-invalidated references stale for the next cycle, rebuilds `reverse-index.json`, and writes the pulse report.

## Main players

- `collectDaily` (lines 269–410) — the `--collect` bookend: classifies each flagged file (new/unchanged/real/significant/uncertain) via `classifyChange`, builds the scope-scoped invalidation plan and cross-scope edge list, and writes the daily worklist. [critical]
- `applyDaily` (lines 464–626) — the `--apply` bookend: validates re-extracted candidates against the ledger sha, reconciles `ledger.json`, removes deleted-file rows, computes reverse-dependency staleness, re-confirms L4 edges touching L3-refreshed files, advances `cycle_commits`, prunes the fast worklist, and writes the pulse report. [critical]
- `agedEdges` (lines 239–251) — the confidence-aging check: inferred/ambiguous edges whose `confirmed_at_commit` isn't among the last N refresh-cycle commits. [critical]
- `rebuildReverseIndex` (lines 426–446) — rebuilds `referenced_by` per entity from the current graph's edges. [critical]
- `owningScope` (lines 135–147) — longest-prefix scope match for a path, operating on a plain `ScopeRegistry`. [supporting]
- `readConfidenceAgingCycles` (lines 75–86) — reads `insight.confidenceAgingCycles` from cortex.config.json, defaulting to 3. [supporting]
- `headCommit` (lines 121–131) — short HEAD sha via `git rev-parse`, `'unknown'` on failure. [supporting]

## Insights

This file contains a SECOND, independent implementation of `owningScope`/`entityPath` distinct from query.ts's (same longest-prefix logic, different input shape — a plain `ScopeRegistry` here vs an `InsightLocation` there) — not a shared helper, so scope-resolution semantics can drift between the two call sites if only one is updated. Ledger rows for files outside the current worklist are left byte-untouched by design (spec Rule 5) — `applyDaily` only rewrites entries for candidates actually in the worklist, so untouched scopes stay cached. The reverse-dependency staleness update is a two-phase handshake across cycles: references surfaced THIS cycle are cleared from `ledger.stale`, and only NEW invalidations from this cycle's refreshed/removed paths are added for the NEXT cycle to re-verify (lines 529–544) — the surfaced set and the newly-added set are never the same set. The L4 "neighbourhood update" only re-confirms edges touching L3-refreshed files (line 551, `refreshedL3`) — an L2-only refresh never advances any edge's `confirmed_at_commit`. The pulse reorg (this cycle) split machine working state from human-read reports: worklists now live under `.cortex/pulse/state/` (was flat dotfiles directly in `pulse/`) and this loop's report moved to `.cortex/pulse/reports/insight-refresh.md` — pure path renames via a new `stateDir` helper (replacing the old `pulseDir`), no behavioural change.

`collectDaily`'s dirty-file detection compares the current source against the **ledger's** recorded `built_at_commit`/sha, not against the already-written entry file's own `source_sha256` — so when a prior cycle re-extracted entries but the reconciling `ledger.json` write lagged behind (e.g. an uncommitted extraction from an earlier run), the next `--collect` flags those files as dirty again even though their on-disk entries already match current source exactly. Confirmed by cross-checking all 19 flagged files' `source_sha256` against live source: all matched, and re-extracting would have been pure churn against the shrink guard for zero content gain — the correct move was reconciling the stale ledger rows via `--apply`, not re-running LLM extraction. (claude-sessions/pedropacheco1/73eb1881-288d-49e9-a4ea-75c4077aa0e1)

`collectDaily`'s significance filter does not reuse the shared exclude machinery `runL1`'s `walk` uses (`src/insight/exclude.ts`'s `hasExcludedSegment`/`buildIgnoreFilter`) — it is not listed among this file's imports. As a result the daily worklist collector permanently re-flags skip-listed paths (`.claude/`, `.specflow/`, `tests/`, and other out-of-scope dirs) as "new"/dirty every cycle instead of excluding them upstream, inflating the pending count each run even though those files were never extractable in the first place. Observed independently across multiple daily runs (155-167 non-`src/` files flagged every cycle); not yet filed as a ledger bug. (claude-sessions/pedropacheco1/6b167446-06fe-49a6-9992-92e28d42a85e)

## File map

- Lines 1–98: module doc, imports, worklist/report constants, `readConfidenceAgingCycles`, `insightDir`/`stateDir` path helpers.
- Lines 100–163: shared insight-module readers (`readGraph`, `readReverseIndex`, `readScopeRegistry`, `headCommit`, `owningScope`, `entityPath`, `edgeTouchesPath`).
- Lines 165–410: collect phase — worklist types (`DailyFileEntry`, `DailyWorklist`, etc.), `agedEdges`, `collectDaily`.
- Lines 412–626: apply phase — `entryFileFor`, `rebuildReverseIndex`, `applyDaily` (ledger reconciliation, L4 re-confirmation, pulse report).
- Lines 628–680: `runRefreshDaily` — the `--collect`/`--apply`/bare dispatcher.

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
