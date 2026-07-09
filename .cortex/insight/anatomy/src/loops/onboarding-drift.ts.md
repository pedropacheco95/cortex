---
path: src/loops/onboarding-drift.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 226
size_tokens: 2247
centrality: low
built_at_commit: "8248c76"
source_sha256: "d0b657ec3de48ad706f9115568642d63ab7fbe8e7434f9821b33e74350dd0d77"
---
# src/loops/onboarding-drift.ts

## Purpose

This file implements `runOnboardingDrift`, the deterministic Core logic behind `cortex loop-onboarding-drift` (spec `loops.onboarding-drift`, design §11.4 item 7) — a monthly scan that checks whether the project's scaffolding (the CLAUDE.md managed block and every `_index.md` under `.cortex/`) still matches the current schema's templates and budgets, and writes refresh proposals to `.cortex/pulse/scaffolding-review.md` only. It runs four checks: (a) `checkClaudeMdVersion` compares the CLAUDE.md managed-block version marker against `cortex.config.json`'s `schemaVersion` (missing file, missing block, missing version, and version mismatch are each a distinct finding); (b) `checkIndexHeadings` filters the validator's `check.index-shape` results down to "missing heading" violations; (c) `checkIndexBudgets` re-estimates each `_index.md`'s token count via chars/4 (deliberately not the validator's word-count heuristic) against a 300-token budget; and (d) `checkTemplateIdentical` is a heuristic hint (never an error) flagging curated-knowledge directories (compass, atlas, and their subdirs) whose `_index.md` is byte-identical to the shipped template even though the directory has since gained real artefacts beyond the init skeleton — a sign the prompt was never localised. Propose-don't-mutate: every finding's action is a human-run refresh (`cortex init --force` or manual localisation), never an automatic edit.

## Connections

Uses:
- src/cli/templates.ts — `CORTEX_INDEXES` supplies the shipped `_index.md` template text per directory for the template-identical heuristic.
- src/insight/measure.ts — `computeTokens` provides the chars/4 token estimate used against the 300-token index budget.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `scaffolding-review.md`.
- src/schema/checks/claude-md.ts — `readManagedBlockVersion` is the shared §8 helper that parses the CLAUDE.md managed-block version.
- src/schema/checks/layout.ts — `checkIndexShape` is the validator's own heading-shape check, reused (not reimplemented) and filtered to "missing" violations.

Used by:
- (none src-internal)
