---
path: src/cli/sync.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 2
size_lines: 511
size_tokens: 5527
centrality: low
built_at_commit: "bcbda52"
source_sha256: "9bba47d050a84dc53c8f032c55b8c1613cf56f99f69df686cb7240b0466f2179"
---
# src/cli/sync.ts

## Purpose
Implements `cortex sync` — the repair-and-upgrade command for an EXISTING Cortex project (spec core-cli.sync). Where `cortex init` refuses outright on an existing `.cortex/` without `--force`, `sync` is the safe, repeatable path for putting back a missing CLAUDE.md block, picking up newly shipped skills/task rosters, or refreshing scaffolding after a package upgrade — without a `--force` flag at all (every write here is a merge, an append, or a judgment-gated upgrade, never an unconditional overwrite). Runs twelve rules in order: platform/existing-project preflight, a schema-major version gate (refuses on any mismatch, either direction), a MINOR schema-version rewrite, the CLAUDE.md block and `_index.md` template refresh (localisation-aware — a hand-edited index is left alone and reported as "localised"), skill-bundle and scheduled-task-payload upgrades judged via a `.cortex-installed.json` marker (unmodified-since-install upgrades silently; modified-or-unknown-provenance prompts unless `--yes`), hooks/git-hook re-merge, and a final self-validation. Reuses `src/cli/scaffold.ts`'s mechanism verbatim for the pieces `cortex init` also needs (CLAUDE.md, hooks, git hook, the prompt-interface/marker helpers), and shares ONE readline interface across every "modified since install" question the whole run may ask (B-012) rather than one create/close cycle per differing bundle/payload. Deterministic Core: pure file I/O, no LLM, no network.

## Connections
Uses:
- src/schema/validate.ts: `validate` — Rule 10 self-validation.
- src/schema/version.ts: `SUPPORTED_MAJOR` — the Rule 2 major-version gate.
- src/cli/templates.ts: `SCHEMA_VERSION`, `CORTEX_INDEXES`, `ARCHIVE_INDEX_TEMPLATE`, `INSIGHT_INDEX_TEMPLATE`, `SCHEDULED_TASKS`, `scheduledTaskSkillMd` — the known-template comparisons for Rule 4's index refresh and Rule 8's task-payload refresh.
- src/cli/task-scoping.ts: `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` — project-scoped task naming, same as init.
- src/cli/scaffold.ts: `packageRoot`, `promptYesNo`, `createPromptInterface`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `registrationSummaryLines`, `hashDirectoryContent`, `readInstalledMarker`, `writeInstalledMarker`, `sha256Hex`, `INSTALLED_MARKER_FILENAME` — the shared mechanism and marker-judgment primitives this file's own Rules 5/8 judgment sits on top of.

Used by:
- src/cli/cli.ts: the `sync` verb dynamically imports `sync` from this module and forwards `--yes`/the target positional.

Semantically related (not imports):
- src/cli/init.ts: the sibling command sharing scaffold.ts's exact mechanism; init is the day-1 bootstrap (refuses on an existing `.cortex/`), sync is the repeatable repair/upgrade path (refuses when `.cortex/` is absent).
- src/cli/tasks-register.ts: dynamically imported at the end of `sync()` for `registrationStatus`, the same read-only Desktop-registration check `init` also runs.
