---
path: src/pulse/review.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 688
size_tokens: 6552
centrality: medium
built_at_commit: "8248c76"
source_sha256: "d9552140afc869cb1ee6592a2912fb33d7f4de1332b3f0cf97f303b7d0ef5d79"
---
# src/pulse/review.ts

## Purpose

This file implements the human review gate of Cortex's propose-don't-mutate discipline: `pulseCli`, the deterministic Core logic behind the `pulse-list`, `pulse-accept <S-NNN>`, and `pulse-reject <S-NNN>` commands (spec `pulse.review-cli`, schema §4.5). It discovers `## S-NNN` suggestion sections across every `.cortex/pulse/*.md` report (excluding `dismissed.md`, which holds rejection memory rather than proposals), parses each section's fence-aware payload shape (`addition`, `file`, or `edit`, per §4.5.2), and enforces the accept/reject invariants: duplicate suggestion ids across files are a hard error, targets must resolve inside a type-permitted root or be a new `.claude/skills/<name>/SKILL.md`, edits must match their `current:` block byte-exact and exactly once, file-creates never overwrite, and every accept/reject computes its full blast radius before the first write so an accept is transactional. It also special-cases `promotion`-typed suggestions by delegating to `promote.ts`'s `planPromotion` to land content plus mark the originating insight entry, and handles reject by appending a windowed dismissal entry to `dismissed.md`.

## Connections

Uses:
- src/cli/templates.ts — `pulseDismissedTemplate` supplies the header when `dismissed.md` is created for the first time on a reject.
- src/pulse/fences.ts — `openingFence`, `closesFence`, `headingLinesOutsideFences` (with the `FenceOpen` type) make heading detection and fenced-block extraction fence-aware so payload content that itself looks like a `## S-NNN` heading or a shorter fence round-trips byte-exact.
- src/pulse/promote.ts — `planPromotion` computes the landed content and insight-side mark-as-promoted write for `promotion`-typed suggestions; its refusal reasons are surfaced verbatim on accept failure.
- src/pulse/types.ts — `DEFAULT_SUGGESTION_TYPE`, `isSuggestionType`, `permittedRoots`, `permittedRootsLabel`, and the `SuggestionType` type drive the `**Type:**` parse tolerance and the runtime target-root guard.

Used by:
- (none src-internal)
