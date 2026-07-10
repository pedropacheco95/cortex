---
path: src/cli/tasks-register.ts
extracted_at: 2026-07-10T10:00:00Z
extraction_level: 2
size_lines: 474
size_tokens: 4947
centrality: medium
built_at_commit: "5f24181"
source_sha256: "b26a4c77fc0a2b2c98c736b4b7144f7166a6b000728d4a05c635b1f0c8b75f55"
---
# src/cli/tasks-register.ts

## Purpose
Implements `cortex tasks plan` / `cortex tasks register` / `cortex tasks verify` (spec core-cli.tasks-register; B-009 final resolution). `tasksPlan` prints the authoritative, read-only registration plan (`--json` for the machine shape the `cortex-register-tasks` skill consumes) — Core stays the single source of truth for ids, cadences, and payload paths. `registerTasks` is the direct-write FALLBACK: it refuses to run while the Claude Desktop app is running (the app loads `scheduled-tasks.json` into memory once at launch and rewrites it wholesale on every task event, so a concurrent write would be silently clobbered or, if malformed, make the app wipe every task). `verifyTasks` is the read-only silent-loss detector for registry wipes observed after app updates (#49276); it is never restricted. `registrationStatus` is the read-only check `cortex init` uses to print its register-in-Desktop instruction block. The PRIMARY registration path is the `cortex-register-tasks` skill running inside a Claude Desktop session, using the app's own `mcp__scheduled-tasks__*` tools — this module exists to supply that skill's plan and to cover the app-closed fallback/verification cases.

## Connections
Uses:
- src/cli/templates.ts: `SCHEDULED_TASKS` — the roster of five bundle definitions each plan/register row is built from
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName` — task naming for plan rows, registry upsert, and retired-entry cleanup
- src/cli/init.ts: `writeScheduledTasks` — reused by `registerTasks` to refresh SKILL.md payloads on disk before upserting the app's registry entries

Used by:
- src/cli/cli.ts: `cortex tasks plan|register|verify` dynamically imports `tasksPlan`, `registerTasks`, `verifyTasks`, `desktopAppRunning` and supplies the real home/app-support-dir/process-check
- src/cli/init.ts: dynamically imports `registrationStatus` for the Rule 15 read-only registration summary printed at the end of `cortex init`
