---
id: constellation.renderer
status: implemented
depends_on:
  - constellation.compiler
implements: ../../specs-business/constellation/stakeholder-navigates-the-project-map.business.md
governed_by:
  - R-001
governs:
  - "src/constellation/server.ts"
  - "src/constellation/spa.ts"
  - "src/constellation/lod.ts"
---

# Constellation Renderer

## Intent

`cortex constellation` serves the compiled map to a human: a localhost-only Node server delivering a self-contained single-page canvas renderer over `.cortex/constellation.json`, with a small locked set of presets (lenses) filtered server-side so every lens is a testable contract, not a styling choice. The browser does no graph computation and fabricates no data — it renders exactly what the server returns (design §12.8), and every piece of on-screen copy derives from a real node/edge field. Restraint is the credibility (design §12.7, business Rule 5): the discipline is data honesty — no invented connections, no summarised-away detail, lenses that filter what exists — not visual austerity.

## Entities

- **READS:** `.cortex/constellation.json` (re-read per request, so a fresh scan is visible on reload); the SPA's static assets bundled with the npm package (no CDN — works offline).
- **WRITES:** nothing, ever — serving is strictly read-only over the project (business Rule 2).
- **CREATES:** nothing on disk. HTTP responses only.

## Rules

1. **Invocation.** `cortex constellation [--port N]` starts the server (default port fixed at implementation, printed on start with the full URL) and does not auto-open a browser. `Ctrl-C` stops it; nothing persists.
2. **Localhost only.** The server binds `127.0.0.1` exclusively — never `0.0.0.0`. No auth because no exposure (design §19: localhost-only, no telemetry, no remote viewing).
3. **Read-only + pure Core.** No LLM, no network egress, no subprocess, no writes to the project (R-001; design §12.7 "the constellation observes; it doesn't act"). The server never invokes the compiler — a stale or missing map is reported, not rebuilt.
4. **Missing map.** If `.cortex/constellation.json` does not exist, `GET /api/constellation` returns `404` with a JSON body naming the fix (`run cortex scan`), and the SPA shows that message plainly (business Rule 4).
5. **The API.** `GET /api/constellation?preset=<name>[&domain=<d>]` returns a filtered constellation with the same §4.9 shape (`schemaVersion`, `generated`, `groups`, `nodes`, `edges`, `counters` recomputed for the filtered set). No other mutation of the data — lenses filter, never restyle or summarise (business Rule 3).
6. **The locked preset set.** Exactly three presets; unknown preset → `400`; `domain` required for `domain` preset else `400`:

   | Preset | Node predicate |
   |---|---|
   | `default` | all nodes |
   | `orphans` | nodes with **zero connected edges in either direction** (see Notes — deliberate widening of "zero incoming") |
   | `domain` | `spec-dev`/`spec-business` nodes whose id's domain segment equals `?domain=<d>` |

7. **Filter closure.** For every preset: edges are included iff **both endpoints** are in the filtered node set; groups/children are pruned to those with at least one remaining node; `counters` are recomputed over the filtered sets. A `domain` value matching nothing returns `200` with empty `nodes`/`edges` (an honest empty lens, not an error).
8. **The SPA.** `GET /` serves one self-contained HTML page: a full-viewport 2D `<canvas>` that renders the map's three structural tiers — top-level groups (domains, one signature hue per branch), child groups (the glowing "stars"), and artefact nodes (the innermost dots). The dissolve mechanic is the core interaction: a child group shows as a star when zoomed out and **dissolves** into its member artefacts past a zoom threshold, re-condensing on zoom out. The zoom-driven level-of-detail/dissolve threshold math lives in `src/constellation/lod.ts` (pure, exported, unit-tested there) and is embedded verbatim into the served inline script so shipped and tested logic cannot drift. Around the canvas, glass-panel chrome: a top bar (logo, mono stats line, search, and the preset switcher naming exactly the three presets), a breadcrumb, a legend, zoom controls, a one-time hint, a hover tooltip, and a slide-in detail panel. Positions are deterministic (only the camera transform animates). The single external resource is the Google Fonts stylesheet (with fallback stacks so the page reads offline); there is no external `<script src>`. Fine-grained visual behaviour beyond these landmarks is deliberately unpinned at this layer (journey tier, deferred).
9. **Determinism at the contract.** Identical `constellation.json` + identical query → byte-identical API response.

## Acceptance Criteria

### Server starts, binds localhost, serves the SPA skeleton

- **Given** a project with a compiled `constellation.json`
- **When** `cortex constellation --port 4777` starts
- **Then** the printed URL is `http://127.0.0.1:4777` and the socket is bound to `127.0.0.1` only
- **And** `GET /` returns HTML containing the `<canvas id="constellation">` element, the glass-chrome landmarks (stable hooks `id="stats"`, `id="search"`, `id="presets"`, `id="breadcrumb"`, `id="legend"`, `id="zoom-controls"`, `id="hint"`), and a preset switcher naming exactly `default`, `orphans`, `domain` (via `data-preset="<name>"`, the hook the tests key off)
- **And** the page is self-contained: no external `<script src>`, and the only external resource is the Google Fonts `<link>`

### default preset returns the full compiled map

- **Given** a compiled map with N nodes and E edges
- **When** `GET /api/constellation?preset=default`
- **Then** the response has exactly N nodes, E edges, and the §4.9 top-level keys

### Retired presets are rejected like any unknown preset

- **Given** the v2 anatomy lenses (`anatomy-only`, `knowledge-only`) and the v2 serve-time `insight` overlay, all retired in v3.0
- **When** `GET /api/constellation?preset=<retired>` for any of them
- **Then** the response is `400` with a body naming the three valid presets (`default, orphans, domain`)

### orphans lens surfaces only disconnected nodes

- **Given** a map where the compass core file `compass:preferences.md` has no edges and `spec:schema.validator` has edges
- **When** `GET /api/constellation?preset=orphans`
- **Then** the node set contains `compass:preferences.md` and not `spec:schema.validator`
- **And** the edge set is empty

### domain lens is parameterized and exact

- **Given** dev and business specs in domains `schema` and `hooks`
- **When** `GET /api/constellation?preset=domain&domain=schema`
- **Then** every returned node is a `spec-dev` or `spec-business` node whose id's domain segment is `schema`
- **And** `GET /api/constellation?preset=domain` without `domain` returns `400`
- **And** `preset=domain&domain=nonexistent` returns `200` with empty nodes and edges

### Unknown preset rejected

- **When** `GET /api/constellation?preset=pretty`
- **Then** the response is `400` with a body naming the three valid presets

### Missing map reported plainly

- **Given** a project with no `.cortex/constellation.json`
- **When** `GET /api/constellation?preset=default`
- **Then** the response is `404` and the body tells the user to run `cortex scan`

### Serving is read-only

- **Given** any sequence of requests across all presets
- **When** the server handles them
- **Then** no file under the project root has been created, modified, or deleted

### Deterministic responses

- **Given** an unchanged `constellation.json`
- **When** the same query runs twice
- **Then** the two response bodies are byte-identical

## Notes

- **Decision (endorsed by Pedro): the `orphans` predicate is "zero connected edges in either direction"**, widening the originally requested "zero incoming refs". Reason: §4.9 edge directions make incoming-only misleading — `spec_links` points *out of* a file and `governs` *into* it, so a file linked to its spec (mapped) but ungoverned would count as orphan under incoming-only, while a rule actively governing files (mapped) would too. Fully-disconnected matches the intent — "surfaces unmapped state" (design §12.6) — for every module. One filter function + one test to flip if overridden.
- **Preset set supersedes design §12.5's original three view presets** — design doc reconciled to the locked five-preset set in this round (standing authority: records Pedro's own locked decision).
- No rendering dependency: the page is a hand-rolled 2D-canvas renderer with deterministic (static-position) layout, so there is no Cytoscape/D3 npm bundle to serve — the Cytoscape dependency and its `/vendor/` route were removed with this redesign. The sole external resource is the Google Fonts stylesheet, and it degrades gracefully (fallback font stacks) so the page still reads offline.
- The dissolve/level-of-detail threshold math is factored into `src/constellation/lod.ts` (pure functions: `computeLOD`, `focusLevel`, `clampScale`, `goldenSpiralPoint`, `starRadius`, `clamp`, `hexWithAlpha`) and unit-tested in `tests/atomic/constellation/lod.test.ts`. `spa.ts` embeds those exact functions into the served script by interpolating their source, so the tested logic and the shipped logic are byte-identical.
- Visual behaviour (zoom choreography §12.3-12.4, the hover tooltip, the slide-in detail pane) is deliberately untested at the browser-render layer — journey tier, deferred to v1.1 pending the test-runner loop, same convention as the hooks round; the extractable math is covered atomically per the note above.
- Also supports: `core-cli` (the `cortex constellation` command). Primary parent remains `constellation.stakeholder-navigates-the-project-map`.
