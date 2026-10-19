---
id: specflow.store-v4-awareness
status: implemented
depends_on:
  - specflow.cortex-awareness
  - specflow.insight-awareness
  - store.layout
implements: ../../specs-business/specflow/developer-gets-spec-work-grounded-in-project-memory.business.md
governed_by: []
governs:
  - "skills/specflow-plan/SKILL.md"
  - "skills/specflow-brainstorm/SKILL.md"
  - "skills/specflow-new-project/SKILL.md"
  - "skills/specflow-viewer/SKILL.md"
  - "skills/specflow-entry/SKILL.md"
  - "skills/specflow-develop/SKILL.md"
  - "skills/specflow-tests/SKILL.md"
  - "skills/specflow-onboard-codebase/SKILL.md"
  - "skills/specflow-deep-onboard/SKILL.md"
  - "skills/specflow-spec-editor/SKILL.md"
  - "skills/specflow-receive-review/SKILL.md"
  - "skills/specflow-request-review/SKILL.md"
  - "skills/verification-before-completion/SKILL.md"
---

# The skills read the 4.0 store when a project has one (transition, first slice)

## Intent

Schema 4.0 replaces the hidden `.cortex/` store with the visible `cortex/` store (schema Part II). Pedro approved updating the skills before the v4 release (2026-10-19). After `cortex-v4` merges, though, the 3.x `cortex sync` still installs the shipped skills into projects that have not migrated. So for the transition, each skill decides which store to read by detection, and keeps its 3.x instructions for 3.x projects. This first slice changes reads only, plus `cortex store validate`. It amends the reads that `specflow.cortex-awareness` Rule 1 and `specflow.insight-awareness` specify, and leaves their 3.x text in place.

Held for later decisions: bug ids and filing (D1, C3), intent-reconcile status transitions (C1), `.specflow/` validation (G1), the source-digest and proposals writers (G2, G3), and the homes for skill working output (D2) and onboard-extracted rules (D3). The skills specflow-bugs, specflow-intent-reconcile, specflow-ingest and specflow-lint are untouched.

## Entities

- **READS:** the skill bodies named in `governs`.
- **WRITES:** those bodies and their `.claude/skills/` mirrors.

## Rules

1. **One shared paragraph.** Each governed skill carries the paragraph below verbatim, once, in its Cortex section, or in a short `## Cortex 4.0 store` section where it has none:

   > **Which store (Cortex 4.0 transition).** If `cortex/cortex.json` exists, this project uses the 4.0 store: read `cortex/` in place of the `.cortex/` paths in this skill. Start from `cortex/MAP.md`. Rules are in `cortex/world/rules/` (they apply by `match.paths`, not `governs`), decisions in `cortex/world/decisions/`, terms in `cortex/world/terms/`, working preferences in `cortex/world/agreements/working-preferences.md`, and open pitfalls (the former open bugs) in `cortex/code/<area>/` with `status: open`. There is no insight layer in 4.0: where this skill would query insight, read the file and grep `cortex/code/<area>/` and `cortex/world/terms/`. Check the store with `cortex store validate`. While `.cortex/` also exists and the migration is not accepted (`migration.accepted` is `null` in `cortex/cortex.json`), read `cortex/` but write nothing to either store beyond what this skill's 3.x instructions already allow. After acceptance, write nothing to `.cortex/`; file a durable fact with the `cortex-remember` skill. Without `cortex/cortex.json`, use the `.cortex/` paths as written.

2. **The 3.x text stays.** No existing instruction is removed or reworded. Every phrase the existing awareness tests pin is still present.
3. **Descriptions unchanged.** No skill's frontmatter `description` changes, so the listing budget is unaffected.
4. **Mirrored.** Each edited `skills/<name>/SKILL.md` is byte-identical to `.claude/skills/<name>/SKILL.md`.
5. **Install set unchanged.** `cortex migrate --accept` installs only `cortex-remember` (`store.migrate` Rule 18). The four 3.x bundles that 4.0 supersedes (`cortex-loop`, `cortex-extract-insight`, `cortex-archive-ingest`, `cortex-register-tasks`) stay in `skills/` for unmigrated projects, and leave in the release that retires 3.x.

## Acceptance Criteria

### Every governed skill carries the paragraph verbatim

- **Given** the 13 governed SKILL.md files
- **When** each is read
- **Then** each contains the Rule 1 paragraph exactly once, byte for byte

### The 3.x pins still hold

- **Given** the existing specflow awareness, spine, review-pair and hardening tests
- **When** they run
- **Then** they pass unchanged

### Mirrored, and the budget holds

- **Given** the edited bundles
- **When** the mirror test and the listing-budget check run
- **Then** each edited SKILL.md is byte-identical to its mirror, and the budget check passes

### The held skills are untouched

- **Given** specflow-bugs, specflow-intent-reconcile, specflow-ingest and specflow-lint
- **When** they are read
- **Then** none contains the Rule 1 paragraph
