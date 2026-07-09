---
path: src/pulse/fences.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 85
size_tokens: 750
centrality: medium
built_at_commit: "8248c76"
source_sha256: "2ba656aedd3d3192eb8846456d233c860aa5891fdac4340f9dd05d6411904226"
---

# src/pulse/fences.ts

## Purpose

Owns both halves of the schema §4.5 fence-nesting grammar contract (the B-003 bug fix, applying the CommonMark longer-fence rule): the writer half, `chooseOuterFence`, picks an outer backtick fence strictly longer than the longest inner backtick run in a payload (minimum three backticks) so a proposal payload that itself contains fenced code examples cannot prematurely close its own wrapping fence; the parser half, `openingFence`/`closesFence`, recognises a fence's character and length on open and only closes on a fence of the same character and at-least-equal length, letting shorter inner fences pass through byte-exact. `headingLinesOutsideFences` builds on this to find `## S-NNN`-style headings that sit outside any fenced block, so a heading-looking line inside a payload is correctly treated as payload rather than document structure. The module is pure (no fs, no LLM, no network).

## Connections

Uses: (none src-internal)

Used by:
- `src/insight/session-observe.ts` — uses the fence contract when writing its own proposal sections.
- `src/loops/skill-suggest.ts` — `chooseOuterFence`, to safely wrap draft `SKILL.md` payloads that routinely contain their own fenced examples.
- `src/pulse/distil.ts` — uses the fence grammar for its own §4.5 section parsing/writing (`parseSuggestionSections`).
- `src/pulse/review.ts` — the §4.5 section parser referenced in this file's own header comment as a consumer.

Semantically related (not imports): `src/pulse/types.ts` — both are pure §4.5-contract policy modules shared between writers and validators specifically so the two sides cannot drift apart; `src/pulse/suggestion-ids.ts` — a sibling small shared-infrastructure module underpinning the same proposal pipeline.
