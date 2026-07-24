---
path: src/cli/init.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 3
size_lines: 588
size_tokens: 6555
centrality: high
built_at_commit: "bcbda52"
source_sha256: "d123e6457f63f8b14fabfaf283c16a09d26874bbd24cd12ae193b435b08433f7"
---
# src/cli/init.ts

## Purpose
Implements `cortex init` — the day-1 bootstrap that scaffolds the entire `.cortex/` knowledge layer (compass, atlas, archive, insight, pulse skeletons plus config), installs Skill bundles, drafts deterministic preferences from project metadata, scaffolds the two spec trees, migrates a legacy `bugs.md`, compiles the constellation, manages the CLAUDE.md block, registers Claude Code hooks and the git post-commit hook, writes Desktop scheduled tasks (with `--partial` skill-gating), and self-validates — all as pure deterministic file I/O with zero LLM/network calls. As of the sync-round factoring, Rules 4/10/11/12/13/17's actual mechanism (skills install, CLAUDE.md block, hooks merge, git hook, scheduled-task payload writer, the registration-summary lines) lives in the new `src/cli/scaffold.ts`, shared verbatim with `cortex sync`; this file imports that mechanism, re-exports the pieces external callers/tests still expect from `init.js`, and keeps only what is genuinely init-specific (preflight, gitignore, skeleton, preferences draft, spec-tree scaffolding, bugs.md migration, and the 17-rule orchestration itself).

## Main players
- `init` (lines 421–588) — the top-level orchestrator running the seventeen rules in sequence: preflight, gitignore, skeleton, skills (via scaffold.ts), preferences, spec trees, bug migration, constellation compile, CLAUDE.md (via scaffold.ts), hooks (via scaffold.ts), git hook (via scaffold.ts), scheduled tasks (via scaffold.ts), self-validation, summary. [critical]
- `writeSkeleton` (lines 126–183) — writes every `.cortex/` directory's `_index.md`, merges `cortex.config.json`, preserves compass leaves, pre-creates the pulse/ subdivided layout (`reports/`, `state/`, `state/reads/`, `extraction/`), and delegates to `scaffoldInsight`/`scaffoldArchive`. [critical]
- `draftPreferences` (lines 201–287) — deterministically extracts stack facts (package.json, tsconfig.json, eslint config, pyproject.toml, README.md) into a draft `.cortex/compass/preferences.md`, never overwritten once written. [supporting]
- `migrateBugs` (lines 328–408) — one-time migration of a legacy root `bugs.md` into `.cortex/compass/bugs/B-NNN-<slug>.md` files with monotonic numbering, leaving a deprecation marker behind. [supporting]
- `scaffoldSpecTrees` (lines 293–311) — scaffolds `.specflow/specs/` and `.specflow/specs-business/` skeletons only when absent. [supporting]

Re-imported from src/cli/scaffold.ts (now the mechanism's home, no longer defined here) and re-exported for compatibility: `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION`, `INSIGHT_GIT_HOOK_INVOCATION`, `RETIRED_GIT_HOOK_INVOCATION`, and the `TaskSkillGap`/`ScheduledTasksResult` types.

## Insights
- The sync-round factoring moved roughly 280 lines of mechanism (Rules 4, 10, 11, 12, 13, 17's actual file-writing logic — `installSkills`/`confirmOverwrite`, `upsertClaudeMd`, `cortexHookEntries`/`mergeSettings`, the git-hook constants and `stripRetiredGitHookLines`/`installGitHook`, `TaskSkillGap`/`ScheduledTasksResult`/`missingRequiredSkills`/`writeScheduledTasks`) out to `src/cli/scaffold.ts`, byte-for-byte unchanged behaviourally per that file's own doc comment — this file's own existing ACs/tests keep passing unmodified. `init.ts` now imports the functions it still calls directly and re-exports the subset (`writeScheduledTasks`, `stripRetiredGitHookLines`, the three `GIT_HOOK_INVOCATION` constants, the two task-result types) that other modules/tests still reach via `init.js` rather than `scaffold.js` directly.
- `init` refuses outright (exit 2, nothing written) on two preflight conditions: non-macOS platform, and an existing `.cortex/` without `--force` — this is the one path where Core deliberately writes nothing rather than degrading. The refusal message for an existing `.cortex/` now names `cortex sync` as the recommended repair/upgrade path (previously it only offered `--force`).
- `noLlm`, `claudeBin`, and `timeoutMs` on `InitOptions` are accepted purely for CLI compatibility with the retired v1/v2 purpose pass — they are now no-ops, a trace of the anatomy-to-insight migration (build-order-v3 step 7).
- Exit code 3 (the old purpose-pass auth failure) is explicitly retired in the comments — only 0 (success) and 1 (self-validation failure) remain, plus preflight's 2.
- Rule 15's summary now builds its scheduled-tasks registration block via the shared `registrationSummaryLines(regStatus)` helper (moved to scaffold.ts) instead of inlining the branching logic — `cortex sync`'s own summary tail calls the exact same helper, so the two commands render an identical instruction block.
- Rule 3's `writeSkeleton` pre-creates the pulse/ subdivided layout (`reports/`, `state/`, `state/reads/`, `extraction/`) on day-1 (B-008 pulse reorg) purely so a fresh project shows the organised structure immediately — every writer already `mkdir -p`s its target on demand, so this is a first-impression nicety, not a functional dependency; `pulse/` stays gitignored, so no `.gitkeep` is written into the pre-created dirs.
- The post-scaffold instruction block warns that the Desktop app offers no "always allow" for scheduled-task creation and prompts once per bundle (5 prompts) — added after real use showed the app demanding per-call approval with no batch-approve. (claude-sessions/pedropacheco1/3bac199d-2d61-471f-b48b-f91c871cd282)
- `--partial` gates Desktop scheduled-task registration on whether each task's required skill dir exists under `.claude/skills/`; tasks whose skill is absent are skipped (named in the summary) rather than erroring — this is what makes `cortex init` usable mid-construction as loop skills are added incrementally; re-running `--partial` later auto-registers newly-available tasks. (claude-sessions/pedropacheco1/75ef81a0-97bd-4fa1-8c2a-72ddb2d98405)

## File map
- Lines 1–54: module doc comment, imports (now including the scaffold.ts mechanism imports and re-exports), `InitOptions`/`InitResult` interfaces.
- Lines 87–102: small fs helpers (`writeIfAbsent`, `slugify`) and Rule 2 gitignore (`updateGitignore`).
- Lines 126–191: Rule 3 skeleton (`writeSkeleton`, pre-creating the pulse/ subdivided layout) and `readConfig`.
- Lines 194–199: Rule 4 note — skills install mechanism moved to scaffold.ts.
- Lines 201–287: Rule 7 preferences draft (`draftPreferences`).
- Lines 293–311: Rule 8 spec-tree scaffolding (`scaffoldSpecTrees`).
- Lines 317–408: Rule 9 legacy bugs.md migration (`extractField`, `migrateBugs`).
- Lines 410–415: Rules 10–13 & 17 note — CLAUDE.md/hooks/git-hook/scheduled-tasks mechanism moved to scaffold.ts.
- Lines 417–588: `init` — the full seventeen-rule orchestration and summary assembly, including the B-009 read-only registration-status check via `tasks-register.ts` and the shared `registrationSummaryLines` tail.

## Connections
Uses:
- src/archive/scaffold.ts: `scaffoldArchive` — scaffolds the archive module during Rule 3
- src/cli/scaffold.ts: `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION` — the Rules 4/10/11/12/13/17 mechanism, factored out and shared with `cortex sync`.
- src/cli/templates.ts: config defaults, gitignore lines, index templates, scheduled-task roster — nearly every literal string init writes.
- src/insight/scaffold.ts: `scaffoldInsight` — scaffolds the insight module during Rule 3
- src/paths.ts: `specsRoot`, `businessRoot`, `SPECS_REL`, `BUSINESS_REL` — Rule 8 spec-tree paths
- src/schema/validate.ts: `validate` — Rule 14 self-validation

Used by:
- src/cli/cli.ts: calls `init()` as the fallback verb when no other `argv[0]` matches
- src/cli/tasks-register.ts: dynamically imports `writeScheduledTasks` inside `registerTasks` to refresh payloads before the registry upsert (now re-exported from init.ts, sourced from scaffold.ts)

Semantically related (not imports):
- src/cli/sync.ts: the sibling command sharing the exact same scaffold.ts mechanism, layering its own `.cortex-installed.json` marker-judged upgrade logic on top
- src/constellation/compile.ts: `init` dynamically imports `compile` to build the constellation as part of Rule 3's citation-graph step
- src/cli/tasks-register.ts: `init` dynamically imports `registrationStatus` for the Rule 15 read-only Desktop-registration summary

## Query pointers
- If you need the exact set of files/directories `cortex init` writes, also read src/cli/templates.ts (every template literal lives there) and src/cli/scaffold.ts (the shared write mechanism).
- If you need the scheduled-task naming scheme, also read src/cli/task-scoping.ts.
- If you need the Desktop app registration mechanism (plan/register/verify), also read src/cli/tasks-register.ts.
- If you need to compare init's day-1 path against the existing-project repair/upgrade path, also read src/cli/sync.ts — both call the identical scaffold.ts functions.
