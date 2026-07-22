---
id: core-cli.sync
status: implemented
depends_on:
  - core-cli.init
  - core-cli.task-scoping
  - core-cli.tasks-register
  - schema.validator
implements: ../../specs-business/core-cli/developer-keeps-existing-project-current.business.md
governed_by: []
governs:
  - "src/cli/**/*.ts"
---

# cortex sync — Repair and Upgrade for an Existing Project

## Intent

`cortex sync` is the standing repair-and-upgrade command for a project already under Cortex management. Day-1 `cortex init` refuses to re-run on an existing `.cortex/` without `--force` (`core-cli.init` Rule 1), so before this command there was no safe way to put back a missing CLAUDE.md block, pick up newly shipped skills, or refresh scheduled-task prompts after a package upgrade. Sync factors init's already-idempotent scaffolding steps — the CLAUDE.md managed block, `_index.md` templates, skill-bundle install/upgrade, the hooks merge, the git post-commit hook, and the scheduled-task payloads (`core-cli.init` Rules 4, 10, 11, 12, 13) — into a standalone command that init also calls internally, and adds the one thing init's steps don't do on their own: recognising which of them are safe to re-apply against an *existing* project's current state (an unmodified index refreshed, a localised one left alone; an unmodified skill upgraded, a user-modified one preserved) and refusing outright when the project's schema version has drifted too far to trust the templates it would refresh against. Sync never touches `.cortex/`'s knowledge content — compass, atlas, archive, insight, pulse state are exactly as the developer left them, before and after.

## Entities

- **READS:** `.cortex/cortex.config.json` (preflight existence + `schemaVersion`, per schema §10.1); `CLAUDE.md` (existing managed block and its version marker, schema §8); every `.cortex/**/_index.md` outside the pulse subdirectory carve-out (schema §7.1); `.claude/skills/` (installed bundle content); `.claude/skills/<bundle>/.cortex-installed.json` (this spec's own installed-bundle marker, written only by sync — never by init — Rule 5); `.claude/settings.json` (existing hook entries); `.git/hooks/post-commit` (existing hook content); `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` (existing task payloads, schema §9.1); the shipped `_index.md` / CLAUDE.md-block / scheduled-task templates and skill bundles inside the installed npm package (`src/cli/templates.ts` and `skills/`); `schema.validator`'s `supportedMajor`/`supportedMinor` (schema §10.3).
- **WRITES:** `.cortex/cortex.config.json` (`schemaVersion` rewrite on a MINOR upgrade, Rule 2 — no other key touched); `CLAUDE.md` (managed block insert-or-update; creates the file if absent); non-localised `_index.md` files (refreshed to the current template); `.claude/skills/` (bundle install/upgrade, `.cortex-installed.json` marker); `.claude/settings.json` (hook merge); `.git/hooks/post-commit` (append-if-missing); `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` (payload refresh, via `core-cli.task-scoping`'s writer).
- **CREATES:** nothing under `.cortex/` — sync operates only on scaffolding that `cortex init` already created; it never creates the `.cortex/` skeleton itself (that remains init's job). `CLAUDE.md` and `.claude/settings.json` are created only if entirely absent, exactly as init would.

## Rules

1. **Preflight — the complement of init's gate.** Refuse (exit 2, nothing written) when: `.cortex/cortex.config.json` does not exist (this is the existing-project command; a project with no Cortex footprint at all is `cortex init`'s job, named in the refusal message) — or the platform is not macOS (`darwin`), same v1 gate as init (design §3, RULES.md rule 5).
2. **Version gate (schema §10.3, §10.4).** Compare the project's `schemaVersion` MAJOR against the installed package's `supportedMajor` (`schema.validator`'s constants). **MAJOR differs (either direction)** — the project is behind an installed package that no longer recognises its old contract, or ahead of one that hasn't caught up — sync refuses the scaffolding refresh entirely (exit **3**, nothing written) and names the concrete next step: `cortex migrate` when the project is behind, upgrading the installed `cortex` package when the project is ahead. Sync is deliberately **not** a migration path (schema §10.4): it never attempts a partial refresh against a contract it doesn't fully recognise. **MAJOR equal, any MINOR** — proceed; sync **is** the MINOR upgrade path, re-scaffolding templates to the version the installed package currently ships and rewriting `schemaVersion` accordingly.
3. **CLAUDE.md managed block (schema §8).** Insert or update the `<!-- cortex:start -->…<!-- cortex:end -->` block, creating `CLAUDE.md` if it is entirely absent — this is the repair story: content outside the markers is never modified, whether the file already had a block, had none, or didn't exist. Idempotent: re-running changes nothing once the block matches the current template and version.
4. **`_index.md` template refresh — localisation-aware, a judgment call.** For every `.cortex/**/_index.md` outside the schema §7.1 pulse-subdirectory carve-out: if its current bytes exactly match the shipped template output for the `schemaVersion` recorded in `cortex.config.json` **before** this run (i.e., nothing has touched it since it was last written by init or a prior sync), refresh it to the current template. If its bytes differ from that prior-version template — a human or a loop (the onboarding-drift loop's own localisation-refresh proposals, `loops.onboarding-drift` Note) has localised it — sync leaves it in place and reports it as localised, not refreshed. This mirrors `loops.onboarding-drift`'s drift signal (d) in reverse: that loop only proposes; sync is the human-invoked act of refreshing what's safe to refresh.
5. **Skill-bundle upgrade — a judgment call, reusing init's mechanism.** For each bundle shipped in the installed package's `skills/`: absent locally → install it (as init Rule 4 would). Present and byte-identical to the shipped bundle → already current, no-op. Present and differing from the shipped bundle: sync consults the bundle's `.cortex-installed.json` marker (written only by sync, never by init, recording the SHA-256 of the bundle as shipped the last time sync ran against it). If the on-disk bundle still matches that recorded hash — untouched since sync last touched it — sync upgrades it silently and rewrites the marker to the newly shipped hash. If the on-disk bundle diverges from the recorded hash (the developer edited it) — or no marker exists at all, which covers both a bundle init just installed and one that predates this mechanism, and which sync treats alike as unknown provenance rather than assuming it's safe — sync prompts before overwriting (`--yes` accepts for all bundles in this run; declining, or the non-interactive default, preserves the developer's copy and reports it as skipped-user-modified). This is the same prompt-or-preserve shape as `core-cli.init` Rule 4, extended with the marker so unmodified upgrades don't need a prompt at all.
6. **Hooks merge (schema §5).** Merge the current hook entries into `.claude/settings.json`, creating it if absent and preserving all unrelated keys — identical merge semantics to `core-cli.init` Rule 11. The Read-pair entries are present iff `cortex.config.json` `hooks.preRead` is true. The result must satisfy `check.hook-config`; this is sync's registration-refresh path referenced by schema §5's "sync refreshes an existing project's hook registration."
7. **Git post-commit hook.** If the project is a git repo and `.git/hooks/post-commit` does not already carry the Cortex anatomy-refresh-fast invocation, append it (as `core-cli.init` Rule 12 would), preserving any existing hook content and leaving the file executable. If the invocation is already present, no-op. If not a git repo, skip with a notice.
8. **Scheduled-task payload refresh (schema §9.1, §9's payload/registration split).** For each of the five bundles: absent locally → write it (as init Rule 13 would). Present and matching the current shipped payload template → no-op. Present and differing: apply the same unmodified-vs-user-modified judgment as Rule 5 (a payload-level `.cortex-installed.json` alongside each scoped task directory) — an unmodified payload is refreshed silently (picking up a changed member-loop roster or cadence), a user-modified one is left in place and reported. Sync never touches registration state itself — only the payload files. After refreshing, sync runs the same read-only `registrationStatus` check init uses (tolerating registry-not-found) and prints the identical instruction block (open the project in Claude Desktop, run `cortex-register-tasks`, confirm with `cortex tasks verify`) when any of the five is unregistered, or the all-registered one-liner otherwise.
9. **Never touches knowledge content.** `compass/`, `atlas/`, `archive/`, `insight/` content and `pulse/` state are read by nothing in this spec and written by nothing in this spec — every byte in those trees is identical before and after a sync run.
10. **Self-validation.** After all steps, run `schema.validator` over the project. Sync succeeds (exit 0) only if the report is conformant (zero errors); otherwise it prints the violations and exits 1. Warnings do not fail sync.
11. **Summary.** Print a summary naming every change made or considered: CLAUDE.md block created/updated/already-current, each `_index.md` refreshed vs. left-as-localised, each skill bundle installed/upgraded/skipped-user-modified, hooks merged, git hook state, each task payload refreshed/left-as-localised, and the Rule 8 registration-status instruction block or one-liner. Exit codes: 0 success, 1 self-validation failure, 2 preflight refusal, 3 version-gate refusal (Rule 2).
12. **No silent destruction.** Every write to a pre-existing file is a merge, an append, or an upgrade gated by Rules 4/5/8's unmodified check — never an unconditional overwrite. This rule wins over any step above if they conflict. Sync has no `--force` flag: unlike init, which uses `--force` to permit re-running against an existing `.cortex/` at all, sync is designed to run repeatedly against an existing project by default, so there is nothing for `--force` to unlock.

## Acceptance Criteria

### Missing CLAUDE.md block is repaired, rest of the file untouched

- **Given** a project with a valid `.cortex/cortex.config.json` and a `CLAUDE.md` containing `# My Project` and a `## Commands` section but no `<!-- cortex:start -->` block
- **When** `cortex sync` runs
- **Then** the file gains exactly one well-formed managed block matching the current template and `schemaVersion`
- **And** `# My Project` and `## Commands` are byte-identical to before

### No --force needed on an existing project; a non-Cortex project refuses cleanly

- **Given** a project with an existing, current `.cortex/cortex.config.json`
- **When** `cortex sync` runs with no flags
- **Then** it completes without requiring any force-style flag
- **And given** a project with no `.cortex/` at all, `cortex sync` exits 2 and nothing is created or modified in the project or `~/.claude/`

### Non-macOS platform refused

- **Given** the process platform reports `linux`
- **When** `cortex sync` runs
- **Then** it exits 2 with a message naming macOS as the v1 requirement, and nothing is written

### Unmodified skill bundle is upgraded silently

- **Given** a project whose `.claude/skills/cortex-pulse-hygiene/` is byte-identical to the version it was installed at (its `.cortex-installed.json` hash matches the on-disk content) and the installed package now ships a changed version of that bundle
- **When** `cortex sync` runs
- **Then** the bundle on disk matches the newly shipped content, its marker is rewritten to the new hash, and the summary names it as upgraded

### User-modified skill bundle is preserved and reported

- **Given** the same project, but the developer has edited `cortex-pulse-hygiene/SKILL.md` since install (its content no longer matches the recorded marker hash)
- **When** `cortex sync` runs without `--yes`
- **Then** the bundle on disk is unchanged, and the summary names it as skipped because it was user-modified
- **And given** `--yes` is passed, the bundle is overwritten with the shipped version and the summary names it as upgraded

### Task payloads refresh and the instruction block appears when unregistered

- **Given** a project whose scheduled-task payloads were written by an older package version and the installed package now ships a bundle with a changed member-loop roster, with a stubbed home directory and no registry present
- **When** `cortex sync` runs
- **Then** the affected payload SKILL.md files are refreshed to the current roster
- **And** the summary prints the open-Desktop-and-run-`cortex-register-tasks` instruction block (registry missing counts as all five unregistered)
- **And given** a fixture registry where all five are registered and enabled, the summary prints the all-registered one-liner instead

### Localised _index.md is preserved and reported, not refreshed

- **Given** a project whose `compass/_index.md` no longer matches the shipped template for the `schemaVersion` recorded before this run (a human or the onboarding-drift loop edited it)
- **When** `cortex sync` runs
- **Then** that file is byte-identical after the run
- **And** the summary names it as localised and left alone
- **And given** a sibling `_index.md` that still matches its prior-version template exactly, that one is refreshed to the current template

### Knowledge content is byte-identical after sync

- **Given** a project with populated `compass/`, `atlas/`, `archive/`, `insight/`, and `pulse/` directories
- **When** `cortex sync` runs
- **Then** every file under those directories is byte-identical, and none is created or deleted

### MAJOR schema lag defers to migrate, nothing written

- **Given** a project whose `cortex.config.json` declares a `schemaVersion` MAJOR below the installed package's `supportedMajor`
- **When** `cortex sync` runs
- **Then** it exits **3**, names `cortex migrate` as the next step, and writes nothing — not even the CLAUDE.md block
- **And given** the project's MAJOR is instead *above* the installed package's `supportedMajor`, the same exit code and refusal apply, naming a `cortex` package upgrade as the next step

### MINOR upgrade rewrites schemaVersion and nothing else in the config

- **Given** a project at `schemaVersion` `3.0` and an installed package shipping `3.1`
- **When** `cortex sync` runs
- **Then** scaffolding is refreshed to the `3.1` templates
- **And** `cortex.config.json`'s `schemaVersion` reads `3.1`
- **And** no other key in the config file is modified

### Idempotent double-run

- **Given** a project on which `cortex sync` has just completed successfully
- **When** `cortex sync` runs again immediately
- **Then** no file's bytes change, no new skill or task upgrades occur, and the summary reports everything already current

## Notes

- **Factoring (Notes-level implementation decision, not an observable behaviour change).** `cortex init`'s Rules 4, 10, 11, 12, 13 are implemented by calling the same internal scaffolding module this spec exposes as `cortex sync`; init additionally creates the `.cortex/` skeleton and runs the anatomy/purpose/preferences/spec-tree/migration steps sync never touches. Init's own observable behaviour (Rules, ACs) is unchanged by this factoring.
- **Judgment call (`.cortex-installed.json` marker, Rules 5 and 8).** Neither `cortex-schema.md` nor `core-cli.init` defines a mechanism for telling "upgraded since install, unmodified" apart from "developer edited this." This spec introduces a small sidecar marker (content hash at install/last-sync time) per skill bundle and per scheduled-task payload to make that judgment call decidable without guessing. It is this spec's own bookkeeping file, not a schema-committed artefact — the same category as `core-cli.tasks-register`'s `.cortex-backup-<stamp>` convention, which also isn't in `cortex-schema.md`.
- **Decision (marker is sync-only, confirmed by implementation).** `cortex init` never writes `.cortex-installed.json`. Having init stamp it would put a stray file next to every freshly installed bundle and every freshly written task payload, breaking the byte-identity acceptance criteria the awareness suite (`tests/spec/specflow/awareness.test.ts`) holds init to. A bundle or payload with no marker is therefore either one init just installed or one that predates this mechanism entirely — Rules 5/8 already fold both into "unknown provenance, prompt rather than assume," so the first `cortex sync` run against any project establishes the baseline without a separate bootstrap step.
- **Implementation state (Rule 4, `_index.md` comparison).** Only one template generation has ever shipped, so the implementation currently compares on-disk bytes against the *current* template rather than the schemaVersion-keyed prior-version template Rule 4 specifies — a code comment marks the collapse. The two comparisons are identical today because there is nothing else to compare against; the Rule's literal contract takes over, unchanged, the first time a MINOR bump actually changes template content, at which point version-keyed template storage is needed to honour it.
- **Judgment call (exit codes).** Sync reuses init's slot numbering where the situations are analogous (2 = preflight refusal) and claims 3 for its own distinct refusal (version-gate deferral) rather than init's meaning for 3 (complete-but-unauthenticated) — the two commands never run in the same process, so the reuse is a readability choice, not a shared contract.
- **Deliberately not done:** this spec does not give sync a `--partial` equivalent or a bundle-selection flag — init's `--partial` answers "which bundles to write when member skills are missing," a day-1 concern; sync always considers all installed bundles and reports what it can't safely touch, which covers the same ground without a second flag.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
