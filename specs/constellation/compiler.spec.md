---
id: constellation.compiler
status: implemented
depends_on:
  - schema.validator
  - anatomy.scanner
implements: ../../specs-business/constellation/stakeholder-sees-the-project-understood.business.md
governed_by:
  - R-001
governs:
  - "src/constellation/compile.ts"
---

# Constellation Compiler

## Intent

The constellation compiler turns everything Cortex knows about a project into one connected, renderable graph: it reads the four knowledge surfaces (anatomy, cerebrum, atlas, the two spec trees), builds nodes and citation-graph edges per schema §4.9, groups them into the Level-1 constellations (design §12.3), and emits `.cortex/constellation.json` deterministically. It is pure Core — the renderer (a separate spec) only draws what this compiler emits (design §12.8: "Browser does no graph computation — only rendering. All compilation in Core.").

## Entities

- **READS:** `.cortex/anatomy/files.md` + `layers.md` (anatomy nodes, sizes, layer grouping, `spec_links`); `.cortex/cerebrum/rules/R-*.md`, `bugs/B-*.md`, and the four core files (cerebrum nodes + `source`/`governs`/`related_specs` edges); `.cortex/atlas/**` leaf artefacts (atlas nodes + `cerebrum_rules`/`supersedes`/`sources`/`related_specs` edges); `specs/**/*.spec.md` and `specs-business/**/*.business.md` (spec nodes + `implements`/`depends_on`/`governed_by` edges); `tests/scenario/specs/*.md` (`covers` edges); `.cortex/cortex.config.json` (schema version).
- **WRITES:** `.cortex/constellation.json` — nothing else, ever.
- **CREATES:** the constellation artefact per schema §4.9. The schema owns its shape; this spec does not redefine fields.

## Rules

1. **Pure Core.** Deterministic, offline, no LLM, no network, no subprocess (design §3.1; RULES.md rule 3; governed by R-001). Read-only over every input surface — the compiler never mutates what it reads.
2. **Output per schema §4.9, exactly.** Top-level keys `schemaVersion` (from `cortex.config.json`), `generated`, `groups`, `nodes`, `edges`, `counters`. Emitted output MUST pass `check.constellation` with zero errors.
3. **Nodes.** One node per artefact across the four surfaces, with module-prefixed unique ids per §4.9 (`anatomy:<relpath>`, `rule:R-NNN`, `bug:B-NNN`, `cerebrum:<file>`, `atlas:<artefact-id>`, `spec:<id>`, `business:<id>`). Anatomy nodes carry `size` = the `tokens` estimate from `files.md`. `_index.md` and `_overview.md` files are scaffolding, not knowledge — they do not become nodes.
4. **Groups (Level 1, design §12.3).** Exactly four top groups — `anatomy`, `cerebrum`, `atlas`, `specs` — each with children by natural grouping: anatomy by architectural layer (`layers.md`; files absent from `layers.md` fall into an `(unassigned)` child), cerebrum by category (`rules`, `bugs`, core files), atlas by subfolder, specs by domain folder (dev and business nodes share the domain child; `module` distinguishes them). Every node's `group` resolves to a declared child.
5. **Edges from the citation graph only (§6 table).** `kind` names the producing frontmatter field. The symmetric `implements`/`implemented_by` pair dedupes to a single `implements` edge (dev → business). `governs` globs expand to one edge per matched anatomy node. `spec_links` cells produce file → spec edges. **`graph.json` import edges are excluded** — the constellation is the citation graph, not raw code structure (design §12.7).
6. **Dangling refs are dropped and counted.** A reference whose target is not an emitted node produces no edge and increments `counters.droppedRefs`. The compiler never fails on a broken reference and never emits an edge with an unresolvable endpoint — complaining is `schema.validator`'s job.
7. **Determinism.** Groups, nodes, and edges are emitted in stable sorted order; two compilations of identical input are byte-identical except `generated`.
8. **Honest coverage.** Orphan nodes (no edges) are emitted like any other node — gaps are information (design §12.6). `counters` carries per-module node counts plus `edges` and `droppedRefs`.
9. **Invocation.** Exposed as a library function `compile(root)`; `cortex scan` invokes it after anatomy emission (design §12.8 step 1), so the constellation refreshes whenever anatomy does. Missing surfaces are tolerated: a project with no atlas entries or no spec trees compiles to a graph with empty groups, not an error.

## Acceptance Criteria

### Emitted artefact passes the schema check

- **Given** an initialised, scanned project with specs, rules, and bugs
- **When** the compiler runs
- **Then** `.cortex/constellation.json` exists and `check.constellation` reports zero errors

### Four top groups with natural children

- **Given** a project whose `layers.md` names layers `src/schema` and `src/cli`, with one rule and one dev-spec domain `schema`
- **When** the compiler runs
- **Then** `groups` has exactly the four top ids `anatomy`, `cerebrum`, `atlas`, `specs`
- **And** `anatomy` has children for `src/schema` and `src/cli`, `cerebrum` has a `rules` child, and `specs` has a `schema` child

### Anatomy nodes carry token sizes and layer groups

- **Given** a `files.md` row for `src/a.ts` with `tokens` 120 assigned to layer `src`
- **When** the compiler runs
- **Then** node `anatomy:src/a.ts` has `size: 120` and `group` naming the `src` layer child

### implements dedupes to a single edge

- **Given** dev spec `schema.validator` whose `implements:` names a business spec whose `implemented_by:` lists it back
- **When** the compiler runs
- **Then** exactly one edge `{from: "spec:schema.validator", to: "business:<id>", kind: "implements"}` exists between the pair

### governs globs expand to per-file edges

- **Given** rule `R-001` with `governs: ["src/schema/**/*.ts"]` and two anatomy nodes under `src/schema/`
- **When** the compiler runs
- **Then** there are two edges `kind: "governs"` from `rule:R-001` to those anatomy nodes

### spec_links produce file→spec edges

- **Given** a `files.md` row for `src/schema/validate.ts` with `spec_links` `schema.validator`
- **When** the compiler runs
- **Then** an edge `{from: "anatomy:src/schema/validate.ts", to: "spec:schema.validator", kind: "spec_links"}` exists

### Dangling refs dropped and counted, never emitted

- **Given** a rule whose `source:` names a deleted file
- **When** the compiler runs
- **Then** no edge with an unresolvable endpoint exists
- **And** `counters.droppedRefs` is at least 1

### Import edges are excluded

- **Given** a `graph.json` with three import edges
- **When** the compiler runs
- **Then** no edge in `constellation.json` has kind `import` or `export`

### Deterministic modulo timestamp

- **Given** any project
- **When** the compiler runs twice without input changes
- **Then** the two outputs are byte-identical after removing the `generated` line

### Empty surfaces compile, orphans survive

- **Given** a fresh `.cortex/` with anatomy but no atlas entries, no rules, and no spec trees
- **When** the compiler runs
- **Then** it succeeds; `atlas` and `specs` groups are present with no children or nodes
- **And** anatomy nodes with zero edges are still emitted

## Notes

- **Decision:** import/export edges from `graph.json` are excluded (design §12.7 wins over a loose reading of §12.2) — the constellation shows the citation graph; a dependency browser is a different tool.
- **Decision:** `_index.md`/`_overview.md` files become neither nodes nor edges — they are scaffolding *about* the knowledge, not knowledge.
- **Decision (ripple, enumerated per RULES.md rule 19):** `.cortex/constellation.json` joins the gitignored set (schema Decision 1, §1; `core-cli.init` Rule 2 + gitignore AC amended in the same change). The init implementation gains the fourth gitignore line in this spec's implementation round.
- The renderer (design §12.8 steps 2-4, §16.2 step 7) is a separate spec — first UI surface in the project; its ACs will need a depth decision (compiler-contract assertions vs visual behaviour).
- Also supports: `core-cli` (`cortex scan` invokes the compiler). Primary parent remains `constellation.stakeholder-sees-the-project-understood`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
