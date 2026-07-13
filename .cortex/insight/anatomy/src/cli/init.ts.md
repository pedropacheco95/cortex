---
path: src/cli/init.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 3
size_lines: 888
size_tokens: 9742
centrality: high
built_at_commit: "fd7b55b"
source_sha256: "c0f03cdd03d746a03e677421bb3a19189ba2e4f0b03377647c6014d68ef0f3cd"
---
# src/cli/init.ts

## Purpose
Implements `cortex init` — the day-1 bootstrap that scaffolds the entire `.cortex/` knowledge layer (compass, atlas, archive, insight, pulse skeletons plus config), installs Skill bundles, drafts deterministic preferences from project metadata, scaffolds the two spec trees, migrates a legacy `bugs.md`, compiles the constellation, manages the CLAUDE.md block, registers Claude Code hooks and the git post-commit hook, writes Desktop scheduled tasks (with `--partial` skill-gating), and self-validates — all as pure deterministic file I/O with zero LLM/network calls (the v1/v2 anatomy scan and inline purpose pass are retired in v3, build-order-v3 step 7).

## Main players
- `init` (lines 711–888) — the top-level orchestrator running the seventeen rules in sequence: preflight, gitignore, skeleton, skills, preferences, spec trees, bug migration, constellation compile, CLAUDE.md, hooks, git hook, scheduled tasks, self-validation, summary. [critical]
- `writeSkeleton` (lines 117–174) — writes every `.cortex/` directory's `_index.md`, merges `cortex.config.json`, preserves compass leaves, pre-creates the pulse/ subdivided layout (`reports/`, `state/`, `state/reads/`, `extraction/`), and delegates to `scaffoldInsight`/`scaffoldArchive`. [critical]
- `installSkills` (lines 205–228) — copies bundled Skill directories into `.claude/skills/`, prompting to overwrite an existing bundle unless `--yes`/`--force`. [critical]
- `draftPreferences` (lines 234–320) — deterministically extracts stack facts (package.json, tsconfig.json, eslint config, pyproject.toml, README.md) into a draft `.cortex/compass/preferences.md`, never overwritten once written. [supporting]
- `migrateBugs` (lines 361–441) — one-time migration of a legacy root `bugs.md` into `.cortex/compass/bugs/B-NNN-<slug>.md` files with monotonic numbering, leaving a deprecation marker behind. [supporting]
- `upsertClaudeMd` (lines 447–475) — inserts or updates the `<!-- cortex:start -->...<!-- cortex:end -->` managed block in the project's CLAUDE.md. [critical]
- `mergeSettings` (lines 502–537) — deep-merges the five Cortex hook registrations into `.claude/settings.json` without disturbing unrelated hooks. [critical]
- `installGitHook` / `stripRetiredGitHookLines` (lines 590–617, 573–588) — installs/updates `.git/hooks/post-commit` to call `cortex insight-refresh-fast`, idempotently stripping the retired `cortex anatomy-refresh-fast` invocation from a pre-existing hook. [critical]
- `writeScheduledTasks` (lines 654–705) — now exported (previously module-private): writes the five canonical Desktop scheduled-task bundle SKILL.md files under project-scoped names, removes retired canonical tasks for this project, and (with `--partial`) skips tasks whose required skill directories are absent. Reused directly by `src/cli/tasks-register.ts`'s `registerTasks`. [critical]

## Insights
- `init` refuses outright (exit 2, nothing written) on two preflight conditions: non-macOS platform, and an existing `.cortex/` without `--force` — this is the one path where Core deliberately writes nothing rather than degrading.
- `noLlm`, `claudeBin`, and `timeoutMs` on `InitOptions` are accepted purely for CLI compatibility with the retired v1/v2 purpose pass — they are now no-ops, a trace of the anatomy-to-insight migration (build-order-v3 step 7).
- `confirmOverwrite` treats "no TTY" as an implicit "preserve the user's copy" — non-interactive runs (CI, scripted `cortex init`) never overwrite an existing skill bundle even without `--yes`.
- Exit code 3 (the old purpose-pass auth failure) is explicitly retired in the comments — only 0 (success) and 1 (self-validation failure) remain, plus preflight's 2.
- `writeScheduledTasks`'s default mode (no `--partial`) still registers a task whose required skill is missing, only warning about the gap — `--partial` is the only mode that actually gates registration on skill presence.
- `writeScheduledTasks`, `ScheduledTasksResult`, and `TaskSkillGap` are now exported (were module-private) specifically so `src/cli/tasks-register.ts`'s `registerTasks` can reuse the same payload writer rather than duplicating the SKILL.md-writing logic — the roster refresh always runs first inside `registerTasks`, before the registry upsert.
- Rule 15's summary no longer claims scheduled tasks are "registered" once payloads are written (B-009): it calls the new read-only `registrationStatus` (from `tasks-register.ts`) to check the Desktop app's actual `scheduled-tasks.json`, and prints the `cortex-register-tasks` skill instruction block — including an explicit warning that the app requires one live approval per task creation — only when something is unregistered.
- Rule 3's `writeSkeleton` now also pre-creates the pulse/ subdivided layout (`reports/`, `state/`, `state/reads/`, `extraction/`) on day-1 (B-008 pulse reorg) purely so a fresh project shows the organised structure immediately — every writer already `mkdir -p`s its target on demand, so this is a first-impression nicety, not a functional dependency; `pulse/` stays gitignored, so no `.gitkeep` is written into the pre-created dirs.

- The post-scaffold instruction block warns that the Desktop app offers no "always allow" for scheduled-task creation and prompts once per bundle (5 prompts) — added after real use showed the app demanding per-call approval with no batch-approve. (claude-sessions/pedropacheco1/3bac199d-2d61-471f-b48b-f91c871cd282)
- `--partial` gates Desktop scheduled-task registration on whether each task's required skill dir exists under `.claude/skills/`; tasks whose skill is absent are skipped (named in the summary) rather than erroring — this is what makes `cortex init` usable mid-construction as loop skills are added incrementally; re-running `--partial` later auto-registers newly-available tasks. (claude-sessions/pedropacheco1/75ef81a0-97bd-4fa1-8c2a-72ddb2d98405)
## File map
- Lines 1–67: module doc comment, imports, `InitOptions`/`InitResult` interfaces.
- Lines 78–93: small fs helpers (`writeIfAbsent`, `slugify`) and Rule 2 gitignore (`updateGitignore`, lines 99–111).
- Lines 117–182: Rule 3 skeleton (`writeSkeleton`, now also pre-creating the pulse/ subdivided layout) and `readConfig`.
- Lines 188–228: Rule 4 skills install (`packageRoot`, `confirmOverwrite`, `installSkills`).
- Lines 234–320: Rule 7 preferences draft (`draftPreferences`).
- Lines 326–344: Rule 8 spec-tree scaffolding (`scaffoldSpecTrees`).
- Lines 350–441: Rule 9 legacy bugs.md migration (`extractField`, `migrateBugs`).
- Lines 447–475: Rule 10 CLAUDE.md managed block (`upsertClaudeMd`).
- Lines 481–537: Rule 11 hooks registration (`cortexHookEntries`, `mergeSettings`).
- Lines 539–617: Rule 12 git post-commit hook (`GIT_HOOK_INVOCATION` constants, `stripRetiredGitHookLines`, `installGitHook`).
- Lines 619–705: Rules 13 & 17 Desktop scheduled tasks (`TaskSkillGap`, `ScheduledTasksResult`, `missingRequiredSkills`, `writeScheduledTasks`) — all now exported.
- Lines 707–888: `init` — the full seventeen-rule orchestration and summary assembly, including the B-009 read-only registration-status check via `tasks-register.ts`.

## Connections
Uses:
- src/archive/scaffold.ts: `scaffoldArchive` — scaffolds the archive module during Rule 3
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` — project-scoped task naming for Rules 13/17 (writing, collision resolution, and the ownership-marker retired-task guard)
- src/cli/templates.ts: config defaults, gitignore lines, index templates, CLAUDE.md block, scheduled-task templates — nearly every literal string init writes
- src/insight/scaffold.ts: `scaffoldInsight` — scaffolds the insight module during Rule 3
- src/paths.ts: `specsRoot`, `businessRoot`, `SPECS_REL`, `BUSINESS_REL` — Rule 8 spec-tree paths
- src/schema/validate.ts: `validate` — Rule 14 self-validation

Used by:
- src/cli/cli.ts: calls `init()` as the fallback verb when no other `argv[0]` matches
- src/cli/tasks-register.ts: dynamically imports `writeScheduledTasks` inside `registerTasks` to refresh payloads before the registry upsert

Semantically related (not imports):
- src/constellation/compile.ts: `init` dynamically imports `compile` to build the constellation as part of Rule 3's citation-graph step
- src/cli/tasks-register.ts: `init` dynamically imports `registrationStatus` for the Rule 15 read-only Desktop-registration summary

## Query pointers
- If you need the exact set of files/directories `cortex init` writes, also read src/cli/templates.ts (every template literal lives there).
- If you need the scheduled-task naming scheme, also read src/cli/task-scoping.ts.
- If you need the Desktop app registration mechanism (plan/register/verify), also read src/cli/tasks-register.ts.
- If you need what changed at build-order-v3 step 7 (anatomy retirement), also read src/insight/scaffold.ts and src/constellation/compile.ts.
