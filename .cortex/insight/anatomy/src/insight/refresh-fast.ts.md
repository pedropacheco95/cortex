---
path: src/insight/refresh-fast.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 3
size_lines: 272
size_tokens: 2524
centrality: high
built_at_commit: "8248c76"
source_sha256: "00d0cb9f3355d98cf4885b922f246d70eca74b7a17c0231bbed0363a90b2ebfa"
---
# src/insight/refresh-fast.ts

## Purpose

The post-commit hook tier of the three insight-refresh loops: fully deterministic, no LLM anywhere, no extraction. Diffs the last commit, applies the Core structural significance filter to rule out formatting/comment/whitespace/import-reordering changes, and flags the survivors into `.cortex/pulse/.insight-refresh-worklist.json` for the daily loop to pick up. Never updates `ledger.json` — staleness only advances on a successful daily re-extraction. This is the sole post-commit invocation since the anatomy fast tier was retired and the git hook consolidated.

## Main players

- `runInsightRefreshFast` (lines 193–271) — the post-commit hook entrypoint: diffs the last commit, applies the significance filter, and writes survivors to the worklist; always exits 0 (hook-safe). [critical]
- `parseNameStatus` (lines 50–74) — parses `git diff-tree --name-status` output into changed/deleted path lists, treating renames as delete(old)+add(new) and copies as add(new). [critical]
- `isInsightScope` (lines 161–170) — mirrors the L1 walk's exclusion semantics (skip-list/sensitive/binary/ignored) for a single path. [supporting]
- `readWorklist` / `writeWorklist` (lines 104–132) — read/write the persisted `.insight-refresh-worklist.json`, sorted deterministically except for the `generated` timestamp. [critical]
- `gitShow` (lines 146–157) — fetches a file's content as of an arbitrary commit, for baseline comparison against the current version. [supporting]

## Insights

This is explicitly the hook-safe path: every failure inside `runInsightRefreshFast` is caught and degrades to exit 0 plus a `pulse/hook-errors.md` entry via `appendHookError` (lines 263–268) — a git hook must never block a commit. Renames are NOT tracked as identity-preserving: `parseNameStatus` treats an `R` status as delete(old)+add(new) (lines 66–68), so a renamed file always re-enters the significance pipeline as new content rather than being recognized as the same logical file with continuity. `ledger.json` is deliberately read-only here (never written) — per the module doc, staleness only updates on a successful daily re-extraction (the `--apply` bookend in refresh-daily.ts), so a crash mid-fast-tier can never corrupt the ledger.

## Connections

Uses:
- src/hooks/errors.ts: `appendHookError` to record failures without ever blocking the commit.
- src/insight/exclude.ts: `buildIgnoreFilter` + `hasExcludedSegment` for scope filtering.
- src/insight/l1-triage.ts: skip-dir/sensitive-dir/binary-extension constants and `languageForExt`.
- src/insight/significance.ts: `classifyChange` to filter out cosmetic changes before flagging.
- src/insight/storage.ts: `parseLedger` to read `ledger.json`.

Used by:
- src/insight/refresh-daily.ts: reuses `readLedger`, `readWorklist`, `writeWorklist`, `gitShow`, `sha256Of`, and the worklist-file constant.
- src/insight/refresh-full.ts: reuses `readLedger` for the full-regeneration worklist.

## Query pointers

If you need to change what counts as a "significant" change before Haiku triage, read src/insight/significance.ts. For the daily loop's consumption of this worklist, read src/insight/refresh-daily.ts. The git-hook entrypoint that actually invokes `runInsightRefreshFast` is outside this scope.
