---
path: src/cli/scaffold.ts
extracted_at: 2026-08-07T01:00:00Z
extraction_level: 3
size_lines: 734
size_tokens: 8230
centrality: medium
built_at_commit: "c2de5f6"
source_sha256: "bbe34fb1f5a977f7caee11b2d6ea901c474361f46c3310ca5dc719768133413f"
---
# src/cli/scaffold.ts

## Purpose
The shared scaffolding mechanism behind both `cortex init` (Rules 4, 10, 11, 12, 13) and `cortex sync` (which exposes this same factoring per its own spec Notes: init and sync call the identical mechanism here; sync layers its own upgrade judgment on top via the `.cortex-installed.json` marker helpers). Carries two paired, declarative version-chains for skill-bundle lifecycle (spec `core-cli.sync` Rules 5 & 6): the **retirement chain** (`SKILL_MIGRATIONS`/`SkillMigration`/`retiredBundles`, B-015) names bundle directories that should NOT exist in `.claude/skills/` at a given package version — state-based, re-evaluated every sync run, so a declined removal is simply re-offered rather than lost; and NEW this pass, its mirror the **additions chain** (`SKILL_ADDITIONS`/`SkillAddition`/`bundleAddedAt`/`shouldInstallAbsent`) names bundle directories that STARTED shipping at a given version, so sync can distinguish "never offered this project" (install) from "developer deliberately deleted it" (leave gone) — without this, every sync would put a deliberately-deleted bundle back, since both cases look identical as a bare absence. `listSkillBundles` remains the single exported source of truth for "which directories under `skills/` are real skill bundles" (a directory containing a `SKILL.md`), shared by `installSkills`, `sync.ts`'s `syncSkillBundles`, and both chains' safety checks, so the enumerations cannot drift apart. `writeScheduledTasks` (Rules 13 & 17) profile-scopes `SCHEDULED_TASKS` via `scopeTaskToProfile` before writing payloads (spec `core-cli.init-profile` Rule 4) — under the default `specflow` profile this is a no-op pass-through. Also exports `createPromptInterface`/`promptYesNo` (B-012 shared-readline-interface fix), `upsertClaudeMd` (Rule 10), `mergeSettings` (Rule 11), `installGitHook`/`stripRetiredGitHookLines`/the three `GIT_HOOK_INVOCATION` constants (Rule 12), and the `.cortex-installed.json` marker helpers (`sha256Hex`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `INSTALLED_MARKER_FILENAME`) — generic hash/marker primitives that live here so sync.ts's own judgment logic stays focused on its decision tree; nothing in this file writes the marker itself, only sync.ts does. Deterministic Core: pure file I/O, no LLM, no network.

## Main players
- `SKILL_ADDITIONS` (lines 272–308) — NEW: the declarative additions chain, mirroring `SKILL_MIGRATIONS`; one seed entry (version `3.3`) naming every bundle the package shipped when the chain was introduced, so a project's absence of one of these is a decision, not a gap. [critical]
- `bundleAddedAt` / `shouldInstallAbsent` (lines 311–331) — NEW: `bundleAddedAt` looks up which version's entry first named a bundle; `shouldInstallAbsent` is the fail-open predicate sync calls per absent bundle — no entry names it → install (fail open costs one reinstall; failing closed makes a bundle permanently unreachable), otherwise install only if its `added` entry's version is strictly above the project's pre-run `schemaVersion`. [critical]
- `SKILL_MIGRATIONS` (lines 157–187) — the declarative retirement chain, one entry (version `3.3`, removing `specflow-change-router`, `_conventions`, `cortex-ingest`, and the eleven per-loop bundles folded into `cortex-loop`). Shaped like a database migration list: each release that retires a bundle appends one entry. [critical]
- `retiredBundles` (lines 217–231) — computes bundle directory names present in `<root>/.claude/skills/` that should not exist at version `to`, applying two safety invariants — never a name the package still ships (`shippedSet`), and never a name no migration entry actually names (`present` ∩ `named`). [critical]
- `compareVersions` / `applicableSkillMigrations` (lines 190–206) — `MAJOR.MINOR` comparator (now shared by both chains — `shouldInstallAbsent` calls it too) and the migration-entry filter ("every entry this version has reached"); a migration/addition dated ahead of the installed package never applies. [supporting]
- `listSkillBundles` (lines 113–120) — the single enumeration of real skill bundles (dirs containing `SKILL.md`) under a `skills/` source directory, shared by `installSkills`, `sync.ts`'s `syncSkillBundles`, and both chains' safety checks. [critical]
- `createPromptInterface` (lines 64–67) — B-012 primitive: returns a shared `readline.Interface` when both stdin/stdout are a TTY, `undefined` otherwise. [critical]
- `promptYesNo` (lines 76–89) — the y/N prompt itself; when passed an `rl` it just asks the question on that shared interface. [critical]
- `installSkills` (lines 334–364) — installs every shipped skill bundle absent locally, prompting per pre-existing bundle unless `yes`; creates one shared `rl` before the loop. [critical]
- `writeScheduledTasks` (lines 583–641) — writes the SKILL.md prompt payloads under `~/.claude/scheduled-tasks/`, calling `readProfile(root)` and `scopeTaskToProfile` on every entry in `SCHEDULED_TASKS` before the existing skip/lacking/retired logic runs; project-scoped via `resolveScopedTaskName`. [critical]
- `upsertClaudeMd` (lines 370–403) — creates/inserts/updates the CLAUDE.md managed block, returning which of the four outcomes occurred. [supporting]
- `mergeSettings` (lines 430–465) — merges the Cortex hook entries into `.claude/settings.json`, preserving unrelated content; throws (never silently overwrites) on unparseable existing JSON. [supporting]
- `installGitHook` (lines 517–544), with `stripRetiredGitHookLines` (lines 500–515) — idempotently installs/repairs the post-commit hook and strips the retired `cortex anatomy-refresh-fast` line from an existing hook before reconciling. [supporting]
- `hashDirectoryContent`/`readInstalledMarker`/`writeInstalledMarker`/`sha256Hex` (lines 677–730) — the generic content-hash and `.cortex-installed.json` marker primitives sync.ts's own Rule 5/6/8 judgment is built on; nothing in this file calls `writeInstalledMarker` itself. [supporting]

## Insights
- **The additions chain closes the loop the retirement chain opened:** `SKILL_MIGRATIONS` alone can tell sync a bundle should be gone, but nothing previously let sync tell "never offered" apart from "offered, then deliberately deleted" for a bundle that simply doesn't exist locally — both are the same bare absence. `SKILL_ADDITIONS` + `bundleAddedAt` + `shouldInstallAbsent` fixes that asymmetrically on purpose: an unlisted bundle fails OPEN (installed) because failing closed would make a bundle permanently unreachable for every existing project, while the retirement chain's removals stay declinable per-run. `tests/atomic/core-cli/skill-additions.test.ts` pins the invariant that every shipped bundle is named by exactly one addition entry.
- **B-015 root cause (retirement chain, lines 124–147):** Cortex installs/upgrades bundles by diffing against what the package currently ships, but a bundle it has STOPPED shipping is invisible to that diff — it just sits in `.claude/skills/` forever after a rename, so two skills end up claiming the same job. The fix is a migration chain, not a diff extension: each retiring release appends a declarative entry naming what it dropped and why, and `retiredBundles` is re-evaluated on EVERY sync run (not advanced past once seen). `tests/atomic/core-cli/retired-bundles.test.ts` pins the invariant that no migration entry may name a bundle the package still ships.
- **Asymmetric version-window semantics between the two chains, and why:** `applicableSkillMigrations`'s retirement lookup and `shouldInstallAbsent`'s addition lookup both use `compareVersions`, but the retirement side is a cursor-rejecting state check (a declined removal must stay offered every run) while the addition side IS a version window (`addedAt > priorVersion`) — there is no decision to lose on an install, so once a project's recorded `schemaVersion` passes an addition's version, that bundle's absence is permanently read as deliberate.
- `installSkills`/`writeScheduledTasks` deliberately never write `.cortex-installed.json` — sync.ts owns that marker exclusively so a fresh `cortex init` never gets a stray bookkeeping file; this preserves the specflow-awareness byte-identity ACs (`tests/spec/specflow/awareness.test.ts`).
- The B-012 root cause: rapid sequential `readline.Interface` create-question-close cycles on the SAME stdin can drop or misattribute buffered input between interfaces. The fix is structural: one shared interface per run, created once, closed once, threaded as an optional parameter.
- `writeScheduledTasks`'s retired-task removal is careful about ownership: it checks `taskDirProjectRoot(retiredDir)` before removing a plain-slug directory, so it never deletes another project's same-named scoped task dir.
- Deterministic Core discipline holds throughout: every function is synchronous file I/O (or one readline round-trip); no LLM call, no network access anywhere in the file.
- The CLAUDE.md scaffolding/managed-block machinery this file drives only ever targets the **root** `CLAUDE.md` — the project also carries a tracked, permanently-0-byte `.claude/CLAUDE.md` that this file (and `src/schema/checks/claude-md.ts`, `src/loops/onboarding-drift.ts`) never reads, writes, or flags. (claude-sessions/pedropacheco1/738a8033-6a3e-4ac5-9063-23ab51cb5024)

## File map
- Lines 1–25: module doc comment.
- Lines 26–40: imports.
- Lines 42–49: `packageRoot`.
- Lines 51–89: `createPromptInterface`, `promptYesNo` (B-012).
- Lines 91–120: `installSkills`-mechanism doc comment, `listSkillBundles` doc + function.
- Lines 122–231: retirement-chain machinery — `SkillMigration` interface, `SKILL_MIGRATIONS` array, `compareVersions`, `applicableSkillMigrations`, `retiredBundles`.
- Lines 233–331: NEW additions-chain machinery — `SkillAddition` interface, `SKILL_ADDITIONS` array, `bundleAddedAt`, `shouldInstallAbsent`.
- Lines 334–364: `installSkills`.
- Lines 370–403: `upsertClaudeMd` (CLAUDE.md managed block).
- Lines 405–465: hooks registration (`cortexHookEntries`, `mergeSettings`).
- Lines 467–544: git post-commit hook (constants, `stripRetiredGitHookLines`, `installGitHook`).
- Lines 546–641: Desktop scheduled-task payloads (`TaskSkillGap`, `ScheduledTasksResult`, `missingRequiredSkills`, `writeScheduledTasks`).
- Lines 648–666: `registrationSummaryLines`.
- Lines 668–734: `.cortex-installed.json` marker primitives (`INSTALLED_MARKER_FILENAME`, `sha256Hex`, `hashDirectoryContent`, `InstalledMarker`, `readInstalledMarker`, `writeInstalledMarker`), re-exported `ScheduledTask` type.

## Connections
Uses:
- src/cli/templates.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS`, `scopeTaskToProfile` — the literal content and profile-scoping transform `writeScheduledTasks` uses.
- src/cli/profile.ts: `readProfile` — the profile `writeScheduledTasks` scopes against.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` — project-scoped task naming.

Used by:
- src/cli/init.ts: imports `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION`.
- src/cli/sync.ts: imports `packageRoot`, `promptYesNo`, `createPromptInterface`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `registrationSummaryLines`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME`, `listSkillBundles`, `retiredBundles`, and now also `bundleAddedAt`/`shouldInstallAbsent` (NEW) for its Rule 5 additions-chain check alongside its existing Rule 6 retirement sync.

## Insights

- `writeScheduledTasks` (lines 546-641) preserves an existing scheduled-task payload file untouched once it's on disk — only `--force` rewrites it (matching the general "no silent destruction" init rule) — but there is no content-hash/version check that would detect the payload text has fallen behind the current `SCHEDULED_TASKS` template in `src/cli/templates.ts` and prompt a refresh. Confirmed root cause of a real, live problem: all five deployed payloads under `~/.claude/scheduled-tasks/cortex-*/SKILL.md` are a snapshot from around 2026-07-20, silently un-refreshed through the 2026-08-06 templates.ts rewrite (the single-`cortex-loop`-skill consolidation) and every `sync`/`init` run since — see `insight/observations/scheduled-task-prompt-drift.md`. (claude-sessions/pedropacheco1/b6fa9d2b-cc7e-472d-a709-12d5dd22d38a)

## Query pointers
- If you need to trace a skill-bundle retirement end to end, read `SKILL_MIGRATIONS`/`retiredBundles`/`compareVersions` here, then src/cli/sync.ts's `syncSkillBundles` (the Rule 6 loop that actually removes/prompts), then `tests/atomic/core-cli/retired-bundles.test.ts` (the invariant pin).
- If you need to trace a skill-bundle addition end to end, read `SKILL_ADDITIONS`/`bundleAddedAt`/`shouldInstallAbsent` here, then src/cli/sync.ts's install-check call site, then `tests/atomic/core-cli/skill-additions.test.ts` (the invariant pin).
- If you need to change the "bundle/payload already exists or was modified" prompt flow, also read: src/cli/sync.ts (`syncSkillBundles`/`syncScheduledTaskPayloads`), src/cli/init.ts (`installSkills`'s own caller, single-shot `yes`-gated).
- If you need the profile-scoping mechanism `writeScheduledTasks` applies, also read src/cli/templates.ts (`scopeTaskToProfile`) and src/cli/profile.ts (`readProfile`).
- If you need the scheduled-task registration mechanism, also read: src/cli/task-scoping.ts (naming/scoping), src/cli/tasks-register.ts (Desktop-app registry write/verify).
- If you need the `.cortex-installed.json` marker's actual judgment logic (not just its hash/read/write primitives), read src/cli/sync.ts.
