---
path: src/cli/scaffold.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 2
size_lines: 484
size_tokens: 5389
centrality: medium
built_at_commit: "bcbda52"
source_sha256: "08b5c98251478092a61649b4140038f03494a1f7119b93b14bb6d39edb9dfdaa"
---
# src/cli/scaffold.ts

## Purpose
The shared scaffolding mechanism behind both `cortex init` (Rules 4, 10, 11, 12, 13) and `cortex sync` (which exposes this same factoring per its own spec Notes: init and sync call the identical mechanism here; sync layers its own upgrade judgment on top via the `.cortex-installed.json` marker helpers). Moved verbatim out of `src/cli/init.ts` in the sync-round factoring — no behavioural change to init from the move, every function is byte-for-byte the same logic init previously had inline. Exports: `packageRoot`, `createPromptInterface`/`promptYesNo` (the B-012 shared-readline-interface fix for asking several sequential y/N questions in one run without dropping buffered input), `installSkills` (Rule 4), `upsertClaudeMd` (Rule 10), `mergeSettings` (Rule 11), `installGitHook`/`stripRetiredGitHookLines`/the three `GIT_HOOK_INVOCATION` constants (Rule 12), `writeScheduledTasks`/`TaskSkillGap`/`ScheduledTasksResult` (Rules 13 & 17), `registrationSummaryLines` (the shared instruction-block tail both commands render identically), and the `.cortex-installed.json` marker helpers (`sha256Hex`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `INSTALLED_MARKER_FILENAME`) — generic hash/marker primitives that live here so sync.ts's own judgment logic stays focused on its decision tree; nothing in this file writes the marker itself, only sync.ts does. Deterministic Core: pure file I/O, no LLM, no network.

## Connections
Uses:
- src/cli/templates.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS` — the literal content `upsertClaudeMd`/`writeScheduledTasks` write.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` — project-scoped task naming for `writeScheduledTasks`'s writing, collision resolution, and retired-task removal.

Used by:
- src/cli/init.ts: imports `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION` for its Rules 4/10/11/12/13/17, and re-exports several of these plus the two task-result types for external compatibility.
- src/cli/sync.ts: imports `packageRoot`, `promptYesNo`, `createPromptInterface`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `registrationSummaryLines`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME` for its Rules 3/5/6/7/8 (CLAUDE.md, skill-bundle upgrade, hooks, git hook, scheduled-task payload refresh).
