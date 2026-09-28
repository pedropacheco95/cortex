---
path: src/cli/scaffold.ts
extracted_at: 2026-09-22T00:00:00Z
extraction_level: 2
size_lines: 771
size_tokens: 8840
centrality: high
built_at_commit: "a66041b"
source_sha256: "ddfd5f267d6b42f82807e830b270db9bcffd05aa17ac3f02e86c49c2b4d6ba1c"
---
# src/cli/scaffold.ts

## Purpose
The shared scaffolding mechanism behind both `cortex init` (Rules 4, 10, 11, 12, 13) and `cortex sync` (which exposes this same factoring per its own spec Notes: init and sync call the identical mechanism here; sync layers its own upgrade judgment on top via the `.cortex-installed.json` marker helpers). Carries two paired, declarative version-chains for skill-bundle lifecycle (spec `core-cli.sync` Rules 5 & 6): the **retirement chain** (`SKILL_MIGRATIONS`/`retiredBundles`, B-015) names bundles that should NOT exist in `.claude/skills/` at a given package version, re-evaluated every sync run so a declined removal is simply re-offered; its mirror the **additions chain** (`SKILL_ADDITIONS`/`bundleAddedAt`/`shouldInstallAbsent`) names bundles that STARTED shipping at a given version, letting `sync` tell "never offered this project" apart from "developer deliberately deleted it" for an absent bundle. `listSkillBundles` remains the single source of truth for "which directories under `skills/` are real skill bundles" (contains a `SKILL.md`), shared by `installSkills`, `sync.ts`'s `syncSkillBundles`, and both chains' safety checks. New this pass: `upsertClaudeMd(root, config?)` now accepts an optional config object and renders the CLAUDE.md block from `cortex.config.json` as it stands — reading the file itself when the caller passes none — so both `init` (after it writes the config) and `sync` share one path to the 3.4 fifth-revision placement/visibility tail (`templates.ts`'s `placementTail`); a missing or unparseable config renders `unknown` visibility and no notes-directory sentence. `cortexHookEntries` grew four more hook registrations beyond the original SessionStart/pre-write/post-write triad — `SessionEnd` (explicit 10s timeout, lifting the shared 1.5s default) and its `Stop` companion (3.3 third revision, hooks.session-end), plus `PreToolUse Grep|Bash` (search-annotate, 3.4 second revision) and `UserPromptSubmit` (prompt-route, 3.4 third revision) — both of the latter two always registered regardless of `hooks.preRead`, which gates only the Read pair. `HookEntry` gained an optional `timeout` field, threaded onto the inner `{ type: 'command', ... }` object only when set. Also exports `createPromptInterface`/`promptYesNo` (B-012 shared-readline-interface fix), `installGitHook`/`stripRetiredGitHookLines`/the three `GIT_HOOK_INVOCATION` constants, and the `.cortex-installed.json` marker helpers (`sha256Hex`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `INSTALLED_MARKER_FILENAME`) that `sync.ts`'s own judgment logic is built on — nothing in this file writes the marker itself, only `sync.ts` does. Deterministic Core: pure file I/O, no LLM, no network.

## Connections
Uses:
- src/cli/templates.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS`, `scopeTaskToProfile` — the literal content and profile-scoping transform `writeScheduledTasks` applies; `claudeMdBlock` is now called with the config object `upsertClaudeMd` resolved.
- src/cli/profile.ts: `readProfile` — the profile `writeScheduledTasks` scopes `SCHEDULED_TASKS` against.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` — project-scoped task naming for both the retired-canonical cleanup and the live-task write path.

Used by:
- src/cli/init.ts: imports `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION`.
- src/cli/sync.ts: imports the same mechanism plus `packageRoot`, `promptYesNo`, `createPromptInterface`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME`, `listSkillBundles`, `retiredBundles`, and — new this pass — `shouldInstallAbsent`, the Rule 5 additions-chain predicate `sync.ts`'s `syncSkillBundles` now calls before installing an absent bundle.
