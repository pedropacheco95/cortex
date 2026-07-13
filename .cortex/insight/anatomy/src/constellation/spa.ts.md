---
path: src/constellation/spa.ts
extracted_at: 2026-07-11T01:23:31Z
extraction_level: 3
size_lines: 950
size_tokens: 13225
centrality: high
built_at_commit: "fd7b55b"
source_sha256: "3095b51f18c0df9a57e3c5f47ac5c69addb07c9a3c199cf45be276b2eab9fcaf"
---
# src/constellation/spa.ts

## Purpose
One self-contained HTML string (`SPA_HTML`) implementing the constellation single-page renderer (spec `constellation.renderer` Rule 8): a full-viewport 2D canvas that draws the compiled map as a deep-space starfield — each top-level group (domain) a coloured halo, each child group a glowing star that dissolves into its member artefacts on zoom and re-condenses zooming out. Around the canvas sits a glass top bar (logo, stats, search, and the four-way preset switcher `default`/`orphans`/`domain`/`insight`), a breadcrumb, a legend, zoom controls, a hover tooltip, and a slide-in detail panel. This is a rewrite from an earlier Cytoscape.js compound-node implementation: the browser now does its own canvas layout/animation rather than delegating to a graph library, and does no graph computation of its own beyond that — every glyph and every line of chrome copy derives from the real `id`/`module`/`label`/`group`/`ref` fields (plus, for the `insight` preset, `purpose`/`cliPointer`/`conceptExcerpt`/`touchingFiles`/`owningFile`/`range`) that `/api/constellation` returns.

## Main players
- `SPA_HTML` (const, lines 33-950) — critical. The entire file is this one exported template-literal string: a `<!doctype html>` document with an inline `<style>` block and one inline `<script>` containing all client-side logic (scene building, camera/LOD rendering, chrome sync, event wiring). Nothing else is exported.

## Insights
- The LOD math (`clamp`, `hexWithAlpha`, `computeLOD`, `focusLevel`, `clampScale`, `goldenSpiralPoint`, `starRadius` from `lod.ts`) and the edge-style math (`confidenceStyle` from `insight-style.ts`) are embedded into the client script via `<function>.toString()` interpolation (lines 176-186), not re-implemented inline and not loaded as a separate script tag. This is the single-source-of-truth convention design §12.6 calls for: the same functions that are unit-tested in Node run byte-identical in the browser, with zero drift and no extra network round-trip. Any change to the dissolve thresholds or edge dash styling belongs in `lod.ts`/`insight-style.ts`, never patched directly in this string.
- `state.preset === 'insight'` is threaded through nearly every rendering and interaction function (`nodeColor`, `groupColor`, `pickAt`, tooltip/detail body construction) as a branch, rather than the insight preset being a separate code path — curated and insight data share one scene-building and draw pipeline (`buildScene`, `draw`), with insight-only fields (`purpose`, `confidence`, `evidence`, etc.) simply riding along undefined on curated nodes/edges.
- Insight-preset node colour is by **kind** (file/element/concept, a small fixed `KIND_COLOR` map) while curated-preset node colour is by **domain** (`hue(n.domainId)`); insight cluster-star colour is a hash of the cluster id into a 12-entry qualitative palette (`clusterHue`) since there are 10+ clusters — too many for one fixed hue each, an explicit engineering call recorded in the source comments.
- Insight edges are always rendered dashed with per-confidence-tier opacity/width (from `confidenceStyle`), and hovering an edge (`pickLink`, only wired up when `state.preset === 'insight'`) surfaces its `evidence` string in the tooltip — explainability is treated as a module invariant per schema §4.10.6, not an optional nicety.
- The only external network dependency is the Google Fonts stylesheet (Space Grotesk + IBM Plex Mono) with full fallback stacks, so the page still reads offline; there is no external `<script src>` anywhere.
- Layout is deterministic and static (golden-angle phyllotaxis via `goldenSpiralPoint`, positions computed once in `buildScene`) — only the camera transform (`cam`/`camT`, lerped each frame) animates, which is why the reference implementation holds 60fps trivially even before any perf work.

## File map
- Lines 33-169: the HTML shell — `<head>` with inline `<style>` (topbar, search, preset switcher, breadcrumb, legend, zoom controls, tooltip, detail panel, all CSS-variable themed) and the static `<body>` markup (canvas, topbar with the four preset buttons, breadcrumb/legend/zoom-controls containers, hint, tooltip, detail aside, message placeholder).
- Lines 170-249: client script setup — embedded `lod.ts`/`insight-style.ts` function bodies (176-186), the domain/cluster colour helpers (`hue`, `nodeColor`, `groupColor`, `clusterHue`), DOM element handles, and the mutable `state`/`scene`/`cam` variables.
- Lines 249-354: `buildScene(map)` — turns a `/api/constellation` response into the static layout (domains → groups → nodes, golden-spiral member placement, edge/link lists, aggregate inter-group links, decorative starfield, world-bounds fit scale).
- Lines 356-444: camera/sizing plumbing (`resize`, `recomputeFit`, `resetCamera`, `clampS`) and picking (`pickNode`, `pickGroup`, `pickLink`, `pickAt`, `distToSegment`) plus camera-move helpers (`zoomToDomain`, `zoomToGroup`, `selectNode`, `deselect`).
- Lines 445-632: the render loop — `draw(time)`, the faithful port computing LOD alphas, focus tier, and drawing starfield → domain haloes → group haloes → inter-group links → node links (curated vs. insight-dashed branch) → group stars → artefact dots → labels, in that back-to-front order.
- Lines 634-791: chrome sync functions driven by state changes — `syncBreadcrumb`, `syncLegend` (including the insight-only kind-counts strip), `syncTooltip` (node/edge/group variants), `syncDetail` (kind-specific body: file/concept/element/plain-module).
- Lines 792-856: data loading — `onData` (post-fetch scene rebuild + stats), `clearSceneChrome`, `load(preset, domain)` (fetches `/api/constellation`, handles the insight preset's honest-empty `emptyHint` as a 200, not an error), `setActivePreset`.
- Lines 857-950: event wiring (preset buttons, domain input, search, breadcrumb, legend, detail panel close/navigate, zoom buttons, pointer drag/pick/hover, wheel zoom, window resize) and the bootstrap (`resize(); load('default'); requestAnimationFrame(loop);`).

## Connections
Uses:
- src/constellation/lod.ts: `clamp`, `hexWithAlpha`, `computeLOD`, `focusLevel`, `clampScale`, `goldenSpiralPoint`, `starRadius` — embedded verbatim (`.toString()`) as the client script's zoom/layout math.
- src/constellation/insight-style.ts: `confidenceStyle` — embedded verbatim (`.toString()`) as the client script's insight-edge dash/opacity/width mapping.

Used by:
- src/constellation/server.ts: imports `SPA_HTML` and serves it verbatim at the `/` route.

## Query pointers
- Any visual/behavioural bug in the running renderer (wrong colours, broken zoom, missing tooltip data): this file IS the client — read the relevant chrome-sync or draw section directly, there is no separate bundled JS to chase.
- Changing what data the insight preset exposes per node: the shape is entirely dictated by `server.ts`'s `InsightPresetNode`/`InsightPresetEdge` — check that file first, then find the corresponding read here (`onData`, `syncDetail`'s kind-specific body).
- Dissolve-threshold or edge-styling tuning: edit `lod.ts`/`insight-style.ts`, not this file — the interpolation keeps them in sync automatically.
