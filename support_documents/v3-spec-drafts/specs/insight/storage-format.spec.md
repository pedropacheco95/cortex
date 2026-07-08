---
id: insight.storage-format
status: draft
depends_on: []
implements: ../../specs-business/insight/assistant-understands-codebase.business.md
governed_by:
  - R-001
governs:
  - "src/insight/formats.ts"
  - "src/insight/scaffold.ts"
---

# Insight Storage Format — v3 layout, per-file entries, and the JSON graph

## Intent

This spec fixes the on-disk shape of `.cortex/insight/` for v3 — implements addendum §A4 (superseding schema §4.10 and all of §4.10.1–§4.10.5 wholesale). Insight moves from a concept-map over curated artefacts to a leveled, scoped, per-file understanding of the *source code itself* (design §5.8, §8.3). This spec owns the shapes only: the scoped vs. flat directory layouts, the per-file understanding entry (frontmatter + section contract), `scope-registry.yaml`, the staleness ledger, the reverse-dependency index, and the three JSON graph files (`graph.json`, `tags.json`, `clusters.json`). It does not own the query verbs (`insight.cli`), the extraction behaviour that populates these shapes (`insight.extract-skill`), or the refresh cadence that keeps them current (`insight.refresh-loops`) — those specs build against this one. Deterministic Core (R-001): the formats carry no enforcement authority, no hook injects them, and validating a hand-authored fixture against these shapes requires no LLM.

## Entities

- **READS:** nothing at runtime — this spec is the contract other specs and the validator build against. The presence or absence of `scope-registry.yaml` at the module root is the sole signal `insight.cli` uses to resolve the scoped-vs-flat layout difference (§A4.1) without depending on this spec at read time.
- **WRITES:** `cortex init` scaffolds the module skeleton against this contract (carried from the v2 `insight.module-contract` scaffolding role): `.cortex/insight/_index.md` and an empty `.cortex/insight/anatomy/` (unscoped default; `scopes/` and `scope-registry.yaml` are added by `insight.extract-skill` only when it decides to scope). The module is committed, not gitignored (schema Decision 1's fourth quadrant, carried by addendum §A4.0).
- **CREATES:** the format definitions this spec asserts structurally: the two directory layouts (§A4.1), the per-file entry contract (§A4.2), `scope-registry.yaml` (§A4.3), `ledger.json` (§A4.4), `reverse-index.json` (§A4.5), and `graph.json`/`tags.json`/`clusters.json` (§A4.6). `insight.extract-skill` is the sole writer of extracted content into these shapes; `insight.refresh-loops` is the sole writer of updates to them.

## Rules

1. **Two layouts, chosen by scoping (addendum §A4.1).** Scoped extraction (large codebases) nests per-file entries and a scope-local `graph.json` under `scopes/<scope>/{anatomy,concepts,graph.json}`, alongside module-root `scope-registry.yaml`, `ledger.json`, `reverse-index.json`, and cross-scope `anatomy/`, `concepts/`, `graph.json`, `tags.json`, `clusters.json`. Unscoped extraction (small codebases) drops `scope-registry.yaml` and `scopes/`; every per-file entry lives under top-level `anatomy/`, path-mirroring the source (e.g. `anatomy/src/auth/session.ts.md`). The `anatomy/` name is deliberately carried over from v1's `.cortex/anatomy/` (design §5.10) — same role, now nested inside insight.
2. **The per-file understanding entry (addendum §A4.2).** One entry per source file, path-mirrored under `anatomy/` (or `scopes/<scope>/anatomy/`). Required frontmatter: `path`, `extracted_at` (iso-datetime), `extraction_level` (`2` or `3`), `size_lines` (int), `size_tokens` (int), `centrality` (`high|medium|low`), `built_at_commit` (string), `source_sha256` (64-hex, hash of the source file *body*, never the entry frontmatter). An L3 entry carries at minimum `## Purpose`, `## Main players`, `## Connections`; `## Insights` and `## File map` (files above ~500 lines) round it out. An L2 (lighter) entry carries only `## Purpose` and `## Connections`, with `extraction_level: 2`.
3. **`scope-registry.yaml` (addendum §A4.3).** Present only for scoped extractions. `schemaVersion: "3.0"`, `built_at_commit`, and a `scopes` map keyed by scope id, each with a required `path` (resolving to a project-relative directory) and a required (possibly empty) `depends_on` list of scope ids, plus an optional `shared_by` list. A scope with non-empty `shared_by` is extracted once and referenced from every parent (dedup, design §5.4). `depends_on` must be acyclic; `shared_by` should be the inverse of `depends_on` (asymmetry is tolerated as a warning, not an error).
4. **The staleness ledger — `ledger.json` (addendum §A4.4).** Module-level ledger complementing the per-entry `built_at_commit`/`source_sha256`: `schemaVersion: "3.0"`, a module-wide `built_at_commit`, and an `entries` map keyed by source path, each value carrying `source_sha256` (64-hex), `built_at_commit`, and `extraction_level` (`2|3`). This is what lets the fast post-commit tier compare a changed file's current body hash against the ledger without invoking an LLM (design §5.9's "code-only-skips-LLM").
5. **The reverse-dependency index — `reverse-index.json` (addendum §A4.5).** `schemaVersion: "3.0"`, `built_at_commit`, and a `referenced_by` map keyed by entity node id (§A4.6 grammar) to the list of concept-file ids and/or edge ids that cite that entity. This is what lets a file change invalidate every concept/edge referencing an entity it defines, not just its own entry (design §5.9's DIFFERENTLY-verdict reverse-index requirement).
6. **The JSON graph shapes — `graph.json`, `tags.json`, `clusters.json` (addendum §A4.6).** Node ids use the path-derived grammar `file:<project-relpath>`, `element:<project-relpath>#<name>`, `concept:<slug>` — deliberately not the v2 constellation-borrowed grammar, because v3 nodes are source-code entities, not curated artefacts. `graph.json` nodes carry `id`/`kind` (`file|element|concept`)/`label`; edges carry a stable `id`, `source`, `target`, `edge_type` (closed enum `imports|calls|semantically-similar-to|implements-concept|co-clustered`), `confidence` (closed 4-tier enum `structural|stated|inferred|ambiguous` — a discrete tier tied to a named evidence type, never a float), a non-empty `evidence` string (explainability is a module invariant — an empty `evidence` is an error, not a warning), and `confirmed_at_commit` (confidence-aging support). `tags.json` carries a typed `vocabulary` (`tag`, `kind` in `concern|technology|pattern|layer|domain-term`, optional `aliases`) and `assignments` referencing only vocabulary tags. `clusters.json` carries `clusters` with id form `cluster:<slug>`, `members`, non-empty `rationale`, and `scope` (a declared scope id or `global`). **No embeddings anywhere in this layer** (design §1.3) — similarity is expressed only as a `semantically-similar-to` edge with a rationale, never a vector.
7. **Determinism and the crashed-refresh guard (addendum §A4.6).** Serialization is total-ordered (nodes, edges, tags, clusters) so only `generated`/`built_at_commit` vary run-to-run and diffs are meaningful, not permutation noise. A write to any of the three JSON files that would shrink node or edge counts versus the existing file is refused unless the caller passes `--force`.
8. **Dual-authority validation (markdown + JSON).** Both the markdown per-file entries and the JSON graph files are authoritative for their own content — a validator checks each independently against this contract (no single file is a "cache" of the other): `check.insight-entry` for per-file entries, `check.insight-scope-registry` for the registry, `check.insight-ledger` for both ledger and reverse-index (same check governs both), and `check.insight-graph` for the JSON trio. Each check is tolerant of an absent `insight/` module (build-order-v3 §10 spine convention) so `cortex validate` passes on a project that hasn't run extraction yet.
9. **Deterministic Core** (R-001): every shape and every check in this spec is pure file I/O and structural validation — no LLM.

## Acceptance Criteria

### Scoped layout separates per-scope and cross-scope content

- **Given** a project whose extraction plan produced two root scopes (`auth`, `billing`) sharing one sub-scope (`notifications`)
- **When** the scoped layout is materialized
- **Then** `scope-registry.yaml` exists at the module root, `scopes/auth/`, `scopes/billing/`, and `scopes/notifications/` each carry their own `anatomy/`, `concepts/`, and `graph.json`, and module-root `graph.json`/`tags.json`/`clusters.json` hold only cross-scope content
- **And** `notifications/` appears once under `scopes/`, referenced from both `auth`'s and `billing`'s `depends_on`, not duplicated

### Flat layout omits scope machinery

- **Given** a small project whose extraction plan did not scope
- **When** the flat layout is materialized
- **Then** `scope-registry.yaml` and `scopes/` are absent, and every per-file entry lives under top-level `anatomy/` at a path mirroring its source (e.g. `anatomy/src/auth/session.ts.md` for `src/auth/session.ts`)

### A well-formed L3 per-file entry matches the contract

- **Given** a hand-authored entry for `src/auth/session.ts` with frontmatter `path: src/auth/session.ts`, `extracted_at: 2026-07-07T14:00:00Z`, `extraction_level: 3`, `size_lines: 620`, `size_tokens: 5400`, `centrality: high`, `built_at_commit: 9f2c1ab`, `source_sha256: <64 hex chars>`, and sections `## Purpose`, `## Main players`, `## Insights`, `## Connections`, `## Query pointers`
- **When** it is checked against `check.insight-entry`
- **Then** it conforms — required frontmatter present and typed, `extraction_level` in `{2,3}`, `centrality` in enum, `source_sha256` exactly 64 hex characters, and the L3-minimum sections (`Purpose`, `Main players`, `Connections`) are present

### An L2 entry omits Main players and Insights without failing

- **Given** a hand-authored entry with `extraction_level: 2` carrying only `## Purpose` and `## Connections`
- **When** it is checked against `check.insight-entry`
- **Then** it conforms — an L2 entry is not required to carry `## Main players`, `## Insights`, or `## File map`

### `scope-registry.yaml` validates dependency shape

- **Given** a `scope-registry.yaml` with `schemaVersion: "3.0"`, `built_at_commit: 9f2c1ab`, and scopes `auth` (`path: src/auth`, `depends_on: [notifications]`), `notifications` (`path: src/shared/notifications`, `depends_on: []`, `shared_by: [auth]`)
- **When** it is checked against `check.insight-scope-registry`
- **Then** it conforms — every `path` resolves to a real directory, every `depends_on`/`shared_by` id is a declared scope, `depends_on` has no cycle, and `shared_by` correctly inverts `depends_on`

### `scope-registry.yaml` flags a cycle as an error

- **Given** a `scope-registry.yaml` where scope `a` has `depends_on: [b]` and scope `b` has `depends_on: [a]`
- **When** it is checked against `check.insight-scope-registry`
- **Then** the check reports an error for the dependency cycle

### The staleness ledger matches the contract and drives a code-only skip

- **Given** a `ledger.json` with `schemaVersion: "3.0"`, `built_at_commit: 9f2c1ab`, and one entry `"src/auth/session.ts": { source_sha256: <64hex>, built_at_commit: 9f2c1ab, extraction_level: 3 }`
- **When** `src/auth/session.ts` is re-hashed after a commit and the new body hash equals `entries["src/auth/session.ts"].source_sha256`
- **Then** the file is correctly identified as unchanged at the content level, requiring no re-extraction — the comparison completes with no LLM invocation

### The reverse-dependency index resolves a changed file to its referencing concepts

- **Given** a `reverse-index.json` with `referenced_by: { "element:src/auth/session.ts#validateToken": ["concept:authentication", "edge:auth-billing-01"] }`
- **When** `src/auth/session.ts` changes and the index is queried for entities it defines
- **Then** both `concept:authentication` and `edge:auth-billing-01` are returned as needing re-verification, not just the file's own entry

### A well-formed JSON trio matches the contract

- **Given** hand-authored `graph.json` with one node `{ id: "file:src/auth/session.ts", kind: "file", label: "session.ts" }` and one edge `{ id: "edge:1", source: "file:src/auth/session.ts", target: "concept:authentication", edge_type: "implements-concept", confidence: "stated", evidence: "session.ts explicitly implements the token-issuance half of authentication", confirmed_at_commit: "9f2c1ab" }`; `tags.json` with vocabulary entry `{ tag: "authentication", kind: "concern" }` and assignment `{ "file:src/auth/session.ts": ["authentication"] }`; `clusters.json` with `{ id: "cluster:auth-core", label: "Auth core", members: ["file:src/auth/session.ts"], rationale: "co-located auth primitives", scope: "global" }`
- **When** all three are checked against `check.insight-graph`
- **Then** all three conform — node ids well-formed under the path-derived grammar, `edge_type` and `confidence` each in their closed enums, `evidence` non-empty, tag assignments resolve to declared vocabulary, and the cluster id matches `cluster:<slug>` with non-empty `rationale`

### An edge with empty evidence is an error

- **Given** a `graph.json` edge identical to the one above but with `evidence: ""`
- **When** it is checked against `check.insight-graph`
- **Then** the check reports an error (not a warning) — non-empty evidence is a module invariant, not an advisory

### A malformed `edge_type` or `confidence` value is rejected

- **Given** a `graph.json` edge with `edge_type: "related-to"` (not in the closed enum) or `confidence: 0.85` (a float, not a tier)
- **When** it is checked against `check.insight-graph`
- **Then** the check reports an error for each — the enums are closed and confidence is never a continuous value

### No embedding vectors are a permitted field anywhere in the JSON trio

- **Given** the `graph.json`, `tags.json`, `clusters.json` contracts as defined
- **When** the permitted field sets are enumerated
- **Then** no field for a vector, embedding, or similarity score appears anywhere — the only sanctioned expression of similarity is a `semantically-similar-to` edge carrying a rationale string

### A write that would shrink the graph is refused without `--force`

- **Given** an existing `graph.json` with 40 nodes and 60 edges
- **When** a refresh write attempts to persist a new `graph.json` with 12 nodes and 15 edges without passing `--force`
- **Then** the write is refused
- **And** the same write with `--force` passed succeeds

### Markdown and JSON are validated independently as dual authorities

- **Given** a per-file markdown entry for `src/auth/session.ts` and a `graph.json` node `file:src/auth/session.ts` that disagree on nothing structural but are checked separately
- **When** `cortex validate` runs
- **Then** `check.insight-entry` validates the markdown entry on its own terms and `check.insight-graph` validates the JSON node on its own terms — neither check treats the other file as a source of truth it defers to, and a malformed markdown entry does not suppress a JSON validation failure or vice versa

### An absent insight module does not fail validation

- **Given** a project that has never run `cortex-extract-insight`, with no `.cortex/insight/` directory at all
- **When** `cortex validate` runs
- **Then** none of `check.insight-entry`, `check.insight-scope-registry`, `check.insight-ledger`, `check.insight-graph` report a failure — each tolerates an absent module

## Notes

- This spec defines shapes only; `insight.extract-skill` is the sole writer of initial content into them, `insight.refresh-loops` is the sole writer of updates, and `insight.cli` is the sole reader at query time. Enforcing that write/read separation is out of scope here — it is a coordination convention the other three specs honor, not a rule this spec's validator checks can mechanically catch.
- The `_index.md` active prompt (addendum §A4.7) and the CLAUDE.md insight block (addendum §A4.8) are both locked template text tied to this module. build-order-v3 step 5b attributes `_index.md` to this spec's scaffolding role; I was unsure whether the CLAUDE.md block (§A4.8) belongs here or to the module-rename/migration spec that re-roots the rest of the managed CLAUDE.md block — I have treated only the scaffolding of `_index.md` as in-scope and left the CLAUDE.md managed-block text to whichever migration spec owns re-rooting it, to avoid double-owning that template text across two draft specs.
- Cluster-id stability across rebuilds (v2's Jaccard carry-over) and the exact cluster-representation nuances beyond the field-level shape fixed here are explicitly addendum-deferred to this spec (design §10.3, §11 Q1); this draft fixes only the shape in Rule 6/Criterion "A well-formed JSON trio matches the contract" and defers the carry-over algorithm itself as an open item for the implementation pass.
- Journey-layer tests are deferred pending the test-runner loop, per the project-wide convention established for the v2 insight specs.
