---
id: core-cli.sync
status: draft
depends_on:
  - core-cli.task-scoping
  - core-cli.tasks-register
  - schema.validator
  - store.migrate
  - store.managed-block
  - specflow.git-hooks
implements: ../../specs-business/core-cli/developer-keeps-existing-project-current.business.md
governed_by: []
governs:
  - "src/cli/**/*.ts"
---

# cortex sync — Repair and Upgrade for an Existing Project

## Intent

`cortex sync` is the standing repair-and-upgrade command for a project already under Cortex management. Day-1 `cortex init` refuses to re-run on an existing `.cortex/` without `--force` (`core-cli.init` Rule 1), so before this command there was no safe way to put back a missing CLAUDE.md block, pick up newly shipped skills, or refresh scheduled-task prompts after a package upgrade. Sync factors init's already-idempotent scaffolding steps — the CLAUDE.md managed block, `_index.md` templates, skill-bundle install/upgrade, the hooks merge, the git post-commit hook, and the scheduled-task payloads (`core-cli.init` Rules 4, 10, 11, 12, 13) — into a standalone command that init also calls internally, and adds the one thing init's steps don't do on their own: recognising which of them are safe to re-apply against an *existing* project's current state (an unmodified index refreshed, a localised one left alone; an unmodified skill upgraded, a user-modified one preserved) and refusing outright when the project's schema version has drifted too far to trust the templates it would refresh against. Sync never touches `.cortex/`'s knowledge content — compass, atlas, archive, insight, pulse state are exactly as the developer left them, before and after.

Amendment 2026-11-04 (owner decision: installing or syncing Cortex removes old skills and updates everything). `cortex sync` becomes the update route on a 4.0 store: it removes retired skills, installs the final set, and refreshes the block, the hooks and the task payloads. The old skills leave the package, so the 3.x path can no longer do its job. It stops running: Rules 1–15 and their criteria are kept as the record of what the 3.x path did, and Round 2 removes that code and those tests. Rules 16–27 are what `cortex sync` does from here on.

## Entities

- **READS:** `.cortex/cortex.config.json` (preflight existence + `schemaVersion`, per schema §10.1); `CLAUDE.md` (existing managed block and its version marker, schema §8); every `.cortex/**/_index.md` outside the pulse subdirectory carve-out (schema §7.1); `.claude/skills/` (installed bundle content); `.claude/skills/<bundle>/.cortex-installed.json` (this spec's own installed-bundle marker; the 3.x `init` never wrote it, Rule 5; at 4.0 sync and `cortex migrate --accept` write it, and `writeTaskPayloads`, called by sync and `cortex tasks register`, writes the payload marker); `.claude/settings.json` (existing hook entries); `.git/hooks/post-commit` (existing hook content); `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` (existing task payloads, schema §9.1); the shipped `_index.md` / CLAUDE.md-block / scheduled-task templates and skill bundles inside the installed npm package (`src/cli/templates.ts` and `skills/`); `schema.validator`'s `supportedMajor`/`supportedMinor` (schema §10.3).
- **WRITES:** `.cortex/cortex.config.json` (`schemaVersion` rewrite on a MINOR upgrade, Rule 2 — no other key touched); `CLAUDE.md` (managed block insert-or-update; creates the file if absent); non-localised `_index.md` files (refreshed to the current template); `.claude/skills/` (bundle install/upgrade, `.cortex-installed.json` marker); `.claude/settings.json` (hook merge); `.git/hooks/post-commit` (append-if-missing); `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` (payload refresh, via `core-cli.task-scoping`'s writer).
- **CREATES:** nothing under `.cortex/` — sync operates only on scaffolding that `cortex init` already created; it never creates the `.cortex/` skeleton itself (that remains init's job). `CLAUDE.md` and `.claude/settings.json` are created only if entirely absent, exactly as init would.

## Rules

1. **Preflight — the complement of init's gate.** Refuse (exit 2, nothing written) when: `.cortex/cortex.config.json` does not exist (this is the existing-project command; a project with no Cortex footprint at all is `cortex init`'s job, named in the refusal message) — or the platform is not macOS (`darwin`), same v1 gate as init (design §3, RULES.md rule 5).
2. **Version gate (schema §10.3, §10.4).** Compare the project's `schemaVersion` MAJOR against the installed package's `supportedMajor` (`schema.validator`'s constants). **MAJOR differs (either direction)** — the project is behind an installed package that no longer recognises its old contract, or ahead of one that hasn't caught up — sync refuses the scaffolding refresh entirely (exit **3**, nothing written) and names the concrete next step: `cortex migrate` when the project is behind, upgrading the installed `cortex` package when the project is ahead. Sync is deliberately **not** a migration path (schema §10.4): it never attempts a partial refresh against a contract it doesn't fully recognise. **MAJOR equal, any MINOR** — proceed; sync **is** the MINOR upgrade path, re-scaffolding templates to the version the installed package currently ships and rewriting `schemaVersion` accordingly.
3. **CLAUDE.md managed block (schema §8).** Insert or update the `<!-- cortex:start -->…<!-- cortex:end -->` block, creating `CLAUDE.md` if it is entirely absent — this is the repair story: content outside the markers is never modified, whether the file already had a block, had none, or didn't exist. Idempotent: re-running changes nothing once the block matches the current template and version. **3.4 fifth revision:** the block is rendered from the config exactly as `core-cli.init` Rule 10 renders it — the role sentence, the generated placement paragraph (`visibility.repo` and `placement.localNotesDir` read from the config as it stands, absent keys rendering as `unknown` and no notes directory), no insight mandate — so a config edit followed by `cortex sync` refreshes the paragraph.
4. **`_index.md` template refresh — localisation-aware, a judgment call.** For every `.cortex/**/_index.md` outside the schema §7.1 pulse-subdirectory carve-out: if its current bytes exactly match the shipped template output for the `schemaVersion` recorded in `cortex.config.json` **before** this run (i.e., nothing has touched it since it was last written by init or a prior sync), refresh it to the current template. If its bytes differ from that prior-version template — a human or a loop (the onboarding-drift loop's own localisation-refresh proposals, `loops.onboarding-drift` Note) has localised it — sync leaves it in place and reports it as localised, not refreshed. This mirrors `loops.onboarding-drift`'s drift signal (d) in reverse: that loop only proposes; sync is the human-invoked act of refreshing what's safe to refresh. **3.4 second revision (`recall.index-blocks` Rule 7):** the comparison is made with the `<!-- cortex:recall:start … -->`…`<!-- cortex:recall:end -->` block and its preceding blank line removed, and a refreshed file gets its block re-appended unchanged — the generated block is opaque to sync, never a reason to call a file localised.
5. **Skill-bundle upgrade — a judgment call, reusing init's mechanism.** For each bundle shipped in the installed package's `skills/`: absent locally → install it (as init Rule 4 would) **only when the additions chain below says it is new to this project**; an absent bundle the project has already been offered was deleted deliberately and is left alone, named in the summary per Rule 12. Present and byte-identical to the shipped bundle → already current, no-op. Present and differing from the shipped bundle: sync consults the bundle's `.cortex-installed.json` marker (written only by sync, never by init, recording the SHA-256 of the bundle as shipped the last time sync ran against it). If the on-disk bundle still matches that recorded hash — untouched since sync last touched it — sync upgrades it silently and rewrites the marker to the newly shipped hash. If the on-disk bundle diverges from the recorded hash (the developer edited it) — or no marker exists at all, which covers both a bundle init just installed and one that predates this mechanism, and which sync treats alike as unknown provenance rather than assuming it's safe — sync prompts before overwriting (`--yes` accepts for all bundles in this run; declining, or the non-interactive default, preserves the developer's copy and reports it as skipped-user-modified). This is the same prompt-or-preserve shape as `core-cli.init` Rule 4, extended with the marker so unmodified upgrades don't need a prompt at all.

   **The additions chain — when a bundle became this project's business.** Rule 6 records what the package has stopped shipping; this records when it *started*. Retirement is a chain (`SKILL_MIGRATIONS`) and so is this: `SKILL_ADDITIONS` (`src/cli/scaffold.ts`) carries one entry per release that introduces bundles, naming the `MAJOR.MINOR` version, the bundle names, and the reason. An absent bundle is installed **iff its entry's version is strictly above the `schemaVersion` recorded in `cortex.config.json` before this run** — the same prior-run reading Rule 4 depends on, captured before Rule 2 rewrites the key. A bundle whose entry is at or below that version has already been offered to this project, so its absence is the developer's decision, not a gap to repair.

   Unlike Rule 6's removals, this comparison **is** a version window, and safely so. Rule 6 rejects a cursor because a removal is declinable, and a declined decision would be lost the moment `schemaVersion` advanced past its entry. An installation is unconditional — there is no decision to lose — so a project past a bundle's addition version has, by construction, been given it.

   Three consequences the chain imposes:
   (a) **Shipping a new bundle requires a MINOR schema bump.** Without one, the entry's version never exceeds an already-current project's, and the bundle never reaches it. This is the coupling Rule 6 already assumes — a roster change rides the schema version, and appending the entry is the checklist item for adding a bundle, exactly as it is for retiring one.
   (b) **Bootstrap — the chain is seeded at the version it lands in, and moves no version constant.** The chain ships inside schema **`3.3`**, seeded with one entry at `3.3` naming every bundle the package currently ships. `3.3` is unreleased, so this lands as a revision in place rather than a bump (the same allowance §10's 3.1 and 3.3 already took), and the B-014 three-way version agreement stays green. The seed's effect follows from the strictly-above comparison: a project at `3.2` or below sees the seed as new and installs the full roster once — correct, because nothing recorded its intent before the chain existed and inventing a record retroactively would be guessing. A project already at `3.3` is not below the seed, so no bundle is new to it and its deletions hold from the first run, with no reinstall pass to sit through. Consequence (a) is what carries the chain forward from here: the next bundle Cortex ships needs a `3.4` entry and the MINOR bump that makes `3.4` exceed a current project's recorded version.
   (c) **A missing `.claude/skills/` directory is a fresh install, not a mass deletion.** When the directory does not exist at all, every shipped bundle is installed regardless of the chain, so a clone of a repo that gitignores it stays repairable. A directory that exists but is partially emptied is read as deletions: this guard is a cheap whole-directory heuristic, not a general one, and Rule 12's summary is what makes the difference visible.

6. **Retired-bundle removal — the counterpart to Rule 5 (B-015).** Rule 5 installs and upgrades what the package ships; this removes what it has stopped shipping, so a rename cannot leave both copies registered. Retirement is recorded as a **migration chain** (`SKILL_MIGRATIONS`, `src/cli/scaffold.ts`): each release that drops a bundle appends one entry naming the version, the bundle names, and the reason. Appending an entry is the checklist item for retiring a bundle, the same way a contract change gets a schema bump.

   **The entries are declarative, not cursor-based.** An entry means "no project at or past version X should have these", and sync enforces every entry in force at the installed package's version on **every** run — it does not apply only the entries in the window between the project's old and new `schemaVersion`. That distinction is load-bearing: sync rewrites `schemaVersion` whether or not a removal happened (Rule 2), so a cursor would advance past an entry the developer declined, and the orphan would become permanent. Enforcing by state means a declined removal is simply re-offered next sync, and a run with nothing left to remove is a silent no-op.

   Three safety invariants, in force order:
   (a) **Only migration-named bundles are candidates.** A directory in `.claude/skills/` that no entry names — a developer's own skill — is never a candidate and is never touched.
   (b) **A currently-shipped bundle is never removed**, whatever an entry says. A mistaken entry can therefore never delete a live skill, and a test pins that no entry names a shipped bundle.
   (c) **Removal obeys Rule 13** with the same judgment as Rule 5: marker present and matching → the bundle is untouched since sync installed it, so remove it silently. Marker missing or mismatched (the developer edited it, or it predates the marker mechanism) → prompt before removing; `--yes` accepts for the run, and declining preserves the directory and reports it as retired-but-preserved. Deleting an edited skill without asking is the one outcome this rule must not produce.

   Removals and preservations are reported on their own summary lines (Rule 12) — a deletion nobody is told about is indistinguishable from a bug.

7. **Hooks merge (schema §5).** Merge the current hook entries into `.claude/settings.json`, creating it if absent and preserving all unrelated keys — identical merge semantics to `core-cli.init` Rule 11. The Read-pair entries are present iff `cortex.config.json` `hooks.preRead` is true. The result must satisfy `check.hook-config`; this is sync's registration-refresh path referenced by schema §5's "sync refreshes an existing project's hook registration."
8. **Git post-commit hook.** If the project is a git repo and `.git/hooks/post-commit` does not already carry the Cortex anatomy-refresh-fast invocation, append it (as `core-cli.init` Rule 12 would), preserving any existing hook content and leaving the file executable. If the invocation is already present, no-op. If not a git repo, skip with a notice.
9. **Scheduled-task payload refresh (schema §9.1, §9's payload/registration split).** For each of the five bundles: absent locally → write it (as init Rule 13 would). Present and matching the current shipped payload template → no-op. Present and differing: apply the same unmodified-vs-user-modified judgment as Rule 5 (a payload-level `.cortex-installed.json` alongside each scoped task directory) — an unmodified payload is refreshed silently (picking up a changed member-loop roster or cadence), a user-modified one is left in place and reported. Sync never touches registration state itself — only the payload files. After refreshing, sync runs the same read-only `registrationStatus` check init uses (tolerating registry-not-found) and prints the identical instruction block (open the project in Claude Desktop, type `/cortex-register-tasks`, confirm with `cortex tasks verify`) when any of the five is unregistered, or the all-registered one-liner otherwise.
10. **Never touches knowledge content.** `compass/`, `atlas/`, `archive/`, `insight/` content and `pulse/` state are read by nothing in this spec and written by nothing in this spec — every byte in those trees is identical before and after a sync run. **One carve-out (3.4 fifth revision, Rule 15):** `compass/registry.md` is created when absent — a machine-derived ledger of ids the files already carry, not knowledge — and never modified when present.
15. **Id registry migration (schema §10.4, 3.4 fifth revision; `schema.id-registry` Rule 6).** After Rule 4 and before Rule 5: when `.cortex/compass/registry.md` is absent, create it from every `compass/rules/R-*.md` and `compass/bugs/B-*.md` present — the `REGISTRY_HEADER`, then `<id> <slug>` lines, rules first then bugs, each ascending, the slug taken from the filename after the id and its hyphen (or `reserved` when the filename is bare `R-NNN.md`) — and name it in the Rule 12 summary as `registry created (<n> rules, <m> bugs)`. When present: no read beyond existence, no write, summary line `registry present`. Fires under every profile and needs no version comparison: an existing project that already has the file is byte-identical after the run (Rule 13 holds).
11. **Self-validation.** After all steps, run `schema.validator` over the project. Sync succeeds (exit 0) only if the report is conformant (zero errors); otherwise it prints the violations and exits 1. Warnings do not fail sync.
12. **Summary.** Print a summary naming every change made or considered: CLAUDE.md block created/updated/already-current, each `_index.md` refreshed vs. left-as-localised, each skill bundle installed/upgraded/skipped-user-modified/skipped-as-deliberately-removed (Rule 5's additions-chain skip — a bundle deliberately *not* installed is named for the same reason Rule 6 names a removal: silence is indistinguishable from a bug), hooks merged, git hook state, each task payload refreshed/left-as-localised, and the Rule 9 registration-status instruction block or one-liner. Exit codes: 0 success, 1 self-validation failure, 2 preflight refusal, 3 version-gate refusal (Rule 2).
13. **No silent destruction.** Every write to a pre-existing file is a merge, an append, or an upgrade gated by Rules 4/5/6/9's unmodified check — never an unconditional overwrite. This rule wins over any step above if they conflict. Sync has no `--force` flag: unlike init, which uses `--force` to permit re-running against an existing `.cortex/` at all, sync is designed to run repeatedly against an existing project by default, so there is nothing for `--force` to unlock.
14. **Progress output (optional, side-channel).** `sync()` accepts an optional `onProgress` callback (`SyncOptions.onProgress`). When supplied, it fires once at the start of each of Rules 3, 4, 5, 6, 7, 8, 9, and 11 — the steps slow or silent enough that their absence of feedback reads as a hang — naming the step about to run. Rules 5, 6 and 9 may prompt interactively (`promptYesNo`, the B-012 shared-readline interface); this rule's calls for those steps land immediately before `syncSkillBundles`/`syncScheduledTaskPayloads` are invoked, never from inside either function's own prompt loop, so a progress line can never interleave with an unanswered prompt. When `onProgress` is omitted, nothing about the run changes — no progress output exists and behaviour is byte-identical to a build that predates this rule. The CLI dispatch (`cortex sync`) supplies an `onProgress` that writes each message to **stderr**, prefixed `cortex sync: `, one line per call — stdout carries only the Rule 12 summary, so a piped or redirected `cortex sync` still yields just the report. Progress is a side-channel: it changes nothing about the returned `summary`, the exit code, or any file this spec's other rules write.

### The 4.0 update route (amendment 2026-11-04)

16. **Which project gets what**, checked in this order:
    1. the platform is not `darwin`: exit 2, with Rule 1's message;
    2. `cortex/cortex.json` exists and cannot be parsed, or has no `schemaVersion`: exit 3, `cortex sync: refused — cortex/cortex.json is not valid: <reason>. Nothing was written.`; its `schemaVersion` MAJOR differs from the package's: exit 3, `cortex sync: refused — this store is schema <version> and this package supports <major>.x. Nothing was written.`;
    3. `cortex/cortex.json` exists and `migration.accepted` is a date, or it has no `migration` field and there is no `.cortex/` folder: the update route, Rule 17;
    4. `cortex/cortex.json` has a `migration` field whose `accepted` is `null`, absent or not a date: exit 3, `cortex sync: refused — this project's migration is not accepted; finish it with cortex migrate --accept. Nothing was written.`;
    5. a `.cortex/` folder exists, with or without its config, which covers a `cortex.json` with no `migration` field that `cortex store init` wrote beside it: exit 3, `cortex sync: refused — this project is on the 3.x store; migrate it first with cortex migrate. Nothing was written.`;
    6. otherwise: exit 2, `cortex sync: refused — no Cortex store found at <root>; set one up with cortex init. Nothing was written.`
17. **The update route, in order:** remove retired skills (Rule 18); install and update the final set (Rule 19); refresh `MAP.md` and the managed blocks (Rule 20); refresh the git hooks (Rule 21); write the task payloads and report the tasks (Rule 22); list project skills (Rule 23); validate (Rule 24). The blocks come after the skills, so that they see `specflow-spec` (`store.managed-block` Rule 9).

    **Before any write**, it checks that the package holds every name in `FINAL_BUNDLES`. If one is missing: exit 1, `cortex sync: refused — this package lacks <names>. Nothing was written.` Removal cannot be undone from a package that has no replacement.

    **A step that fails** stops the route: it prints `cortex sync: stopped at <skills, blocks, hooks or tasks>: <error>`, exits 1, and what it wrote stays. Every step is idempotent, so running sync again continues. A Rule 21 refusal and a Rule 22 status are not failures.

    **A symbolic link.** A bundle that is a symbolic link, or holds one, is not followed, removed or replaced: `skills: <name> is a symlink; left alone`.

    **A symbolic skills folder.** When `.claude` or `.claude/skills` is a symbolic link, writing there would reach its target, which other projects may share. The skills step is skipped, with the line `skills: .claude/skills is a symlink; left alone`.
18. **Retired skills.** A bundle under `.claude/skills/` whose name matches `RETIRED_SKILL_NAMES` (`store.migrate` Rule 18 step 5) is a candidate.
    - Its `.cortex-installed.json` marker matches its content, or it is an unedited shipped copy (Rule 27): it is removed, with the line `skills: removed <name>`.
    - Otherwise: it is left alone, with the line `skills: <name> is retired but has local edits; left for the skill-adjust step of <packaged path of cortex-migrate's SKILL.md>`. There is no prompt and no `--yes`: the skill-adjust step decides it (`store.migrate-skill` Rule 13).
    - A bundle that name does not match is never a candidate, so a project's own skill is never removed.
19. **The final set.** `FINAL_BUNDLES`, exported from `src/store/migrate/system.ts`, is the list of `store.migrate` Rule 18 step 2. For each name:
    - absent: copied from the package with a marker, `skills: installed <name>`;
    - identical to the package's copy: no change to the content, and a missing or stale marker is written;
    - differs, and its marker matches its content or it is an unedited shipped copy (Rule 27) (no local edit): replaced by the package's copy, `skills: updated <name>`;
    - differs otherwise (a local edit): left alone, `skills: .claude/skills/<name> exists with different content; left alone`;

    **Whole bundles only.** An install or replacement is built in a `.cortex-tmp-<name>` folder under `.claude/skills/`, marker included, and renamed into place, the old bundle moving to `.cortex-tmp-old-<name>` first; a Rule 18 removal renames the bundle to a `.cortex-tmp-<name>` folder first. A step that fails leaves the old bundle or the new one, never part of one. A process killed between the two renames leaves the name empty, with the unedited old bundle aside, and the next run installs it fresh.

    **Leftovers.** At the start of the next run a leftover folder `.cortex-tmp-<final or retired name>` or `.cortex-tmp-old-<final name>` is deleted, with the line `skills: cleared leftover <folder>`. Any other `.cortex-tmp-*` entry is a person's: it stays, and the Rule 18 step 5 scan reads it like any other bundle. A file at a temp name the step needs stops it: `cortex sync: stopped at skills: .claude/skills/<name> is in the way; move it and run this again`.

    **Empty and odd entries.** An empty folder at a retired or final name counts as absent. A `.DS_Store` is not content: no shipped version holds one, so it never reads as a local edit. A plain file at a final name is `left alone` like a local edit. When a folder holds the marker's path on an identical copy, the line is `skills: <name>: marker not written; left alone`.
20. **Blocks.** It runs `cortex store map`, which writes `MAP.md` and both blocks, and prints its lines. Text outside the blocks stays untouched (`store.managed-block`).
21. **Git hooks.** The first case that holds:
    - outside a git repository: `hooks: not a git repository; skipped`;
    - `git config core.hooksPath` is `.githooks` and `.githooks/commit-msg` carries the `# cortex-managed` line, which is what "already installed" means: it does what `cortex hooks install` does and prints `hooks: refreshed .githooks`. When install refuses over a hand-written hook (`specflow.git-hooks` Rule 12), nothing changes, and sync prints each refusal line prefixed `hooks: `. Sync's exit code does not change;
    - `specflow/` does not exist: `hooks: no specflow/ folder; skipped`;
    - `core.hooksPath` is unset, or is `.githooks` with no such line: it installs nothing and prints `hooks: not installed; run cortex hooks install`;
    - it is set to anything else: it installs nothing and prints `hooks: core.hooksPath is <value>; add the hooks there by hand`.

    Turning a refusing check on in a repository stays a separate act.
22. **Tasks** (owner decision, sitting item 4). Sync writes the task payloads and reports registration. It does not register: only a Desktop session has the app's scheduling tools, and this route never calls `registerTasks`.

    **Payloads.** It calls `writeTaskPayloads({ projectRoot, home, dryRun })` once (`core-cli.tasks-register` Rule 18) and prints a line per name in the `written`, `updated` and `kept` lists it returns. For each of the three `STORE_V4_TASKS`, at its `resolveScopedTaskName` directory under `<home>/.claude/scheduled-tasks/`, with a `.cortex-installed.json` marker holding the hash of its `SKILL.md`, as in Rule 9:
    - absent: written with a marker, `tasks: installed payload <scoped name>`;
    - identical to the current payload: no change to the content, and a missing or stale marker is written;
    - differs, and its marker matches its content (no local edit): replaced, `tasks: updated payload <scoped name>`;
    - differs otherwise (a local edit): left alone, `tasks: <scoped name> has local edits; left alone`.

    A payload is written even when a skill it requires is absent; `core-cli.tasks-register` Rule 14 refuses that at registration. This step removes no directory, so a 3.x payload the app may still point at stays. A directory another project owns is never touched (`core-cli.task-scoping`).

    **Status.** It then calls the read-only `registrationStatus({ projectRoot, home, appSupportDir })` once (`core-cli.tasks-register`), all three injected through `SyncOptions`. No registry counts as every task unregistered. It prints one line:
    - every task registered: `tasks: all <n> registered`;
    - otherwise: `tasks: <m> of <n> not registered; in a Claude Desktop session for this project, type /cortex-register-tasks (plain words will not run it)`.

    The skill is typed, never triggered by words (`store.migrate-skill` Rule 14). Whatever the status, sync's exit code does not change.
23. **Project skills.** It prints the `project skills to adjust` section of `store.migrate` Rule 18 step 5, from the same code.
24. **Validation and exit.** It runs `cortex store validate`. Exit 0 when that reports no errors; otherwise it prints them and exits 1. Warnings do not fail sync.
25. **`--dry-run`** writes nothing. It prints the lines of Rules 18–23 that a real run would print, each `skills:`, `hooks:` and payload `tasks:` line prefixed `would: `, and the Rule 22 status line and the Rule 23 section unprefixed, and it exits 0 without validating. Rule 20 does not run: it prints `would: blocks: refresh MAP.md and the managed blocks` in its place. Rule 21 picks its case as a real run does, with the read-only check of `specflow.git-hooks` Rule 12, and prints that case's lines; only the refresh itself does not run. `--yes` and `-y` are accepted and ignored, so old scripts keep working. Any other flag, `--help` included, exits 2 with `cortex sync: unknown flag <flag>. Nothing was written.`, and a second non-flag argument exits 2 with `cortex sync: unexpected argument <arg>. Nothing was written.`, because a mistyped `--dry-run` must never do a real run. The payload lines come from `dryRun: true`. Where Rule 16 or Rule 17's package check refuses, it refuses the same way.
26. **What the update route leaves alone.** It writes only `.claude/skills/`, `MAP.md`, `CLAUDE.md`, `AGENTS.md`, `.githooks/` and what `writeTaskPayloads` writes (Rule 22), which removes nothing. Apart from that validation it reads or writes nothing else under `cortex/`, and nothing under `.cortex/`, `specflow/` or `.claude/settings*.json`. It takes no prompt. A second run prints no `skills:` or payload `tasks:` line for a removal, an install or an update, and changes no file. Rule 24's validation only reads the store.
27. **Unedited shipped copies** (2026-11-05). `cortex init` at 3.x wrote no marker, so a missing marker does not prove a local edit. `SHIPPED_3X_HASHES`, exported from `src/store/migrate/system.ts`, maps each name that `RETIRED_SKILL_NAMES` matches, plus `cortex-register-tasks` and `verification-before-completion`, to the `hashDirectoryContent` value of every distinct version of `skills/<name>` in the history of `main` up to commit `88895ca`. A bundle whose hash, marker excluded, is in its name's list is an unedited shipped copy, whatever its marker says. The list is frozen: every copy 4.0 writes has a marker. A copy no entry matches counts as a local edit.

## Acceptance Criteria

The criteria in this section and under `## Notes` describe the 3.x path (Rules 1–15). The 4.0 route has its own section at the end.

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

### A bundle the developer deleted is not reinstalled

- **Given** a project at `schemaVersion` `3.3` whose `.claude/skills/` exists but no longer holds `cortex-loop-rule-decay`, a bundle the seed entry names at `3.3`
- **When** `cortex sync` runs
- **Then** `.claude/skills/cortex-loop-rule-decay/` is still absent
- **And** the summary names it as skipped because it was deliberately removed

### A project predating the chain gets the full roster once

- **Given** a project at `schemaVersion` `3.2` with several shipped bundles absent from `.claude/skills/`
- **When** `cortex sync` runs
- **Then** every absent bundle is installed, because the seed entry at `3.3` is above the project's recorded `3.2`
- **And** the summary names each of them as installed

### A bundle added after the project's version still reaches it

- **Given** a project at `schemaVersion` `3.3`, a chain carrying an entry at `3.4` naming `cortex-loop-example`, an installed package at `3.4` shipping it, and `cortex-loop-rule-decay` absent under its `3.3` seed entry
- **When** `cortex sync` runs
- **Then** `cortex-loop-example` is installed
- **And** `cortex-loop-rule-decay` is still not reinstalled

### The additions comparison reads the version from before Rule 2's rewrite

- **Given** a project at `schemaVersion` `3.2`, an installed package at `3.3`, and shipped bundles absent locally
- **When** `cortex sync` runs, so that Rule 2 rewrites `schemaVersion` to `3.3` before the skill step executes
- **Then** the bundles are installed — the comparison used `3.2`, the value recorded before this run, not the `3.3` just written

### A missing skills directory is repaired in full

- **Given** a project at the current `schemaVersion` with no `.claude/skills/` directory at all
- **When** `cortex sync` runs
- **Then** every shipped bundle is installed, whatever its additions-chain entry version says

### Every shipped bundle is named by exactly one addition

- **Given** the additions chain and the shipped bundle list
- **When** they are compared
- **Then** every shipped bundle is named by exactly one entry, and no entry is dated ahead of the package's own version

### Task payloads refresh and the instruction block appears when unregistered

- **Given** a project whose scheduled-task payloads were written by an older package version and the installed package now ships a bundle with a changed member-loop roster, with a stubbed home directory and no registry present
- **When** `cortex sync` runs
- **Then** the affected payload SKILL.md files are refreshed to the current roster
- **And** the summary prints the open-Desktop-and-type-`/cortex-register-tasks` instruction block (registry missing counts as all five unregistered)
- **And given** a fixture registry where all five are registered and enabled, the summary prints the all-registered one-liner instead

### Localised _index.md is preserved and reported, not refreshed

- **Given** a project whose `compass/_index.md` no longer matches the shipped template for the `schemaVersion` recorded before this run (a human or the onboarding-drift loop edited it)
- **When** `cortex sync` runs
- **Then** that file is byte-identical after the run
- **And** the summary names it as localised and left alone
- **And given** a sibling `_index.md` that still matches its prior-version template exactly, that one is refreshed to the current template

### Knowledge content is byte-identical after sync

- **Given** a project with populated `compass/` (including `registry.md`), `atlas/`, `archive/`, `insight/`, and `pulse/` directories
- **When** `cortex sync` runs
- **Then** every file under those directories is byte-identical, and none is created or deleted

### A missing id registry is created once from the files on disk

- **Given** an existing project with `R-001`–`R-003` and `B-001`–`B-019` files and no `compass/registry.md`
- **When** `cortex sync` runs twice
- **Then** after the first run the registry exists with the `REGISTRY_HEADER`, three `R-` lines then nineteen `B-` lines in ascending order, the slugs taken from the filenames, and the summary reads `registry created (3 rules, 19 bugs)`; after the second run the file is byte-identical and the summary reads `registry present`

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

### Progress output arrives at rule boundaries, never disturbs the summary

- **Given** a project with a valid, current `.cortex/cortex.config.json` and an `onProgress` collector function passed to `sync()`
- **When** `cortex sync` runs
- **Then** the collector receives one message for each of Rules 3, 4, 5, 6, 7, 8, and 10, in that order
- **And** the returned `summary` is identical to a run against the same project with no `onProgress` supplied
- **And given** no `onProgress` is supplied at all, nothing about the run's behaviour or output changes from a build that predates Rule 13

## Notes

- **Limit (hash depth).** `hashDirectoryContent` leaves out the marker's file name at every depth, so a person's `notes/.cortex-installed.json` inside a bundle is invisible to the hash and goes with the bundle. It stays that way because every value in `SHIPPED_3X_HASHES` depends on that function.

- **Factoring (Notes-level implementation decision, not an observable behaviour change).** `cortex init`'s Rules 4, 10, 11, 12, 13 are implemented by calling the same internal scaffolding module this spec exposes as `cortex sync`; init additionally creates the `.cortex/` skeleton and runs the anatomy/purpose/preferences/spec-tree/migration steps sync never touches. Init's own observable behaviour (Rules, ACs) is unchanged by this factoring.
- **Judgment call (`.cortex-installed.json` marker, Rules 5 and 8).** Neither `cortex-schema.md` nor `core-cli.init` defines a mechanism for telling "upgraded since install, unmodified" apart from "developer edited this." This spec introduces a small sidecar marker (content hash at install/last-sync time) per skill bundle and per scheduled-task payload to make that judgment call decidable without guessing. It is this spec's own bookkeeping file, not a schema-committed artefact — the same category as `core-cli.tasks-register`'s `.cortex-backup-<stamp>` convention, which also isn't in `cortex-schema.md`.
- **Decision (the 3.x `init` writes no marker, confirmed by implementation).** At 3.x only sync wrote `.cortex-installed.json`, and `cortex init` never did. At 4.0 it is also written by `cortex migrate --accept` for bundles and by `writeTaskPayloads` for payloads, which `cortex tasks register` calls too. Having the 3.x init stamp it would put a stray file next to every freshly installed bundle and every freshly written task payload, breaking the byte-identity acceptance criteria the awareness suite (`tests/spec/specflow/awareness.test.ts`) holds init to. A bundle or payload with no marker is therefore either one init just installed or one that predates this mechanism entirely — Rules 5/8 already fold both into "unknown provenance, prompt rather than assume," so the first `cortex sync` run against any project establishes the baseline without a separate bootstrap step.
- **Implementation state (Rule 4, `_index.md` comparison).** Only one template generation has ever shipped, so the implementation currently compares on-disk bytes against the *current* template rather than the schemaVersion-keyed prior-version template Rule 4 specifies — a code comment marks the collapse. The two comparisons are identical today because there is nothing else to compare against; the Rule's literal contract takes over, unchanged, the first time a MINOR bump actually changes template content, at which point version-keyed template storage is needed to honour it.
- **Judgment call (the additions chain lives inside Rule 5, not beside it).** Symmetry with Rule 6 argues for its own rule number, but it is precisely the qualifier on Rule 5's own "absent locally → install it" clause, and inserting a rule here would renumber Rules 7–14 and break this spec's internal cross-references (Rule 6(c)→13, Rule 13→"Rules 4/5/6/9", Rule 14's step list, the progress AC). Rules 5 and 6 read as the pair they are — what the package started shipping, and what it stopped.
- **Judgment call (why the chain seeds at `3.3` and not `3.4`).** The mechanism needs a seed version strictly above what pre-chain projects record, which reads at first like a MINOR bump. It isn't: `3.3` is unreleased, so the only projects that can be *at* `3.3` are ones tracking the package's own development, and for them the seed's non-effect is the correct behaviour — deletions hold immediately, with no reinstall pass. Bumping to `3.4` would buy a bootstrap pass that only ever reinstalls bundles a `3.3` project already has, at the cost of moving three version constants. The bump this rule genuinely requires is the *next* one, per consequence (a), when a bundle is actually added.
- **Judgment call (exit codes).** Sync reuses init's slot numbering where the situations are analogous (2 = preflight refusal) and claims 3 for its own distinct refusal (version-gate deferral) rather than init's meaning for 3 (complete-but-unauthenticated) — the two commands never run in the same process, so the reuse is a readability choice, not a shared contract.
- **Deliberately not done:** this spec does not give sync a `--partial` equivalent or a bundle-selection flag — init's `--partial` answers "which bundles to write when member skills are missing," a day-1 concern; sync always considers all installed bundles and reports what it can't safely touch, which covers the same ground without a second flag.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).

### A retired bundle is removed on sync (B-015)

- **Given** a project holding `specflow-change-router` — a bundle a migration entry retires and the installed package no longer ships — with a marker matching its installed content
- **When** `cortex sync` runs
- **Then** the directory is gone from `.claude/skills/`, and the summary names it as removed

### A retired bundle the developer edited is preserved, not deleted

- **Given** a retired bundle whose content diverges from its marker, or which has no marker at all
- **When** `cortex sync` runs non-interactively (or the developer declines)
- **Then** the directory is still present and the summary reports it as skipped rather than removed

### A currently-shipped bundle is never removed

- **Given** a name that appears in both `RETIRED_SKILL_BUNDLES` and the shipped package
- **When** `cortex sync` runs
- **Then** the bundle is installed or upgraded as Rule 5 dictates and is never deleted

### A developer's own skill is never touched

- **Given** a `.claude/skills/my-own-skill/` that Cortex never shipped and has never retired
- **When** `cortex sync` runs
- **Then** it is present, byte-identical, and absent from every removal report

### A declined removal is re-offered, never silently dropped

- **Given** a project whose retired bundle was edited, so the first sync preserved it — and whose `schemaVersion` that same run advanced past the migration's version
- **When** `cortex sync` runs again
- **Then** the bundle is still offered for removal, because entries are enforced by state rather than by a version cursor

### A migration never names a bundle the package ships

- **Given** the migration chain and the shipped bundle list
- **When** they are compared
- **Then** no entry names a currently-shipped bundle, and none is dated ahead of the package's own version

## Acceptance Criteria: the 4.0 update route (amendment 2026-11-04)

Unless a criterion says otherwise, the fixture is an accepted 4.0 store on darwin, with a test package root holding the final set, and `isDesktopAppRunning` returning true.

### A 3.x project is told to migrate

- **Given** a project with only `.cortex/cortex.config.json`
- **When** `cortex sync` runs
- **Then** it exits 3 with the Rule 16 message naming `cortex migrate`, and the project is byte-identical

### An unaccepted migration is told to finish

- **Given** `cortex/cortex.json` with `migration.accepted: null` and `.cortex/` present
- **When** `cortex sync` runs
- **Then** it exits 3 with the Rule 16 message naming `cortex migrate --accept`, and the project is byte-identical

### No store is refused

- **Given** a project with neither store
- **When** `cortex sync` runs
- **Then** it exits 2 with the message naming `cortex init`

### A store of another major version is refused

- **Given** `cortex/cortex.json` at `schemaVersion` `5.0`
- **When** `cortex sync` runs
- **Then** it exits 3 and the project is byte-identical

### A fresh 4.0 store takes the route

- **Given** a `cortex store init` project with no `migration` field
- **When** `cortex sync` runs
- **Then** it exits 0 and the final set is installed

### An unedited retired skill is removed

- **Given** `.claude/skills/specflow-develop` and `.claude/skills/cortex-loop-hygiene`, each with a matching marker
- **When** `cortex sync` runs
- **Then** both folders are gone and the output has `skills: removed specflow-develop` and `skills: removed cortex-loop-hygiene`

### An edited retired skill is left for the migrate step

- **Given** `.claude/skills/specflow-plan` whose content does not match its marker, and `.claude/skills/specflow-bugs` with no marker
- **When** `cortex sync` runs
- **Then** both are byte-identical, each has the Rule 18 `is retired but has local edits` line naming the packaged path of `cortex-migrate`'s SKILL.md, and no prompt was made

### A project's own skill is never removed

- **Given** `.claude/skills/release` and `.claude/skills/specflow-custom`, neither with a marker
- **When** `cortex sync` runs
- **Then** both are byte-identical

### The final set arrives

- **Given** no bundle of the final set under `.claude/skills/`
- **When** `cortex sync` runs
- **Then** all nine are installed with markers, each has its `skills: installed` line, and `cortex-migrate` is not installed

### An unedited skill is updated

- **Given** an installed `specflow-review` whose marker matches its content, and a package copy that differs
- **When** `cortex sync` runs
- **Then** it equals the package's copy, its marker is new, and the output has `skills: updated specflow-review`

### An edited skill is left alone

- **Given** an installed `specflow-review` whose content does not match its marker
- **When** `cortex sync` runs
- **Then** it is byte-identical, and the output has `skills: .claude/skills/specflow-review exists with different content; left alone`

### A package lacking part of the final set removes nothing

- **Given** a package with no `cortex-quality`, and an unedited retired skill under `.claude/skills/`
- **When** `cortex sync` runs, and separately `cortex sync --dry-run`
- **Then** both exit 1 with `cortex sync: refused — this package lacks cortex-quality. Nothing was written.`, and the project is byte-identical

### The block reaches stage 2 in one run

- **Given** a project with `specflow/` and a stage 1 block, and a package holding `specflow-spec`
- **When** `cortex sync` runs once
- **Then** the `CLAUDE.md` block holds the two stage 2 paragraphs

### Installed hooks are refreshed

- **Given** a git repository with `core.hooksPath` set to `.githooks` and an out-of-date `.githooks/commit-msg` carrying the `# cortex-managed` line
- **When** `cortex sync` runs
- **Then** the file holds what `cortex hooks install` writes, and the output has `hooks: refreshed .githooks`

### Hooks are not switched on by sync

- **Given** a git repository with `specflow/` and `core.hooksPath` unset
- **When** `cortex sync` runs
- **Then** `core.hooksPath` is still unset, `.githooks/` does not exist, and the output has `hooks: not installed; run cortex hooks install`

### Outside git, hooks are skipped

- **Given** a project that is not a git repository
- **When** `cortex sync` runs
- **Then** it exits 0 and the output has `hooks: not a git repository; skipped`

### Unregistered tasks print the command to type

- **Given** a test registry holding one of this project's tasks, with the roster at three
- **When** `cortex sync` runs
- **Then** the output has `tasks: 2 of 3 not registered; in a Claude Desktop session for this project, type /cortex-register-tasks (plain words will not run it)`, the registry is byte-identical, and it exits 0

### No registry counts as unregistered

- **Given** no registry under the injected `appSupportDir`
- **When** `cortex sync` runs
- **Then** the output has the Rule 22 line with every task unregistered, no registry is created, and it exits 0

### Registered tasks are reported in one line

- **Given** a test registry holding every task of this project, enabled
- **When** `cortex sync` runs
- **Then** the output has `tasks: all 3 registered` and no `/cortex-register-tasks`

### Sync never registers

- **Given** a test registry and a stub in place of `registerTasks`
- **When** `cortex sync` runs
- **Then** the stub was not called, and the registry is byte-identical

### The task payloads arrive

- **Given** no payload for this project under the injected home
- **When** `cortex sync` runs
- **Then** the three `STORE_V4_TASKS` payloads exist at their scoped names with markers, each has its `tasks: installed payload` line, and a second run changes no file and prints none of those lines

### An unedited payload is refreshed and an edited one is kept

- **Given** one payload whose marker matches its older content, and another whose content was edited after its marker was written
- **When** `cortex sync` runs
- **Then** the first holds the current payload with its `tasks: updated payload` line, and the second is byte-identical with its `has local edits; left alone` line

### Payloads of other projects and 3.x payloads stay

- **Given** a directory at this project's plain scoped name owned by another project root, and this project's 3.x payload directory
- **When** `cortex sync` runs
- **Then** both are byte-identical, and this project's payload is at the hash-fallback name

### Project skills are listed

- **Given** a project bundle `release` naming `specflow-develop`
- **When** `cortex sync` runs
- **Then** the output has `project skills to adjust: 1` and `- release/SKILL.md: specflow-develop`, and the file is byte-identical

### A validation error fails sync

- **Given** a store file with a validation error
- **When** `cortex sync` runs
- **Then** it prints the error and exits 1

### A dry run writes nothing

- **Given** a project with an unedited retired skill and no final set
- **When** `cortex sync --dry-run` runs
- **Then** it exits 0, the project and the test registry are byte-identical, the output has `would: skills: removed <name>`, `would: skills: installed <name>`, `would: blocks: refresh MAP.md and the managed blocks` and `would: tasks: installed payload <scoped name>`, no payload exists under the injected home, and the `project skills to adjust` section is unprefixed

### A dry run reports the hook case a real run would take

- **Given** `core.hooksPath` set to `.githooks`, a `.githooks/commit-msg` carrying the `# cortex-managed` line, and `.githooks/pre-commit` without it; separately, the same path with no hook files
- **When** `cortex sync --dry-run` runs
- **Then** the first prints the `specflow.git-hooks` Rule 12 line and no `refreshed`, the second prints `would: hooks: not installed; run cortex hooks install`, and neither changes a file

### A second run changes nothing

- **Given** a project `cortex sync` has just updated
- **When** `cortex sync` runs again
- **Then** no file changed, and the output has no `removed`, `installed` or `updated` line

### Knowledge and settings stay out of it

- **Given** a store with files in `world/`, `code/`, `history/` and `now/`, a `specflow/` tree, and a `.claude/settings.json`
- **When** `cortex sync` runs
- **Then** all of them are byte-identical

### An unedited 3.x copy with no marker is updated

- **Given** `.claude/skills/cortex-register-tasks/` holding that bundle as of an earlier commit of `main`, with no marker
- **When** `cortex sync` runs
- **Then** it holds the package's copy with a marker, and the output has `skills: updated cortex-register-tasks`

### A marker-less copy with an edit is left alone

- **Given** the same bundle with one byte changed, and no marker
- **When** `cortex sync` runs
- **Then** it is byte-identical, and the output has the Rule 19 `left alone` line

### An unedited retired copy with no marker is removed

- **Given** `.claude/skills/specflow-plan/` holding that bundle as of an earlier commit of `main`, with no marker
- **When** `cortex sync` runs
- **Then** it is gone, and the output has `skills: removed specflow-plan`

### The shipped list covers the history

- **Given** the history of `main` up to `88895ca`
- **When** each distinct version of `skills/cortex-register-tasks` and `skills/verification-before-completion` is hashed
- **Then** all 4 and all 3 are in `SHIPPED_3X_HASHES` under their names

### A 3.x project with a bare cortex.json is told to migrate

- **Given** `.cortex/cortex.config.json`, and a `cortex/cortex.json` with no `migration` field written by `cortex store init`
- **When** `cortex sync` runs
- **Then** it exits 3 with the Rule 16 message naming `cortex migrate`, and the project is byte-identical

### A broken cortex.json is refused

- **Given** a `cortex/cortex.json` that does not parse, and separately one with no `schemaVersion`
- **When** `cortex sync` runs
- **Then** each exits 3 with `cortex/cortex.json is not valid`, and the project is byte-identical

### A migration with no accepted date is unaccepted

- **Given** a `cortex/cortex.json` whose `migration` has no `accepted` key
- **When** `cortex sync` runs
- **Then** it exits 3 with the Rule 16 message naming `cortex migrate --accept`

### A failed step stops the route

- **Given** a `cortex store map` that throws
- **When** `cortex sync` runs
- **Then** it exits 1 with `cortex sync: stopped at blocks:`, no `hooks:` or `tasks:` line follows, the skills written stay, and a second run with the fault gone finishes with exit 0

### A symlinked bundle is left alone

- **Given** `.claude/skills/specflow-plan` and `.claude/skills/cortex-remember` as symbolic links, and a retired bundle holding a symbolic link
- **When** `cortex sync` runs
- **Then** all three and their targets are byte-identical, and each has its `is a symlink; left alone` line

### An interrupted install leaves a whole bundle

- **Given** a marked, unedited `cortex-remember` and a copy that fails partway into its `.cortex-tmp-cortex-remember` folder
- **When** `cortex sync` runs, then runs again with the fault gone
- **Then** after the first run the bundle is byte-identical to before, and after the second it holds the package's copy, with no `.cortex-tmp-*` folder left

### A missing or stale marker on an identical copy is written

- **Given** a final-set bundle identical to the package's copy with no marker, and another with a marker holding the wrong hash
- **When** `cortex sync` runs
- **Then** both have a marker holding their hash, their content is unchanged, and neither has a `skills: updated` line

### A hand-written hook does not fail sync

- **Given** `core.hooksPath` set to `.githooks`, a `.githooks/commit-msg` carrying the `# cortex-managed` line, and `.githooks/pre-commit` without it
- **When** `cortex sync` runs
- **Then** `.githooks/` is byte-identical, the output has the `specflow.git-hooks` Rule 12 line prefixed `hooks: `, and it exits 0

### A hand-set hooks path gets nothing written

- **Given** a git repository with `specflow/`, `core.hooksPath` set to `.githooks` by hand, and no hook files in `.githooks/`
- **When** `cortex sync` runs
- **Then** `.githooks/` is unchanged, `specflow.since` is not written, the output has `hooks: not installed; run cortex hooks install`, and it exits 0

### A hooks path elsewhere gets no install advice

- **Given** a git repository with `specflow/` and `core.hooksPath` set to `.husky`
- **When** `cortex sync` runs
- **Then** the output has `hooks: core.hooksPath is .husky; add the hooks there by hand`, no `run cortex hooks install`, and it exits 0

### No specflow folder skips the hooks

- **Given** a git repository with no `specflow/` and `core.hooksPath` unset
- **When** `cortex sync` runs
- **Then** the output has `hooks: no specflow/ folder; skipped`

### The renamed router leaves too

- **Given** an unedited `.claude/skills/specflow-change-router` with no marker
- **When** `cortex sync` runs
- **Then** it is gone, and the output has `skills: removed specflow-change-router`

### The verb refuses a flag it does not know

- **Given** an unedited retired skill
- **When** `cortex sync --help`, `-h`, `--dryrun`, `--dry-rnu`, `-n`, `--dry-run=true` and `--force` each run
- **Then** each exits 2 with its `unknown flag` line, `dry-run` as a second argument exits 2 with its `unexpected argument` line, and the project is byte-identical

### A symlinked skills folder is left alone

- **Given** `.claude/skills` as a symbolic link to a folder holding a marked retired bundle
- **When** `cortex sync` runs
- **Then** it exits 0 with the line `skills: .claude/skills is a symlink; left alone`, and the folder is byte-identical

### A person's temp-looking folder stays, and a generated leftover is named

- **Given** `.cortex-tmp-notes/mine.md`, and empty folders `.cortex-tmp-old-cortex-remember` and `.cortex-tmp-specflow-plan`
- **When** `cortex sync` runs
- **Then** the first is byte-identical, the others are gone, and each has its `cleared leftover` line

### Something in the way of a temp name is named

- **Given** a plain file at `.cortex-tmp-specflow-plan` and an unedited `specflow-plan`
- **When** `cortex sync` runs, and separately `cortex sync --dry-run`
- **Then** each exits 1 with the `is in the way` line, and both are byte-identical

### An empty folder at a bundle name counts as absent

- **Given** empty folders `cortex-remember` and `specflow-plan`
- **When** `cortex sync` runs
- **Then** the first is installed, and the second has no `is retired` line

### A .DS_Store is not a local edit

- **Given** a marked, unedited final bundle and a marked, unedited retired bundle, each with a `.DS_Store`
- **When** `cortex sync` runs
- **Then** the first is updated and the second is removed

### A read-only subfolder does not wedge the next runs

- **Given** a marked, unedited bundle with a read-only subfolder, and a package update due
- **When** `cortex sync` runs
- **Then** it exits 0 with `skills: updated <name>`, and no `.cortex-tmp-*` folder is left

### A failed removal leaves the bundle whole

- **Given** an unedited retired bundle in a read-only `.claude/skills/`
- **When** `cortex sync` runs
- **Then** it exits 1 with a `stopped at skills` line, and the bundle is byte-identical

### An unreadable project file keeps the report

- **Given** a project bundle with an unreadable `SKILL.md`
- **When** `cortex sync` runs
- **Then** it exits 0, its install lines are printed, and the file has `- <path>: not read`, not counted

### A dry run prints what a real run then does

- **Given** retired, final and project bundles in every state
- **When** `cortex sync --dry-run` runs, then `cortex sync`
- **Then** their `skills:`, `tasks:`, `hooks:` and project-skill lines match, with `would: ` removed

### This repository ships every bundle of the final set

- **Given** the repository's `skills/`
- **When** it is read
- **Then** it holds every `FINAL_BUNDLES` name and `cortex-migrate`

### A .cortex folder with no config is told to migrate

- **Given** a `.cortex/` folder with no `cortex.config.json`, a `cortex/cortex.json` with no `migration` field, and an unedited retired skill
- **When** `cortex sync` runs
- **Then** it exits 3 with the Rule 16 message naming `cortex migrate`, and the project is byte-identical

### Every retired name with a shipped copy is on the list, and no other name is

- **Given** `SHIPPED_3X_HASHES`
- **When** its names are read
- **Then** each is a retired name, `cortex-register-tasks` or `verification-before-completion`, and `specflow-change-router` has an entry

### Sync refuses off darwin before anything else

- **Given** an accepted store on a platform that is not `darwin`
- **When** `cortex sync` runs
- **Then** it exits 2 with Rule 1's message, and the project is byte-identical

### A plain file with a bundle name is left alone

- **Given** a plain file at a retired name and at a final name
- **When** `cortex sync` runs
- **Then** it exits 0, both are byte-identical, and the final name has its `left alone` line

### A failed copy leaves the old bundle and a partial temp folder the next run clears

- **Given** an unedited bundle and a package copy that fails partway
- **When** `installWhole` throws, and `cortex sync` then runs
- **Then** the bundle was byte-identical after the failure, and no `.cortex-tmp-*` folder is left after the run

### A person's file at an unused temp name blocks nothing

- **Given** an unedited retired bundle and a plain file at `.cortex-tmp-old-<that name>`
- **When** `cortex sync` runs
- **Then** it exits 0, the bundle is gone, and the file is byte-identical

### A folder at the marker path does not stop sync

- **Given** a final bundle identical to the package's, with a folder at its marker path
- **When** `cortex sync` runs, and separately `cortex sync --dry-run`
- **Then** each exits 0 with `skills: <name>: marker not written; left alone`, the second prefixed `would: `

### A commit-msg that is a folder is not an install

- **Given** `core.hooksPath` set to `.githooks`, `specflow/`, and a folder at `.githooks/commit-msg`
- **When** `cortex sync` runs
- **Then** it exits 0 with `hooks: not installed; run cortex hooks install`

### With no home passed, payloads land under os.homedir()

- **Given** `HOME` pointing at a temp folder and no `home` option
- **When** the update route runs
- **Then** the three payloads are under that folder (B-011)

### A marked older final bundle is not listed by a dry run

- **Given** a marked, unedited older final bundle naming a retired skill
- **When** `cortex sync --dry-run` runs
- **Then** the output has `project skills to adjust: 0`
