# Core CLI — Overview

## What this is

The deterministic Node.js CLI binary surface — every `cortex` command — with no LLM calls. It owns the day-1 `cortex init` bootstrap (the 13-step workflow) and the deterministic plumbing behind scans, status, the constellation server invocation, test runs, and per-loop invocations.

## What it covers

**Specs written:**

- `core-cli.init` — the day-1 bootstrap: `.cortex/` skeleton + config, anatomy scan, inline agentic purpose pass (subprocess boundary), preferences draft, spec-tree scaffolding, legacy `bugs.md` migration, CLAUDE.md managed block, hooks + git hook + twelve Desktop scheduled tasks, self-validation, summary.

- `core-cli.task-scoping` — project-scoped scheduled-task names (schema §9.1: slug + path-hash + canonical), project-scoped recognition in init/--partial, and the `cortex tasks rename` legacy migration.

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
