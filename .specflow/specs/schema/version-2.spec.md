---
id: schema.version-2
status: implemented
depends_on:
  - specflow.reorg
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by:
  - R-001
governs:
  - "src/schema/version.ts"
---

# Schema Version Wiring — 1.0 → 2.0

## Intent

Schema 2.0 is a MAJOR bump (directories moved, a new committed `insight/` module — schema §2.3, §4.10). This spec owns the version-gate wiring that makes the bump real: the project `cortex.config.json` declares `schemaVersion: "2.0"`, and the validator declares `supportedMajor = 2`, `supportedMinor = 0`. The bump MUST land in the same change as the `.specflow/` move (`specflow.reorg`) — bumping to 2.0 activates the re-rooted checks, so a bump without the move (or a move without the bump) leaves the repo failing its own validation mid-step (schema §2.3 sequencing spine). It also carries the MAJOR-mismatch short-circuit (schema §10.3, Decision 12): a config declaring a MAJOR the validator doesn't support is a single `check.config` error, not a validation against the wrong contract. Deterministic Core (R-001).

## Entities

- **READS:** `.cortex/cortex.config.json` (`schemaVersion`); the validator's declared `supportedMajor`/`supportedMinor` (`src/schema/version.ts`).
- **WRITES:** `src/schema/version.ts` (`supportedMajor = 2`, `supportedMinor = 0`); the `schemaVersion` value in the project config and in the `cortex init` config template.
- **CREATES:** nothing new on disk — this is a value bump, not a new artefact.

## Rules

1. **Config version.** The project `.cortex/cortex.config.json` `schemaVersion` reads `"2.0"`, and `cortex init`'s config template emits `"2.0"` on fresh projects (schema §10.1). The config's new `insight` block (`clusterCarryOverJaccard`, `promotionMinAgeDays`, `promotionMinObservations`) is defined by `insight.module-contract`; this spec owns only the `schemaVersion` value.
2. **Validator support declaration.** The validator declares `supportedMajor = 2`, `supportedMinor = 0` (schema §10.3). `src/schema/version.ts` is the single source of both, read by every version-gate branch.
3. **The bump lands with the move.** The `schemaVersion` bump and `specflow.reorg`'s path rewrite MUST be one commit (schema §2.3 sequencing spine): bumping to 2.0 is what activates the re-rooted `check.layout`/`check.id-matches-path`/`check.specs-index`/`check.overview-present`, so the re-rooted validator running green against the moved trees is the step's round-trip regression (build-order §1). `depends_on: [specflow.reorg]` encodes the ordering; the two are verified together.
4. **MAJOR-mismatch short-circuit (schema §10.3, Decision 12).** When `cortex.config.json` declares a MAJOR **above** the validator's supported MAJOR, the validator emits the single `check.config` error (clause §10.3) and runs **no** further checks — it does not validate against a contract it doesn't implement. A MAJOR **below** supported emits a single `check.config` error recommending `cortex migrate`.
5. **MINOR forward-tolerance (schema §10.2/§10.3).** MAJOR equal, MINOR above supported → one `warning`, then proceed with forward tolerance (unknown optional fields tolerated). MAJOR and MINOR equal → proceed normally.
6. **Migration waived for 1.0→2.0 only (schema Decision 19 / §10.4).** No `cortex migrate` for this transition; the policy holds in full for every future MAJOR. `cortex init` on a pre-2.0 project without the migration treats the old trees as absent — acceptable because no such external project exists.
7. **Deterministic Core** (R-001): version comparison and the config read are pure logic — no LLM, no network.

## Acceptance Criteria

### The config and validator both read 2.0

- **Given** a fresh `cortex init` at schema 2.0
- **When** the config template is emitted and the validator is inspected
- **Then** `cortex.config.json` `schemaVersion` is `"2.0"` and `src/schema/version.ts` declares `supportedMajor = 2`, `supportedMinor = 0`

### The re-rooted validator passes green at 2.0 against the moved trees

- **Given** the trees moved under `.specflow/` (`specflow.reorg`) and the config bumped to `"2.0"` in the same change
- **When** `cortex validate` runs over the project
- **Then** the report has zero `error`-severity violations — the re-rooted `check.layout`/`check.id-matches-path`/`check.specs-index`/`check.overview-present` all resolve against `.specflow/`

### A higher MAJOR short-circuits, not misvalidates

- **Given** `cortex.config.json` declaring `schemaVersion: "3.0"` while the validator supports `2.x`
- **When** `cortex validate` runs
- **Then** the report contains exactly one `error` from `check.config` citing clause §10.3
- **And** no other violation derived from validating against the unsupported contract appears

### A lower MAJOR recommends migrate

- **Given** `cortex.config.json` declaring `schemaVersion: "1.0"` while the validator supports `2.x`
- **When** `cortex validate` runs
- **Then** the single `check.config` error recommends `cortex migrate` and no further checks run

### A higher MINOR is tolerated forward

- **Given** `cortex.config.json` declaring `schemaVersion: "2.7"` while the validator supports `2.0`
- **When** `cortex validate` runs
- **Then** the report carries one `warning` about the higher minor and otherwise proceeds normally with forward tolerance

### No migration artefacts for 1.0→2.0

- **Given** the 1.0→2.0 transition
- **When** the bump lands
- **Then** no `cortex migrate` ships and no deprecation marker is written (schema §10.4 waiver, Decision 19)

## Notes

- This spec deliberately owns only the *version wiring*; the substance of the 2.0 contract (the `insight/` module, the typed pulse gate, the re-rooted checks) is owned by the specs that implement each piece. It is the switch that turns 2.0 on, which is why it is inseparable from `specflow.reorg`.
- The four insight checks do not gate the 2.0 bump: `check.layout` tolerates an absent `insight/` module, so a repo passes at 2.0 before `insight/` is scaffolded (build-order §1).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
