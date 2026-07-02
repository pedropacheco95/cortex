# Loops — Overview

## What this is

The thirteen Cortex loops plus the shared loop infrastructure built once and reused. A Cortex loop maintains `.cortex/` integrity, writes only to `.cortex/pulse/` (except the test-runner), uses the standard skill/CLI surface, and composes with the other loops.

## What it covers

**Specs written:**

- `loops.session-reading` — the shared transcript substrate: project-slug resolution, project-isolated session enumeration, tolerant JSONL parsing, message extraction; read-only, format-drift-defensive.

- `loops.writer-verifier` — the generic writer/verifier harness: isolated-workspace writer, independence-preserving blind verifier, checks-gate-first loop, first-class iteration limit, pass/fail/unavailable outcomes with full verdict audit trail.

- `loops.rule-decay` / `loops.atlas-staleness` / `loops.onboarding-drift` / `loops.spec-drift` — the four curation reviewers: retirement/re-verify/refresh/drift candidates with evidence, each writing only its own always-write pulse report.

_Planned (not yet written):_

- The thirteen Cortex loops and their composition properties
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
