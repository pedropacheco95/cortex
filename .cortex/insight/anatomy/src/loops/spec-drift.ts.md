---
path: src/loops/spec-drift.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 181
size_tokens: 1663
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "1198554859016bd57656a51243dcaff80e431d2600ee37126ecf4d1b119776f1"
---
# src/loops/spec-drift.ts

## Purpose

This file implements `scanSpecDrift` and `runSpecDrift`, the deterministic Core logic behind `cortex loop-spec-drift` (spec `loops.spec-drift`, design §11.4 item 10) — a daily detector that, for every dev spec with a non-empty `governs:` glob, expands that glob directly against the working tree (the direct expansion IS the reverse map now that anatomy's `spec_links` was retired at build-order-v3 step 7) and compares the spec's own git last-commit epoch against each governed file's, flagging any file committed more than `SPEC_DRIFT_GRACE_DAYS` (14) after the spec as a drift suspect. It writes `.cortex/pulse/reports/spec-drift.md` only (relocated from the pulse root under the reorganized `pulse/reports/` zone), never classifying the drift itself — each suspect section states three possible readings (spec is stale, implementation regressed, or code grew new behaviour needing new acceptance criteria) and leaves classification to a human or `specflow-bugs`. Ungoverned specs are skipped and counted; specs or governed files outside git history are noted separately as "untracked," never judged; and if the project isn't a git repo at all, the whole scan short-circuits with a "not a repo" report body.

## Connections

Uses:
- src/loops/git-info.ts — `gitLastCommitEpoch`, `isGitRepo` supply per-file last-commit epochs (cached per run) and the git-repo guard.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `spec-drift.md`.
- src/paths.ts — `SPECS_GLOB` locates all dev spec files to scan.

Used by:
- (none src-internal)

Semantically related (not imports): shares the scan-and-report, propose-don't-mutate loop shape with src/loops/rule-decay.ts and src/pulse/hygiene.ts (all three reuse validator-owned resolution/matching logic rather than reimplementing it, and all three write exactly one pulse report per run).
