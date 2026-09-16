# Cortex — Developer Spec Index

**Read this when:** you are about to implement, modify, or reason about any dev spec — start here to find the owning domain, then read that domain's `_overview.md` before opening individual specs.

## Domains

- `schema/` — the `cortex-schema.md` contract and the schema validator
- `core-cli/` — the deterministic Node.js CLI binary surface
- `anatomy/` — the native code-structure scanner (SUPERSEDED at v3 — absorbed into `insight/`; specs retained for lineage)
- `compass/` — write-time enforcement layer and the unified bug ledger (renamed from `cerebrum/` at v3)
- `atlas/` — the project knowledge base
- `hooks/` — Claude Code hooks and the git post-commit hook
- `scaffolding/` — CLAUDE.md and `_index.md` prompt templates
- `pulse/` — the Hygiene and Distil self-maintenance loops
- `loops/` — the Cortex loops and shared loop infrastructure (scheduled as five task bundles; `loops.skill-suggest` superseded — folded into `pulse.distil`)
- `constellation/` — the read-only graph compiler and renderer
- `specflow/` — the absorbed spec-and-test lineage
- `insight/` — the ungated codebase-understanding layer (v3: L1 pass, storage contract, query CLI, extraction skill, refresh loops, session-observe)
- `archive/` — ingested source documents and the one type-routed ingestion skill
- `provenance/` — `derives_from:` frontmatter, `check.provenance`, and the backward-traversal index
- `migration/` — the v3 module migration (compass rename, decisions single-home)
- `discipline/` — process-agnostic discipline primitives both process profiles invoke (verification gate, hardening convention)
- `recall/` — the recall surface: the compiled `recall-index.json` (step 2) and its consumers (step 3): `cortex why`/`cortex recall`, the generated atlas index blocks; the two hook consumers live in `hooks/`

## Dependency Graph

Current edges (`A → depends on B`):

- `anatomy.scanner` → `schema.validator`
- `core-cli.init` → `schema.validator`, `anatomy.scanner`
- `hooks.session-start` → `core-cli.init`
- `hooks.pre-write` → `core-cli.init`
- `hooks.post-write` → `core-cli.init`, `anatomy.scanner`
- `constellation.compiler` → `schema.validator`, `anatomy.scanner`
- `constellation.renderer` → `constellation.compiler`
- `atlas.ingest-skill` → `core-cli.init`, `schema.validator`
- `pulse.review-cli` → `core-cli.init`, `schema.validator`
- `loops.session-reading` → `schema.validator`
- `loops.writer-verifier` → `core-cli.init`, `schema.validator`
- `pulse.hygiene` → `core-cli.init`, `schema.validator`, `anatomy.scanner`
- `loops.rule-decay` / `loops.atlas-staleness` / `loops.onboarding-drift` → `core-cli.init`, `schema.validator`
- `loops.spec-drift` → `core-cli.init`, `schema.validator`, `anatomy.scanner`
- `pulse.distil` → `loops.session-reading`, `pulse.review-cli`, `core-cli.init`
- `loops.skill-suggest` → (SUPERSEDED — retired as a standalone loop; its workflow-mining lens folded into `pulse.distil`; spec retained for lineage)
- `loops.bug-triage` → `core-cli.init`, `schema.validator`, `pulse.review-cli`
- `loops.lint-scheduled` / `loops.verify-scheduled` → `schema.validator`, `core-cli.init`
- `anatomy.refresh-fast` → `anatomy.scanner`, `core-cli.init`
- `anatomy.refresh-deep` → `anatomy.scanner`, `anatomy.refresh-fast`, `core-cli.init`
- `hooks.pre-read-writeback` → `core-cli.init`, `anatomy.scanner`
- `hooks.post-read` → `core-cli.init`, `anatomy.scanner`, `hooks.pre-read-writeback`
- `core-cli.task-scoping` → `core-cli.init`
- `core-cli.tasks-register` → `core-cli.init`, `core-cli.task-scoping`
- `loops.test-runner` → `loops.writer-verifier`, `loops.bug-triage`, `schema.validator`, `core-cli.init`
- `specflow.cortex-awareness` → `core-cli.init`, `schema.validator`
- `discipline.verification-skill` → `core-cli.init`
- `discipline.hardening-convention` → (no dependencies — a standalone authoring recipe)
- `scaffolding.coverage-map` → `hooks.session-start`, `insight.storage-format`
- `scaffolding.rationalization-table` → `scaffolding.coverage-map`
- `pulse.usage` → `loops.session-reading`, `core-cli.init`
- `scaffolding.skill-listing-budget` → (no dependencies — a standalone authoring contract)
- `loops.cortex-loop-bundle` → `core-cli.task-scoping`, `core-cli.init-profile`, `core-cli.sync`, `scaffolding.skill-listing-budget`
- `pulse.threads` → `core-cli.init`, `pulse.hygiene` (expiry rides in the implemented sweep; the edge points from the draft to the implemented spec, never the reverse)
- `hooks.session-end` → `core-cli.init`, `loops.session-reading`, `pulse.threads`
- `schema.schema-clauses` → `schema.validator`
- `schema.bears-on` → `schema.validator`, `schema.schema-clauses`, `provenance.frontmatter-check`
- `atlas.evidence` → `core-cli.init`, `schema.bears-on`, `pulse.threads`, `pulse.usage`, `pulse.review-cli` (the producers it amends are implemented; the edge points from the draft to them, never the reverse)
- `recall.recall-index` → `schema.bears-on`, `schema.schema-clauses`, `atlas.evidence`, `pulse.threads`, `constellation.compiler`, `insight.refresh-loops`, `core-cli.init`
- `hooks.search-annotate` → `core-cli.init`, `recall.recall-index`, `pulse.usage`, `schema.bears-on`
- `hooks.pre-read-writeback` (Rule 6) → additionally `recall.recall-index`, `hooks.search-annotate`
- `recall.why` → `recall.recall-index`, `schema.bears-on`, `hooks.search-annotate`
- `recall.index-blocks` → `recall.recall-index`, `core-cli.init`, `core-cli.sync`, `hooks.search-annotate`
- `hooks.prompt-route` → `core-cli.init`, `pulse.threads`, `hooks.session-end`, `hooks.search-annotate`, `pulse.usage`
- `hooks.pre-read-writeback` (Rule 7) → no new edge; `pulse.usage` Rule 13 measures it, `atlas.evidence` Rule 5 records it

v3 edges (`build-order-v3.md`):

- `migration.decisions-single-home` → `migration.compass-rename`
- `archive.ingest-skill` → `migration.compass-rename`
- `provenance.frontmatter-check` → `archive.ingest-skill`, `migration.compass-rename`
- `insight.cli` → `insight.storage-format`
- `insight.extract-skill` → `insight.storage-format`, `insight.cli`, `insight.l1-structural`
- `insight.refresh-loops` → `insight.storage-format`, `insight.extract-skill`
- `insight.session-observe` → `insight.extract-skill`, `insight.storage-format`, `provenance.frontmatter-check`

## Build Order

Following the design doc's §16.2 implementation order:

1. `schema.validator` — implemented
2. `anatomy.scanner` — implemented
3. `core-cli.init` — implemented
4. `hooks.session-start`, `hooks.pre-write`, `hooks.post-write` — implemented
5. `constellation.compiler` — implemented
6. `constellation.renderer` — implemented
7. `atlas.ingest-skill` — implemented
8. `pulse.review-cli` — implemented
9. `loops.session-reading` — implemented
10. `loops.writer-verifier` — implemented
11. `pulse.hygiene`, `loops.rule-decay`, `loops.atlas-staleness`, `loops.onboarding-drift`, `loops.spec-drift` — implemented
12. `pulse.distil` — implemented (now also carrying the skill lens); `loops.skill-suggest` — SUPERSEDED (retired as a standalone loop; folded into `pulse.distil`, spec retained for lineage)
13. `loops.bug-triage`, `loops.lint-scheduled`, `loops.verify-scheduled` — implemented
14. `anatomy.refresh-fast`, `anatomy.refresh-deep` — implemented
15. `hooks.pre-read-writeback`, `hooks.post-read` — implemented (design §16.2 step 27)
16. `core-cli.task-scoping` — implemented (multi-project blocker cleared)
17. `loops.test-runner` — implemented (design §16.2 step 28 — all thirteen loops live)
18. `specflow.cortex-awareness` — implemented (design §16.2 step 29 — **v1.0 internal complete**)
19. _(v1.0 internal complete; the v2 foundation — schema 2.0, the `.specflow/` reorg, the v2 insight module now superseded — followed per build-order-v2.)_

### v3 (build-order-v3.md — the codebase-understanding round; all steps shipped)

1. Schema 3.0 addendum — shipped (contract document, folded into `cortex-schema.md`)
2. `migration.compass-rename` (2a), `migration.decisions-single-home` (2b) — implemented
3. `archive.ingest-skill` (module 3a + skill 3b) — implemented
4. `provenance.frontmatter-check` — implemented
5. Insight rebuild: `insight.l1-structural` (5a), `insight.storage-format` (5b), `insight.cli` (5c), `insight.extract-skill` (5d), `insight.refresh-loops` (5e) — implemented
6. `insight.session-observe` — implemented
7. Anatomy deprecation — shipped (consumers re-pointed to insight; `.cortex/anatomy/` removed; the `anatomy/` specs SUPERSEDED-bannered)
8. Skill integrations — shipped (the `cortex insight` enrichment pass across the specflow-* skills)
9. Ingestion re-home — shipped (`cortex-ingest` folded into `cortex-archive-ingest` as the atlas extraction strategy)
10. `constellation.insight-preset-v3` — implemented (design §11 Q2 resolved: a fourth `?preset=insight` constellation preset over the code-understanding graph, commissioned and shipped)
11. `core-cli.tasks-register` — implemented (B-009 resolution: real Desktop-app registry registration + verify)

### Recall work (2026-09; `plans/2026-09-15-recall-step1.md`)

1. Step 0 — `loops.session-reading` Rule 7 (`extractToolUses`, `sessionTitle`) and `pulse.usage` Rules 8–11 — implemented (commit 6d89522)
2. Step 1 — `pulse.threads` (ledger, counter, verbs, promote) and `hooks.session-end` (the session record), plus `pulse.hygiene` Rule 8 (expiry and retention) — implemented
3. Step 2 — schema MINOR 3.4 (approved 2026-09-15; `plans/2026-09-15-recall-step2.md`): `schema.schema-clauses`, `schema.bears-on`, `atlas.evidence`, `recall.recall-index` — specified, draft; amended in place: `pulse.threads` Rules 4/12, `pulse.usage` Rule 12, `insight.session-observe` Rule 6, `constellation.compiler` Rule 10, `core-cli.init` Rule 2, `insight.refresh-loops` Rule 9, `schema.version-2` Rules 2/8
4. Step 3 — the consumers (approved 2026-09-15; schema 3.4 second revision in place; `plans/2026-09-15-recall-step3.md`): `hooks.search-annotate`, `recall.why`, `recall.index-blocks` — specified, draft; amended in place: `hooks.pre-read-writeback` Rule 6 (the PreRead marker), `recall.recall-index` Rule 12, `pulse.usage` Rule 11 (id-shaped pointers), `core-cli.init` Rules 2 and 18 (B-018 invocation gate, fixed in the same batch as the verbs), `core-cli.sync` Rule 4
5. Step 4 — open-thread prompt routing and the read-deferral flag (approved 2026-09-16; schema 3.4 third revision in place; `plans/2026-09-16-recall-step4.md`): `hooks.prompt-route` — specified, draft; amended in place: `hooks.pre-read-writeback` Rule 7 (the `hooks.readDefer` deny gate, default off — RULES.md rule 6's one measured exception), `pulse.usage` Rules 11 and 13 (`Open:`/`Evidence:` prefixes, thread-verb follow, Read deferrals), `atlas.evidence` Rule 5 (findings order), `pulse.threads` Rule 14, `hooks.search-annotate` Notes
