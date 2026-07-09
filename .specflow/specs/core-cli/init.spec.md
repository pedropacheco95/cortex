---
id: core-cli.init
status: implemented
depends_on:
  - schema.validator
  - anatomy.scanner
implements: ../../specs-business/core-cli/developer-sets-up-cortex-in-one-command.business.md
governed_by: []
governs:
  - "src/cli/**/*.ts"
---

# cortex init — Day-1 Bootstrap

## Intent

`cortex init` is the single command that brings a project under Cortex management (design §13, as amended). It creates the `.cortex/` skeleton, runs the anatomy scanner, completes day-1 purposes via the agentic layer, drafts preferences, scaffolds or respects the spec trees, wires the scaffolding (CLAUDE.md, hooks, git hook, Desktop scheduled tasks), migrates legacy SpecFlow artefacts, validates its own output, and prints a complete summary — idempotently and without destroying anything that already exists. It is the implementation of the one-command-setup outcome.

## Entities

Init operates on the project directory, the user's `~/.claude/`, and the git repo. It orchestrates; the artefact shapes it writes are owned by `cortex-schema.md`.

- **READS:** the project root (presence checks); `package.json`, `tsconfig.json`, `.eslintrc*`, `pyproject.toml`, `README.md` (preferences drafting); a legacy root `bugs.md` (migration); existing `.gitignore`, `CLAUDE.md`, `.claude/settings.json`, `.git/hooks/post-commit` (merge targets); the skill bundles shipped inside the installed npm package.
- **WRITES:** `.gitignore` (append), `CLAUDE.md` (managed block), `.claude/settings.json` (merge), `.claude/skills/` (install), `.git/hooks/post-commit` (append), `~/.claude/scheduled-tasks/<task>/SKILL.md` (create), `.cortex/cerebrum/preferences.md` (draft), `.cortex/cerebrum/bugs/` (migration), spec-tree skeletons when absent.
- **CREATES:** the `.cortex/` skeleton per schema §1 — every directory with its `_index.md` active prompt (schema §7.1 templates) and `cortex.config.json` (schema §10.1, current `schemaVersion`).

## Rules

1. **Preflight.** Refuse (exit 2, nothing written) when: `.cortex/` already exists and `--force` was not given; or the platform is not macOS (`darwin`) — v1 is macOS-only (design §3, RULES.md rule 5) and init is where that gate lives.
2. **Gitignore (schema Decision 1).** Append exactly the four regenerable/sensitive/transient paths — `.cortex/anatomy/`, `.cortex/atlas/sources/`, `.cortex/pulse/`, `.cortex/constellation.json` — to `.gitignore`, creating it if absent. Never `.cortex/` wholesale. Idempotent: lines already present are not duplicated.
3. **Skeleton.** Create the full `.cortex/` layout per schema §1, populating every directory's `_index.md` from the schema §7.1 active-prompt templates (not empty placeholders), and write `cortex.config.json` with the current `schemaVersion` and the §10.1 defaults.
4. **Skills install.** Copy the skill bundles shipped inside the npm package into the project's `.claude/skills/`. If a bundle already exists there, prompt before overwriting (`--yes` accepts all; declining preserves the user's copy). Init installs whatever bundles the installed package version ships — it does not hardcode a count.
5. **Anatomy scan.** Run the native scanner (`anatomy.scanner`) — deterministic, per its own spec.
6. **Inline purpose pass — the Core/agentic boundary.** For entries left `needs_purpose_refresh: true`, init spawns the Claude Code CLI headless (`claude -p …`) as a **subprocess** instructing it to run the anatomy deep-refresh Skill, and waits (bounded timeout, configurable). The Core process itself makes **no** LLM/API calls (RULES.md rule 3) — the agentic layer is delegated to as an opaque subprocess. Failure semantics are fixed, not implementation-defined:
   - **`--no-llm` given:** the pass is deliberately skipped. This is a **success state**, never an error: init exits 0, all undocumented files stay flagged, and the summary states the flagged count and that the scheduled deep-refresh will fill them.
   - **`claude` binary absent, subprocess timeout, user cancellation (SIGINT to the subprocess), or mid-batch error:** init **degrades gracefully** — every file not confirmed rewritten stays flagged `needs_purpose_refresh: true`, a clear notice lands in the summary, and init still exits 0. A subprocess problem never fails init.
   - **Authentication failure** (the subprocess reports the Claude CLI is not logged in / unauthorized): init must detect this, never hang, complete all remaining steps, and exit with the dedicated code **3** — "complete but unauthenticated" — so scripts can distinguish it. The summary names authentication specifically and tells the user to authenticate (`claude` login) and re-run the purpose pass or wait for the scheduled loop. All artefacts on disk are complete and valid; only purposes are missing.
7. **Preferences draft.** Deterministically extract stack/formatting/framework facts from `package.json`, `tsconfig.json`, `.eslintrc*`, `pyproject.toml`, `README.md` into `.cortex/cerebrum/preferences.md`, explicitly marked as a draft for human review — never as accepted rules. Absent inputs are skipped silently.
8. **Spec trees.** If `specs/` / `specs-business/` are absent, scaffold skeletons (root `_overview.md` in both; `specs/_index.md` per schema §7.2) and print a recommendation to run `specflow-onboard-codebase`. Init **never auto-runs onboarding** — it is a heavyweight agentic workflow the user starts deliberately. If the trees exist, they are not touched.
9. **Legacy migration (design §8.5, schema §10.4).** If a root `bugs.md` exists, split it into `.cortex/cerebrum/bugs/B-NNN-<slug>.md` files conforming to schema §4.3, and replace the original's content with a deprecation marker pointing at the new location. No other file is migrated by init in v1.
10. **CLAUDE.md managed block (schema §8).** Insert or update the `<!-- cortex:start -->…<!-- cortex:end -->` block, creating `CLAUDE.md` if absent. Content outside the markers is never modified. Re-running updates only the block (idempotent).
11. **Hooks registration (schema §5).** Merge the hook entries into `.claude/settings.json`, creating it if absent and preserving all unrelated keys. The PreRead hook entry is written iff `cortex.config.json` `hooks.preRead` is true. The result must satisfy `check.hook-config`.
12. **Git post-commit hook.** If the project is a git repo: install the anatomy-refresh-fast invocation into `.git/hooks/post-commit`, **appending** to an existing hook file rather than replacing it (and making it executable). If not a git repo: skip with a notice.
13. **Desktop scheduled-task payloads (design §13 step 12; corrected by B-009).** Write one `~/.claude/scheduled-tasks/<scoped-task-name>/SKILL.md` per scheduled loop — names project-scoped per schema §9.1 and `core-cli.task-scoping` (slug + path-hash + canonical task name; recognition, preserve, and overwrite logic all match only this project's prefix) — the fourteen of schema §9.1 at 3.0 — each `name`/`description` frontmatter plus the prompt body per schema §9-adjacent conventions. **These SKILL.md directories are prompt payloads only, not registration**: the Desktop app never scans `~/.claude/scheduled-tasks/` — its registry is its own `scheduled-tasks.json`, which `cortex tasks register` writes (upserting the fourteen entries with cadences from the canonical cadence table) and `cortex tasks verify` checks (spec `core-cli.tasks-register`). Init's summary must say the payloads are not yet registered and point at those commands. Idempotent: existing task files are overwritten only with `--force`, otherwise left in place.
14. **Self-validation.** After all steps, run `schema.validator` over the project. Init succeeds (exit 0) only if the report is conformant (zero errors); otherwise it prints the violations and exits 1. Warnings do not fail init.
15. **Summary.** Print a summary naming every change made: files indexed (and how many purposes were filled inline vs left flagged), skills installed, preferences drafted, hooks registered, git hook state, scheduled task payloads written, CLAUDE.md updated, migrations performed, spec-tree state — plus the reminder that the payloads are not yet registered with the Desktop app and to run `cortex tasks register` / `cortex tasks verify` (B-009). Exit codes: 0 success (including a degraded purpose pass, Rule 6), 1 self-validation failure, 2 preflight refusal, 3 complete-but-unauthenticated (Rule 6).
16. **No silent destruction.** Every write to a pre-existing file is a merge or an append; the only overwrites are `--force`-gated. This rule wins over any step above if they conflict.
17. **`--partial` mode.** With `--partial`, init writes a scheduled-task payload (Rule 13) **only if every skill its prompt invokes is present** in the project's `.claude/skills/`; tasks whose skills are absent are skipped, and the summary names each skipped task and the missing skill it needs. All other init behaviour is unchanged: `.cortex/` skeleton, scanner run, purpose pass, hooks registered, CLAUDE.md updated, git hook installed. This makes init usable while Cortex itself is under construction (loops land incrementally) and covers the v1.x case of users disabling optional loops. The task→skill mapping is owned by the task definitions themselves — each declares the skill(s) its prompt invokes. **Default (non-partial) mode is unchanged:** all fourteen task payloads are written regardless of skill presence — a task firing without its skill degrades politely in the Desktop session — but the summary warns which written tasks currently lack their skill and names `--partial` as the honest opt-in.

## Acceptance Criteria

### Fresh init on an empty project succeeds end-to-end

- **Given** an empty git-initialised project directory on macOS with no `.cortex/`
- **When** `cortex init --no-llm` runs
- **Then** `.cortex/` matches the schema §1 layout with an `_index.md` in every directory and a `cortex.config.json` declaring the current `schemaVersion`
- **And** the final self-validation reports conformant and the exit code is 0

### Existing .cortex/ refused without --force

- **Given** a project where `.cortex/cortex.config.json` already exists
- **When** `cortex init` runs without `--force`
- **Then** init exits 2 and no file in the project or `~/.claude/` is created or modified

### Non-macOS platform refused

- **Given** the process platform reports `linux`
- **When** `cortex init` runs
- **Then** init exits 2 with a message naming macOS as the v1 requirement, and nothing is written

### Gitignore additions are exact and idempotent

- **Given** a project whose `.gitignore` already contains `.cortex/pulse/`
- **When** `cortex init --no-llm` runs
- **Then** `.gitignore` contains `.cortex/anatomy/`, `.cortex/atlas/sources/`, `.cortex/pulse/`, and `.cortex/constellation.json` exactly once each
- **And** it does not contain a bare `.cortex/` line

### CLAUDE.md content outside the managed block is preserved

- **Given** a `CLAUDE.md` containing `# My Project` and a `## Commands` section
- **When** `cortex init --no-llm` runs twice
- **Then** the file contains exactly one `<!-- cortex:start -->…<!-- cortex:end -->` block
- **And** `# My Project` and `## Commands` are byte-identical to before

### settings.json merge preserves unrelated keys

- **Given** `.claude/settings.json` containing `{"model": "opus", "hooks": {"Stop": [{"matcher": "*"}]}}`
- **When** `cortex init --no-llm` runs
- **Then** the Cortex hook entries are present, `model` and the `Stop` hook are unchanged, and `check.hook-config` passes

### Purpose pass skipped cleanly when claude is unavailable

- **Given** a project with source files lacking doc comments and no `claude` binary on PATH
- **When** `cortex init` runs (without `--no-llm`)
- **Then** init still exits 0
- **And** the affected `files.md` rows keep `needs_purpose_refresh: true`
- **And** the summary states the purpose pass was skipped and will be handled by the scheduled refresh

### Inline purpose pass invoked as a subprocess when available

- **Given** a stub `claude` executable on PATH that records its invocation and rewrites flagged purposes
- **When** `cortex init` runs
- **Then** the stub was invoked exactly once with a prompt naming the anatomy deep-refresh Skill
- **And** init's own process opened no network connections

### Auth failure: named specifically, exit 3, everything else complete

- **Given** a stub `claude` executable on PATH that exits reporting an authentication/login error
- **When** `cortex init` runs
- **Then** init does not hang, completes every remaining step (hooks, tasks, CLAUDE.md, self-validation), and exits **3**
- **And** the summary names authentication specifically and tells the user how to authenticate and get purposes filled
- **And** every undocumented file's row still has `needs_purpose_refresh: true`

### Subprocess timeout or mid-batch error degrades gracefully

- **Given** a stub `claude` executable that hangs past the configured timeout (or dies mid-batch after rewriting some rows)
- **When** `cortex init` runs
- **Then** init exits **0**
- **And** every file not confirmed rewritten keeps `needs_purpose_refresh: true` (rows already rewritten keep their new purposes)
- **And** the summary carries a notice that the purpose pass did not complete and the scheduled refresh will finish it

### --no-llm is a success state with a visible flagged count

- **Given** a project with 5 files lacking doc comments
- **When** `cortex init --no-llm` runs
- **Then** init exits **0** with no error-styled output about the LLM
- **And** the summary states that 5 files are flagged `needs_purpose_refresh` and that the scheduled deep-refresh (or a re-run after authentication) will fill them

### Legacy bugs.md migrated with deprecation marker

- **Given** a root `bugs.md` with two bug entries
- **When** `cortex init --no-llm` runs
- **Then** `.cortex/cerebrum/bugs/` contains `B-001-*.md` and `B-002-*.md` conforming to schema §4.3
- **And** the root `bugs.md` now contains only a deprecation marker pointing at the new location

### Spec trees scaffolded only when absent, onboarding recommended not run

- **Given** a project with no `specs/` directory
- **When** `cortex init --no-llm` runs
- **Then** `specs/_index.md`, `specs/_overview.md`, and `specs-business/_overview.md` exist as skeletons
- **And** the summary recommends `specflow-onboard-codebase`
- **And** given a project whose `specs/` already has content, that content is byte-identical after init

### Fourteen scheduled task payloads written — payloads, not registration

- **Given** a fresh init with a stubbed home directory
- **When** `cortex init --no-llm` runs
- **Then** `~/.claude/scheduled-tasks/` contains fourteen task directories under this project's scoped names (schema §9.1), each holding a `SKILL.md` with the scoped `name` and `description` frontmatter
- **And** the summary states the payloads are not yet registered with the Desktop app and points at `cortex tasks register` / `cortex tasks verify`
- **And** re-running without `--force` leaves user-modified task files untouched

### --partial writes payloads for exactly the tasks whose skills ship or are present

- **Given** a fresh project and a package shipping the five loop skill bundles (installed by Rule 4 before the task check)
- **When** `cortex init --partial --no-llm --yes` runs
- **Then** exactly the tasks whose invoked skills are now present get their payloads written — with the full packaged-skill census (all task-invoked skills shipping), that is all fourteen — exit code 0
- **And** the `.cortex/` skeleton, anatomy, hooks, and CLAUDE.md block are all complete
- **And** the summary names each skipped task with the missing skill it needs
- _(Historical note: before any bundles shipped, this AC's premise was "zero loop skills → 0 task payloads" — superseded when the loop bundles began shipping with the package.)_

### --partial with some skills present → only those tasks, skips named

- **Given** a project whose `.claude/skills/` contains `specflow-lint` and `specflow-tests` but no `cortex-*` loop skills
- **When** `cortex init --partial --no-llm` runs
- **Then** exactly the tasks whose invoked skills are present are written (including the `specflow-lint` and `specflow-verify` tasks)
- **And** the summary names each skipped task with the missing skill it needs

### Default mode with missing skills → all fourteen written, warning names the gaps

- **Given** the same project as above
- **When** `cortex init --no-llm` runs without `--partial`
- **Then** all fourteen task directories are written
- **And** the summary warns which written tasks lack their skill and mentions `--partial`

### Git hook appended, not clobbered

- **Given** a git repo whose `.git/hooks/post-commit` already contains `echo existing`
- **When** `cortex init --no-llm` runs
- **Then** the hook file still contains `echo existing`, followed by the cortex anatomy-refresh-fast invocation, and remains executable

## Notes

- **Decision (Core/agentic mechanism, Rule 6):** "the Skill runs inline as part of `cortex init`" (design §7.2 as amended) is realised by spawning the Claude Code CLI headless as a subprocess. RULES.md rule 3 is interpreted as: the Core *process* makes no LLM/API calls; delegating to the agentic layer via subprocess is the sanctioned boundary. The git post-commit hook path stays pure-deterministic (it never triggers the subprocess).
- **Decision (design open question #11 — REVISED by B-009):** OQ#11's conservative path ("init writes SKILL.md files only; cadence/config is confirmed in the Desktop app UI on first open") was falsified against the app: the Desktop app never scans `~/.claude/scheduled-tasks/`, so there is no confirm-on-first-open flow for tasks it doesn't know exist. Corrected mechanism (B-009 change-plan option 1, owner-approved): init writes prompt payloads only; **registration is an entry in the app's own `scheduled-tasks.json` registry**, written by `cortex tasks register` (which also assigns cadence from the canonical cadence table) and checked by `cortex tasks verify` — spec `core-cli.tasks-register`. If upstream #47797 (task metadata beside SKILL.md) ships, a MINOR revision can re-home registration onto it.
- **Decision (§8.4 bridge 5 reconciliation):** init scaffolds empty spec trees and *recommends* onboarding; it never auto-runs `specflow-onboard-codebase`. Pending design-doc edit to match.
- OPEN: the exact `_index.md` template texts (schema §7.1 fixes the shape and budget; the per-module wording ships with the implementation and should be reviewed against the token budgets).
- Also supports: every other domain — init is the entry point that wires scaffolding, hooks, pulse, loops, and specflow together. Primary parent remains `core-cli.developer-sets-up-cortex-in-one-command`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
