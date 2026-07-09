---
path: src/pulse/hygiene.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 376
size_tokens: 3911
centrality: medium
built_at_commit: "8248c76"
source_sha256: "1eb8bc69ea4e610f47f6f0011493280c7db35a40870053d92564eba7d3098fe5"
---
# src/pulse/hygiene.ts

## Purpose

This file implements `runHygiene`, the deterministic Core logic behind `cortex pulse-hygiene` (spec `pulse.hygiene`, design §10.2) — a daily sweep that surveys the project for unfinished or broken state and always writes exactly one file, `.cortex/pulse/hygiene-report.md`, never mutating anything else. It runs six independent checks — orphan local git branches (unmerged, stale by `ORPHAN_BRANCH_DAYS`), stale open PRs via `gh` (skipped gracefully if `gh` is unavailable or fails), insight drift (staleness-ledger entries whose source file vanished from disk), compass dead references (rule `source:`/`governs:` fields that no longer resolve, reusing the validator's own resolution logic), spec orphans (dev specs whose `governs:` glob matches nothing), and aged TODO/FIXME comments (aged by the file's last git-commit date, not wall-clock) — and renders each as a report section that is either a skip notice, "No findings this cycle," or a bulleted findings list with a suggested next step per finding. Each check is independently exported and testable, and the whole sweep is designed to degrade gracefully (missing git repo, missing `gh`, missing insight ledger, missing specs dir) rather than fail the run.

## Connections

Uses:
- src/insight/exclude.ts — `hasExcludedSegment`, `buildIgnoreFilter` scope the project file listing for the TODO/FIXME check to the same walk as insight's L1 (dot:false, hard excludes, .gitignore + config excludes).
- src/insight/storage.ts — `parseLedger` reads and schema-validates `.cortex/insight/ledger.json` for the insight-drift check.
- src/loops/git-info.ts — `gitExec`, `isGitRepo`, `gitLastCommitEpoch` back the orphan-branch scan and the TODO/FIXME aging logic.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `hygiene-report.md` with its schema §4.5 header.
- src/paths.ts — `specsRoot`, `SPECS_GLOB` locate and glob the dev spec tree for the spec-orphans check.
- src/schema/checks/compass.ts — `globMatchesNothing` is reused (not reimplemented) to test whether a rule's `governs:` glob or a spec's `governs:` glob matches any on-disk file.
- src/schema/index-build.ts — `buildIndex`, `resolveId`, `resolveRelativePath` reuse the validator's id/path resolution to detect dead compass rule `source:` references.

Used by:
- (none src-internal)
