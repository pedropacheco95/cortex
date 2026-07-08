---
id: constellation.insight-preset
status: implemented
depends_on:
  - insight.refresh-loop
  - constellation.renderer
  - constellation.compiler
implements: ../../specs-business/constellation/stakeholder-navigates-the-project-map.business.md
governed_by:
  - R-001
---

# Constellation Insight Preset — serve-time overlay

> **SUPERSEDED at v3 (build-order-v3 step 7 + the step-10 disposition; design
> §8.3, §11 Q2).** The v2 serve-time `insight` overlay this spec describes is
> DROPPED: it composed over `insight/map/graph.json`, a node set that no
> longer exists after the v3 insight rebuild. `src/constellation/
> insight-overlay.ts` is deleted, the `insight` preset returns the
> unknown-preset 400, and the former `governs:` target no longer exists, so
> the list is removed. A NEW v3 preset over the code-understanding graph
> stays deferred (design §11 Q2 — "not central; defer"). Retained for lineage.

## Intent

The constellation preset set (v1's five server-side lenses) gains a sixth, `insight` (schema §4.9): the curated citation graph with an inferred overlay composed **at serve time**. When (and only when) the `insight` preset is requested, the `cortex constellation` server reads `insight/map/graph.json` and `clusters.json` directly and overlays them on the curated graph — inferred edges rendered **dashed** (visually subordinate to solid curated edges), tag clusters rendered as **background colour regions** behind their member nodes. `constellation.json` stays **curated-only and byte-identical** to its v1 contract; nothing from insight is ever compiled into it, so the overlay is always as fresh as the last refresh run with no second compilation to drift. The default view stays curated-only — the preset is opt-in per session — preserving "proof of comprehension" (v1 §12.1): every edge in the default view is a human-gated claim; inferred edges are visibly second-class hypotheses. Deterministic, read-only Core (R-001).

## Entities

- **READS:** `.cortex/constellation.json` (the curated compiled graph, re-read per request); `insight/map/graph.json` and `insight/map/clusters.json` (read **only** when the `insight` preset is requested); the SPA's bundled static assets.
- **WRITES:** nothing, ever — serving is strictly read-only over the project. `constellation.json` is never modified and never gains inferred content.
- **CREATES:** nothing on disk; HTTP responses only.

## Rules

1. **The sixth preset.** `GET /api/constellation?preset=insight` returns the curated §4.9 graph plus an inferred overlay. The five v1 presets (`default`, `anatomy-only`, `knowledge-only`, `orphans`, `domain`) are unchanged; the preset switcher now names six.
2. **Serve-time composition, never compiled in (schema §4.9).** The overlay is read from `insight/map/graph.json` + `clusters.json` at request time, only for the `insight` preset. `constellation.json` stays curated-only — its shape and byte-determinism contract are untouched, and it never contains an inferred edge or cluster. If the insight files are absent, the `insight` preset returns the curated graph with an empty overlay (an honest empty overlay, not an error).
3. **Shared node set = a join, not a merge (schema §4.9, §4.10.2).** Insight adds edges and groupings over the **same** nodes; the shared constellation node-id grammar (`anatomy:<relpath>`, `rule:R-NNN`, `spec:<dev-id>`, …) makes this a join on node id. Inferred edges whose endpoints are not curated nodes are dropped-and-counted (tolerant, as the compiler's dropped-ref handling), not an error.
4. **Rendering rules (schema §4.9).** Inferred edges render **dashed** (subordinate to solid curated edges; weight/opacity MAY additionally encode `high|medium|low` confidence — a renderer detail, not a contract). Tag clusters render as **background colour regions** behind their member nodes (Cytoscape compound/parent styling — same library, no new renderer).
5. **Default stays curated (schema §4.9, v1 §12.1).** The `insight` preset is **opt-in per session, never the default**. The `default` preset response is byte-unchanged from v1 — no dashed edges, no cluster regions.
6. **Read-only + pure Core (R-001).** No LLM, no network egress, no subprocess, no writes. The server never invokes the refresh loop or the compiler — a stale or missing map/overlay is reported or empty, never rebuilt.
7. **Determinism at the contract.** Identical `constellation.json` + identical `insight/map/*.json` + `preset=insight` → byte-identical API response.

## Acceptance Criteria

### The insight preset overlays dashed edges and cluster regions

- **Given** a compiled `constellation.json` and `insight/map/graph.json` with an inferred edge `spec:insight.cli --semantically-related-> anatomy:src/insight/query.ts` and `clusters.json` with `cluster:insight-layer` over those nodes
- **When** `GET /api/constellation?preset=insight`
- **Then** the response carries the curated nodes/edges plus the inferred edge marked dashed and the cluster as a background region over its members
- **And** the curated edges remain solid and present

### The switcher now names six presets

- **Given** a project with a compiled map
- **When** `GET /` serves the SPA
- **Then** the preset switcher names exactly `default`, `anatomy-only`, `knowledge-only`, `orphans`, `domain`, `insight`

### The default preset is byte-unchanged from v1

- **Given** the same project
- **When** `GET /api/constellation?preset=default`
- **Then** the response is byte-identical to the v1 curated-only default — no dashed edges, no cluster regions

### constellation.json stays curated-only

- **Given** a run that served the `insight` preset
- **When** `constellation.json` is validated
- **Then** it still validates as curated-only (`check.constellation`) — no inferred edge or cluster was compiled into it, and no file under the project changed

### Absent insight files yield an empty overlay, not an error

- **Given** a project with `constellation.json` but no `insight/map/graph.json`
- **When** `GET /api/constellation?preset=insight`
- **Then** the response is the curated graph with an empty overlay, exit/status 200 — an honest empty overlay

### An inferred edge to a non-curated node is dropped, not errored

- **Given** `insight/map/graph.json` with an inferred edge whose endpoint is not an emitted curated node
- **When** `GET /api/constellation?preset=insight`
- **Then** that edge is dropped-and-counted and the overlay renders the resolvable inferred edges — no error

### The overlay response is deterministic

- **Given** unchanged `constellation.json` and `insight/map/*.json`
- **When** `GET /api/constellation?preset=insight` runs twice
- **Then** the two response bodies are byte-identical

## Notes

- This resolves a v1 deferral (v1 §12.2): "edge stroke can carry semantic distinctions where they exist (e.g. dashed for inferred); design decision deferred to schema." Schema §4.9 is that decision; this spec implements it.
- The overlay lives in `src/constellation/insight-overlay.ts` and is invoked by the server's request handler (owned by `constellation.renderer`, `src/constellation/server.ts`) — the serve-time integration point. The overlay module is this spec's owned artefact; the server dispatches to it when `preset=insight`.
- Journey-layer visual behaviour (dashed-edge styling choreography, cluster-region colour choices) is deliberately unpinned at this layer — journey tier, deferred to v1.1, same convention as the renderer.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
