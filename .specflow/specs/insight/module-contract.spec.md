---
id: insight.module-contract
status: implemented
depends_on:
  - schema.version-2
implements: ../../specs-business/insight/assistant-has-project-knowledge-when-working.business.md
governed_by:
  - R-001
governs:
  - "src/insight/scaffold.ts"
---

# Insight Module Contract — formats and scaffolding

> **SUPERSEDED at v3 (design §8.3; build-order-v3 steps 5b and 7).** The v2
> `map/` layout and its three JSON contracts are replaced wholesale by the v3
> storage contract, spec `insight.storage-format` (this domain; schema §4.10 — per-file entries, ledger, reverse index,
> the new graph/tags/clusters shapes, owned by `src/insight/storage.ts` /
> `entry.ts`). The legacy formats module (`src/insight/formats.ts`) was kept
> only for the v2 constellation overlay and is deleted with it at step 7 (the
> step-10 disposition), so its `governs:` glob is removed; `scaffold.ts`
> survives, rebuilt for the v3 layout. Retained for lineage.

## Intent

This spec defines the `.cortex/insight/` module skeleton and its file formats (schema §4.10, §7.4, §1) and makes `cortex init` scaffold it — committed, not gitignored. Insight is the ungated, queryable knowledge layer: two content types live side by side in a flat `map/` directory, distinguished by extension (`.md` prose, `.json` inferred map), under a single active-prompt `_index.md` that states the ungated trust model. This spec owns the *shapes* — the prose contract, the three JSON contracts, the config block, the init scaffolding — that the CLI (`insight.cli`), the loops (`insight.refresh-loop`, `insight.gaps-loop`), and the validator checks (`schema.validator-insight-checks`) all build against. Deterministic Core (R-001); the formats carry no enforcement authority and no hook ever injects them (schema §4.10, §5).

## Entities

- **READS:** `cortex.config.json` (`insight` block); the module layout schema §1.
- **WRITES:** the scaffolded module on `cortex init` — `insight/_index.md` and the empty flat `insight/map/` directory; the `insight` block into the config template.
- **CREATES:** `.cortex/insight/` (committed), `.cortex/insight/_index.md` (§7.4 active prompt), `.cortex/insight/map/` (flat, carrying NO `_index.md` of its own, §4.10.3). Prose and JSON files are created later by their producer loops, not by init.

## Rules

1. **Module layout (schema §1, §4.10).** `insight/` holds `_index.md` plus the flat `map/` directory. `map/` holds prose `.md` files (`<topic>.md`) and exactly three inferred `.json` files (`graph.json`, `tags.json`, `clusters.json`) side by side; it carries no nested `_index.md` (the module index one level up fully describes it, §4.10.3). The whole module is committed, not gitignored — the fourth git-policy quadrant, machine-owned *and* committed (schema Decision 1 amendment).
2. **`_index.md` trust-model prompt (schema §7.4).** `insight/_index.md` follows the §7.1 active-prompt shape (`Read this when:` / `What's here:` / `How to navigate:`, <300 tokens) with one module-specific requirement: it MUST name insight as **ungated/unreviewed** and point at `cortex insight` as the query surface — this is where Claude learns *how much to trust* what it finds.
3. **Prose file contract (schema §4.10.1).** `insight/map/<topic>.md` frontmatter — required: `kind: insight-prose`, `updated` (iso-datetime); optional: `topic`, `related_specs`. Body: free markdown under H2 headings; loop-appended entries carry a one-line provenance trailer `_(observed <iso-date>, signal <n>, sessions: <id>, <id>)_`; a file MAY end with a single `## Corrections` log as its last H2. Frontmatter is deliberately lean — correction history lives in the body, not the frontmatter (schema Decision 16).
4. **The three JSON contracts (schema §4.10.2).** `graph.json` (`schemaVersion`, `generated`, `rebuild`, `nodes`, `edges` with `kind` in the closed enum `semantically-related|same-cluster|mentions-same-entity`, `confidence` in `high|medium|low`, non-empty `rationale`); `tags.json` (`schemaVersion`, `generated`, `tags` map of node-id → label list); `clusters.json` (`schemaVersion`, `generated`, `clusters` with `cluster:<label-slug>` ids). Node ids reuse the constellation node-id grammar (§4.9). This spec defines the shapes; the refresh loop is their sole writer.
5. **Config block (schema §10.1).** The `cortex.config.json` `insight` block carries `clusterCarryOverJaccard` (default 0.5), `promotionMinAgeDays` (default 14), `promotionMinObservations` (default 2) — all optional with those defaults. `cortex init` writes the block explicitly so the config self-documents.
6. **Init scaffolds committed.** `cortex init` creates `insight/` + `insight/_index.md` and does **not** add `insight/` to `.gitignore` (the gitignored set is unchanged — schema Decision 1). `map/` is created empty; no prose or JSON files are seeded.
7. **Deterministic Core** (R-001): scaffolding and format definitions are pure file I/O — no LLM.

## Acceptance Criteria

### Init scaffolds the module committed

- **Given** a fresh project
- **When** `cortex init` runs
- **Then** `.cortex/insight/_index.md` and `.cortex/insight/map/` exist, `map/` is empty and carries no `_index.md`
- **And** `.gitignore` does not list `.cortex/insight/` (it is committed)

### The index states the ungated trust model

- **Given** the scaffolded `insight/_index.md`
- **When** it is inspected
- **Then** it carries the `Read this when:` and `What's here:` headings, names insight as ungated/unreviewed, and references `cortex insight` as the query surface

### The config carries the insight block with defaults

- **Given** the emitted config template
- **When** it is read
- **Then** the `insight` block is present with `clusterCarryOverJaccard: 0.5`, `promotionMinAgeDays: 14`, `promotionMinObservations: 2`

### A well-formed prose file matches the contract

- **Given** a hand-authored `map/setup.md` with frontmatter `kind: insight-prose` + `updated: 2026-07-05T10:00:00Z`, one H2 section, and a `## Corrections` log
- **When** it is checked against the §4.10.1 contract
- **Then** it conforms — lean frontmatter, a single trailing `## Corrections` heading, provenance trailer present on the loop-appended entry

### A well-formed JSON trio matches the contract

- **Given** hand-authored `map/graph.json`, `map/tags.json`, `map/clusters.json` with `schemaVersion: "2.0"`, one node `spec:insight.cli`, one edge `{ from, to, kind: "semantically-related", confidence: "high", rationale: "both define the insight query surface" }`, one tag set, and one cluster `cluster:insight-layer`
- **When** they are checked against the §4.10.2 contract
- **Then** all three conform — closed `kind` enum, `high|medium|low` confidence, non-empty rationale, `cluster:<slug>` id form

### map/ tolerates only the two content types

- **Given** the module contract
- **When** the permitted `map/` contents are enumerated
- **Then** only `<topic>.md` prose and the three named `.json` files are permitted, and `map/` carries no `_index.md` (enforced by `schema.validator-insight-checks`' `check.insight-ownership`)

## Notes

- This spec defines formats; it asserts them structurally. Until `schema.validator-insight-checks` (step 3) lands, conformance is verified by structural inspection and by `cortex insight list` (`insight.cli`) enumerating the scaffolded module.
- The prose/JSON *ownership* split (prose = gaps loop + humans; JSON = refresh loop only) is the load-bearing coordination rule (schema §4.10.3); this spec defines the files, the loop specs own the write lanes, and the validator enforces the extension discipline.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
