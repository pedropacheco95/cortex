---
id: constellation.insight-preset-v3
status: implemented
depends_on:
  - constellation.renderer
  - constellation.compiler
  - insight.storage-format
  - insight.cli
implements: ../../specs-business/constellation/stakeholder-navigates-the-project-map.business.md
governed_by:
  - R-001
governs:
  - "src/constellation/insight-style.ts"
---

# Constellation Insight Preset (v3) — the code-understanding lens

## Intent

Build-order-v3 step 10 was deferred at design §11 Q2 ("not central; defer") and is now commissioned: a fourth constellation preset, `insight`, over the code-understanding graph the v3 insight rebuild produces (`insight/graph.json` + `clusters.json`, schema §4.10.6) — architecturally simpler than the v2 lineage this supersedes (`constellation.insight-preset`, SUPERSEDED-bannered): it renders the insight graph as its **own self-contained map**, not a join/overlay onto the curated `constellation.json`. `constellation.json` stays curated-only and untouched (RULES.md rule 16, R-001) — `?preset=insight` never reads it. The preset is composed fresh per request from `.cortex/insight/` (via `composeInsightPreset`, `src/constellation/server.ts`), rendered by the same deterministic-layout canvas SPA the curated presets use (`src/constellation/spa.ts`, `lod.ts` untouched), with its own colour language (kind-coloured nodes, cluster-hashed group stars) and its own edge discipline: every insight edge renders **dashed**, non-negotiably, with confidence-tier-driven opacity/weight (`src/constellation/insight-style.ts`).

## Entities

- **READS:** `.cortex/insight/graph.json`, `.cortex/insight/clusters.json`, per-file entries under `.cortex/insight/anatomy/` (or the scoped equivalent, resolved transparently via `insight/query.ts`'s `locateInsight`/`loadUnifiedGraph`/`fileQuery`/`conceptQuery`), and concept docs under `.cortex/insight/concepts/`. Read fresh per request (no caching), the same re-read discipline `constellation.renderer` already holds for `constellation.json`.
- **WRITES:** nothing, ever — composing this preset is as strictly read-only as every other preset (R-001, RULES.md rule 16).
- **CREATES:** nothing on disk. HTTP responses only.

## Rules

1. **The fourth preset.** `GET /api/constellation?preset=insight` composes and returns a self-contained graph over `.cortex/insight/`. `PRESET_NAMES` (the switcher-facing, unknown-preset-validation set) is now `default | orphans | domain | insight` — four names, in `src/constellation/server.ts`. `applyPreset` (the curated-filter function `constellation.renderer` owns) is unchanged in what it filters; it does not implement `insight` itself, since insight is not a filter over curated nodes.
2. **Never depends on `constellation.json`; never a join.** `handleApi` checks `preset === 'insight'` and short-circuits to `composeInsightPreset` **before** the curated file read — a missing or absent `constellation.json` never blocks the insight preset (unlike every curated preset's 404), and a missing or empty `.cortex/insight/` (no dir, or a `graph.json` with zero nodes) yields `200` with empty `groups`/`nodes`/`edges` plus a client-consumable `emptyHint` field (`"no insight extracted yet — run cortex-extract-insight"`) — an honest empty result, never an error. This is architecturally simpler than the superseded v2 design (`constellation.insight-preset`), which joined an overlay onto the curated node set; v3's insight preset has no curated dependency at all.
3. **Composition shape.** One synthetic top-level group `{id: "insight", label: "Insight"}` whose `children` are every declared cluster (`clusters.json`) plus a synthetic `cluster:uncategorized` catch-all for any graph node absent from every cluster's `members` (never silently dropped). Nodes carry `id/label/module/ref/group` (the same field names `buildScene` already reads — no client dissolve-mechanic changes) where `module` is the graph node's `kind` (`file | element | concept`) and `ref` is derived from the id. Nodes carry additional, preset-specific fields: `file` nodes get `purpose` (the entry's `## Purpose` body, via `fileQuery`) and `cliPointer` (`` cortex insight file <path> ``); `concept` nodes get `conceptExcerpt` (the concept doc's body between its `# title` and its first `## `-section) and `touchingFiles` (paths from `implements-concept`/`co-clustered` edges, via `conceptQuery`); `element` nodes get `owningFile` and, only when cheaply extractable from the owning file's `## Main players` bullet, a `range` (`"<start>-<end>"`) — omitted gracefully otherwise, since §4.10.6 graph nodes carry no line range of their own.
4. **Edges.** Every edge carries `from/to/kind` (kind = the graph's `edge_type`, the same field name curated edges use) plus `dashed: true` (always — non-negotiable, regardless of confidence tier), `confidence`, and `evidence` (schema §4.10.6's non-empty-evidence invariant, passed through verbatim). An edge endpoint absent from the composed node set is **dropped and counted** in `counters.droppedRefs`, never an error — mirrors the compiler's own dropped-ref tolerance (Rule 6 of `constellation.compiler`).
5. **Rendering: dashed edges are absolute; confidence drives opacity/weight only.** The client (`spa.ts`) draws every insight edge with `ctx.setLineDash(...)` and resets `setLineDash([])` immediately after, so curated presets are never affected. Opacity/width/dash-density per confidence tier are computed by the pure, unit-tested `confidenceStyle` (`src/constellation/insight-style.ts`, embedded verbatim into the served script — the same `.toString()` convention `lod.ts` already uses) — strongest (`structural`) to faintest (`ambiguous`, never silently trusted). Exact numbers are an engineering call, recorded in Notes below, not a schema-level contract.
6. **Node kinds get their own colour language; clusters get a distinct one.** Node dots colour by kind (`file | element | concept`, a small fixed palette) rather than by curated domain; cluster "stars" hash their id to a qualitative palette (there are 10+ clusters, too many for one fixed hue each) — deliberately distinct from the kind-dot palette so the two colour dimensions never collide. The legend (`#legend`) surfaces file/element/concept counts for this preset. The stats line (`#stats`) reads "N FILES · N ELEMENTS · N CONCEPTS · N CLUSTERS" instead of the curated "ARTIFACTS · GROUPS · EDGES" line.
7. **Explainability on hover.** Hovering an insight edge (nearest-segment hit-testing, an engineering-call pixel threshold — Notes) surfaces a tooltip card with its `evidence`, `edge_type`, and `confidence` — the module invariant (schema §4.10.6: "each edge names its rationale") must be reachable from the rendered map, not just the JSON.
8. **Detail panel branches by kind.** Selecting a node routes `syncDetail` by `module`: `file` shows Purpose + the `cortex insight file <path>` pointer; `concept` shows the excerpt + touching files; `element` shows the owning file (+ line range, when present). Curated-preset nodes (`module` = `rule | bug | compass | atlas | spec-dev | spec-business`) are unaffected — they keep the plain MODULE field.
9. **Read-only + pure Core (R-001, RULES.md rule 16).** No LLM, no network egress, no subprocess, no writes. `composeInsightPreset` never invokes `cortex-extract-insight` or any refresh loop — stale or absent insight data is reported (empty result), never rebuilt.
10. **Determinism at the contract.** `generated` in the composed response is read from the insight graph's own `generated` field (`.cortex/insight/graph.json`, or the constant sentinel `1970-01-01T00:00:00.000Z` for the empty result) — **never** a wall-clock timestamp — so identical insight files + identical request produce a byte-identical response, the same discipline `constellation.renderer` Rule 9 already holds for curated presets.

## Acceptance Criteria

### The switcher now names four presets

- **Given** a project with a compiled map
- **When** `GET /` serves the SPA
- **Then** the preset switcher names exactly `default`, `orphans`, `domain`, `insight` (`data-preset="<name>"`), and no others

### The insight preset composes counts, clustering, and dashed edges from fixture insight data

- **Given** a fixture `.cortex/insight/graph.json` with 2 file nodes, 1 element node, 1 concept node, and `clusters.json` declaring 2 clusters that together cover all but one file node
- **When** `GET /api/constellation?preset=insight`
- **Then** `counters` reports 2 files, 1 element, 1 concept, 2 clusters, and the edge/droppedRefs counts match the fixture's resolvable/dangling edges
- **And** every returned edge carries `dashed: true`, a `confidence` tier, and a non-empty `evidence` string
- **And** the one uncategorized file node's `group` is `cluster:uncategorized`, which appears as a child of the single synthetic `insight` top-level group

### Per-kind detail data is present

- **Given** the same fixture, including a per-file entry with a `## Purpose` section and a `## Main players` bullet naming an element with a line range, and a concept doc
- **When** `GET /api/constellation?preset=insight`
- **Then** the file node carries `purpose` and a `cortex insight file <path>` `cliPointer`
- **And** the concept node carries a `conceptExcerpt` and `touchingFiles`
- **And** the element node carries `owningFile` and a `range` derived from the Main-players bullet

### Absent or empty insight data is an honest empty result, never an error

- **Given** a project with no `.cortex/insight/` directory at all
- **When** `GET /api/constellation?preset=insight`
- **Then** the response is `200` with empty `groups`/`nodes`/`edges` and an `emptyHint` naming `cortex-extract-insight`

### The insight preset never depends on constellation.json

- **Given** a project with `.cortex/insight/` populated but **no** `.cortex/constellation.json`
- **When** `GET /api/constellation?preset=insight`
- **Then** the response is `200` and composed normally — not the curated preset's `404`

### Curated presets are unaffected

- **Given** a project with both a compiled `constellation.json` and populated `.cortex/insight/`
- **When** `GET /api/constellation?preset=default` (or `orphans`/`domain`) runs
- **Then** the response is byte-identical to what it would be without any insight data present, and no request for any preset — including `insight` — writes to disk

### Deterministic responses

- **Given** unchanged insight files
- **When** `GET /api/constellation?preset=insight` runs twice
- **Then** the two response bodies are byte-identical

## Notes

- **Composition route (both the base graph and the per-node detail data) is a single server-side function, `composeInsightPreset(root)` in `src/constellation/server.ts`**, invoked directly by `handleApi` — no separate HTTP endpoint, no client-side second fetch for Purpose/concept-excerpt/element-range data. It is composed inline into the same `/api/constellation?preset=insight` response the client already fetches, reusing `insight/query.ts`'s existing `locateInsight`/`loadUnifiedGraph`/`fileQuery`/`conceptQuery`/`mainPlayers` (the same engine `cortex insight file|concept|element` uses) rather than re-implementing scoped/unscoped resolution or section parsing. This was the natural choice: the query engine already solves "read an entry, resolve scoped vs. flat, parse `## Purpose`/`## Main players`" byte-for-byte identically to the CLI, and duplicating it would risk drift.
- **Engineering calls made under standing authority (recorded here, not asked):**
  - **Kind-dot palette:** `file` `#6ea8f5`, `element` `#f2b45e`, `concept` `#a892f7` — reusing the existing specs/compass/atlas hue family for visual continuity with the curated presets' colour language.
  - **Cluster-star palette:** a fixed 12-colour qualitative palette, id hashed (`sum(charCode) * 31 mod length`) to a slot — simple, deterministic, no new dependency, "good enough" for 10-15 clusters; not intended to guarantee zero adjacent-hue collisions.
  - **Confidence → opacity/width/dash:** `structural` 0.85 / 1.6px / `[6,3]`; `stated` 0.62 / 1.3px / `[5,4]`; `inferred` 0.40 / 1.0px / `[4,5]`; `ambiguous` 0.22 / 0.8px / `[3,6]` (unrecognized tier falls back to `ambiguous`'s style — fail-quiet on a rendering detail). These are visual defaults, not a schema-level contract; free to retune without a spec change.
  - **Edge hover hit-test threshold:** 8 screen px (nearest-segment distance), matching the existing node/group pick generosity (`+8`/`+10` in `pickNode`/`pickGroup`).
  - **Clusters counter excludes the synthetic catch-all:** `counters.clusters` reports declared clusters only (`clusters.json.clusters.length`), not `cluster:uncategorized` — the stat line answers "how many real clusters did extraction find," not "how many groups does the client render."
  - **Malformed `clusters.json` degrades to "no clusters"** (every node falls to `cluster:uncategorized`) rather than failing the whole preset — consistent with the module's general tolerance discipline; a malformed `graph.json` (or a `scope-registry.yaml` parse failure) still propagates as the query engine's `InsightArtefactError`, since a broken graph has nothing sensible to fall back to.
- This resolves design §11 Q2 ("not central; defer") — see `cortex-v3-design.md` §11, and the schema §4.9 clause it superseded, now updated to record this decision (no more "open question").
- The old `constellation.insight-preset` spec (v2 lineage: a curated+overlay JOIN design) is retained as a superseded lineage record only — its banner now points here instead of describing this preset as "stays deferred."
- Visual behaviour (exact glow/twinkle choreography, colour tuning) is deliberately unpinned at this layer — journey tier, deferred to v1.1, the same convention `constellation.renderer` already established.
