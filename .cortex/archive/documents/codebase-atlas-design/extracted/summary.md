# Codebase Atlas — design reference summary

Source: `../source.html` (a 41.8 KB declarative-component `.dc.html` template —
requires a `support.js` runtime this repo does not have; treated here as a
**static design spec**, not an executable prototype). It renders a canvas
"galaxy" visualization of a codebase: domains → groups → files, with a
zoom-driven level-of-detail (LOD) model.

## Theme tokens

Three built-in themes (`THEMES` map, all switchable at runtime via top-bar
buttons):

| Theme | `bg` | Notes |
|---|---|---|
| `deepspace` (default) | `#05060b` | starfield visible, glow halos strongest |
| `observatory` | `#0a1018` | dimmer variant, same structure |
| `lightatlas` | `#f3f1ea` | light mode — no starfield, flatter halos |

Each theme carries a `cluster` palette (one color per domain — `auth`, `api`,
`frontend`, `infra`, `database`, `testing`) and a `ui` palette: `panel`
(translucent, blurred), `border`, `text`, `sub` (secondary text), `chip`,
`input`, `shadow`. Panels use `backdrop-filter: blur(12–22px)` glassmorphism
throughout — top bar, breadcrumbs, legend, hover card, and the detail panel
all share this treatment.

## Typography

- **Space Grotesk** (400/500/600/700) — headings, titles, body UI text.
- **IBM Plex Mono** (400/500/600) — stat lines, paths, kickers, zoom
  percentage, anything numeric/technical. Loaded via a Google Fonts
  `<link>` (the one sanctioned external resource per the derived
  implementation's commit message).

## Layout / component inventory

- **Top bar** (58px, blurred panel, bottom border): logo mark (small SVG
  constellation icon) + "Codebase Atlas" title + a live `{{fileCount}} FILES ·
  {{domainCount}} DOMAINS · {{groupCount}} GROUPS` stat line in mono; a
  centered search input ("Search 250 files, groups, paths…"); a 3-way theme
  toggle (pill buttons) on the right.
- **Breadcrumbs** — floating pill top-left below the bar, chevron-separated
  (`▸`), driven by focus level (`all` → domain → group).
- **Legend** — floating panel bottom-left, title changes by focus level
  (`DOMAINS · CLICK TO ZOOM` → `GROUPS · <domain>` → `FILES · <group>`); each
  row is a colored glow-dot + label + count, clickable to zoom.
- **Zoom controls** — floating column bottom-right: zoom % readout, `+`,
  `−`, and a reset/fit button.
- **Hint pill** — bottom-center, auto-dismisses on first interaction:
  "Each glowing star is a group — zoom in and it dissolves into its files ·
  Scroll to zoom · Drag to pan".
- **Hover card** — cursor-following tooltip: colored kicker (domain · group,
  or "GROUP"), title, mono path, excerpt, and a two-stat footer row
  (link count, last-updated / external-link count).
- **Detail panel** — 340px panel that slides in from the right
  (`slideIn` keyframe) on file selection: cluster-color kicker, title,
  mono path chip, author/updated stat pair, a structured body (heading /
  paragraph / bullet / code blocks built by `buildBody()`), a "LINKED FILES"
  section listing connected files, and a footer CTA button ("Open document").

## The group-star / zoom-dissolve interaction model

This is the design's central mechanic and the one most directly ported:

- The canvas renders **domains** (broad clusters, e.g. "Frontend", "Auth &
  Security") as soft radial-gradient halos positioned on an ellipse.
- Within each domain, **groups** render as single glowing "stars" (radius
  scaled by member count) — the galaxy's primary visible unit at rest.
- **Files** are invisible at the default zoom (`fileAlpha` starts at 0) and
  fade in only past a zoom-ratio threshold, dissolving each group-star into
  its individual file-nodes arranged around the group's centroid.
- Alpha/visibility of every layer (domain halo, group star, group label,
  file dot, file label) is a continuous function of the zoom ratio `r`
  (current scale ÷ fit scale), each with its own threshold band — this
  produces the smooth "dissolve" rather than a hard cutoff.
- Aggregate group-to-group links render only when zoomed out; individual
  file-to-file links fade in with `fileA`.
- Clicking a group re-centers/zooms the camera onto it (`zoomToGroup`);
  clicking a file selects it and opens the detail panel.

## Lineage — what derived from this reference

- **`src/constellation/spa.ts`** (commit `c33ba1e`, "Constellation restyled
  to the Codebase Atlas design") — full port of the design language into
  Cortex's self-contained constellation SPA: the `#05060b` deep-space
  canvas, glowing group-stars with zoom-dissolve, glassmorphism panels,
  Space Grotesk + IBM Plex Mono, top bar with search/stats, breadcrumbs,
  legend, zoom controls + hint pill, hover cards, and the slide-in detail
  panel. `cytoscape` was removed as a dependency in the same commit — the
  ported renderer is pure canvas vanilla JS.
- **`src/constellation/lod.ts`** (same commit) — the zoom-driven
  level-of-detail alpha logic (domain/group/file dissolve thresholds)
  extracted out of the inline canvas draw loop into its own unit-tested
  module, generalizing the `domainLabelA` / `groupStarA` / `fileA` /
  `groupLabelA` / `fileLabelA` threshold bands seen in this reference's
  `draw()` method.
- **`src/constellation/insight-style.ts`** + the `?preset=insight` preset
  (commit `75da03b`, "Insight constellation preset: the semantic galaxy") —
  extended the same visual language (group-stars, dissolve-on-zoom,
  glassmorphism hover/detail panels) to render the insight layer's
  clusters/files/elements/concepts, with confidence mapped to edge opacity
  and evidence surfaced in the hover card. `confidenceStyle` was extracted
  from this styling work into its own unit-tested module, mirroring how
  `lod.ts` was extracted from the original port.

## Caveats

- This is a `.dc` (declarative-component) template requiring a `support.js`
  runtime not present in this repo — it cannot be executed as-is. It is
  retained purely as the static visual/interaction design spec that the
  constellation renderer's implementation targets, not as runnable code.
- Randomized dummy data (`mulberry32` seeded RNG, placeholder domain/group/
  file names) fills the reference for demonstration only; none of it
  reflects real Cortex codebase content.
