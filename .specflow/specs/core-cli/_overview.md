# Core CLI — Overview

## What this is

The deterministic Node.js CLI binary surface — every `cortex` command — with no LLM calls. It owns the day-1 `cortex init` bootstrap (the 13-step workflow) and the deterministic plumbing behind scans, status, the constellation server invocation, test runs, and per-loop invocations.

## What it covers

**Specs written:**

- `core-cli.init` — the day-1 bootstrap: `.cortex/` skeleton + config, anatomy scan, inline agentic purpose pass (subprocess boundary), preferences draft, spec-tree scaffolding, legacy `bugs.md` migration, CLAUDE.md managed block, hooks + git hook + the five Desktop scheduled-task bundle payloads (payloads only — registration happens in a Desktop session via the `cortex-register-tasks` skill, and init prints the instruction block; B-009 final mechanism), self-validation, summary.

- `core-cli.sync` — the standing repair/upgrade path for a project that already has `.cortex/`: CLAUDE.md managed-block repair, localisation-aware `_index.md` refresh, skill-bundle upgrade (unmodified-silent, user-modified-preserved), hooks merge, git hook, scheduled-task payload refresh, self-validation, summary — factoring the same scaffolding steps init uses, with a version gate that defers to `cortex migrate` on a MAJOR schema lag instead of half-upgrading.

- `core-cli.task-scoping` — project-scoped scheduled-task names (schema §9.1: plain `<slug>-<canonical>` with a path-hash fallback on collision, ownership marker, five canonical bundle names), project-scoped recognition in init/--partial, and the `cortex tasks rename` migration across every prior naming generation.

- `core-cli.tasks-register` — `cortex tasks plan` / `register` / `verify`: the authoritative registration plan the `cortex-register-tasks` skill consumes (the primary, in-Desktop-session mechanism via the app's own `mcp__scheduled-tasks__*` tools), the guarded app-closed direct-write fallback into the app's `scheduled-tasks.json` (cadence table, backup, atomic write, foreign entries preserved, refuses while the app runs), and verification against silent registry loss (B-009 resolution, final mechanism).

_Planned coverage (not yet written):_

- `cortex scan` — incremental scanning plus `--full` (CLI wrapper over `anatomy.scanner`)
- `cortex status`
- `cortex constellation` — launching the read-only renderer
- `cortex test-run`
- Per-loop invocations: `cortex pulse-hygiene`, `cortex pulse-distil`, `cortex loop-*`
- The pulse review CLI: `cortex pulse-list` / `pulse-accept` / `pulse-reject`

## Why it's grouped this way

This domain is deterministic plumbing only — predictable, testable command surfaces with no LLM calls. All agentic behaviour is deliberately excluded and lives in `loops/`, `pulse/`, and `specflow/`. The CLI stays the source of truth that those agentic layers invoke.

The bootstrap (`cortex init`) belongs here because it is mechanical sequencing of file I/O and scaffold creation, not agentic reasoning.

## Related groups

- Business outcomes for this domain: `../../specs-business/core-cli/`
- Implements the contract: `../schema/`
- Invokes the scanner: `../anatomy/`
- Invokes the self-maintenance loops: `../pulse/`, `../loops/`
- Launches the renderer: `../constellation/`

- `core-cli.init-profile` — `cortex init --profile specflow|superpowers`: the process-profile field in `cortex.config.json` (schema §10.1) and the one thing that reads it — scheduled-task writing, which scopes Bucket-3 spec-loop members out under a non-specflow profile while every Bucket-1 knowledge loop stays scheduled.
