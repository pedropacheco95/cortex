---
path: src/cli/sync.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 3
size_lines: 629
size_tokens: 6822
centrality: medium
built_at_commit: "0998c19"
source_sha256: "c5bebb407948d392423778d62ec202d1e6227e800d5ac5ceea4591edf7284a1f"
---
# src/cli/sync.ts

## Purpose
Implements `cortex sync` — the repair-and-upgrade command for an EXISTING Cortex project (spec core-cli.sync). Where `cortex init` refuses outright on an existing `.cortex/` without `--force`, `sync` is the safe, repeatable path for putting back a missing CLAUDE.md block, picking up newly shipped skills/task rosters, or refreshing scaffolding after a package upgrade — without a `--force` flag at all. Triage verdict: significant, not cosmetic — two real behavioural additions landed since the last extraction: **(1) B-015 skill-bundle retirement (Rule 6)** — `syncSkillBundles` now also removes bundles `src/cli/scaffold.ts`'s `SKILL_MIGRATIONS` chain names as retired, marker-judged the same way upgrades are (silent when unmodified-since-install, prompted otherwise, `--yes` bypasses); **(2) profile-scoped scheduled-task payloads (spec `core-cli.init-profile` Rule 4)** — `syncScheduledTaskPayloads` now reads the project's profile via `readProfile` and both scopes which bundles get written/refreshed AND actively removes any payload a profile switch has newly excluded (the same orphan-cleanup failure class B-015 fixed for skill bundles, now applied to task payloads). Runs twelve rules in order: platform/existing-project preflight, a schema-major version gate, a MINOR schema-version rewrite, the CLAUDE.md block and `_index.md` template refresh (localisation-aware), skill-bundle upgrade+retirement and scheduled-task-payload upgrade+profile-scoping (both judged via `.cortex-installed.json` markers), hooks/git-hook re-merge, and a final self-validation. `SyncOptions.onProgress` fires once as each rule boundary begins so a caller can surface "still working" feedback during the slower steps. Reuses `src/cli/scaffold.ts`'s mechanism verbatim for the pieces `cortex init` also needs, and shares ONE readline interface across every "modified since install" question the whole run may ask (B-012). Deterministic Core: pure file I/O, no LLM, no network.

## Main players
- `sync` (lines 440–629) — the top-level twelve-rule orchestrator: preflight, version gate, CLAUDE.md, index refresh, skill-bundle sync (incl. retirement), hooks, git hook, task-payload sync (incl. profile-scoped orphan removal), self-validation, summary. [critical]
- `syncSkillBundles` (lines 195–302) — Rule 5 (marker-judged upgrade) PLUS Rule 6 (NEW — migration-driven retirement, lines 264–299): after the install/upgrade loop, calls `retiredBundles(root, bundles, toVersion)` and removes each named bundle if unmodified-since-install, or prompts (unless `--yes`) if edited/unknown-provenance — never deletes an edit without asking. [critical]
- `syncScheduledTaskPayloads` (lines 316–434) — Rule 8: writes/refreshes task payloads, now first computing `scoped = SCHEDULED_TASKS.map(t => ({task: t, scopedTask: scopeTaskToProfile(t, profile)}))` (line 343) and, for every entry where `scopedTask === null` (NEW, lines 348–359), removing any on-disk payload a previous profile left behind — the write loop below only processes non-null `scopedTask`s. Ends with a B-012 defensive invariant re-checking every written/refreshed payload's marker hash. [critical]
- `refreshIndexes` (lines 162–178) — Rule 4: compares each `_index.md` against its known shipped template; a byte match is "current" (refreshed), anything else (including no known template) is "localised" (left alone). [supporting]
- `parseSchemaMajor` (lines 90–94) — extracts the MAJOR int from a `schemaVersion` string for the Rule 2 gate. [supporting]

## Insights
- **B-015 retirement (Rule 6) mirrors Rule 5's exact safety shape, deliberately:** both compute `unmodifiedSinceInstall` from the marker and only act without asking when that holds; edited-or-unknown-provenance always prompts unless `--yes`. The one asymmetry is direction — Rule 5 replaces content, Rule 6 deletes a whole directory — which is why the summary (lines 577–585) explicitly lists `skillResult.removed` separately from upgrades: "a deletion nobody is told about is indistinguishable from a bug" (the file's own comment at line 577).
- **Profile-switch orphan cleanup (Rule 8) is the same failure class as B-015, applied one layer up:** a bundle a profile now excludes must also lose any payload a PREVIOUS profile left behind, or switching from `specflow` to `superpowers` (or back) silently accumulates orphaned scheduled-task payloads nothing ever revisits. The removal loop (lines 348–359) uses the identical ownership check (`taskDirProjectRoot`) the retired-canonical-task removal above it already used, so it never touches another project's same-slug payload.
- The retirement mechanism is **declarative and state-based, not cursor-based** (documented in scaffold.ts's `SKILL_MIGRATIONS` comment, which this file's Rule 6 loop enforces): a developer who declines a removal prompt once (bundle was edited) is simply re-offered it next sync — nothing advances past the entry just because it was seen.
- Rule 8's B-012 defensive invariant (lines 416–431) re-verifies every payload this run wrote or refreshed has a marker matching its actual on-disk content, rewriting the marker if not — a structural guarantee against the B-012 symptom (payload updated, marker not) that holds regardless of root cause, on top of (not instead of) the per-branch bookkeeping.
- `syncSkillBundles` and `syncScheduledTaskPayloads` both accept an optional shared `rl` (readline interface) now threaded through `sync()`'s own single `createPromptInterface()` call (line 522) — Rule 5 and Rule 8 share ONE interface across the whole run, not one per differing item, and `onProgress` fires strictly BEFORE either call so a progress line never lands between a prompt being issued and it being answered.
- Rule 2's version gate refuses `sync` outright (exit 3) on EITHER-direction schema major mismatch, before any other step — the one refusal `sync` shares in spirit with `init`'s Rule 1 preflight, though `sync`'s own exit code (3) is distinct from `init`'s preflight exit (2).

## File map
- Lines 1–22: module doc comment.
- Lines 23–63: imports — now including `readProfile` (profile.ts), `scopeTaskToProfile` (templates.ts), `listSkillBundles`/`retiredBundles` (scaffold.ts, NEW).
- Lines 64–83: `SyncOptions` interface (`onProgress` documented).
- Lines 85–88: `SyncResult`.
- Lines 90–94: `parseSchemaMajor`.
- Lines 96–178: Rule 4 index refresh (`IndexRefreshResult`, `knownIndexTemplate`, `collectIndexFiles`, `refreshIndexes`).
- Lines 180–302: Rule 5+6 skill-bundle sync (`SkillSyncResult` — now with `removed`/`skippedRetiredModified` fields — and `syncSkillBundles`, the Rule 6 retirement loop at 264–299).
- Lines 304–434: Rule 8 task-payload sync (`TaskPayloadSyncResult`, `syncScheduledTaskPayloads` — profile scoping at 339–359, B-012 invariant at 416–431).
- Lines 436–629: `sync()` — the twelve-rule orchestration and summary assembly (skill-retirement summary lines at 577–585).

## Connections
Uses:
- src/schema/validate.ts: `validate` — Rule 10 self-validation.
- src/schema/version.ts: `SUPPORTED_MAJOR` — the Rule 2 major-version gate.
- src/cli/profile.ts: `readProfile` (NEW) — drives both the task-payload profile scoping and orphan-removal.
- src/cli/templates.ts: `SCHEMA_VERSION`, `CORTEX_INDEXES`, `ARCHIVE_INDEX_TEMPLATE`, `INSIGHT_INDEX_TEMPLATE`, `SCHEDULED_TASKS`, `scopeTaskToProfile` (NEW), `scheduledTaskSkillMd`.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot`.
- src/cli/scaffold.ts: `packageRoot`, `promptYesNo`, `createPromptInterface`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `registrationSummaryLines`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME`, `listSkillBundles` (NEW), `retiredBundles` (NEW) — the shared mechanism plus the B-015 retirement primitives this file's own Rule 6 judgment sits on top of.

Used by:
- src/cli/cli.ts: the `sync` verb dynamically imports `sync` from this module and forwards `--yes`/the target positional plus an `onProgress` stderr-writing sink.

Semantically related (not imports):
- src/cli/init.ts: the sibling command sharing scaffold.ts's exact mechanism; init is the day-1 bootstrap, sync is the repeatable repair/upgrade path.
- src/cli/scaffold.ts: `SKILL_MIGRATIONS` — the declarative chain `syncSkillBundles`'s Rule 6 loop enforces; owned there, consumed here.
- src/cli/tasks-register.ts: dynamically imported at the end of `sync()` for `registrationStatus`, the same read-only Desktop-registration check `init` also runs.

## Query pointers
- If you need the B-015 skill-retirement mechanism end to end, read `syncSkillBundles`'s Rule 6 loop here, then `SKILL_MIGRATIONS`/`retiredBundles`/`compareVersions` in src/cli/scaffold.ts, then `tests/atomic/core-cli/retired-bundles.test.ts`.
- If you need the profile-scoped task-payload mechanism, read `syncScheduledTaskPayloads` here (the removal loop at 348–359 especially), then `scopeTaskToProfile` in src/cli/templates.ts and `readProfile` in src/cli/profile.ts.
- If you need the "bundle/payload already exists or was modified" prompt flow, also read src/cli/scaffold.ts (`createPromptInterface`/`promptYesNo`) and src/cli/init.ts (`installSkills`'s own single-shot caller).
- If you need the `.cortex-installed.json` marker's actual judgment logic (not just its hash/read/write primitives), this file — not scaffold.ts — is the authoritative source.
