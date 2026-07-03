# Cortex — Developer Spec Index

**Read this when:** you are about to implement, modify, or reason about any dev spec — start here to find the owning domain, then read that domain's `_overview.md` before opening individual specs.

## Domains

- `schema/` — the `cortex-schema.md` contract and the schema validator
- `core-cli/` — the deterministic Node.js CLI binary surface
- `anatomy/` — the native code-structure scanner and its artefacts
- `cerebrum/` — write-time enforcement layer and the unified bug ledger
- `atlas/` — the project knowledge base
- `hooks/` — Claude Code hooks and the git post-commit hook
- `scaffolding/` — CLAUDE.md and `_index.md` prompt templates
- `pulse/` — the Hygiene and Distil self-maintenance loops
- `loops/` — the thirteen Cortex loops and shared loop infrastructure
- `constellation/` — the read-only graph compiler and renderer
- `specflow/` — the absorbed spec-and-test lineage

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
- `loops.skill-suggest` → `loops.session-reading`, `pulse.review-cli`, `pulse.distil`
- `loops.bug-triage` → `core-cli.init`, `schema.validator`, `pulse.review-cli`
- `loops.lint-scheduled` / `loops.verify-scheduled` → `schema.validator`, `core-cli.init`
- `anatomy.refresh-fast` → `anatomy.scanner`, `core-cli.init`
- `anatomy.refresh-deep` → `anatomy.scanner`, `anatomy.refresh-fast`, `core-cli.init`

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
12. `pulse.distil`, `loops.skill-suggest` — implemented
13. `loops.bug-triage`, `loops.lint-scheduled`, `loops.verify-scheduled` — implemented
14. `anatomy.refresh-fast`, `anatomy.refresh-deep` — implemented
15. _(next: bug-triage + specflow-lint/verify scheduling as one three-loop round; then **anatomy-refresh fast/deep — prioritized: the fast tier is the load-bearing loop for anatomy freshness, since drift is the default state on active projects between scans (hygiene caught it this round; the fast loop should own it)**; test-runner last, on its harness)_
