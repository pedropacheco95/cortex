---
id: constellation.renderer
status: implemented
depends_on:
  - constellation.compiler
implements: ../../specs-business/constellation/stakeholder-navigates-the-project-map.business.md
governed_by:
  - R-001
---

# Constellation Renderer

## Intent

`cortex constellation` serves the compiled map to a human: a localhost-only Node server delivering a single-page Cytoscape renderer over `.cortex/constellation.json`, with a small locked set of presets (lenses) filtered server-side so every lens is a testable contract, not a styling choice. The browser does no graph computation — it renders what the server returns (design §12.8). Restraint is the credibility (design §12.7): good defaults, minimal chrome, no animation flourishes.

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
6. **The locked preset set.** Exactly five presets; unknown preset → `400`; `domain` required for `domain` preset else `400`:

   | Preset | Node predicate |
   |---|---|
   | `default` | all nodes |
   | `anatomy-only` | `module == "anatomy"` |
   | `knowledge-only` | `module != "anatomy"` (cerebrum + rules + bugs + atlas + both spec kinds) |
   | `orphans` | nodes with **zero connected edges in either direction** (see Notes — deliberate widening of "zero incoming") |
   | `domain` | `spec-dev`/`spec-business` nodes whose id's domain segment equals `?domain=<d>` |

7. **Filter closure.** For every preset: edges are included iff **both endpoints** are in the filtered node set; groups/children are pruned to those with at least one remaining node; `counters` are recomputed over the filtered sets. A `domain` value matching nothing returns `200` with empty `nodes`/`edges` (an honest empty lens, not an error).
8. **The SPA.** `GET /` serves the single page: Cytoscape with **compound nodes** for the group hierarchy (design §12.8 — native support, no D3, no hand-rolled layout), a preset switcher naming exactly the five presets, and the coverage counters (design §12.6). Level-1 grouped view is the default (design §12.3). Visual behaviour beyond this skeleton is deliberately unpinned at this layer (journey tier, deferred).
9. **Determinism at the contract.** Identical `constellation.json` + identical query → byte-identical API response.

## Acceptance Criteria

### Server starts, binds localhost, serves the SPA skeleton

- **Given** a project with a compiled `constellation.json`
- **When** `cortex constellation --port 4777` starts
- **Then** the printed URL is `http://127.0.0.1:4777` and the socket is bound to `127.0.0.1` only
- **And** `GET /` returns HTML containing the Cytoscape container element and a preset switcher naming exactly `default`, `anatomy-only`, `knowledge-only`, `orphans`, `domain`

### default preset returns the full compiled map

- **Given** a compiled map with N nodes and E edges
- **When** `GET /api/constellation?preset=default`
- **Then** the response has exactly N nodes, E edges, and the §4.9 top-level keys

### anatomy-only lens

- **Given** a map containing anatomy, rule, and spec nodes
- **When** `GET /api/constellation?preset=anatomy-only`
- **Then** every returned node has `module: "anatomy"`
- **And** every returned edge has both endpoints in the returned node set
- **And** groups with no remaining nodes are absent

### knowledge-only lens

- **Given** the same map
- **When** `GET /api/constellation?preset=knowledge-only`
- **Then** no returned node has `module: "anatomy"` and rule/bug/cerebrum/atlas/spec nodes are all present

### orphans lens surfaces only disconnected nodes

- **Given** a map where `anatomy:src/lone.ts` has no edges and `spec:schema.validator` has edges
- **When** `GET /api/constellation?preset=orphans`
- **Then** the node set contains `anatomy:src/lone.ts` and not `spec:schema.validator`
- **And** the edge set is empty

### domain lens is parameterized and exact

- **Given** dev and business specs in domains `schema` and `hooks`
- **When** `GET /api/constellation?preset=domain&domain=schema`
- **Then** every returned node is a `spec-dev` or `spec-business` node whose id's domain segment is `schema`
- **And** `GET /api/constellation?preset=domain` without `domain` returns `400`
- **And** `preset=domain&domain=nonexistent` returns `200` with empty nodes and edges

### Unknown preset rejected

- **When** `GET /api/constellation?preset=pretty`
- **Then** the response is `400` with a body naming the five valid presets

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

- **Decision (flagged for override): the `orphans` predicate is "zero connected edges in either direction", widening the requested "zero incoming refs".** Reason: §4.9 edge directions make incoming-only misleading — `spec_links` points *out of* a file and `governs` *into* it, so a file linked to its spec (mapped) but ungoverned would count as orphan under incoming-only, while a rule actively governing files (mapped) would too. Fully-disconnected matches the intent — "surfaces unmapped state" (design §12.6) — for every module. One filter function + one test to flip if overridden.
- **Preset set supersedes design §12.5's original three view presets** — design doc reconciled to the locked five-preset set in this round (standing authority: records Pedro's own locked decision).
- Cytoscape ships as an npm dependency, served locally by the package — no CDN, offline-safe; version pinned per RULES.md rule 2 (≥7 days old, CVE-checked). Compound nodes are the committed hierarchy mechanism — no D3, no custom layout code.
- Visual behaviour (zoom choreography §12.3-12.4, drill-down detail pane, ghost nodes) is deliberately untested at this layer — journey tier, deferred to v1.1 pending the test-runner loop, same convention as the hooks round.
- Also supports: `core-cli` (the `cortex constellation` command). Primary parent remains `constellation.stakeholder-navigates-the-project-map`.
