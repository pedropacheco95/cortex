---
path: src/loops/rule-decay.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 145
size_tokens: 1421
centrality: medium
built_at_commit: "8248c76"
source_sha256: "cb6edd02ddce1351c2565682d2402f9e858dac2f66d400df55d39c7b0e17cda1"
---
# src/loops/rule-decay.ts

## Purpose

This file implements `scanRuleDecay` and `runRuleDecay`, the deterministic Core logic behind `cortex loop-rule-decay` (spec `loops.rule-decay`, design §11.4 item 5) — a weekly review of every ACTIVE compass rule (`.cortex/compass/rules/R-*.md`, skipping `status: retired`) for decay signals, writing retirement candidates to `.cortex/pulse/rule-candidates.md` only; a human retires a rule by hand-editing `status: retired`, this loop never does. It checks three signals per rule: (a) every `governs:` glob matches zero on-disk files (via the validator's `globMatchesNothing`); (b) any `source:` reference no longer resolves (via the validator's `resolveRelativePath`/`resolveId`, reused rather than reimplemented); and (c), only when (a) holds, whether the rule file itself is older than `RULE_DECAY_AGE_DAYS` (180) by git last-commit date (falling back to file mtime outside git history) — a rule whose surface has vanished AND has sat that way for a long time is stronger evidence than either signal alone. Rules with any signal become a `RuleCandidate` with its evidence attached, and the report footer states the engineering-call thresholds and explicitly defers a fourth signal ("violated recently without correction") until violation telemetry exists.

## Connections

Uses:
- src/loops/git-info.ts — `gitLastCommitEpoch` supplies the rule file's last-commit epoch for the age signal.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `rule-candidates.md`.
- src/schema/checks/compass.ts — `globMatchesNothing` is reused to test whether a rule's `governs:` glob matches any file on disk.
- src/schema/index-build.ts — `buildIndex`, `resolveId`, `resolveRelativePath` reuse the validator's id/path resolution to detect a rule's dead `source:` references.

Used by:
- (none src-internal)

Semantically related (not imports): shares the scan-and-report, propose-don't-mutate loop shape and the reused `globMatchesNothing`/index-build resolution logic with src/pulse/hygiene.ts's "Compass dead references" check and src/loops/spec-drift.ts's governed-file scan.
