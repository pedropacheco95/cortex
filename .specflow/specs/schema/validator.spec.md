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
12. **Global id uniqueness across all kinds (schema §6 global rule 1; B-019).** Every `id` is unique within its kind across everything the project index scans in its single pass — dev and business specs (combined, across both trees), compass rules, compass bugs, atlas artefacts (decisions, evidence, domain terms, stakeholders, sources) and scenario specs. A duplicate is an `error` from `check.xref-unique`, one per duplicated id, located at the first file and naming every file that carries the id. Uniqueness is derived from the index's own scan — `buildIndex` keeps every file per id (`id → files[]`), never a second, narrower glob — and the index never silently discards a duplicate: resolving a duplicated id yields **no** file, so a `governed_by`, `affects`, `bears_on`, `compass_rules` or `related_specs` reference to it is reported as unresolved by the referring check alongside the uniqueness error, never satisfied by whichever file the scan listed last.
13. **Rule and bug self-agreement.** A compass rule's or bug's number must agree in three places: the filename prefix (`R-NNN-<slug>.md` / `B-NNN-<slug>.md`), the `id:` field, and the H1 heading (`# R-NNN — …` / `# B-NNN — …`). Filename versus `id:` disagreement is an `error` from `check.rule` / `check.bug` — already enforced in `src/schema/checks/compass.ts`, restated here so the rule is complete. The H1 is prose the schema does not shape (§4.1, §4.2), so its disagreement is a `warning` from `check.compass-heading`, raised only when the body's first H1 begins with an `R-NNN` / `B-NNN` token that differs from `id:`; a file with no H1, or an H1 with no such token, is not a finding.
14. **Index completeness.** `compass/rules/_index.md` should reference every `R-NNN` file in `compass/rules/`, and `compass/bugs/_index.md` every `B-NNN` file in `compass/bugs/`. An id counts as referenced when its literal token appears anywhere in the index, or when it lies inside a same-prefix range written `R-001–R-003` (en dash, em dash or hyphen between two ids) — the collapsed forms the indexes already use. An index that carries a `… and N more` line (the §7.1 generated-block tail) or a generated block (`<!-- cortex:recall:start`) counts as **complete** without a scan: it collapsed to fit the <300-token budget by design, and completeness cannot be read off it. Otherwise the missing ids produce, per index, exactly one `warning` from `check.index-completeness` (clause §7.1) at the index file, whose message reads `index lists N of M rules` / `… bugs` and names up to five missing ids. The check never asks an index to grow past its budget — an over-budget index is `check.index-shape`'s warning, and the remedy for both at once is a range or the `… and N more` line, not more rows. An absent directory or index is not this check's finding (`check.index-present` owns absence).

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

### Two compass rules with one id are rejected

- **Given** a conformant tree plus `.cortex/compass/rules/R-026-first.md` and `R-026-second.md`, both `id: R-026`, each individually valid under `check.rule` (a resolving `source:`, a matching `governs:` glob)
- **When** the validator runs
- **Then** the report contains exactly one `error` from `check.xref-unique` citing `§6`, located at `R-026-first.md`, whose message names both files
- **And** the tree is non-conformant

### Two bugs with one id are rejected

- **Given** the same tree plus `.cortex/compass/bugs/B-001-first.md` and `B-001-second.md`, both `id: B-001`, each individually valid under `check.bug`
- **When** the validator runs
- **Then** the report contains exactly one `error` from `check.xref-unique` whose message names both bug files

### Two specs with one id are rejected

- **Given** two dev specs in different directories both declaring `id: schema.validator`
- **When** the validator runs
- **Then** the report contains an `error` from `check.xref-unique` naming both files (this criterion adopts the pre-existing test `check.xref-unique: two specs with same ID → fires` in `tests/atomic/schema/validator.test.ts`)

### A duplicated id never resolves to an arbitrary file

- **Given** the two `R-026` files above and a dev spec whose `governed_by:` lists `R-026`
- **When** the validator runs
- **Then** the index holds both files under `R-026` (`idToFiles.get('R-026')` has two entries) and `resolveId` returns nothing for it
- **And** the report carries the `check.xref-unique` error and an unresolved-reference `error` at the dev spec's `governed_by` key — never a silent resolution to either file

### An H1 that disagrees with the id is warned, a filename that disagrees stays an error

- **Given** `R-026-first.md` with `id: R-026` and the H1 `# R-027 — Second rule`, and `B-004-x.md` with `id: B-005`
- **When** the validator runs
- **Then** the report contains one `warning` from `check.compass-heading` at `R-026-first.md` naming `R-027` and `R-026`, and one `error` from `check.bug` at the `id` key of `B-004-x.md` (the filename rule)
- **And** a rule whose H1 is `# Core makes no LLM calls` (no id token) produces no `check.compass-heading` finding

### An index that omits a bug is warned with the count

- **Given** `compass/bugs/` holding `B-001` … `B-005` and a `compass/bugs/_index.md` whose body mentions `B-001–B-003` and `B-005` only
- **When** the validator runs
- **Then** the report contains exactly one `warning` from `check.index-completeness` at `compass/bugs/_index.md` whose message is `index lists 4 of 5 bugs (missing: B-004)`, and the tree stays conformant

### A collapsed index counts as complete

- **Given** the same five bugs and an index whose body mentions `B-005` and the line `- … and 4 more (\`cortex …\`)`, and a rules index carrying a `<!-- cortex:recall:start v3.4 -->` … `<!-- cortex:recall:end -->` block that names no rule
- **When** the validator runs
- **Then** neither index produces a `check.index-completeness` finding

## Notes

- The contract is `cortex-schema.md` (schema v1.0). Rules 5-11 of this spec map onto its mechanical check catalogue (Appendix A); the per-facet definitions live in `cortex-schema.md` §1 (layout), §2-§3 (tree/test conventions), §4 (frontmatter), §5 (hooks), §6 (cross-references), §7-§9 (index/overview/CLAUDE/loop templates), §10 (versioning). If the schema adds or renames a facet, revise this spec in the same change.
- **Resolved (was OPEN): coverage-completeness is out of scope.** Per `cortex-schema.md` Decision 4 / §3 / §4.8, this validator checks only that `covers:` entries *resolve* (`check.covers-resolves`). The constraint "every business spec appears in ≥1 scenario's `covers:`" is owned by `specflow-verify` (design §11.4), not the validator.
- **Resolved (was OPEN): `ValidationReport` format** is fixed in `cortex-schema.md` §6.1; see the Entities section above.
- Also supports: the `core-cli` outcome (the validator is invoked by `cortex scan` / `cortex init`) and the `specflow` lineage (the scheduled `specflow-lint` loop overlaps with these structural checks). Primary parent remains `schema.contributor-trusts-project-knowledge`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
- **Rules 12–14 (2026-09-17, wave follow-up A; B-019).** Rule 12 is schema §6 global rule 1 restated in this spec's words — it was absent here until B-019 showed `check.xref-unique` (`src/schema/checks/xref.ts`) re-globbing the two spec trees while `buildIndex` (`src/schema/index-build.ts`) overwrote the second file of a duplicated id. Rules 13 and 14 are the two adjacent asks of the 2026-09-14 parallel-wave brief (`.cortex/archive/documents/parallel-wave-brief-2026-09-14/extracted/asks.md`, A-02 and A-03): four sessions re-allocated a colliding `R-026` in one night because each read the index, not the directory. Plan: `plans/2026-09-17-wave-a.md`.
- **OPEN: clause labels in `compass.ts` are one section behind the schema.** `check.rule` cites `§4.2` and `check.bug` `§4.3`, while `cortex-schema.md` numbers those sections §4.1 and §4.2. Pre-existing, not corrected in the Rule 12–14 round (tests may pin the strings); `check.compass-heading` cites the schema's numbering (§4.1 for a rule, §4.2 for a bug).
