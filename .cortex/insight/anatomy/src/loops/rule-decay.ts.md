---
path: src/loops/rule-decay.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 144
size_tokens: 1425
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "6eebc669cc4b601fb4b710bb8ee9d3f0038cb74e1cd89dbd2171011b0df7da28"
---
# src/loops/rule-decay.ts

## Purpose

This file implements `scanRuleDecay` and `runRuleDecay`, the deterministic Core logic behind `cortex loop-rule-decay` (spec `loops.rule-decay`, design §11.4 item 5) — a weekly review of every ACTIVE compass rule (`.cortex/compass/rules/R-*.md`, skipping `status: retired`) for decay signals, writing retirement candidates to `.cortex/pulse/reports/rule-candidates.md` only (relocated from the pulse root under the reorganized `pulse/reports/` zone); a human retires a rule by hand-editing `status: retired`, this loop never does. It checks three signals per rule: (a) every `governs:` glob matches zero on-disk files (via the validator's `globMatchesNothing`); (b) any `source:` reference no longer resolves (via the validator's `resolveRelativePath`/`resolveId`, reused rather than reimplemented); and (c), only when (a) holds, whether the rule file itself is older than `RULE_DECAY_AGE_DAYS` (180) by git last-commit date (falling back to file mtime outside git history) — a rule whose surface has vanished AND has sat that way for a long time is stronger evidence than either signal alone. Rules with any signal become a `RuleCandidate` with its evidence attached, and the report footer states the engineering-call thresholds and explicitly defers a fourth signal ("violated recently without correction") until violation telemetry exists.

## Connections

Uses:
- src/loops/git-info.ts — `gitLastCommitEpoch` supplies the rule file's last-commit epoch for the age signal.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `rule-candidates.md`.
- src/schema/checks/compass.ts — `globMatchesNothing` is reused to test whether a rule's `governs:` glob matches any file on disk.
- src/schema/index-build.ts — `buildIndex`, `resolveId`, `resolveRelativePath` reuse the validator's id/path resolution to detect a rule's dead `source:` references.

Used by:
- (none src-internal)

Semantically related (not imports): shares the scan-and-report, propose-don't-mutate loop shape and the reused `globMatchesNothing`/index-build resolution logic with src/pulse/hygiene.ts's "Compass dead references" check and src/loops/spec-drift.ts's governed-file scan.
