---
path: src/pulse/review.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 2
size_lines: 743
size_tokens: 7271
centrality: high
built_at_commit: "a66041b"
source_sha256: "96b55724ec8cfee2fcaab237f01955fad385b8c38e83050c46b7cc99390839dc"
---
# src/pulse/review.ts

## Purpose

This file implements the human review gate of Cortex's propose-don't-mutate discipline: `pulseCli`, the deterministic Core logic behind the `pulse-list`, `pulse-accept <S-NNN>`, and `pulse-reject <S-NNN>` commands (spec `pulse.review-cli`, schema §4.5). It discovers `## S-NNN` suggestion sections across the single S-namespace — every loop report under `.cortex/pulse/reports/` plus `suggestions.md`, which stays at the pulse root as distil's user-facing output (`dismissed.md` and other pulse-root files like `_index.md` are excluded) — parses each section's fence-aware payload shape (`addition`, `file`, or `edit`, per §4.5.2), and enforces the accept/reject invariants: duplicate suggestion ids across files are a hard error, targets must resolve inside a type-permitted root or be a new `.claude/skills/<name>/SKILL.md`, edits must match their `current:` block byte-exact and exactly once, file-creates never overwrite, and every accept/reject computes its full blast radius before the first write so an accept is transactional. It also special-cases `promotion`-typed suggestions by delegating to `promote.ts`'s `planPromotion` to land content plus mark the originating artefact (insight or archive), special-cases a NEW `.cortex/compass/rules/R-NNN-<slug>.md` target by registering its id in `compass/registry.md` in the same run (Rule 7b, schema.id-registry Rule 4, refusing before any write if the id is already registered under a different slug), and handles reject by appending a windowed dismissal entry to `dismissed.md`.

## Connections

Uses:
- src/atlas/evidence.ts — `ensureEvidenceDir`, called on accept of an `evidence-candidate`-typed suggestion so `atlas/evidence/` and its `_index.md` exist before the write (§4.3, the compass-core-file precedent).
- src/cli/templates.ts — `pulseDismissedTemplate` supplies the header when `dismissed.md` is created for the first time on a reject.
- src/compass/registry.ts — `findRegistered`, `registerId` back the Rule 7b guard: a new rule-file target's id is checked against the registry before any write, then registered after the file lands.
- src/pulse/fences.ts — `openingFence`, `closesFence`, `headingLinesOutsideFences` (with the `FenceOpen` type) make heading detection and fenced-block extraction fence-aware so payload content that itself looks like a `## S-NNN` heading or a shorter fence round-trips byte-exact.
- src/pulse/promote.ts — `planPromotion` computes the landed content and (for an insight-sourced promotion) the mark-as-promoted write; its refusal reasons are surfaced verbatim on accept failure.
- src/pulse/types.ts — `DEFAULT_SUGGESTION_TYPE`, `isSuggestionType`, `permittedRoots`, `permittedRootsLabel`, and the `SuggestionType` type drive the `**Type:**` parse tolerance and the runtime target-root guard.

Used by:
- (none src-internal — reached only via `src/cli/cli.ts`'s dynamic import of the `pulse-list`/`pulse-accept`/`pulse-reject` verbs, not tracked as an in-tree edge)
