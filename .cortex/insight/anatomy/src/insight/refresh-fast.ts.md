---
path: src/insight/refresh-fast.ts
extracted_at: 2026-09-22T09:55:19Z
extraction_level: 2
size_lines: 290
size_tokens: 2774
centrality: high
built_at_commit: "a66041b"
source_sha256: "397d0c65aa1c3d049b3cae714b29da889c065d3396b309bd5eade8bd0969faac"
---
# src/insight/refresh-fast.ts

## Purpose

The post-commit hook tier of the three insight-refresh loops: fully deterministic, no LLM anywhere, no extraction. Diffs the last commit, applies the Core structural significance filter to rule out formatting/comment/whitespace/import-reordering changes, and flags the survivors into `.cortex/pulse/state/insight-refresh-worklist.json` for the daily loop to pick up. Never updates `ledger.json` — staleness only advances on a successful daily re-extraction. Since schema 3.4 it also rebuilds the recall index (`.cortex/recall-index.json`) before its ledger gate, whenever `.cortex/` exists, so an unextracted project still gets a fresh recall index on every commit. This is the sole post-commit invocation since the anatomy fast tier was retired and the git hook consolidated; every failure degrades to exit 0 plus a `pulse/hook-errors.md` entry (hook-safe).

## Connections

Uses:
- src/hooks/errors.ts: `appendHookError` to record failures (both the recall-index rebuild and the top-level catch) without ever blocking the commit.
- src/insight/exclude.ts: `buildIgnoreFilter` + `hasExcludedSegment` for scope filtering (`isInsightScope`).
- src/insight/l1-triage.ts: skip-dir/sensitive-dir/binary-extension constants and `languageForExt`, mirroring the L1 walk's exclusion semantics.
- src/insight/significance.ts: `classifyChange` to filter out cosmetic changes before flagging a changed file.
- src/insight/storage.ts: `parseLedger` to read `ledger.json` (`readLedger`).

Used by:
- src/insight/query.ts: imports `sha256Of` for its in-process staleness check (a cross-purpose reuse — the query engine borrows the fast tier's hashing helper rather than duplicating it).
- src/insight/refresh-daily.ts: reuses `readLedger`, `readWorklist`, `writeWorklist`, `gitShow`, `sha256Of`, and the worklist-file constant.
- src/insight/refresh-full.ts: reuses `readLedger` for the full-regeneration worklist.

## Query pointers

If you need to change what counts as a "significant" change before Haiku triage, read src/insight/significance.ts. For the daily loop's consumption of this worklist, read src/insight/refresh-daily.ts. For the recall-index side effect added in 3.4, read src/recall/index.ts's `writeRecallIndex`. The git-hook entrypoint that actually invokes `runInsightRefreshFast` is outside this scope.
