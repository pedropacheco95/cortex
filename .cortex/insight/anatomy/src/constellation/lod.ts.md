---
path: src/constellation/lod.ts
extracted_at: 2026-07-11T01:23:31Z
extraction_level: 2
size_lines: 90
size_tokens: 1004
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "06c8e756751369b2ef690ba5eb5c0fc31c903a5a96f0de6e04f1b78700be9e79"
---
# src/constellation/lod.ts

## Purpose
Pure, DOM-free, canvas-free level-of-detail and layout math for the constellation renderer: the five zoom-driven alpha curves that make a group star "dissolve" into its member artefacts as the camera zooms in (`computeLOD`), the focus-tier classifier (`focusLevel`), a camera-scale clamp (`clampScale`), golden-angle phyllotaxis point placement for laying out a group's members (`goldenSpiralPoint`), a member-count-driven star radius (`starRadius`), and a hex-to-rgba helper (`hexWithAlpha`). These are the single source of truth for the dissolve threshold logic: unit-tested directly and also embedded verbatim (via `.toString()`) into the client-side script `spa.ts` serves, so the shipped page runs byte-identical logic with zero drift and no extra network round-trip.

## Connections
Uses:
- (none src-internal — a zero-dependency leaf module, deliberately plain so it embeds cleanly in the browser)

Used by:
- src/constellation/spa.ts: imports `clamp`, `hexWithAlpha`, `computeLOD`, `focusLevel`, `clampScale`, `goldenSpiralPoint`, `starRadius` and interpolates each function's `.toString()` into the inline `<script>` of the served single-page renderer, driving the canvas draw loop's zoom/dissolve/layout behaviour.

Semantically related (not imports): src/constellation/insight-style.ts — the sibling pure-math module embedded the same way (`.toString()` verbatim) into `spa.ts`'s client script, for edge rendering style rather than node/group layout.
