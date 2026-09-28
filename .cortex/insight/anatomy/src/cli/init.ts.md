---
path: src/cli/init.ts
extracted_at: 2026-09-22T00:00:00Z
extraction_level: 2
size_lines: 673
size_tokens: 7721
centrality: high
built_at_commit: "a66041b"
source_sha256: "6edd25054c2be2b62d9706603fe66c0fd194546735eb1a2943f21482734c077c"
---
# src/cli/init.ts

## Purpose
Implements `cortex init` — the day-1 bootstrap that scaffolds the entire `.cortex/` knowledge layer (compass, atlas, archive, insight, pulse skeletons plus config), installs Skill bundles, drafts deterministic preferences from project metadata, scaffolds the two spec trees, migrates a legacy `bugs.md`, compiles the constellation and — new this pass — the recall index plus its two atlas `_index.md` generated blocks, manages the CLAUDE.md block, registers Claude Code hooks and the git post-commit hook, writes Desktop scheduled tasks (with `--partial` skill-gating and profile-scoping), self-validates, and — also new this pass — seeds the append-only id registry via `ensureRegistry` (schema.id-registry Rules 1 and 6, 3.4 fifth revision: header-only on a fresh project, built from any R-*/B-* files already on disk under `--force`, never rewritten once present) — all as pure deterministic file I/O with zero LLM/network calls. `InitOptions.profile` accepts an optional `ProcessProfile` (`'specflow'` | `'superpowers'`), stamped into a fresh project's `cortex.config.json` via `freshConfig(profile)` (defaulting to `DEFAULT_PROFILE`) and, on a `--force` re-init of an existing config, preserved rather than reset unless an explicit `--profile` overrides it. Rules 4/10/11/12/13/17's actual write mechanism (skills install, CLAUDE.md block, hooks merge, git hook, scheduled-task payload writer, registration-summary lines) lives in `src/cli/scaffold.ts`, shared verbatim with `cortex sync`; this file keeps only what is genuinely init-specific: preflight (including the B-013 nested-layer guard and the non-macOS/existing-`.cortex/` refusals), gitignore, the skeleton writer, the preferences draft, spec-tree scaffolding, the legacy bugs.md migration, and the full rule orchestration + summary.

## Connections
Uses:
- src/archive/scaffold.ts: `scaffoldArchive` — scaffolds the archive module during Rule 3 (index/register templates, empty `documents/`/`types/`).
- src/cli/profile.ts: `DEFAULT_PROFILE`, `ProcessProfile` — the profile stamped into fresh configs via `freshConfig`.
- src/cli/scaffold.ts: `installSkills`, `upsertClaudeMd`, `mergeSettings`, `installGitHook`, `writeScheduledTasks`, `registrationSummaryLines`, `stripRetiredGitHookLines`, `GIT_HOOK_INVOCATION` — the Rules 4/10/11/12/13/17 mechanism, factored out and shared with `cortex sync`.
- src/cli/templates.ts: `CONFIG_DEFAULTS`, `GITIGNORE_LINES`, `CORTEX_INDEXES`, the spec-tree/compass/pulse templates, `SCHEDULED_TASKS` — nearly every literal string init writes.
- src/compass/registry.ts: `ensureRegistry` — new this pass, the id-registry seed called from `writeSkeleton` right after the compass leaf files.
- src/insight/scaffold.ts: `scaffoldInsight` — scaffolds the insight module during Rule 3.
- src/paths.ts: `specsRoot`, `businessRoot`, `SPECS_REL`, `BUSINESS_REL` — Rule 8 spec-tree paths.
- src/schema/validate.ts: `validate` — Rule 14 self-validation.
- (dynamic, not statically resolved) `../constellation/compile.js`, `../recall/index.js`, `../recall/index-blocks.js`, `./tasks-register.js` — the constellation compile, the new recall-index write + atlas index-block rewrite (both added this pass, immediately after the constellation compile so a fresh project gets both regenerable files day-1), and the read-only Desktop-registration status check.

Used by:
- src/cli/cli.ts: calls `init()` as the handler for the literal `init` verb (Rule 18/B-018 — no longer a fall-through default), forwarding `--profile` once validated.
- src/cli/tasks-register.ts: dynamically imports `writeScheduledTasks` inside `registerTasks` to refresh payloads before the registry upsert (re-exported from init.ts, sourced from scaffold.ts).
- A large atomic/spec test surface (dispatch, sync, hooks pre-read/prompt-route/search-annotate, insight module-contract/storage-format, recall index-blocks/why, schema visibility, specflow awareness, discipline packaging, loops onboarding-drift) exercises `init` directly as the fastest way to stand up a populated `.cortex/` fixture.

Semantically related (not imports):
- src/cli/sync.ts: the sibling command sharing scaffold.ts's exact mechanism and, new this pass, also calling `ensureRegistry` — init seeds the id registry on a brand-new project, sync seeds it (idempotently, existence-check only) on an existing project that predates the registry.
