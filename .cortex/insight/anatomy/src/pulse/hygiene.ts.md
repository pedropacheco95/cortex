---
path: src/pulse/hygiene.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 3
size_lines: 419
size_tokens: 4364
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "fdb957ca0c2dfeba284ccc9a06280715676ebc241788a232df4e31e57ea9bde3"
---
# src/pulse/hygiene.ts

## Purpose

This file implements `runHygiene`, the deterministic Core logic behind `cortex pulse-hygiene` (spec `pulse.hygiene`, design §10.2) — a daily sweep that surveys the project for unfinished or broken state and always writes exactly one file, `.cortex/pulse/reports/hygiene.md`, never mutating anything else. It runs six independent checks — orphan local git branches (unmerged, stale by `ORPHAN_BRANCH_DAYS`), stale open PRs via `gh` (skipped gracefully if `gh` is unavailable or fails), insight drift (staleness-ledger entries whose source file vanished from disk), compass dead references (rule `source:`/`governs:` fields that no longer resolve, reusing the validator's own resolution logic), spec orphans (dev specs whose `governs:` glob matches nothing), and aged TODO/FIXME comments (aged by the file's last git-commit date, not wall-clock) — and renders each as a report section that is either a skip notice, "No findings this cycle," or a bulleted findings list with a suggested next step per finding. Alongside the six checks, every sweep also runs a deterministic retention pass — `cleanStaleReadLedgers` — that prunes per-session read ledgers under `pulse/state/reads/` older than `READS_RETENTION_DAYS`, reporting the count cleaned in the report footer. Each check is independently exported and testable, and the whole sweep is designed to degrade gracefully (missing git repo, missing `gh`, missing insight ledger, missing specs dir) rather than fail the run.

## Main players

- `runHygiene` (function, lines 374-419) — critical. Orchestrates the six checks plus the read-ledger retention pass, renders the report body, and performs the sweep's single always-write via `writePulseReport`.
- `cleanStaleReadLedgers` (function, lines 332-355) — critical. Deletes `pulse/state/reads/<session-id>` ledger files whose mtime predates `READS_RETENTION_DAYS`; tolerates a missing directory and per-file stat/unlink errors (best-effort housekeeping that never blocks the sweep).
- `READS_RETENTION_DAYS` (constant, line 37) — supporting. Engineering-call retention window (14 days) for stale read ledgers; marked TODO to promote to `cortex.config.json` as `pulse.readsRetentionDays`.
- `checkOrphanBranches` (function, lines 72-105) — supporting. Flags unmerged local branches with no commits in `ORPHAN_BRANCH_DAYS`.
- `checkStalePrs` (function, lines 124-150) — supporting. Flags open PRs (via `gh`) with no update in `STALE_PR_DAYS`; skips with a reason if `gh` is missing or fails.
- `checkInsightDrift` (function, lines 159-185) — supporting. Flags insight ledger entries whose source file no longer exists on disk.
- `checkCompassDeadRefs` (function, lines 192-234) — supporting. Flags compass rule `source:`/`governs:` references that don't resolve, reusing `index-build.ts` and `globMatchesNothing`.
- `checkSpecOrphans` (function, lines 240-270) — supporting. Flags dev specs whose `governs:` glob(s) all match nothing on disk.
- `checkAgedTodos` (function, lines 278-320) — supporting. Flags files with TODO/FIXME markers whose last git commit is `AGED_TODO_DAYS` or older.
- `listProjectFiles` (function, lines 62-66) — supporting. Shared file listing (same scope as insight's L1 walk) feeding the TODO/FIXME check.

## Insights

- `READS_RETENTION_DAYS` was added in a pulse-reorg follow-up alongside `cleanStaleReadLedgers`, moving per-session read-ledger cleanup from ad hoc/manual into the deterministic daily sweep; it is explicitly flagged as a stopgap pending a `cortex.config.json` override.
- The report filename moved from the flat `.cortex/pulse/hygiene-report.md` to the subdivided `.cortex/pulse/reports/hygiene.md`, consistent with the broader pulse-layout reorg (see `src/pulse/migrate.ts`).
- `cleanStaleReadLedgers` deliberately never throws — every per-file failure is swallowed — reinforcing the file's design principle that housekeeping must degrade gracefully rather than fail the run.

## Connections

Uses:
- src/insight/exclude.ts — `hasExcludedSegment`, `buildIgnoreFilter` scope the project file listing for the TODO/FIXME check to the same walk as insight's L1 (dot:false, hard excludes, .gitignore + config excludes).
- src/insight/storage.ts — `parseLedger` reads and schema-validates `.cortex/insight/ledger.json` for the insight-drift check.
- src/loops/git-info.ts — `gitExec`, `isGitRepo`, `gitLastCommitEpoch` back the orphan-branch scan and the TODO/FIXME aging logic.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `hygiene.md` (now under `reports/`) with its schema §4.5 header.
- src/paths.ts — `specsRoot`, `SPECS_GLOB` locate and glob the dev spec tree for the spec-orphans check.
- src/schema/checks/compass.ts — `globMatchesNothing` is reused (not reimplemented) to test whether a rule's `governs:` glob or a spec's `governs:` glob matches any on-disk file.
- src/schema/index-build.ts — `buildIndex`, `resolveId`, `resolveRelativePath` reuse the validator's id/path resolution to detect dead compass rule `source:` references.

Used by:
- (none src-internal)

## Query pointers

- To see how the read-ledger retention constant interacts with the rest of the pulse-reorg layout, cross-reference `src/pulse/migrate.ts` (`STATIC_MOVES` for `.reads-*` → `state/reads/<id>`).
- To find where `hygiene.md`'s report content is consumed downstream, check `src/pulse/review.ts`'s `discoverSuggestions`, which now scans `.cortex/pulse/reports/` for `## S-NNN` sections.
