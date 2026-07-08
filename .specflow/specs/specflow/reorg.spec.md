---
id: specflow.reorg
status: implemented
depends_on: []
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by:
  - R-001
governs:
  - "src/paths.ts"
  - "skills/specflow-*/**"
---

# SpecFlow Tree Reorganization — `specs/` → `.specflow/`

## Intent

The `.specflow/` reorganization moves both spec trees under one hidden, SpecFlow-owned namespace (`specs/` → `.specflow/specs/`, `specs-business/` → `.specflow/specs-business/`; `tests/` stays at the project root) and rewrites every project-root-relative reference *to* the trees so nothing breaks the day they move (schema §2.3, v2 design §9). This is a mechanical, deterministic move — the physical tree relocation, the Core path-constant rewrite (validator/compiler/loop discovery roots, `check.id-matches-path` base, `specflow-change-router`'s "has a `specs/` dir" trigger), and the find-and-replace-grade `specs/`→`.specflow/specs/` rewrite inside the specflow skill bundles (build-order step 1b, F4). It is step 1 because every subsequent v2 piece builds against the final paths. Deterministic Core (R-001); no LLM, no judgment.

## Entities

- **READS:** the current tree roots (`specs/`, `specs-business/`); every Core module and skill file carrying a hardcoded `specs/`/`specs-business/` project-root path constant; the CLAUDE.md managed block and root `loop.md` text.
- **WRITES:** the relocated trees under `.specflow/`; `src/paths.ts` (the central tree-discovery path constants); the specflow skill bundles' instruction text (`skills/specflow-*/**` — mechanical path substitution only); the CLAUDE.md template and `loop.md` wording.
- **CREATES:** `.specflow/` at the project root holding exactly the two trees (no wrapper docs of its own, schema §2.3).

## Rules

1. **The physical move.** `specs/` → `.specflow/specs/` and `specs-business/` → `.specflow/specs-business/`, each tree's internal `_index.md`/`_overview.md` structure carried across unchanged. `tests/` stays at the project root (test runners, CI globs, coverage tooling assume root-level test paths — schema §2.3, v2 design §9.1). The root SpecFlow artefacts (`RULES.md`, `build-order.md`, `link-map.md`, `implicit-behaviors.md`, `dead-features.md`) also stay at the project root (schema Decision 20 / OQ8).
2. **Invariant under the move (schema §2.3):** spec IDs are unchanged — the tree root is stripped before deriving the ID, so `.specflow/specs/schema/validator.spec.md` is still `schema.validator`. Every ID-form cross-reference (`depends_on`, `covers`, `governed_by`, `related_specs`, `spec_links`) survives untouched. Every `implements:`/`implemented_by:` relative path survives — both trees moved together, so their relative geometry is identical. `governs:` globs (project-root-relative pointers at *source* files) are unaffected.
3. **What changes:** only project-root-relative references *to* the trees — the validator/compiler/loop discovery roots and `check.id-matches-path` base (all reading from `src/paths.ts`), the constellation spec-node scan input, the spec-drift/lint/verify loop inputs, and `specflow-change-router`'s trigger. The rewrite is centralized in `src/paths.ts` so Core has one source of truth for the tree roots.
4. **Skill path rewrite (step 1b, F4).** The mechanical `specs/`→`.specflow/specs/` and `specs-business/`→`.specflow/specs-business/` substitution inside `skills/specflow-*/**` instruction text ships in this round — a find-and-replace-grade change, distinct from the judgment-bearing insight-query enrichment which stays a separate follow-up pass (v2 design §9.4). Only literal tree-root paths are rewritten; no workflow logic changes.
5. **Grep-clean done-state.** After the move, no project-root-relative `specs/` or `specs-business/` path constant remains in Core or skill text — excluding `tests/scenario/specs/` (a distinct test path, unmoved) and relative `../../specs*` cross-references (correctly unchanged, per Rule 2).
6. **No migration ships (schema §10.4 waiver, Decision 19).** No `cortex migrate` for 1.0→2.0 and no deprecation markers at the old roots — there are no external users and the Cortex repo moves itself. This waiver is specific to 1.0→2.0; the migration policy stands for future MAJORs.
7. **Deterministic Core** (R-001): the move and rewrite are pure file I/O — no LLM, no network. This step is coordinated with `schema.version-2`: the version bump and the path rewrite land together (§2.3 sequencing spine) so the re-rooted checks activate against the moved trees (see `schema.version-2` Rule 3).

## Acceptance Criteria

### The trees move and keep their structure

- **Given** a repo with `specs/schema/validator.spec.md` and `specs-business/schema/contributor-trusts-project-knowledge.business.md`
- **When** the reorganization runs
- **Then** the files live at `.specflow/specs/schema/validator.spec.md` and `.specflow/specs-business/schema/contributor-trusts-project-knowledge.business.md`
- **And** `.specflow/` contains exactly the two trees and no wrapper docs
- **And** `tests/` and `RULES.md` remain at the project root

### Spec IDs are invariant under the move

- **Given** `.specflow/specs/schema/validator.spec.md` after the move
- **When** its ID is derived (tree root stripped, §2.2)
- **Then** the ID is still `schema.validator` — unchanged from before the move

### Relative cross-references survive untouched

- **Given** the moved dev spec's `implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md`
- **When** the path is resolved from `.specflow/specs/schema/`
- **Then** it resolves to the moved business spec — the relative geometry is identical, so the literal `../../specs-business/...` string is unchanged

### Core discovery roots point at `.specflow/`

- **Given** `src/paths.ts` after the rewrite
- **When** the validator, compiler, and loops read their tree-discovery roots
- **Then** every root resolves under `.specflow/`, and no Core module carries a project-root-relative `specs/` constant of its own

### Skill text is rewritten, logic is not

- **Given** a specflow skill whose instructions named `specs/` and `specs-business/`
- **When** the step-1b rewrite runs
- **Then** those literal tree-root paths read `.specflow/specs/` and `.specflow/specs-business/`
- **And** no workflow step, ordering, or judgment instruction in the skill changed

### The result is grep-clean

- **Given** the completed move
- **When** the repo is grepped for a project-root-relative `specs/` or `specs-business/` path constant in Core and skill text
- **Then** the only remaining matches are `tests/scenario/specs/` and relative `../../specs*` cross-references — no unmoved discovery root remains

### No migration artefacts are left behind

- **Given** the 1.0→2.0 transition
- **When** the move completes
- **Then** no `cortex migrate` runs and no deprecation marker exists at the old `specs/`/`specs-business/` roots (§10.4 waiver)

## Notes

- This spec and `schema.version-2` are the single coordinated step-1 change (build-order §1): sequenced internally as move-and-rewrite, then bump, then round-trip the re-rooted validator. The version bump MUST land in the same commit as the move (`schema.version-2` Rule 3) — a bump before the move, or a move before the bump, leaves the repo failing its own validation mid-step.
- The insight checks do not gate this step: `check.layout` tolerates an absent module, so the validator passes at 2.0 before `insight/` exists.
- **OPEN:** whether the root SpecFlow artefacts (`link-map.md` et al.) later follow into `.specflow/` is deferred to a future MINOR/MAJOR (schema Decision 20 / OQ8); this spec leaves them at the root.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
