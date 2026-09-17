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

1. **Preflight.** Refuse (exit 2, nothing written) when: `.cortex/` already exists and `--force` was not given — the refusal message names `cortex sync` as the existing-project path (repair/upgrade without a forced re-init, spec `core-cli.sync`); or the platform is not macOS (`darwin`) — v1 is macOS-only (design §3, RULES.md rule 5) and init is where that gate lives; or the target itself sits at or beneath an existing Cortex layer — a directory named `.cortex` carrying its own `cortex.config.json` (the target IS such a directory, or is nested inside one, e.g. a subdirectory of `.cortex/`) — in which case the refusal message names the project root (that layer directory's parent) and tells the user to run `cortex init` or `cortex sync` there instead. This third condition is **never bypassed by `--force`**: initialising inside a `.cortex/` layer is never an intentional action, unlike the other two conditions where `--force`/a corrected platform is a legitimate way past the gate. It is distinct from the existing-`.cortex/`-exists condition above: that one fires when the target directory already *has* a `.cortex/` child; this one fires when the target directory *is, or is beneath,* a `.cortex/` layer itself — a normal project root that merely contains a `.cortex/` child (the everyday case) is unaffected.
2. **Gitignore (schema Decision 1).** Append exactly the regenerable/sensitive/transient paths — `.cortex/atlas/sources/`, `.cortex/pulse/`, `.cortex/constellation.json`, `.cortex/archive/documents/*/source.*` (v3.0), and `.cortex/recall-index.json` (3.4, `recall.recall-index`) — to `.gitignore`, creating it if absent (`.cortex/anatomy/` retired with the module at v3). Never `.cortex/` wholesale. Idempotent: lines already present are not duplicated. **Skeleton at 3.4:** `atlas/evidence/` with its `_index.md` joins the atlas subdirectories Rule 3 scaffolds (schema §1); the recall index is compiled after the constellation (Rule 3's citation-graph compile step) so a fresh project has both regenerable files on day one. **3.4 second revision:** immediately after the recall index, init writes the generated blocks into `atlas/decisions/_index.md` and `atlas/evidence/_index.md` (`recall.index-blocks` Rule 6) — on a fresh project both are empty, so no block is written and the files stay byte-identical to their templates.
3. **Skeleton.** Create the full `.cortex/` layout per schema §1, populating every directory's `_index.md` from the schema §7.1 active-prompt templates (not empty placeholders), and write `cortex.config.json` with the current `schemaVersion` and the §10.1 defaults — **3.4 fifth revision:** including `"visibility": { "repo": "unknown", "allow": [] }` written explicitly (`schema.visibility` Rule 1) and, in `compass/`, the header-only id registry `registry.md` (`schema.id-registry` Rules 1 and 6).
4. **Skills install.** Copy the skill bundles shipped inside the npm package into the project's `.claude/skills/`. If a bundle already exists there, prompt before overwriting (`--yes` accepts all; declining preserves the user's copy). Init installs whatever bundles the installed package version ships — it does not hardcode a count.
5. **Anatomy scan.** Run the native scanner (`anatomy.scanner`) — deterministic, per its own spec.
6. **Inline purpose pass — the Core/agentic boundary.** For entries left `needs_purpose_refresh: true`, init spawns the Claude Code CLI headless (`claude -p …`) as a **subprocess** instructing it to run the anatomy deep-refresh Skill, and waits (bounded timeout, configurable). The Core process itself makes **no** LLM/API calls (RULES.md rule 3) — the agentic layer is delegated to as an opaque subprocess. Failure semantics are fixed, not implementation-defined:
   - **`--no-llm` given:** the pass is deliberately skipped. This is a **success state**, never an error: init exits 0, all undocumented files stay flagged, and the summary states the flagged count and that the scheduled deep-refresh will fill them.
   - **`claude` binary absent, subprocess timeout, user cancellation (SIGINT to the subprocess), or mid-batch error:** init **degrades gracefully** — every file not confirmed rewritten stays flagged `needs_purpose_refresh: true`, a clear notice lands in the summary, and init still exits 0. A subprocess problem never fails init.
   - **Authentication failure** (the subprocess reports the Claude CLI is not logged in / unauthorized): init must detect this, never hang, complete all remaining steps, and exit with the dedicated code **3** — "complete but unauthenticated" — so scripts can distinguish it. The summary names authentication specifically and tells the user to authenticate (`claude` login) and re-run the purpose pass or wait for the scheduled loop. All artefacts on disk are complete and valid; only purposes are missing.
7. **Preferences draft.** Deterministically extract stack/formatting/framework facts from `package.json`, `tsconfig.json`, `.eslintrc*`, `pyproject.toml`, `README.md` into `.cortex/cerebrum/preferences.md`, explicitly marked as a draft for human review — never as accepted rules. Absent inputs are skipped silently.
8. **Spec trees.** If `specs/` / `specs-business/` are absent, scaffold skeletons (root `_overview.md` in both; `specs/_index.md` per schema §7.2) and print a recommendation to run `specflow-onboard-codebase`. Init **never auto-runs onboarding** — it is a heavyweight agentic workflow the user starts deliberately. If the trees exist, they are not touched.
9. **Legacy migration (design §8.5, schema §10.4).** If a root `bugs.md` exists, split it into `.cortex/cerebrum/bugs/B-NNN-<slug>.md` files conforming to schema §4.3, and replace the original's content with a deprecation marker pointing at the new location. No other file is migrated by init in v1.
10. **CLAUDE.md managed block (schema §8).** Insert or update the `<!-- cortex:start -->…<!-- cortex:end -->` block, creating `CLAUDE.md` if absent. Content outside the markers is never modified. Re-running updates only the block (idempotent). **3.4 fifth revision (brief §1.1, §5).** The block is rendered by `claudeMdBlock(projectName, config)` from the §8 template and the project's `cortex.config.json`: (a) the protocol paragraph names the non-implementer roles — the pinned sentence *"This applies more, not less, to sessions that dispatch, review or plan rather than edit: everything reaches them as a claim, and `compass/` is where claims are checked."*; (b) one **placement paragraph**, generated, replaces any split guidance: `**Placement:** durable knowledge lives in \`.cortex/\` (tracked, except \`atlas/sources/\`, \`pulse/\` and archived raw sources).` followed by ` \`<placement.localNotesDir>\` is local and untracked: notes there do not travel — promote them into \`.cortex/\` instead of tracking the directory.` when `placement.localNotesDir` is set (schema §10.1), and by ` This repository is public: compass and atlas carry pointers, never hosts, ports or account ids (RULES.md rule 20).` when `visibility.repo` is `public`, or ` Repository visibility is unknown — set \`visibility.repo\` in \`cortex.config.json\`.` when it is `unknown`; (c) the two-sentence insight mandate ("Before substantive work on any file, query its insight entry… This is not optional.") is **removed** from the template — the 3.3 second-revision note already recorded its removal on measured non-compliance, and the template never followed. `check.claude-md` is unchanged (markers and version only); the paragraph text is pinned by this spec's tests.
11. **Hooks registration (schema §5).** Merge the hook entries into `.claude/settings.json`, creating it if absent and preserving all unrelated keys. The PreRead hook entry is written iff `cortex.config.json` `hooks.preRead` is true. The result must satisfy `check.hook-config`.
12. **Git post-commit hook.** If the project is a git repo: install the anatomy-refresh-fast invocation into `.git/hooks/post-commit`, **appending** to an existing hook file rather than replacing it (and making it executable). If not a git repo: skip with a notice.
13. **Desktop scheduled-task payloads (design §13 step 12; corrected by B-009).** Write one `~/.claude/scheduled-tasks/<scoped-task-name>/SKILL.md` per scheduled bundle — names project-scoped per schema §9.1 and `core-cli.task-scoping` (plain `<slug>-<canonical>` with hash fallback on collision, ownership marker stamped; recognition, preserve, and overwrite logic all match only this project's tasks) — the **five bundles** of schema §9.1 at 3.0 (`daily`, `weekly-curation`, `weekly-quality`, `test-runner`, `monthly-review`) — each `name`/`description` frontmatter plus the prompt body invoking the bundle's member loop skills in sequence, per schema §9-adjacent conventions. **These SKILL.md directories are prompt payloads only, not registration**: the Desktop app never scans `~/.claude/scheduled-tasks/` — its registry is its own in-memory-per-launch `scheduled-tasks.json`. Registration happens **in a Claude Desktop session via the `cortex-register-tasks` skill** (the app's own `mcp__scheduled-tasks__*` tools; `cortex tasks register` is only the guarded, app-closed direct-write fallback — spec `core-cli.tasks-register`). After writing payloads, init runs the read-only `registrationStatus` check against the registry (registry-not-found tolerated — the app may never have run) and, when any of the five is unregistered, prints a clearly-formatted instruction block: open this folder in Claude Desktop (new session), say `run cortex-register-tasks`, then confirm with `cortex tasks verify`. When all five are registered it prints the all-registered one-liner instead. Idempotent: existing task files are overwritten only with `--force`, otherwise left in place.
14. **Self-validation.** After all steps, run `schema.validator` over the project. Init succeeds (exit 0) only if the report is conformant (zero errors); otherwise it prints the violations and exits 1. Warnings do not fail init.
15. **Summary.** Print a summary naming every change made: files indexed (and how many purposes were filled inline vs left flagged), skills installed, preferences drafted, hooks registered, git hook state, scheduled task payloads written, CLAUDE.md updated, migrations performed, spec-tree state — plus the Rule 13 registration status: the open-Desktop-and-run-`cortex-register-tasks` instruction block when any task is unregistered (registry missing counts as all unregistered), or the all-registered one-liner otherwise (B-009 final mechanism). Exit codes: 0 success (including a degraded purpose pass, Rule 6), 1 self-validation failure, 2 preflight refusal, 3 complete-but-unauthenticated (Rule 6).
16. **No silent destruction.** Every write to a pre-existing file is a merge or an append; the only overwrites are `--force`-gated. This rule wins over any step above if they conflict.
17. **`--partial` mode.** With `--partial`, init writes a bundle payload (Rule 13) **only if every member-loop skill its prompt invokes is present** in the project's `.claude/skills/`; bundles missing any member skill are skipped, and the summary names each skipped bundle and the missing member skill it needs. All other init behaviour is unchanged: `.cortex/` skeleton, scanner run, purpose pass, hooks registered, CLAUDE.md updated, git hook installed. This makes init usable while Cortex itself is under construction (loops land incrementally) and covers the v1.x case of users disabling optional loops. The task→skill mapping is owned by the task definitions themselves — each declares the skill(s) its prompt invokes. **Default (non-partial) mode is unchanged:** all five bundle payloads are written regardless of member-skill presence — a bundle member firing without its skill degrades politely in the Desktop session, and the bundle's other members are failure-isolated from it — but the summary warns which written bundles currently lack a member skill and names `--partial` as the honest opt-in.
18. **Invocation gate (B-018).** Init runs **only** when the first CLI argument is the literal verb `init`, and the dispatcher strips that verb before parsing init's own flags and target (today the verb is kept out of the target only by an `indexOf(-1) + 1 === 0` accident in the positional filter — B-018 chain step 3). Every other path prints the **usage text** — the verb list the `src/cli/cli.ts` file-header docblock already carries, which is the single source so the two cannot drift — to **stdout** and exits **2** having written nothing, in the project or under `~/.claude/`: any first argument no verb branch matched (a mistyped verb, with or without sub-arguments; `--version`/`-v` included until a version verb is specified), `--help`, `-h`, and a bare `cortex` with no arguments. The usage text's first line names the unrecognised argument when there was one. This is the "unrecognised input is a usage error, never a silent fallback" contract `core-cli.init-profile` Rule 2 fixed one level down for `--profile`, applied at the verb level; it generalises Rule 1's exit-2 refusal rather than contradicting it. Source: B-018 (filed 2026-09-15 — `cortex --help` in an empty directory scaffolded a project and wrote five scheduled-task payloads into the user's home, exit 0). Owner decision recorded here: `--help` exits 2 like every other non-verb (B-018's proposed fix suggested 0; the lead chose one code for "nothing ran"), and bare `cortex` is **not** an init alias.

## Acceptance Criteria

### `--help` prints usage and writes nothing

- **Given** an empty directory on macOS with no `.cortex/`, and `HOME` pointing at an empty temp home
- **When** `cortex --help` runs (and, separately, `cortex -h`)
- **Then** the exit code is 2, stdout carries the usage text listing the known verbs (at least `init`, `sync`, `validate`, `scan`, `insight`, `usage`, `thread`, `why`, `recall`, `hook`), and nothing is created in the directory or under `$HOME/.claude/`

### A mistyped verb in a directory without .cortex/ is refused, not initialised

- **Given** the same directory and home
- **When** `cortex nonsense` runs, and separately `cortex insihgt file src/x.ts`
- **Then** each exits 2, the directory and `$HOME/.claude/scheduled-tasks/` are still empty (in particular no `.cortex/` and no `./file/`), and the usage text's first line names `nonsense` / `insihgt`

### Bare `cortex` prints usage and writes nothing

- **Given** the same directory and home
- **When** `cortex` runs with no arguments
- **Then** the exit code is 2, the usage text is on stdout, and nothing is created in the directory or under `$HOME/.claude/`

### The explicit verb still initialises, with the verb stripped

- **Given** the same directory and home
- **When** `cortex init --no-llm` runs, and separately `cortex init --timeout-ms 5 --profile specflow --no-llm`
- **Then** both initialise the current directory (never a directory named `init`), exit 0, and `.cortex/cortex.config.json` exists

### Fresh init on an empty project succeeds end-to-end

- **Given** an empty git-initialised project directory on macOS with no `.cortex/`
- **When** `cortex init --no-llm` runs
- **Then** `.cortex/` matches the schema §1 layout with an `_index.md` in every directory and a `cortex.config.json` declaring the current `schemaVersion`
- **And** the final self-validation reports conformant and the exit code is 0

### Existing .cortex/ refused without --force

- **Given** a project where `.cortex/cortex.config.json` already exists
- **When** `cortex init` runs without `--force`
- **Then** init exits 2 and no file in the project or `~/.claude/` is created or modified
- **And** the refusal message names `cortex sync` as the command for repairing or upgrading this existing project

### Non-macOS platform refused

- **Given** the process platform reports `linux`
- **When** `cortex init` runs
- **Then** init exits 2 with a message naming macOS as the v1 requirement, and nothing is written

### Target inside an existing Cortex layer refused, not even by --force

- **Given** a project already under Cortex management at `<root>` (its `.cortex/cortex.config.json` exists)
- **When** `cortex init <root>/.cortex` runs — or any path nested beneath it, e.g. `<root>/.cortex/insight` — with or without `--force`
- **Then** init exits 2 and nothing is written anywhere, in the target or in `~/.claude/`
- **And** the refusal message names `<root>` as the project root and tells the user to run `cortex init` (or `cortex sync`) there instead
- **And** given instead a normal, unrelated project root that merely contains its own `.cortex/` child (the everyday case), this guard does not fire and init proceeds (or refuses only per the pre-existing existing-`.cortex/`-exists condition, exactly as before this change) — the guard matches only when the target itself is a `.cortex` directory (or nested beneath one) carrying the layer's own `cortex.config.json` marker

### Gitignore additions are exact and idempotent

- **Given** a project whose `.gitignore` already contains `.cortex/pulse/`
- **When** `cortex init --no-llm` runs
- **Then** `.gitignore` contains `.cortex/atlas/sources/`, `.cortex/pulse/`, `.cortex/constellation.json`, `.cortex/archive/documents/*/source.*`, and `.cortex/recall-index.json` exactly once each
- **And** it does not contain a bare `.cortex/` line, and `.cortex/atlas/evidence/_index.md` and `.cortex/recall-index.json` exist

### CLAUDE.md content outside the managed block is preserved

- **Given** a `CLAUDE.md` containing `# My Project` and a `## Commands` section
- **When** `cortex init --no-llm` runs twice
- **Then** the file contains exactly one `<!-- cortex:start -->…<!-- cortex:end -->` block
- **And** `# My Project` and `## Commands` are byte-identical to before

### The block names the non-implementer roles, states placement once, and drops the mandate

- **Given** a fresh `cortex init --no-llm --yes` and, separately, a project whose config carries
  `visibility.repo: "public"` and `placement.localNotesDir: "docs/notes"`
- **When** init writes the managed block for each
- **Then** both blocks contain the sentence `This applies more, not less, to sessions that
  dispatch, review or plan rather than edit` and exactly one line starting `**Placement:**
  durable knowledge lives in \`.cortex/\``; the first block's placement line ends
  `Repository visibility is unknown — set \`visibility.repo\` in \`cortex.config.json\`.`; the
  second's names `docs/notes` as local and untracked and ends `(RULES.md rule 20).`; and neither
  block contains `This is not optional` or `Before substantive work on any file`

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

### Five scheduled task payloads written — payloads, not registration

- **Given** a fresh init with a stubbed home directory
- **When** `cortex init --no-llm` runs
- **Then** `~/.claude/scheduled-tasks/` contains five task directories under this project's scoped bundle names (schema §9.1: `<slug>-daily`, `<slug>-weekly-curation`, `<slug>-weekly-quality`, `<slug>-test-runner`, `<slug>-monthly-review`), each holding a `SKILL.md` with the scoped `name` and `description` frontmatter and the ownership marker in the body
- **And** (no registry in the fixture, so all five count as unregistered) the summary prints the instruction block: N of 5 not yet registered with the Desktop app, open this folder in Claude Desktop and say `run cortex-register-tasks`, then confirm with `cortex tasks verify`
- **And** given a fixture registry in which all five are registered and enabled, the summary prints the all-registered one-liner and no instruction block
- **And** re-running without `--force` leaves user-modified task files untouched

### --partial writes payloads for exactly the bundles whose member skills all ship or are present

- **Given** a fresh project and a package shipping every bundle member's loop skill (installed by Rule 4 before the bundle check)
- **When** `cortex init --partial --no-llm --yes` runs
- **Then** exactly the bundles whose every member skill is now present get their payloads written — with the full packaged-skill census (all member skills shipping), that is all five — exit code 0
- **And** the `.cortex/` skeleton, anatomy, hooks, and CLAUDE.md block are all complete
- **And** the summary names each skipped bundle with the missing member skill it needs
- _(Historical note: before any bundles shipped, this AC's premise was "zero loop skills → 0 task payloads" — superseded when the loop bundles began shipping with the package.)_

### --partial with only some member skills present → only fully-covered bundles, skips named

- **Given** a project whose `.claude/skills/` contains `specflow-lint` and `specflow-tests` but not every member skill of any bundle
- **When** `cortex init --partial --no-llm` runs
- **Then** only bundles whose every member skill is present are written; a bundle missing any member (e.g. `weekly-quality`, which also needs `cortex-loop-insight-refresh-full`) is skipped
- **And** the summary names each skipped bundle with the missing member skill it needs

### Default mode with missing skills → all five written, warning names the gaps

- **Given** the same project as above
- **When** `cortex init --no-llm` runs without `--partial`
- **Then** all five bundle directories are written
- **And** the summary warns which written bundles lack a member skill and mentions `--partial`

### Git hook appended, not clobbered

- **Given** a git repo whose `.git/hooks/post-commit` already contains `echo existing`
- **When** `cortex init --no-llm` runs
- **Then** the hook file still contains `echo existing`, followed by the cortex anatomy-refresh-fast invocation, and remains executable

## Notes

- **Decision (Core/agentic mechanism, Rule 6):** "the Skill runs inline as part of `cortex init`" (design §7.2 as amended) is realised by spawning the Claude Code CLI headless as a subprocess. RULES.md rule 3 is interpreted as: the Core *process* makes no LLM/API calls; delegating to the agentic layer via subprocess is the sanctioned boundary. The git post-commit hook path stays pure-deterministic (it never triggers the subprocess).
- **Decision (design open question #11 — REVISED by B-009):** OQ#11's conservative path ("init writes SKILL.md files only; cadence/config is confirmed in the Desktop app UI on first open") was falsified against the app: the Desktop app never scans `~/.claude/scheduled-tasks/`, so there is no confirm-on-first-open flow for tasks it doesn't know exist. Corrected mechanism (B-009 final, owner-approved): init writes prompt payloads only and prints instructions; **registration happens in a Claude Desktop session via the `cortex-register-tasks` skill**, which drives the app's own `mcp__scheduled-tasks__*` MCP tools against the plan from `cortex tasks plan --json`. Direct registry writing (`cortex tasks register`, the original option 1) was demoted to a guarded app-closed-only fallback after the app's in-memory registry handling (load-once-per-launch, wholesale flush, malformed-file wipe) was proven — spec `core-cli.tasks-register`. `cortex tasks verify` remains the check. If upstream #47797 (task metadata beside SKILL.md) ships, a MINOR revision can re-home registration onto it.
- **Decision (§8.4 bridge 5 reconciliation):** init scaffolds empty spec trees and *recommends* onboarding; it never auto-runs `specflow-onboard-codebase`. Pending design-doc edit to match.
- **Decision (`cortex sync` factoring, spec `core-cli.sync`).** Rules 4, 10, 11, 12, 13 (skills install, CLAUDE.md block, hooks merge, git post-commit hook, scheduled-task payloads) are implemented via the same internal scaffolding module that `cortex sync` exposes standalone for existing projects — sync is the repair/upgrade path Rule 1's refusal now names, so redoing setup is never required to fix or bring current a project init already ran on. This is a Notes-level implementation detail; init's own Rules and ACs are otherwise unchanged by the factoring.
- OPEN: the exact `_index.md` template texts (schema §7.1 fixes the shape and budget; the per-module wording ships with the implementation and should be reviewed against the token budgets).
- Also supports: every other domain — init is the entry point that wires scaffolding, hooks, pulse, loops, and specflow together. Primary parent remains `core-cli.developer-sets-up-cortex-in-one-command`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
