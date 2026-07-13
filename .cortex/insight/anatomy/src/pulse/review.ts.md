---
path: src/pulse/review.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 706
size_tokens: 6761
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "4301475bc5d86f891ff7a5d29be9e49d25459cf52450a375f12440693eecefc1"
---
# src/pulse/review.ts

## Purpose

This file implements the human review gate of Cortex's propose-don't-mutate discipline: `pulseCli`, the deterministic Core logic behind the `pulse-list`, `pulse-accept <S-NNN>`, and `pulse-reject <S-NNN>` commands (spec `pulse.review-cli`, schema §4.5). It discovers `## S-NNN` suggestion sections across the single S-namespace — every loop report under `.cortex/pulse/reports/` plus `suggestions.md`, which stays at the pulse root as distil's user-facing output (`dismissed.md` and other pulse-root files like `_index.md` are excluded) — parses each section's fence-aware payload shape (`addition`, `file`, or `edit`, per §4.5.2), and enforces the accept/reject invariants: duplicate suggestion ids across files are a hard error, targets must resolve inside a type-permitted root or be a new `.claude/skills/<name>/SKILL.md`, edits must match their `current:` block byte-exact and exactly once, file-creates never overwrite, and every accept/reject computes its full blast radius before the first write so an accept is transactional. It also special-cases `promotion`-typed suggestions by delegating to `promote.ts`'s `planPromotion` to land content plus mark the originating insight entry, and handles reject by appending a windowed dismissal entry to `dismissed.md`.

## Connections

Uses:
- src/cli/templates.ts — `pulseDismissedTemplate` supplies the header when `dismissed.md` is created for the first time on a reject.
- src/pulse/fences.ts — `openingFence`, `closesFence`, `headingLinesOutsideFences` (with the `FenceOpen` type) make heading detection and fenced-block extraction fence-aware so payload content that itself looks like a `## S-NNN` heading or a shorter fence round-trips byte-exact.
- src/pulse/promote.ts — `planPromotion` computes the landed content and insight-side mark-as-promoted write for `promotion`-typed suggestions; its refusal reasons are surfaced verbatim on accept failure.
- src/pulse/types.ts — `DEFAULT_SUGGESTION_TYPE`, `isSuggestionType`, `permittedRoots`, `permittedRootsLabel`, and the `SuggestionType` type drive the `**Type:**` parse tolerance and the runtime target-root guard.

Used by:
- (none src-internal)
