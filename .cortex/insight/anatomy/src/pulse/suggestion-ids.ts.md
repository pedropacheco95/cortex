---
path: src/pulse/suggestion-ids.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 50
size_tokens: 482
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "c1d967f814ff0f3b5d583e81a6fdf35a662542319e3ecfdfa931ef4cc79ecb28"
---

# src/pulse/suggestion-ids.ts

## Purpose

Implements the single shared `S-NNN` id allocator for the pulse suggestion namespace (schema §4.5): `readSuggestionCounter` reads the last-allocated integer from `pulse/state/suggestion-counter` (0 if missing), and `allocateSuggestionIds` hands out `n` fresh, zero-padded `S-NNN` ids while immediately persisting the advanced counter so that ids are never reused and two loops allocating in sequence can never collide. This is the one place every proposal-writing loop (distil, skill-suggest, and others) must go through to mint suggestion ids, which is what keeps the S-namespace globally monotonic across otherwise-independent loops. The counter file itself moved from the flat `.cortex/pulse/.suggestion-counter` to `.cortex/pulse/state/suggestion-counter` as part of the pulse-layout reorg (see `src/pulse/migrate.ts`).

## Connections

Uses: (none src-internal)

Used by:
- `src/insight/session-observe.ts` — allocates ids for observation-derived proposals.
- `src/loops/skill-suggest.ts` — `allocateSuggestionIds`, for fresh ids on skill candidates not carried forward from a prior run.
- `src/pulse/distil.ts` — allocates ids for its own rule/pattern candidates, sharing the same counter so distil and skill-suggest ids never collide.

Semantically related (not imports): `src/pulse/fences.ts` and `src/pulse/types.ts` — all three are small, pure, widely-shared infrastructure modules underpinning the §4.5 suggestion-section contract that distil.ts and skill-suggest.ts both build on.
