---
path: src/cli/scaffold.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 3
size_lines: 611
size_tokens: 6842
centrality: medium
built_at_commit: "0998c19"
source_sha256: "6620981485e4e0e6700aba86fe5ba0802d6279fd6f66094de2a9a4537ba0b1a2"
---
# src/cli/scaffold.ts

## Purpose
The shared scaffolding mechanism behind both `cortex init` (Rules 4, 10, 11, 12, 13) and `cortex sync` (which exposes this same factoring per its own spec Notes: init and sync call the identical mechanism here; sync layers its own upgrade judgment on top via the `.cortex-installed.json` marker helpers). New this pass (B-015, spec `core-cli.sync` Rule 6): a declarative **skill-migration chain** — `SKILL_MIGRATIONS`/`SkillMigration`/`compareVersions`/`applicableSkillMigrations`/`retiredBundles` — that names which bundle directories should NOT exist in `.claude/skills/` at a given package version, enforced by `sync` on every run (state-based, not cursor-based, so a declined removal is simply re-offered next sync rather than lost forever). Also new: `listSkillBundles` is now the single exported source of truth for "which directories under `skills/` are real skill bundles" (a directory containing a `SKILL.md`), used identically by `installSkills`, `sync.ts`'s `syncSkillBundles`, and `retiredBundles`'s safety check, so the three enumerations cannot drift apart. `writeScheduledTasks` (Rules 13 & 17) now profile-scopes `SCHEDULED_TASKS` via `scopeTaskToProfile` before writing payloads (spec `core-cli.init-profile` Rule 4) — under the default `specflow` profile this is a no-op pass-through. Also exports `createPromptInterface`/`promptYesNo` (B-012 shared-readline-interface fix), `upsertClaudeMd` (Rule 10), `mergeSettings` (Rule 11), `installGitHook`/`stripRetiredGitHookLines`/the three `GIT_HOOK_INVOCATION` constants (Rule 12), and the `.cortex-installed.json` marker helpers (`sha256Hex`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `INSTALLED_MARKER_FILENAME`) — generic hash/marker primitives that live here so sync.ts's own judgment logic stays focused on its decision tree; nothing in this file writes the marker itself, only sync.ts does. Deterministic Core: pure file I/O, no LLM, no network.

## Main players
- `SKILL_MIGRATIONS` (lines 157–164) — NEW: the declarative retirement chain, currently one entry (version `3.3`, removing `specflow-change-router`, `_conventions`, `cortex-ingest`, each with a documented reason). Shaped like a database migration list: each release that retires a bundle appends one entry. [critical]
- `retiredBundles` (lines 194–208) — NEW: computes bundle directory names present in `<root>/.claude/skills/` that should not exist at version `to`, applying two safety invariants — never a name the package still ships (`shippedSet`), and never a name no migration entry actually names (`present` ∩ `named`). [critical]
- `compareVersions` / `applicableSkillMigrations` (lines 167–183) — NEW: `MAJOR.MINOR` comparator and the migration-entry filter ("every entry this version has reached"); a migration dated ahead of the installed package never applies. [supporting]
- `listSkillBundles` (lines 113–120) — NEW (exported; previously inline in `installSkills` only): the single enumeration of real skill bundles (dirs containing `SKILL.md`) under a `skills/` source directory, now shared by `installSkills`, `sync.ts`'s `syncSkillBundles`, and `retiredBundles`. [critical]
- `createPromptInterface` (lines 64–67) — B-012 primitive: returns a shared `readline.Interface` when both stdin/stdout are a TTY, `undefined` otherwise. [critical]
- `promptYesNo` (lines 76–89) — the y/N prompt itself; when passed an `rl` it just asks the question on that shared interface. [critical]
- `installSkills` (lines 211–241) — installs every shipped skill bundle absent locally, prompting per pre-existing bundle unless `yes`; creates one shared `rl` before the loop. [critical]
- `writeScheduledTasks` (lines 460–518) — writes the SKILL.md prompt payloads under `~/.claude/scheduled-tasks/`, now first calling `readProfile(root)` and `scopeTaskToProfile` on every entry in `SCHEDULED_TASKS` (lines 486–489) before the existing skip/lacking/retired logic runs; project-scoped via `resolveScopedTaskName`. [critical]
- `upsertClaudeMd` (lines 247–280) — creates/inserts/updates the CLAUDE.md managed block, returning which of the four outcomes occurred. [supporting]
- `mergeSettings` (lines 307–342) — merges the Cortex hook entries into `.claude/settings.json`, preserving unrelated content; throws (never silently overwrites) on unparseable existing JSON. [supporting]
- `installGitHook` (lines 394–421), with `stripRetiredGitHookLines` (lines 377–392) — idempotently installs/repairs the post-commit hook and strips the retired `cortex anatomy-refresh-fast` line from an existing hook before reconciling. [supporting]
- `hashDirectoryContent`/`readInstalledMarker`/`writeInstalledMarker`/`sha256Hex` (lines 554–607) — the generic content-hash and `.cortex-installed.json` marker primitives sync.ts's own Rule 5/6/8 judgment is built on; nothing in this file calls `writeInstalledMarker` itself. [supporting]

## Insights
- **B-015 root cause (documented in `SKILL_MIGRATIONS`'s own doc comment, lines 123–147):** Cortex installs/upgrades bundles by diffing against what the package currently ships, but a bundle it has STOPPED shipping is invisible to that diff — it just sits in `.claude/skills/` forever after a rename, so two skills end up claiming the same job. The fix is a migration chain, not a diff extension: each retiring release appends a declarative entry naming what it dropped and why, and `retiredBundles` is re-evaluated on EVERY sync run (not advanced past once seen) — so a developer who declines a removal prompt once (bundle was edited) is simply re-offered it next sync, and re-running when everything is already gone is a silent no-op. `tests/atomic/core-cli/retired-bundles.test.ts` pins the invariant that no migration entry may name a bundle the package still ships — the cheap mistake this structure is designed to prevent.
- `installSkills`/`writeScheduledTasks` deliberately never write `.cortex-installed.json` — sync.ts owns that marker exclusively so a fresh `cortex init` never gets a stray bookkeeping file; this preserves the specflow-awareness byte-identity ACs (`tests/spec/specflow/awareness.test.ts`).
- The B-012 root cause: rapid sequential `readline.Interface` create-question-close cycles on the SAME stdin can drop or misattribute buffered input between interfaces. The fix is structural: one shared interface per run, created once, closed once, threaded as an optional parameter.
- **Profile scoping in `writeScheduledTasks` is a thin pass-through under the default profile:** `scopeTaskToProfile` (templates.ts) returns the task untouched when `profile === 'specflow'`, so init's day-1 behaviour for the common case is byte-identical to before this change; the filter (`.filter((t): t is ScheduledTask => t !== null)`) only removes entries under a non-default profile.
- `writeScheduledTasks`'s retired-task removal is careful about ownership: it checks `taskDirProjectRoot(retiredDir)` before removing a plain-slug directory, so it never deletes another project's same-named scoped task dir.
- Deterministic Core discipline holds throughout: every function is synchronous file I/O (or one readline round-trip); no LLM call, no network access anywhere in the file.

## File map
- Lines 1–25: module doc comment (now describing the B-015 migration chain alongside the B-012 shared-interface fix).
- Lines 26–40: imports — now including `scopeTaskToProfile` from `./templates.js` and `readProfile` from `./profile.js`.
- Lines 42–49: `packageRoot`.
- Lines 51–89: `createPromptInterface`, `promptYesNo` (B-012).
- Lines 91–120: `installSkills`-mechanism doc comment, `listSkillBundles` doc + function (NEW export).
- Lines 122–208: skill-migration machinery — `SkillMigration` interface, `SKILL_MIGRATIONS` array, `compareVersions`, `applicableSkillMigrations`, `retiredBundles` (all NEW).
- Lines 211–241: `installSkills`.
- Lines 247–280: `upsertClaudeMd` (CLAUDE.md managed block).
- Lines 282–342: hooks registration (`cortexHookEntries`, `mergeSettings`).
- Lines 344–421: git post-commit hook (constants, `stripRetiredGitHookLines`, `installGitHook`).
- Lines 423–518: Desktop scheduled-task payloads (`TaskSkillGap`, `ScheduledTasksResult`, `missingRequiredSkills`, `writeScheduledTasks` — now profile-scoped at lines 483–489).
- Lines 520–543: `registrationSummaryLines`.
- Lines 545–611: `.cortex-installed.json` marker primitives (`INSTALLED_MARKER_FILENAME`, `sha256Hex`, `hashDirectoryContent`, `InstalledMarker`, `readInstalledMarker`, `writeInstalledMarker`), re-exported `ScheduledTask` type.

## Connections
Uses:
- src/cli/templates.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS`, `scopeTaskToProfile` (NEW) — the literal content and profile-scoping transform `writeScheduledTasks` uses.
- src/cli/profile.ts: `readProfile` (NEW) — the profile `writeScheduledTasks` scopes against.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` — project-scoped task naming.

Used by:
- src/cli/init.ts: imports `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION`.
- src/cli/sync.ts: imports `packageRoot`, `promptYesNo`, `createPromptInterface`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `registrationSummaryLines`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME`, and now also `listSkillBundles`, `retiredBundles` (NEW) for its own Rule 5/6 skill-bundle sync and retirement.

## Query pointers
- If you need to trace a skill-bundle retirement end to end, read `SKILL_MIGRATIONS`/`retiredBundles`/`compareVersions` here, then src/cli/sync.ts's `syncSkillBundles` (the Rule 6 loop that actually removes/prompts), then `tests/atomic/core-cli/retired-bundles.test.ts` (the invariant pin).
- If you need to change the "bundle/payload already exists or was modified" prompt flow, also read: src/cli/sync.ts (`syncSkillBundles`/`syncScheduledTaskPayloads`), src/cli/init.ts (`installSkills`'s own caller, single-shot `yes`-gated).
- If you need the profile-scoping mechanism `writeScheduledTasks` now applies, also read src/cli/templates.ts (`scopeTaskToProfile`) and src/cli/profile.ts (`readProfile`).
- If you need the scheduled-task registration mechanism, also read: src/cli/task-scoping.ts (naming/scoping), src/cli/tasks-register.ts (Desktop-app registry write/verify).
- If you need the `.cortex-installed.json` marker's actual judgment logic (not just its hash/read/write primitives), read src/cli/sync.ts.
