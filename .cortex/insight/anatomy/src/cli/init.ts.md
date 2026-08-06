---
path: src/cli/init.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 3
size_lines: 656
size_tokens: 7449
centrality: high
built_at_commit: "0998c19"
source_sha256: "059e6482c586d28a5c483d0139832114dec6e5bcfc4c99f3446e69bf81183e92"
---
# src/cli/init.ts

## Purpose
Implements `cortex init` — the day-1 bootstrap that scaffolds the entire `.cortex/` knowledge layer (compass, atlas, archive, insight, pulse skeletons plus config), installs Skill bundles, drafts deterministic preferences from project metadata, scaffolds the two spec trees, migrates a legacy `bugs.md`, compiles the constellation, manages the CLAUDE.md block, registers Claude Code hooks and the git post-commit hook, writes Desktop scheduled tasks (with `--partial` skill-gating and, new this pass, profile-scoping), and self-validates — all as pure deterministic file I/O with zero LLM/network calls. New this pass (spec `core-cli.init-profile` Rule 2): `InitOptions.profile` accepts an optional `ProcessProfile` (`'specflow'` | `'superpowers'`); `init` stamps it into a fresh project's `cortex.config.json` via `freshConfig(profile)` (defaulting to `DEFAULT_PROFILE` when omitted) and, on a `--force` re-init of an existing config, preserves whatever profile was already recorded unless the caller passes an explicit `--profile` to override it. Rules 4/10/11/12/13/17's actual mechanism (skills install, CLAUDE.md block, hooks merge, git hook, scheduled-task payload writer, the registration-summary lines) lives in `src/cli/scaffold.ts`, shared verbatim with `cortex sync`; this file imports that mechanism, re-exports the pieces external callers/tests still expect from `init.js`, and keeps only what is genuinely init-specific (preflight, gitignore, skeleton, preferences draft, spec-tree scaffolding, bugs.md migration, and the 17-rule orchestration itself).

## Main players
- `init` (lines 470–656) — the top-level orchestrator running the seventeen rules in sequence: preflight (including the B-013 nested-layer guard), gitignore, skeleton (now profile-aware), skills (via scaffold.ts), preferences, spec trees, bug migration, constellation compile, CLAUDE.md (via scaffold.ts), hooks (via scaffold.ts), git hook (via scaffold.ts), scheduled tasks (via scaffold.ts, itself now profile-scoped), self-validation, summary. [critical]
- `freshConfig` (lines 133–137) — builds a fresh config object for a brand-new project, spreading `CONFIG_DEFAULTS` and stamping `profile: profile ?? DEFAULT_PROFILE` (NEW — previously config defaults carried no profile key at all). [critical]
- `writeSkeleton` (lines 139–207) — now takes a `profile: ProcessProfile | undefined` parameter; writes every `.cortex/` directory's `_index.md`, merges `cortex.config.json` (calling `freshConfig(profile)` on the fresh-write branch, and on the existing-config-merge branch spreading an explicit `profile` override only when one was passed — an already-recorded profile is otherwise preserved rather than reset), preserves compass leaves, pre-creates the pulse/ subdivided layout, and delegates to `scaffoldInsight`/`scaffoldArchive`. [critical]
- `findEnclosingCortexLayer` (lines 447–457) — B-013 fix: walks `absRoot`'s ancestor chain looking for a directory literally named `.cortex` that also carries its own `cortex.config.json` (the definitive layer marker); returns `{layerDir, projectRoot}` on a hit or `null`. A directory merely named `.cortex` with no config doesn't count. [critical]
- `draftPreferences` (lines 225–311) — deterministically extracts stack facts (package.json, tsconfig.json, eslint config, pyproject.toml, README.md) into a draft `.cortex/compass/preferences.md`, never overwritten once written. [supporting]
- `migrateBugs` (lines 352–432) — one-time migration of a legacy root `bugs.md` into `.cortex/compass/bugs/B-NNN-<slug>.md` files with monotonic numbering, leaving a deprecation marker behind. [supporting]
- `scaffoldSpecTrees` (lines 317–335) — scaffolds `.specflow/specs/` and `.specflow/specs-business/` skeletons only when absent. [supporting]

Re-imported from src/cli/scaffold.ts (now the mechanism's home, no longer defined here) and re-exported for compatibility: `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION`, `INSIGHT_GIT_HOOK_INVOCATION`, `RETIRED_GIT_HOOK_INVOCATION`, and the `TaskSkillGap`/`ScheduledTasksResult` types.

## Insights
- **New this pass — `--profile` preservation semantics (Rule 2/16, lines 154–165):** a plain `cortex init` on a fresh project has nothing recorded yet, so `freshConfig(profile)` simply applies the flag or the default. The subtler path is a `--force` re-init of an EXISTING `.cortex/`: the merge spreads `...CONFIG_DEFAULTS, ...existing, schemaVersion: SCHEMA_VERSION, ...(profile !== undefined ? { profile } : {})` — an explicit `--profile` flag overrides whatever the existing config says, but with NO flag the already-recorded `profile` from `existing` survives untouched (it is NOT reset to `DEFAULT_PROFILE`). This matters because this path is only reachable under `--force` (a plain re-init on an existing `.cortex/` refuses and defers to `cortex sync`), and a forced repair silently flipping a `superpowers` project back to `specflow` just because the flag was omitted would be a real regression, not a cosmetic one.
- The sync-round factoring moved roughly 280 lines of mechanism (Rules 4, 10, 11, 12, 13, 17's actual file-writing logic) out to `src/cli/scaffold.ts`, byte-for-byte unchanged behaviourally — this file's own existing ACs/tests keep passing unmodified.
- `init` refuses outright (exit 2, nothing written) on two preflight conditions: non-macOS platform, and an existing `.cortex/` without `--force` — the refusal message names `cortex sync` as the recommended repair/upgrade path.
- `noLlm`, `claudeBin`, and `timeoutMs` on `InitOptions` are accepted purely for CLI compatibility with the retired v1/v2 purpose pass — they are now no-ops.
- Rule 15's summary builds its scheduled-tasks registration block via the shared `registrationSummaryLines(regStatus)` helper (in scaffold.ts) — `cortex sync`'s own summary tail calls the exact same helper, so the two commands render an identical instruction block. Profile-scoping does not change this summary block's shape — `writeScheduledTasks` (inside scaffold.ts) already filters `SCHEDULED_TASKS` by profile before `init` ever sees the counts.
- Rule 3's `writeSkeleton` pre-creates the pulse/ subdivided layout (`reports/`, `state/`, `state/reads/`, `extraction/`) on day-1 purely so a fresh project shows the organised structure immediately; every writer already `mkdir -p`s its target on demand.
- `--partial` gates Desktop scheduled-task registration on whether each task's required skill dir exists under `.claude/skills/`; combined with profile-scoping, a `superpowers` project run with `--partial` sees BOTH filters applied — Bucket-3 bundles are dropped by profile before `--partial`'s skill-presence check ever runs on them.
- B-013 fix: `init` refuses (exit 2, nothing written, not bypassable by `--force`) when the target directory itself is, or sits beneath, an existing Cortex layer.

## File map
- Lines 1–54: module doc comment, imports (now including `DEFAULT_PROFILE`/`ProcessProfile` from `./profile.js`), `InitOptions`/`InitResult` interfaces (`InitOptions.profile` new).
- Lines 94–109: small fs helpers (`writeIfAbsent`, `slugify`) and Rule 2 gitignore (`updateGitignore`).
- Lines 133–137: `freshConfig` (NEW — profile-stamping fresh-config builder).
- Lines 139–207: Rule 3 skeleton (`writeSkeleton`, now `profile`-parameterised) and `readConfig`.
- Lines 218–223: Rule 4 note — skills install mechanism moved to scaffold.ts.
- Lines 225–311: Rule 7 preferences draft (`draftPreferences`).
- Lines 317–335: Rule 8 spec-tree scaffolding (`scaffoldSpecTrees`).
- Lines 341–432: Rule 9 legacy bugs.md migration (`extractField`, `migrateBugs`).
- Lines 434–439: Rules 10–13 & 17 note — CLAUDE.md/hooks/git-hook/scheduled-tasks mechanism moved to scaffold.ts.
- Lines 447–457: `findEnclosingCortexLayer` (B-013 nested-layer guard helper).
- Lines 470–656: `init` — the full seventeen-rule orchestration and summary assembly, destructuring `opts.profile` (line 477) and threading it through `writeSkeleton` (line 521).

## Connections
Uses:
- src/archive/scaffold.ts: `scaffoldArchive` — scaffolds the archive module during Rule 3
- src/cli/profile.ts: `DEFAULT_PROFILE`, `ProcessProfile` (NEW) — the profile stamped into fresh configs
- src/cli/scaffold.ts: `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION` — the Rules 4/10/11/12/13/17 mechanism, factored out and shared with `cortex sync`.
- src/cli/templates.ts: config defaults, gitignore lines, index templates, scheduled-task roster — nearly every literal string init writes.
- src/insight/scaffold.ts: `scaffoldInsight` — scaffolds the insight module during Rule 3
- src/paths.ts: `specsRoot`, `businessRoot`, `SPECS_REL`, `BUSINESS_REL` — Rule 8 spec-tree paths
- src/schema/validate.ts: `validate` — Rule 14 self-validation

Used by:
- src/cli/cli.ts: calls `init()` as the fallback verb when no other `argv[0]` matches, now forwarding a validated `--profile` value
- src/cli/tasks-register.ts: dynamically imports `writeScheduledTasks` inside `registerTasks` to refresh payloads before the registry upsert (re-exported from init.ts, sourced from scaffold.ts)

Semantically related (not imports):
- src/cli/sync.ts: the sibling command sharing the exact same scaffold.ts mechanism and the same `readProfile`-based scoping for scheduled-task payloads
- src/constellation/compile.ts: `init` dynamically imports `compile` to build the constellation as part of Rule 3's citation-graph step
- src/cli/tasks-register.ts: `init` dynamically imports `registrationStatus` for the Rule 15 read-only Desktop-registration summary

## Query pointers
- If you need the exact set of files/directories `cortex init` writes, also read src/cli/templates.ts (every template literal lives there) and src/cli/scaffold.ts (the shared write mechanism).
- If you need the `--profile` flag's validation and CLI-level parsing, also read src/cli/cli.ts and src/cli/profile.ts (`PROCESS_PROFILES`, `isProcessProfile`).
- If you need to see how the profile actually changes what gets written (not just recorded), also read src/cli/templates.ts's `scopeTaskToProfile` and src/cli/scaffold.ts's `writeScheduledTasks`.
- If you need the scheduled-task naming scheme, also read src/cli/task-scoping.ts.
- If you need the Desktop app registration mechanism (plan/register/verify), also read src/cli/tasks-register.ts.
- If you need to compare init's day-1 path against the existing-project repair/upgrade path, also read src/cli/sync.ts — both call the identical scaffold.ts functions.
