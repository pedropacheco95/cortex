---
id: specflow.store-v4-awareness
status: retired
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
  - "skills/specflow-bugs/SKILL.md"
  - "skills/specflow-intent-reconcile/SKILL.md"
  - "skills/specflow-ingest/SKILL.md"
  - "skills/specflow-lint/SKILL.md"
---

# The skills read and write the 4.0 store when a project has one (transition)

> **RETIRED for 4.0 stores (Specflow batch, 2026-11-04).** New home and any behaviour left without one: `../loops/_retirements.md`. The old skills leave the package in Round 2 (P12); a project on a 3.x store keeps only the 3.x Core commands until its migration is accepted.

## Intent

Schema 4.0 replaces the hidden `.cortex/` store with the visible `cortex/` store (schema Part II). Pedro approved updating the skills before the v4 release (2026-10-19). After `cortex-v4` merges, though, the 3.x `cortex sync` still installs the shipped skills into projects that have not migrated. So for the transition, each skill decides which store to read by detection, and keeps its 3.x instructions for 3.x projects. This first slice changes reads only, plus `cortex store validate`. It amends the reads that `specflow.cortex-awareness` Rule 1 and `specflow.insight-awareness` specify, and leaves their 3.x text in place.

**Second slice (2026-10-19).** Pedro took the held decisions ("solve them as they are"): bug ids and filing (D1, C3; schema S3), intent-reconcile status transitions (C1; schema S5), `.specflow/` validation (G1; schema S11, `schema.validator` Rule 15), the source-digest and proposals writers (G2, G3; `store.remember-skill` Rules 7–8, schema S6–S7), and the homes for skill working output (D2) and inferred rules (D3; schema S4, S6). Rules 6–12 below add the writes, and specflow-bugs, specflow-intent-reconcile, specflow-ingest and specflow-lint join the governed skills.

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

6. **The write gate, one paragraph per writing skill.** The 4.0 writes below apply only when `cortex/cortex.json` exists and either `.cortex/` is absent or `migration.accepted` is set; until then the 3.x instructions apply. Each skill that writes states its 4.0 writes in one paragraph that starts `**Writing to the 4.0 store.**` and opens with that gate, placed straight after the Rule 1 paragraph. The 3.x text stays (Rule 2).
7. **specflow-bugs (D1, C3).** A bug is filed as `cortex/code/<area>/<slug>.md` (schema S3): no `B-NNN` id and no `cortex id next bug`; frontmatter `about`, `permanence: changing`, `verified`, `origin`, `need` (the affected files) and `status: open`; the type, severity, found-at commit, owner and fix in flight as body lines; the rest of the 3.x ledger body unchanged. References to a bug use its path. When the bug is resolved, its text and aliases move to a new `cortex/history/incidents/<YYYY-MM-DD>-<slug>.md` with the resolution, the `code/` file is removed, and links to the old path are updated. Cross-references by B-id in client skills are the client's follow-up.
8. **specflow-intent-reconcile (C1).** Pinning an ask creates `cortex/history/changes/<YYYY-MM-DD>-<slug>.md` with `kind: change-request`, `status: pending`, `source` the verbatim ask, and no IR id; the body quotes the ask and names the stakeholder and the anchor test. Reconciling or flagging changes `status` in place and appends one transition line (schema S5) that carries the landing and the covering spec test, or the filed bug's path.
9. **specflow-ingest (G2).** The memory-shaped remainder of a document goes to the `cortex-remember` skill's source-digest step instead of `cortex-archive-ingest`. A proposed business spec names the `cortex/world/decisions/` file it corresponds to.
10. **specflow-lint (G1).** On a 4.0 project, `cortex validate` runs the store checks and the spec-tree checks (`schema.validator` Rule 15); the skill runs it first, as on 3.x.
11. **Working output (D2).** Output that must outlive the session goes to `cortex/now/` as one `##` item with `until:` (schema S6): specflow-tests writes its verification report to `cortex/now/verification.md` (`until:` today + 14 days); specflow-deep-onboard writes its report to `cortex/now/deep-onboard-report.md` (`until:` today + 30 days) and keeps its scratch in `$TMPDIR/specflow-deep-onboard/`, outside the repository; specflow-develop's gap notes, and deep-onboard's proposed notes and corrections, are proposals filed through `cortex-remember`'s propose mode.
12. **Rules and bugs found while working (D3).** specflow-onboard-codebase and specflow-deep-onboard file every rule they infer as a proposal (`cortex-remember` propose mode), never in `cortex/world/rules/`, and the bugs they find by Rule 7. specflow-spec-editor creates a rule from an approved change plan or proposal as `cortex/world/rules/<rule>.md` with `source: <approver>@<date>` and no `R-NNN` id. specflow-entry files a bug through specflow-bugs (Rule 7).

## Acceptance Criteria

### Every governed skill carries the paragraph verbatim

- **Given** the 17 governed SKILL.md files
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

### Every writing skill carries its gated write paragraph

- **Given** specflow-bugs, specflow-intent-reconcile, specflow-ingest, specflow-lint, specflow-tests, specflow-develop, specflow-onboard-codebase, specflow-deep-onboard, specflow-spec-editor and specflow-entry
- **When** each is read
- **Then** each contains exactly one paragraph starting `**Writing to the 4.0 store.**`, after the Rule 1 paragraph, naming `migration.accepted`

### The write paragraphs name the decided homes

- **Given** those paragraphs
- **When** they are read
- **Then** specflow-bugs names `cortex/code/<area>/<slug>.md`, `status: open`, `cortex/history/incidents/` and says no `B-NNN` id; specflow-intent-reconcile names `cortex/history/changes/`, `kind: change-request` and the transition line `- <YYYY-MM-DD>: <from> → <to>, <reason>`; specflow-ingest names the `cortex-remember` source digest; specflow-lint names `cortex validate`; specflow-tests names `cortex/now/verification.md`; specflow-deep-onboard names `cortex/now/deep-onboard-report.md` and `$TMPDIR/specflow-deep-onboard/`; specflow-develop, specflow-onboard-codebase and specflow-deep-onboard name `now/proposals.md`; specflow-onboard-codebase says inferred rules never go in `cortex/world/rules/`; specflow-spec-editor names `source: <approver>@<date>`
