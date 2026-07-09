---
path: src/cli/init.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 3
size_lines: 828
size_tokens: 8907
centrality: high
built_at_commit: "8248c76"
source_sha256: "e52ec7fad409c27780562919c5b8671cc5b92373de832b319e897be477b77b61"
---
# src/cli/init.ts

## Purpose
Implements `cortex init` — the day-1 bootstrap that scaffolds the entire `.cortex/` knowledge layer (compass, atlas, archive, insight, pulse skeletons plus config), installs Skill bundles, drafts deterministic preferences from project metadata, scaffolds the two spec trees, migrates a legacy `bugs.md`, compiles the constellation, manages the CLAUDE.md block, registers Claude Code hooks and the git post-commit hook, writes Desktop scheduled tasks (with `--partial` skill-gating), and self-validates — all as pure deterministic file I/O with zero LLM/network calls (the v1/v2 anatomy scan and inline purpose pass are retired in v3, build-order-v3 step 7).

## Main players
- `init` (lines 672–827) — the top-level orchestrator running the seventeen rules in sequence: preflight, gitignore, skeleton, skills, preferences, spec trees, bug migration, constellation compile, CLAUDE.md, hooks, git hook, scheduled tasks, self-validation, summary. [critical]
- `writeSkeleton` (lines 104–151) — writes every `.cortex/` directory's `_index.md`, merges `cortex.config.json`, preserves compass leaves, and delegates to `scaffoldInsight`/`scaffoldArchive`. [critical]
- `installSkills` (lines 182–205) — copies bundled Skill directories into `.claude/skills/`, prompting to overwrite an existing bundle unless `--yes`/`--force`. [critical]
- `draftPreferences` (lines 211–297) — deterministically extracts stack facts (package.json, tsconfig.json, eslint config, pyproject.toml, README.md) into a draft `.cortex/compass/preferences.md`, never overwritten once written. [supporting]
- `migrateBugs` (lines 338–418) — one-time migration of a legacy root `bugs.md` into `.cortex/compass/bugs/B-NNN-<slug>.md` files with monotonic numbering, leaving a deprecation marker behind. [supporting]
- `upsertClaudeMd` (lines 424–452) — inserts or updates the `<!-- cortex:start -->...<!-- cortex:end -->` managed block in the project's CLAUDE.md. [critical]
- `mergeSettings` (lines 479–514) — deep-merges the five Cortex hook registrations into `.claude/settings.json` without disturbing unrelated hooks. [critical]
- `installGitHook` / `stripRetiredGitHookLines` (lines 567–594, 550–565) — installs/updates `.git/hooks/post-commit` to call `cortex insight-refresh-fast`, idempotently stripping the retired `cortex anatomy-refresh-fast` invocation from a pre-existing hook. [critical]
- `writeScheduledTasks` (lines 624–666) — writes the fourteen canonical Desktop scheduled-task SKILL.md files under project-scoped names, removes retired canonical tasks for this project, and (with `--partial`) skips tasks whose required skill directories are absent. [critical]

## Insights
- `init` refuses outright (exit 2, nothing written) on two preflight conditions: non-macOS platform, and an existing `.cortex/` without `--force` — this is the one path where Core deliberately writes nothing rather than degrading.
- `noLlm`, `claudeBin`, and `timeoutMs` on `InitOptions` are accepted purely for CLI compatibility with the retired v1/v2 purpose pass — they are now no-ops, a trace of the anatomy-to-insight migration (build-order-v3 step 7).
- `confirmOverwrite` treats "no TTY" as an implicit "preserve the user's copy" — non-interactive runs (CI, scripted `cortex init`) never overwrite an existing skill bundle even without `--yes`.
- Exit code 3 (the old purpose-pass auth failure) is explicitly retired in the comments — only 0 (success) and 1 (self-validation failure) remain, plus preflight's 2.
- `writeScheduledTasks`'s default mode (no `--partial`) still registers a task whose required skill is missing, only warning about the gap — `--partial` is the only mode that actually gates registration on skill presence.

## File map
- Lines 1–60: module doc comment, imports, `InitOptions`/`InitResult` interfaces.
- Lines 61–98: small fs helpers (`writeIfAbsent`, `slugify`) and Rule 2 gitignore (`updateGitignore`).
- Lines 100–151: Rule 3 skeleton (`writeSkeleton`) and `readConfig`.
- Lines 161–205: Rule 4 skills install (`packageRoot`, `confirmOverwrite`, `installSkills`).
- Lines 207–297: Rule 7 preferences draft (`draftPreferences`).
- Lines 299–321: Rule 8 spec-tree scaffolding (`scaffoldSpecTrees`).
- Lines 323–418: Rule 9 legacy bugs.md migration (`extractField`, `migrateBugs`).
- Lines 420–452: Rule 10 CLAUDE.md managed block (`upsertClaudeMd`).
- Lines 454–514: Rule 11 hooks registration (`cortexHookEntries`, `mergeSettings`).
- Lines 516–594: Rule 12 git post-commit hook (`GIT_HOOK_INVOCATION` constants, `stripRetiredGitHookLines`, `installGitHook`).
- Lines 596–666: Rules 13 & 17 Desktop scheduled tasks (`missingRequiredSkills`, `writeScheduledTasks`).
- Lines 668–827: `init` — the full seventeen-rule orchestration and summary assembly.

## Connections
Uses:
- src/archive/scaffold.ts: `scaffoldArchive` — scaffolds the archive module during Rule 3
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName` — project-scoped task naming for Rules 13/17
- src/cli/templates.ts: config defaults, gitignore lines, index templates, CLAUDE.md block, scheduled-task templates — nearly every literal string init writes
- src/insight/scaffold.ts: `scaffoldInsight` — scaffolds the insight module during Rule 3
- src/paths.ts: `specsRoot`, `businessRoot`, `SPECS_REL`, `BUSINESS_REL` — Rule 8 spec-tree paths
- src/schema/validate.ts: `validate` — Rule 14 self-validation

Used by:
- src/cli/cli.ts: calls `init()` as the fallback verb when no other `argv[0]` matches

Semantically related (not imports):
- src/constellation/compile.ts: `init` dynamically imports `compile` to build the constellation as part of Rule 3's citation-graph step

## Query pointers
- If you need the exact set of files/directories `cortex init` writes, also read src/cli/templates.ts (every template literal lives there).
- If you need the scheduled-task naming scheme, also read src/cli/task-scoping.ts.
- If you need what changed at build-order-v3 step 7 (anatomy retirement), also read src/insight/scaffold.ts and src/constellation/compile.ts.
