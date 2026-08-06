# Loops — Overview

## What this is

The Cortex loops plus the shared loop infrastructure built once and reused. A Cortex loop maintains `.cortex/` integrity, writes only to `.cortex/pulse/` (except the test-runner), uses the standard skill/CLI surface, and composes with the other loops. Each loop stays **individually invocable** — by its CLI verb (`cortex loop-spec-drift`, `cortex pulse-hygiene`, …) or via `/cortex-loop` naming the loop, since `loops.cortex-loop-bundle` merged the eleven per-loop skill bundles into one callable-only `cortex-loop` skill dispatching to a reference file per loop; scheduling is a thinner wrapper on top — the individual loops are grouped into **five scheduled-task bundles** (schema §9.1: `daily`, `weekly-curation`, `weekly-quality`, `test-runner`, `monthly-review`), each bundle running its member loops sequentially and failure-isolated. The bundle grouping is a registration/cadence concern owned by `core-cli.task-scoping` / `core-cli.tasks-register`; the loop specs below each own one loop's behaviour regardless of which bundle schedules it.

## What it covers

**Specs written:**

- `loops.session-reading` — the shared transcript substrate: project-slug resolution, project-isolated session enumeration, tolerant JSONL parsing, message extraction; read-only, format-drift-defensive.

- `loops.writer-verifier` — the generic writer/verifier harness: isolated-workspace writer, independence-preserving blind verifier, checks-gate-first loop, first-class iteration limit, pass/fail/unavailable outcomes with full verdict audit trail.

- `loops.rule-decay` / `loops.atlas-staleness` / `loops.onboarding-drift` / `loops.spec-drift` — the four curation reviewers: retirement/re-verify/refresh/drift candidates with evidence, each writing only its own always-write pulse report.

- `loops.skill-suggest` — **SUPERSEDED** (owner decision): retired as a standalone loop; its workflow-mining judgment folds into `pulse.distil` as one extra lens (workflow-shaped patterns become `skill-proposal`-typed pulse suggestions). Spec retained for lineage with a banner pointing at `pulse/distil.spec.md`.

- `loops.bug-triage` — daily ledger triage: fill-only classification of unclassified open bugs, compare-and-report on classified ones (never overwrites a human's judgment).
- `loops.lint-scheduled` / `loops.verify-scheduled` — the daily paper trail: validator-backed structural report and owed-tests coverage report (incl. the §8.2 covers-completeness check; deferrals distinguished).

- `loops.cortex-loop-bundle` — the eleven loop/pulse skill bundles become one callable-only `cortex-loop` skill with a reference file per loop: ~297 tokens off the resident skill listing, with cadences, models, CLI verbs, report paths, and failure isolation unchanged. Profile scoping moves from dropping a skill directory to the worded SKIP instruction the payload already carried.

- `loops.test-runner` — the only code-writing loop: tiered runs, seven-type classification gate (unclassifiable → report-only), harness-verified fixes as branch + five-field PR, budget exhaustion → ledger case file that suppresses retries until resolved.

_Planned (not yet written):_

- The Cortex loops and their composition properties
- The Desktop scheduled-task SKILL.md writer
- The session-reading layer
- The writer/verifier sub-agent harness
- The pulse-accept/reject CLI wiring
- The dismissed-suggestions memory (90-day window)

## Why it's grouped this way

This domain owns autonomous maintenance work and its shared substrate. Cortex is loop-*memory*, not a loop runtime — Claude Code provides the scheduler, sub-agents, and connectors; Cortex provides the persistent state the loops read and write. The two original self-maintenance loops live in `pulse/`; this domain holds the wider family and the infrastructure they share.

The shared substrate is deliberately built once here so every loop reuses the same session-reading layer, sub-agent harness, and dismissed-suggestions memory rather than reimplementing them.

## Related groups

- Business outcomes for this domain: `../../specs-business/loops/`
- The two original self-maintenance loops: `../pulse/`
- Standard CLI surface the loops invoke: `../core-cli/`
- Cortex-aware skills: `../specflow/`
