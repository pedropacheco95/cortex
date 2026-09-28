---
path: src/loops/onboarding-drift.ts
extracted_at: 2026-09-22T09:55:29Z
extraction_level: 2
size_lines: 226
size_tokens: 2273
centrality: medium
built_at_commit: "a66041b"
source_sha256: "5e306c56bb823840c93c66a887d89f5f3d85abd857b5cfab43160c76461930ef"
---
# src/loops/onboarding-drift.ts

## Purpose

Deterministic Core logic behind `cortex loop-onboarding-drift` (spec `loops.onboarding-drift`, design §11.4 item 7) — a monthly scan checking whether a project's scaffolding (the CLAUDE.md managed block and every `_index.md` under `.cortex/`) still matches the current schema's templates and budgets, writing refresh proposals to `.cortex/pulse/reports/scaffolding-review.md` only. Four checks compose `runOnboardingDrift`: (a) `checkClaudeMdVersion` compares the CLAUDE.md managed-block version marker (via the shared `readManagedBlockVersion` helper) against `cortex.config.json`'s `schemaVersion`, reading the config itself through a local `readConfigSchemaVersion` helper rather than an imported one — missing file, missing block, missing version, and version mismatch are each a distinct finding; (b) `checkIndexHeadings` filters the validator's `check.index-shape` results down to "missing heading" violations; (c) `checkIndexBudgets` re-estimates each `_index.md`'s token count via chars/4 (deliberately not the validator's word-count heuristic) against the exported `INDEX_TOKEN_BUDGET` (300); and (d) `checkTemplateIdentical` is a heuristic hint (never an error) flagging curated-knowledge directories (`compass`, `compass/rules`, `compass/bugs`, `atlas`, `atlas/stakeholders`, `atlas/decisions`, `atlas/domain`) whose `_index.md` is byte-identical to the shipped template even though the directory has since gained real artefacts beyond the `cortex init` skeleton (`INIT_SKELETON_FILES`, now including `registry.md`) — a sign the prompt was never localised. Propose-don't-mutate throughout: every finding's action names a human-run refresh (`cortex sync`), never an automatic edit. The loop is invoked only through the CLI (`src/cli/cli.ts` dynamically imports `runOnboardingDrift` for the `loop-onboarding-drift` verb); nothing in `src/` imports this module directly, which is why its in-edges are test-only.

## Connections

Uses:
- src/cli/templates.ts — `CORTEX_INDEXES` supplies the shipped `_index.md` template text per directory for the template-identical heuristic.
- src/insight/measure.ts — `computeTokens` provides the chars/4 token estimate used against the 300-token index budget.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `scaffolding-review.md`.
- src/schema/checks/claude-md.ts — `readManagedBlockVersion` is the shared §8 helper that parses the CLAUDE.md managed-block version marker.
- src/schema/checks/layout.ts — `checkIndexShape` is the validator's own heading-shape check, reused (not reimplemented) and filtered to "missing" violations.

Used by:
- tests/atomic/loops/onboarding-drift.test.ts — mocked unit coverage of the four individual checks.
- tests/spec/loops/onboarding-drift.test.ts — integrated-slice coverage against a real `.cortex/` fixture tree.
- (src-internal callers reach this only dynamically, via `src/cli/cli.ts`'s `await import('../loops/onboarding-drift.js')` for the `loop-onboarding-drift` verb — not a static edge L1 would capture.)
