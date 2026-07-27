---
path: src/cli/scaffold.ts
extracted_at: 2026-07-25T01:15:00Z
extraction_level: 3
size_lines: 489
size_tokens: 5447
centrality: medium
built_at_commit: "0438f32"
source_sha256: "d69356272c06f050a8ea49ca4887486b179004b33f3a3564182d4c7bc4d5d30d"
---
# src/cli/scaffold.ts

## Purpose
The shared scaffolding mechanism behind both `cortex init` (Rules 4, 10, 11, 12, 13) and `cortex sync` (which exposes this same factoring per its own spec Notes: init and sync call the identical mechanism here; sync layers its own upgrade judgment on top via the `.cortex-installed.json` marker helpers). Moved verbatim out of `src/cli/init.ts` in the sync-round factoring — no behavioural change to init from the move, every function is byte-for-byte the same logic init previously had inline. Now also exports `createPromptInterface`, the B-012 fix for the footgun of creating and closing a brand-new `readline.Interface` on the same stdin for every question in a run that asks several in a row: `promptYesNo` accepts an optional shared `rl` and reuses it instead of its old create/question/close-per-call shape, so `installSkills`'s own overwrite-confirmation loop (and now `sync.ts`'s Rule 5/8 loops) can share ONE interface across every sequential y/N question they ask. Exports: `packageRoot`, `createPromptInterface`/`promptYesNo` (B-012), `installSkills` (Rule 4), `upsertClaudeMd` (Rule 10), `mergeSettings` (Rule 11), `installGitHook`/`stripRetiredGitHookLines`/the three `GIT_HOOK_INVOCATION` constants (Rule 12), `writeScheduledTasks`/`TaskSkillGap`/`ScheduledTasksResult` (Rules 13 & 17), `registrationSummaryLines` (the shared instruction-block tail both commands render identically), and the `.cortex-installed.json` marker helpers (`sha256Hex`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `INSTALLED_MARKER_FILENAME`) — generic hash/marker primitives that live here so sync.ts's own judgment logic stays focused on its decision tree; nothing in this file writes the marker itself, only sync.ts does. Deterministic Core: pure file I/O, no LLM, no network.

## Main players
- `createPromptInterface` (lines 63–66) — B-012 primitive: returns a shared `readline.Interface` when both stdin/stdout are a TTY, `undefined` otherwise (non-interactive default); a caller asking more than one sequential y/N question in a single run creates exactly one of these and threads it through every `promptYesNo` call. [critical]
- `promptYesNo` (lines 75–88) — the y/N prompt itself; when passed an `rl` it just asks the question on that shared interface, otherwise it falls back to the old single-shot create-ask-close shape for genuine one-question callers. [critical]
- `installSkills` (lines 96–126) — installs every shipped skill bundle absent locally, prompting per pre-existing bundle unless `yes`; now creates `const rl = yes ? undefined : createPromptInterface()` once before the loop and closes it in a `finally`, the reference implementation of the B-012 pattern other callers now follow. [critical]
- `writeScheduledTasks` (lines 345–396) — writes the SKILL.md prompt payloads under `~/.claude/scheduled-tasks/`, removes this project's retired-canonical scoped dirs (§9.1 deregistration), and reports skipped/lacking/retired tasks; project-scoped via `resolveScopedTaskName` so other projects' entries are never touched. [critical]
- `upsertClaudeMd` (lines 132–165) — creates/inserts/updates the CLAUDE.md managed block, returning which of the four outcomes occurred. [supporting]
- `mergeSettings` (lines 192–227) — merges the Cortex hook entries into `.claude/settings.json`, preserving unrelated content; throws (never silently overwrites) on unparseable existing JSON. [supporting]
- `installGitHook` (lines 279–306), with `stripRetiredGitHookLines` (lines 262–277) — idempotently installs/repairs the post-commit hook and strips the retired `cortex anatomy-refresh-fast` line (and its preceding comment) from an existing hook before reconciling. [supporting]
- `hashDirectoryContent`/`readInstalledMarker`/`writeInstalledMarker`/`sha256Hex` (lines 432–485) — the generic content-hash and `.cortex-installed.json` marker primitives sync.ts's own Rule 5/8 "modified since install" judgment is built on; nothing in this file calls `writeInstalledMarker` itself. [supporting]

## Insights
- The B-012 root cause: rapid sequential `readline.Interface` create-question-close cycles on the SAME stdin can drop or misattribute buffered input between interfaces — a real answer the user typed on one question can be lost while adjacent ones behave normally. The fix is structural, not defensive: one shared interface per run, created once, closed once, threaded as an optional parameter so a genuine single-shot caller (unspecified `rl`) is unaffected and keeps the old create-one-throwaway-interface behaviour.
- `installSkills` is the reference implementation other callers now copy: `const rl = yes ? undefined : createPromptInterface(); try { ...loop calling promptYesNo(text, rl)... } finally { rl?.close(); }` — sync.ts's `syncSkillBundles`/`syncScheduledTaskPayloads` (both accepting an optional `rl` parameter now) follow this exact shape, sharing ONE interface across both Rule 5 and Rule 8's prompts in a single `cortex sync` run.
- `installSkills`/`writeScheduledTasks` deliberately never write `.cortex-installed.json` — sync.ts owns that marker exclusively so a fresh `cortex init` never gets a stray bookkeeping file; this preserves the specflow-awareness byte-identity ACs (`tests/spec/specflow/awareness.test.ts`) that compare an init-installed bundle directory's file SET against the shipped package bundle's file set exactly.
- `writeScheduledTasks`'s retired-task removal is careful about ownership: it checks `taskDirProjectRoot(retiredDir)` before removing a plain-slug directory, so it never deletes another project's same-named scoped task dir — only the hash-fallback form is unambiguous by construction.
- Deterministic Core discipline holds throughout: every function is synchronous file I/O (or one readline round-trip); no LLM call, no network access anywhere in the file.

## Connections
Uses:
- src/cli/templates.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS` — the literal content `upsertClaudeMd`/`writeScheduledTasks` write.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` — project-scoped task naming for `writeScheduledTasks`'s writing, collision resolution, and retired-task removal.

Used by:
- src/cli/init.ts: imports `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION` for its Rules 4/10/11/12/13/17, and re-exports several of these plus the two task-result types for external compatibility.
- src/cli/sync.ts: imports `packageRoot`, `promptYesNo`, `createPromptInterface`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `registrationSummaryLines`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME` for its Rules 3/5/6/7/8 (CLAUDE.md, skill-bundle upgrade, hooks, git hook, scheduled-task payload refresh) — now also sharing ONE `createPromptInterface()` result across its own Rule 5 and Rule 8 prompt loops (B-012).

## Query pointers
- If you need to change the "bundle/payload already exists or was modified" prompt flow, also read: src/cli/sync.ts (`syncSkillBundles`/`syncScheduledTaskPayloads`, which now take an optional `rl: ReadlineInterface`), src/cli/init.ts (`installSkills`'s own caller, single-shot `yes`-gated).
- If you need to trace the B-012 shared-interface fix end to end, read: `createPromptInterface`/`promptYesNo` here, then src/cli/sync.ts's `sync()` where the shared `rl` is created once and threaded through both Rule 5 and Rule 8.
- If you need the scheduled-task registration mechanism, also read: src/cli/task-scoping.ts (naming/scoping), src/cli/tasks-register.ts (Desktop-app registry write/verify, separate from this file's payload-writing).
- If you need the `.cortex-installed.json` marker's actual judgment logic (not just its hash/read/write primitives), read src/cli/sync.ts — this file only supplies the mechanism, never the "modified since install?" decision.
