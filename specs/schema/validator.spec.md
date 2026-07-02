---
id: schema.validator
status: implemented
depends_on: []
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governs:
  - "src/schema/**/*.ts"
---

# Schema Validator

## Intent

The schema validator is the executable embodiment of `cortex-schema.md`. It verifies that an artefact tree (`.cortex/`, `specs/`, `specs-business/`, `tests/`) conforms to the schema contract — directory layout, frontmatter, traceability links, cross-references, test-layer conventions, and schema version — so that Cortex Core and the Skills never silently drift from the contract and malformed artefacts are caught before they propagate. It is the load-bearing check that lets every other piece of the system trust the shape of the knowledge underneath it (design §3.2, §16.2 step 1).

## Entities

The validator operates on files, not database records. It reads artefacts and produces an in-memory result; it persists nothing.

- **READS:** the schema contract (`cortex-schema.md`); every artefact in the target tree — anatomy files, cerebrum artefacts (`preferences`, `environment`, `decisions`, `rules/`, `bugs/`), atlas artefacts, developer specs, business specs, scenario test specs, and the `_index.md` / `_overview.md` files in both spec trees.
- **WRITES:** nothing — the validator is read-only with respect to the tree it inspects.
- **CREATES:** `ValidationReport` — a structured result listing every violation with its severity, file location, the contract clause it breaks, and a human-readable message. Its serialized format is defined by `cortex-schema.md` §6.1 (`--json` emits it verbatim; the terminal rendering is a human-readable table; non-conformant → CLI exit `1`).

## Rules

1. The validator is deterministic and makes **no** LLM calls — it is a Cortex Core component (design §3.1; RULES.md rule 3).
2. Validation is read-only: the validator never mutates, moves, or creates files in the tree it inspects.
3. The validator declares a supported schema MAJOR.MINOR and reads the project's version from `.cortex/cortex.config.json` (`schemaVersion`) — the version is project-level, not per-artefact (`cortex-schema.md` §10.1, §10.3). On a MAJOR mismatch it reports a version-mismatch error and refuses to validate further against the wrong contract rather than guessing; a higher MINOR is tolerated forward with a warning.
4. Every violation carries four fields: `severity` (`error` | `warning`), `location` (file path, plus line or frontmatter key where applicable), the `clause` of the contract it breaks, and a plain-language `message`.
5. The validator covers each facet the schema defines (design §3.2): (a) directory layout; (b) frontmatter presence and per-artefact-type field schema; (c) traceability — `implements:` single-valued, `implemented_by:` a list, `covers:` present on scenario specs; (d) cross-reference resolution across the citation graph; (e) test-layer conventions; (f) schema-version validity.
6. `implements:` must carry exactly one value. Zero values on a leaf spec, or more than one, is an `error` (multiple values signal a spec-decomposition problem — design §8.1).
7. Traceability links must be bidirectionally symmetric: if dev spec X's `implements:` names business spec Y, then Y's `implemented_by:` must include X, and every entry of `implemented_by:` must point back. Any asymmetry is an `error`.
8. Every path referenced in frontmatter (`implements:`, `implemented_by:`, `covers:`, `depends_on:` targets, and cross-reference fields such as `source:`, `governs:`, `related_specs:`) must resolve to an existing artefact. An unresolved reference is an `error`.
9. A directory that the schema requires to carry an `_index.md` (under `.cortex/`) or an `_overview.md` (in either spec tree) but does not is a violation.
10. The validator can be scoped to the whole project, a single tree (e.g. `specs/` only), a subtree, or a single file. When scoped, cross-reference resolution still resolves against the full project so links into out-of-scope files are not falsely reported as broken.
11. Conformance verdict: a target is **non-conformant** if it has any `error`-severity violation, and **conformant** (optionally with warnings) otherwise. When invoked via the CLI, a non-conformant result exits non-zero.

## Acceptance Criteria

### A conformant tree passes

- **Given** a `specs/` tree where every leaf spec has a single resolving `implements:`, every business spec's `implemented_by:` is symmetric, and every directory has its required `_overview.md`
- **When** the validator runs over `specs/`
- **Then** it returns a `ValidationReport` with zero `error`-severity violations
- **And** the CLI invocation exits `0`

### A leaf spec with two `implements:` values is rejected

- **Given** a leaf spec `specs/schema/validator.spec.md` whose `implements:` frontmatter lists two business-spec paths
- **When** the validator runs
- **Then** the report contains one `error` at that file's `implements:` key citing the single-value rule
- **And** the message states that `implements:` must name exactly one business spec

### A broken traceability path is caught

- **Given** a leaf spec whose `implements:` points to `../../specs-business/schema/does-not-exist.business.md`
- **When** the validator runs
- **Then** the report contains one `error` at that file citing unresolved cross-reference
- **And** the message names the missing target path

### Asymmetric links are caught on both sides

- **Given** dev spec `specs/schema/validator.spec.md` whose `implements:` names business spec `contributor-trusts-project-knowledge.business.md`, but that business spec's `implemented_by:` does **not** list the dev spec
- **When** the validator runs over the project
- **Then** the report contains an `error` describing the asymmetry
- **And** the message identifies both the dev spec and the business spec involved

### A missing folder overview is flagged

- **Given** a domain folder `specs/anatomy/` that contains spec files but no `_overview.md`
- **When** the validator runs
- **Then** the report contains a violation at `specs/anatomy/` citing the required-overview rule

### A malformed frontmatter field is flagged

- **Given** a developer spec whose frontmatter omits the required `status:` field
- **When** the validator runs
- **Then** the report contains one `error` at that file citing the frontmatter schema for developer specs
- **And** the message names the missing field

### An unsupported schema version is reported, not guessed

- **Given** `.cortex/cortex.config.json` declares `schemaVersion: "99.0"` while the validator supports `1.x`
- **When** the validator runs
- **Then** the report contains one `error` from `check.config` citing schema-version mismatch (clause §10.3)
- **And** the validator does not emit any other violations derived from validating against the unsupported contract

### Single-file scope resolves links against the whole project

- **Given** the validator is scoped to the single file `specs/schema/validator.spec.md`
- **When** it runs
- **Then** it reports violations local to that file
- **And** its `implements:` target in `specs-business/` is resolved against the full project rather than reported as out-of-scope

## Notes

- The contract is `cortex-schema.md` (schema v1.0). Rules 5-11 of this spec map onto its mechanical check catalogue (Appendix A); the per-facet definitions live in `cortex-schema.md` §1 (layout), §2-§3 (tree/test conventions), §4 (frontmatter), §5 (hooks), §6 (cross-references), §7-§9 (index/overview/CLAUDE/loop templates), §10 (versioning). If the schema adds or renames a facet, revise this spec in the same change.
- **Resolved (was OPEN): coverage-completeness is out of scope.** Per `cortex-schema.md` Decision 4 / §3 / §4.8, this validator checks only that `covers:` entries *resolve* (`check.covers-resolves`). The constraint "every business spec appears in ≥1 scenario's `covers:`" is owned by `specflow-verify` (design §11.4), not the validator.
- **Resolved (was OPEN): `ValidationReport` format** is fixed in `cortex-schema.md` §6.1; see the Entities section above.
- Also supports: the `core-cli` outcome (the validator is invoked by `cortex scan` / `cortex init`) and the `specflow` lineage (the scheduled `specflow-lint` loop overlaps with these structural checks). Primary parent remains `schema.contributor-trusts-project-knowledge`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
