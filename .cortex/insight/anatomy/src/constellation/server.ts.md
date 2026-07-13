---
path: src/constellation/server.ts
extracted_at: 2026-07-11T01:23:31Z
extraction_level: 3
size_lines: 474
size_tokens: 4880
centrality: high
built_at_commit: "fd7b55b"
source_sha256: "3e2980d39f8b3ae1c75eb86b7bdd7b2bf4533f3e9dc035e9a0307c17a8aa0dbb"
---
# src/constellation/server.ts

## Purpose
A localhost-only, read-only Node HTTP server (spec `constellation.renderer`) that re-reads `.cortex/constellation.json` per request, filters it through one of the locked curated presets (`default`/`orphans`/`domain`), and serves the self-contained single-page canvas renderer from `spa.ts`. Never writes and never invokes the compiler — a stale or missing curated map reports 404 rather than triggering a rebuild. v3.0 (build-order-v3 step 10) adds a fourth, structurally separate preset, `insight`: a wholly self-contained composition over `.cortex/insight/graph.json` + `clusters.json` (`composeInsightPreset`), never reading `constellation.json` at all — it is checked and short-circuited in `handleApi` before the curated-file read, and deliberately excluded from `applyPreset`'s own switch.

## Main players
- `PRESET_NAMES` (const, line 35) — supporting. The locked, public preset-name tuple (`default`/`orphans`/`domain`/`insight`) the preset switcher and error messages read from.
- `applyPreset` (function, lines 70-140) — critical. Filters a compiled curated `Constellation` through one of the three curated presets with full filter closure (edges kept iff both endpoints survive; groups/children pruned to those with ≥1 remaining node; counters recomputed over the filtered sets). Pure — never mutates its input.
- `composeInsightPreset` (function, lines 289-374) — critical. Composes the `insight` preset fresh per request from `.cortex/insight/graph.json` + `clusters.json` via `insight/query.ts`'s `locateInsight`/`loadUnifiedGraph`: one synthetic top-level group whose children are the declared clusters plus a synthetic `cluster:uncategorized` catch-all, every edge forced dashed, `generated` read from the insight graph's own field (never wall-clock) for byte-identical determinism. Absent/empty insight data returns an honest empty result via `emptyInsightResult()`, never an error.
- `handleApi` (function, lines 381-428) — critical. The `/api/constellation` request handler: branches on `?preset=insight` before touching `constellation.json` at all, otherwise reads/parses the curated map and delegates to `applyPreset`.
- `createServer` (function, lines 436-453) — critical. Builds the unlistened `http.Server`: serves `SPA_HTML` at `/`, routes `/api/constellation` to `handleApi`, 405s non-GET, 404s everything else.
- `serveConstellation` (function, lines 460-474) — critical. Binds the server to `127.0.0.1` only (never `0.0.0.0`), prints the listening URL, never auto-opens a browser; resolves with the listening server for the CLI to await `close` on.
- `DEFAULT_PORT` (const, line 48) — supporting. Fixed at 4747 (renderer Rule 1).

## Insights
- The `insight` preset is architecturally NOT a join/overlay onto the curated `constellation.json` — that v2 design retired at build-order-v3 step 7. It is a completely parallel data source and code path; `applyPreset`'s `CuratedPresetName` type deliberately excludes it, so anyone adding a case there for `insight` would be fighting the type system, not extending it.
- Determinism is asserted twice for two different reasons: `applyPreset`'s curated result is a pure function of `constellation.json`'s bytes + the query (Rule 9), while `composeInsightPreset`'s `generated` field is deliberately sourced from the insight graph's own `generated` timestamp rather than `new Date()` — matching insight files + identical request must produce a byte-identical response (Rule 7).
- Tolerance is symmetric with the compiler's own philosophy: a malformed `clusters.json` degrades silently to "no clusters" (every node still renders under `cluster:uncategorized`) rather than failing the whole preset, and an edge endpoint absent from the node set is dropped-and-counted (`droppedRefs`), not errored — mirroring the curated compiler's own dropped-ref tolerance.
- `orphans` widens "zero connected edges" to *either* direction (in or out), a deliberate widening documented inline as differing from a naive "zero incoming" reading.

## Connections
Uses:
- src/constellation/compile.ts: `Constellation`, `ConstellationGroup`, `ConstellationGroupChild`, `ConstellationNode` — the compiled curated-map shape `applyPreset`/`handleApi` read and filter.
- src/constellation/spa.ts: `SPA_HTML` — the static page served at `/`.
- src/insight/query.ts: `locateInsight`, `loadUnifiedGraph`, `fileQuery`, `conceptQuery`, `mainPlayers` — locates and loads the insight graph, and looks up per-file/per-element detail (purpose text, main-players line ranges) for `insight`-preset node enrichment.
- src/insight/storage.ts: `parseGraphV3`, `parseClustersV3`, `ClusterV3` — parses `graph.json`/`clusters.json` for `composeInsightPreset`.

Used by:
- src/cli/cli.ts: dynamically imports `serveConstellation`, `DEFAULT_PORT` for the `cortex constellation [--port N]` verb.

## Query pointers
- Adding or changing a curated preset: read `applyPreset` and its `CuratedPresetName`/`PRESET_NAMES` split first — the two lists are intentionally different.
- Debugging the insight lens (empty map, missing purpose/excerpt text, wrong cluster grouping): read `composeInsightPreset` top to bottom; it is the entire code path, no cross-file state.
- Anything about response shape for the browser renderer: cross-reference `src/constellation/spa.ts`'s `buildScene`/`onData`, which consumes exactly what `handleApi` returns.
