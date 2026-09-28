---
path: src/cli/sync.ts
extracted_at: 2026-09-22T00:00:00Z
extraction_level: 2
size_lines: 687
size_tokens: 7668
centrality: high
built_at_commit: "a66041b"
source_sha256: "cec5ca34603ee210334c7446cc7ad0e5b2d7ab98f9c109e59e211fc4caa471df"
---
# src/cli/sync.ts

## Purpose
Implements `cortex sync` — the repair-and-upgrade command for an EXISTING Cortex project (spec core-cli.sync). Where `cortex init` refuses outright on an existing `.cortex/` without `--force`, `sync` is the safe, repeatable path for putting back a missing CLAUDE.md block, refreshing `_index.md` templates, picking up newly shipped skills/task rosters, or refreshing scaffolding after a package upgrade — without a `--force` flag at all. Two changes land this pass on top of the existing B-015 skill-retirement (Rule 6) and profile-scoped task-payload (Rule 8) behaviour: (1) `refreshIndexes` now compares each `_index.md` through `stripRecallBlock` (from `../recall/index-blocks.js`) before the byte-match check, so the generated recall block the two atlas indexes carry doesn't make an otherwise-current file read as "localised"; (2) `syncSkillBundles` now also enforces the Rule 5 **additions chain**: an absent bundle is installed only if `shouldInstallAbsent(bundle, priorVersion)` holds — compared against `declaredVersion` (the schemaVersion recorded BEFORE this run, deliberately not `SCHEMA_VERSION`, which by that point in `sync()` already holds the post-Rule-2-rewrite value) — otherwise it is recorded as `skippedDeleted` and named in the summary the same way `removed`/`skippedUserModified` already are ("a bundle deliberately withheld is as invisible as a deletion nobody is told about"); a project whose `.claude/skills/` didn't exist before this run (`skillsDirExisted`, captured BEFORE the `mkdirSync`) bypasses the guard entirely and takes the full roster, since a project that never had bundles hasn't "lost" one. Also new: `sync()` now calls `ensureRegistry(absRoot)` (Rule 15, schema.id-registry Rule 6, 3.4 fifth revision) right after the index refresh — absent registry is created once from the R-*/B-* files already on disk, a present one is only existence-checked, never regenerated. Runs its rules in order (platform/existing-project preflight, schema-major version gate, MINOR version rewrite, CLAUDE.md, index refresh, id-registry seed, marker-judged skill-bundle sync incl. retirement+additions, hooks, git hook, marker-judged task-payload sync incl. profile-scoped orphan removal, self-validation, summary), sharing ONE readline interface across every "modified since install" prompt the whole run may ask (B-012), with `SyncOptions.onProgress` firing once per rule boundary. Deterministic Core: pure file I/O, no LLM, no network.

## Connections
Uses:
- src/schema/validate.ts: `validate` — self-validation.
- src/schema/version.ts: `SUPPORTED_MAJOR` — the major-version gate.
- src/cli/profile.ts: `readProfile` — drives task-payload profile scoping and orphan-removal.
- src/recall/index-blocks.ts: `stripRecallBlock` — new this pass, makes the `_index.md` template comparison ignore the generated recall block.
- src/compass/registry.ts: `ensureRegistry` — new this pass, the same id-registry seed `init.ts` now also calls, applied here to existing projects.
- src/cli/templates.ts: `SCHEMA_VERSION`, `CORTEX_INDEXES`, `ARCHIVE_INDEX_TEMPLATE`, `INSIGHT_INDEX_TEMPLATE`, `SCHEDULED_TASKS`, `scopeTaskToProfile`, `scheduledTaskSkillMd`.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot`.
- src/cli/scaffold.ts: `packageRoot`, `promptYesNo`, `createPromptInterface`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `registrationSummaryLines`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME`, `listSkillBundles`, `retiredBundles`, and — new this pass — `shouldInstallAbsent`, the Rule 5 additions-chain predicate this file's own `syncSkillBundles` judgment now sits on top of.

Used by:
- src/cli/cli.ts: the `sync` verb dynamically imports `sync` and forwards `--yes`/the target positional plus an `onProgress` stderr-writing sink.

Semantically related (not imports):
- src/cli/init.ts: the sibling command sharing scaffold.ts's exact mechanism and now also `ensureRegistry` — init seeds the id registry on a fresh project, sync seeds it (idempotently) on an existing one that predates the registry.
- src/cli/scaffold.ts: `SKILL_MIGRATIONS`/`SKILL_ADDITIONS` — the declarative chains `syncSkillBundles`'s Rule 5/6 loops enforce; owned there, consumed here.
