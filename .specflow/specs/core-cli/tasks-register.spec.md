---
id: core-cli.tasks-register
status: draft
depends_on:
  - core-cli.init
  - core-cli.task-scoping
governs:
  - "src/cli/tasks-register.ts"
  - "src/cli/templates.ts"
  - "skills/cortex-register-tasks/SKILL.md"
implements: ../../specs-business/core-cli/developer-runs-cortex-on-every-project.business.md
governed_by:
  - R-001
---

# cortex tasks plan / register / verify — Real Desktop-App Registration

## Intent

Writing `~/.claude/scheduled-tasks/<name>/SKILL.md` produces a prompt **payload** only: the Claude Desktop app never scans that directory (B-009). The app's real registry is a `scheduled-tasks.json` under `<app-support>/claude-code-sessions/<uuid>/<uuid>/` (shape `{"scheduledTasks": [...], "recordedSkips": {...}}`), loaded into memory **once per app launch** and rewritten wholesale from memory on every task event, so direct writes are only safe while the app is fully quit. This spec owns the Core surface: `cortex tasks plan [--json]`, the read-only registration plan; `cortex tasks register`, which writes the registry with the app closed (unsupported upstream: issue #41364 closed not-planned, #47797 open); `cortex tasks verify`, the silent-loss detector app updates make necessary (registry wipes observed, issue #49276); and `cortex tasks heartbeat`, which makes a missed run visible.

An accepted 4.0 store has **three tasks**, each dispatching one skill: `learn` (`loops.learn-task`), `fresh` (`loops.fresh-task`), `quality` (`loops.quality-task`). They replace the five 3.x bundles, which a store not yet accepted keeps (Rule 13).

**Two routes (P15).** Registering while the app runs needs the app's own `mcp__scheduled-tasks__*` tools, which exist only in a session the Desktop app spawns, so Core cannot be the main route. The `cortex-register-tasks` skill is (Rule 12), typed as `/cortex-register-tasks`. `cortex tasks register` is the fallback, for when the app is fully quit: a direct write while it runs is overwritten from memory, and a write it cannot parse makes it wipe every task, so `register` refuses, with no override. `cortex sync` registers nothing (Rule 17).

## Entities

- **READS:** the project root (scoping inputs, `cwd`); `<appSupportDir>/claude-code-sessions/**/scheduled-tasks.json`; the payload tree under `<home>/.claude/scheduled-tasks/`; the injected Desktop-app process check.
- **WRITES:** (`writeTaskPayloads`, called by `register` and sync) the payload roster and a `.cortex-installed.json` marker per payload; (`register` only) the discovered registry file (atomic temp+rename); a `<file>.cortex-backup-<stamp>` copy before every write. `plan` and `verify` write nothing. (`heartbeat` only) `cortex/now/cortex-tasks.md`.
- **CREATES:** `planTasks`/`tasksPlan` (+ `TASK_PLAN_VERSION`, `TaskPlanEntry` — now carrying `model`), `registerTasks({projectRoot, home, appSupportDir, isDesktopAppRunning?})`, `verifyTasks(...)`, `writeTaskPayloads({projectRoot, home, dryRun?})`, `heartbeatTask(...)`, `registrationStatus(...)` (init's read-only summary check), `desktopAppRunning()` (the real macOS `pgrep` check, CLI-entry only), the cadence table `TASK_CADENCE` (canonical task name → `{cron, model, heartbeatDays}`), and the constant `TASK_PERMISSION_MODE`.

## Rules

1. **Injected roots, real defaults only at the CLI entry.** `registerTasks`/`verifyTasks`/`tasksPlan`/`registrationStatus` take `projectRoot`, `home`, and (where they read the registry) `appSupportDir` as parameters; the `cortex tasks plan|register|verify` dispatch alone supplies the real `os.homedir()`, `~/Library/Application Support/Claude`, and the real `desktopAppRunning` process check. Tests run exclusively against fixture trees with injected fakes.
2. **Order, and payload roster before the registry.** `register` checks in this order, and every refusal writes nothing: Rule 13, Rule 11, Rule 14, registry discovery and parse (Rules 3 and 6). Only then does it call `writeTaskPayloads` (Rule 18) and remove this project's retired scoped dirs, before touching the registry, so every registry `filePath` it writes has a payload behind it.
3. **Registry discovery.** Glob `claude-code-sessions/**/scheduled-tasks.json` under `appSupportDir`. Zero matches → exit 1 with a message saying the app itself creates the registry (open the Desktop app once); Cortex never creates the registry file. Multiple matches → the most-recently-modified wins and a warning names the ignored files.
4. **Upsert the three tasks, own only your fields.** Per task: `id` = the scoped name (`core-cli.task-scoping`), `cronExpression`, `model` from the cadence table, `enabled: true`, `filePath` = the absolute payload SKILL.md path, `cwd` = the resolved project root, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE` (`"bypassPermissions"`, matching observed app-created entries). `createdAt` (epoch ms) is stamped **only on newly created entries**. Entries are parsed as unknown JSON: on update, fields Cortex does not own survive untouched; every foreign entry, `recordedSkips`, and any unknown top-level key pass through structurally intact.
5. **Retired entries removed, this project only.** Registry entries whose `id` equals this project's scoped name for a retired canonical task, the five 3.x bundles included, are dropped; no other project's entries are ever counted, modified, or removed. Their payload dirs go by Rule 2.
6. **Backup then atomic write; idempotent.** Before writing: copy the registry to `<file>.cortex-backup-<ISO-ish stamp>`. Write via temp file + rename. A re-run with nothing to change writes nothing (no new backup) and reports already-up-to-date. Malformed registry JSON → exit 1, file untouched.
7. **The cadence table is data.** `TASK_CADENCE`, exactly three entries: `learn` → `0 2 * * *`, `claude-opus-5-5`, heartbeat 3 days; `fresh` → `0 4 * * 6`, `claude-sonnet-5-5`, heartbeat 8 days; `quality` → `0 4 * * 0`, `claude-sonnet-5-5`, heartbeat 8 days. Learn daily on Opus and the other two weekly on Sonnet is decided (A9).
8. **`verify` reports per task and fails loudly.** For each of the three: registered / enabled / cron / `model` / payload `filePath` exists on disk. Exit non-zero if any is missing, disabled, or dangling; cron or model drift from the cadence table is reported but does not fail. Zero registries → exit 1 (same message as Rule 3). On failure the bottom line says to type `/cortex-register-tasks` in a Desktop session, or to quit the app and run `cortex tasks register`. `verify` is read-only and is never guarded.
9. **Deterministic Core** (R-001): pure file I/O; no LLM, no network.
10. **`plan` is read-only, exit 0.** `cortex tasks plan` prints, for each of the three: scoped `id`, `cronExpression`, `model`, `cwd` = resolved project root, `permissionMode`, absolute payload path, and the one-line description from `STORE_V4_TASKS`. `--json` emits the stable machine shape (`planVersion`: 3, `projectRoot`, `taskCount`, `tasks[]` with `id`/`canonical`/`cronExpression`/`model`/`cwd`/`enabled`/`useWorktree`/`permissionMode`/`payloadPath`/`description`).
11. **`register` refuses while the Desktop app runs.** The app holds the registry in memory (loaded once per launch, flushed wholesale on every task event): a direct write while it runs is clobbered, and a write it cannot parse makes it wipe every task. `registerTasks` takes an injected `isDesktopAppRunning` check (omitted = guard off, for fixtures); when it reports true, exit 1 **before any write** (payload roster included) with exactly `Scheduled tasks not registered: the Claude Desktop app is open and would overwrite or wipe the registry. Type /cortex-register-tasks in a Desktop session, or quit the app and run cortex tasks register.` **No `--force`-style escape hatch exists by design.** The real check (`desktopAppRunning`) is a deterministic `pgrep -f` against the app bundle's main-binary path, macOS-only like Cortex v1, supplied only at the CLI entry.
12. **The skill is the main route, `cortex tasks register` the fallback (P15).** `cortex-register-tasks` is the tenth skill, in `skills/` and `.claude/skills/`, byte-identical. Its frontmatter carries `disable-model-invocation: true`, so it costs no context and runs only when typed as `/cortex-register-tasks` (`scaffolding.skill-listing-budget` Tier E). Its procedure stays and follows the three tasks. It stops, editing no file, when the `mcp__scheduled-tasks__*` tools are absent. It reads `cortex tasks plan --json` (`planVersion` 3); when `taskCount` is not 3 the project is on the 3.x roster, and it stops and says to migrate first. When a plan entry's payload is missing it registers nothing for that entry and says to run `cortex sync` (Rule 18). It diffs the plan against `list_scheduled_tasks`, creates the missing tasks, updates the drifted ones, deletes or disables this project's superseded tasks, the five 3.x bundles included, removes the payload dir of each one it deleted, never touches another project's, and finishes with `cortex tasks verify`. Because a sentence no longer reaches the skill, every message pointing at it gives the typed command `/cortex-register-tasks`, never `run cortex-register-tasks`.
13. **Which roster.** A project is on the 4.0 roster when `cortex/cortex.json` exists and `migration.accepted` is a date, or it has no `migration` field and no `.cortex/cortex.config.json` exists (schema S9.1; the same test as `core-cli.sync` Rule 16). The rest of this spec describes that roster. Any other project stays on the **3.x roster**, which is read-only: `plan` and `verify` read the five bundles of `SCHEDULED_TASKS` with `TASK_CADENCE_3X` (table in the Notes), so a project that has not migrated can still see what it has. `register`, `heartbeat` and `collect` on the 3.x roster exit 1 with `this project has no 4.0 tasks until its store is accepted (cortex migrate --accept)` and write nothing. `sync` on such a project says to migrate first and writes nothing (`core-cli.sync`).
14. **The payload.** A new constant `STORE_V4_TASKS` holds exactly the three tasks; `SCHEDULED_TASKS` stays as it is, for the 3.x roster. Each payload has the frontmatter `name:` and ownership marker of `core-cli.task-scoping`, and a body of three parts: the line `This is an unattended run: the user can't answer during this run.` (the condition of the managed block's "nobody can answer" line, P9); an instruction to invoke the named skill (`cortex-learn`, `cortex-fresh`, `cortex-quality`) and follow it; and no other procedure. `requiredSkills`: `learn` → `cortex-learn`, `cortex-remember`; `fresh` → `cortex-fresh`, `cortex-remember`; `quality` → `cortex-quality`, `cortex-remember`, `specflow-review`. `register` refuses with exit 1, naming them, when a required skill is absent from the project's `.claude/skills/`.
15. **`cortex tasks heartbeat <learn|fresh|quality> [--today YYYY-MM-DD]`** makes a missed run visible. `--today` defaults to the local date. It replaces that task's item in `now/cortex-tasks.md`, heading `## <task> last ran <today>`, then `until: <today + heartbeatDays>`, leaves the other tasks' items byte-identical, and creates the file with the S3 frontmatter (`about: When each scheduled task last ran`, `permanence: volatile`, `verified: <today> (observed)`, `origin: person:cortex-tasks@<today>`) when absent. A task that stops running leaves an item that expires, which `check.now-until` and `cortex store expire` surface.
16. **`cortex tasks collect <learn|fresh|quality>`** dispatches to `loops.learn-task` Rule 2, `loops.fresh-task` Rule 2 and `loops.quality-task` Rule 2, which own each output. For both verbs an unknown task name exits 2 and prints `Usage: cortex tasks <collect|heartbeat> <learn|fresh|quality>`.
17. **`cortex sync` registers nothing.** It never calls `registerTasks`, whose one caller is the `cortex tasks register` CLI. When tasks are unregistered it prints `/cortex-register-tasks` (`core-cli.sync` Rule 22).
18. **Who writes the payloads.** `create_scheduled_task` needs the payload on disk, and `register` refuses while the app runs, so sync's update route writes them: it calls `writeTaskPayloads({ projectRoot, home, dryRun })` after skills are installed (`core-cli.sync` Rule 22), and `/cortex-register-tasks` finds the three in a new project. For each of the three, at its scoped directory, with a `.cortex-installed.json` marker holding the hash of its `SKILL.md`: absent → written with a marker; identical to the current payload → content unchanged, a missing or stale marker written; different with a marker matching its content (no local edit) → replaced, marker rewritten; different otherwise (a local edit) → left alone. It returns `{ written, updated, kept }`, each a list of scoped names, `kept` holding the local edits; an identical payload is in none of them, so a second call returns three empty lists. With `dryRun: true` it writes nothing, marker included, and returns the lists a real call would, for `core-cli.sync` Rule 25. It removes nothing, because a task the app still holds would point at a missing file, and it never reads or writes the registry. The skill removes a superseded task's payload dir after deleting the task; `register` removes them by Rule 2. `register` has no payload writer of its own, so no payload is ever left without a marker. `writeTaskPayloads` is a new function, not a wrapper: `writeScheduledTasks` in `src/cli/scaffold.ts` removes retired dirs, iterates the 3.x `SCHEDULED_TASKS` and writes no marker, so it stays for the 3.x roster only.
19. **`registrationStatus({ projectRoot, home, appSupportDir })`** is the read-only summary sync and init print from. It reads the roster Rule 13 gives: on the 4.0 roster the three tasks, `total` 3; on the 3.x roster the five bundles, `total` 5, like `plan` and `verify`. Sync refuses a 3.x project before reaching it (`core-cli.sync` Rule 16), so that branch serves only a caller outside sync. It returns `{ registryFound, unregistered, total }`, `unregistered` holding canonical names, and it writes nothing. No registry is tolerated: `registryFound` is false and every task counts as unregistered. Its doc comment and the `total` comment in `src/cli/tasks-register.ts` stop saying five.

## Acceptance Criteria

### Register upserts three entries and preserves everything foreign

- **Given** a fixture app-support tree whose registry holds two foreign entries carrying extra unknown fields, plus a non-empty `recordedSkips`
- **When** `registerTasks` runs
- **Then** the registry holds the two foreign entries (unknown fields structurally identical) plus this project's three, each with scoped `id`, cadence-table `cronExpression` and `model`, `enabled: true`, absolute `filePath`, `cwd` = project root, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE`, and a numeric `createdAt`
- **And** the `learn` task's `model` is `claude-opus-5-5` and the other two are `claude-sonnet-5-5`
- **And** `recordedSkips` and unknown top-level keys survive structurally intact
- **And** a `<file>.cortex-backup-*` copy of the pre-write bytes exists

### Re-run is idempotent

- **Given** a registry `registerTasks` has already brought up to date
- **When** it runs again
- **Then** the file bytes are unchanged, no new backup is created, and the output says already up to date

### Update preserves unknown fields and createdAt on own entries

- **Given** a registry entry with this project's scoped id carrying `createdAt`, a stale cron, `enabled: false`, and an unknown extra field
- **When** `registerTasks` runs
- **Then** the entry's cron and `enabled` are corrected, `createdAt` and the unknown field are unchanged, and no duplicate entry is added

### Retired scoped entries are removed

- **Given** a registry entry whose id is this project's scoped name for a retired canonical task (a name in `RETIRED_CANONICAL_TASK_NAMES`, e.g. `<slug>-cortex-loop-skill-suggest` or `<slug>-<h6>-cortex-pulse-hygiene`, or a 3.x bundle such as `<slug>-weekly-curation`)
- **When** `registerTasks` runs
- **Then** that entry is gone and the three current task entries are present

### Zero registries → clear error, exit 1

- **Given** an app-support fixture with no `scheduled-tasks.json` anywhere under `claude-code-sessions/`
- **When** `registerTasks` (or `verifyTasks`) runs
- **Then** exit 1 with a message stating the Desktop app creates the registry and Cortex never does
- **And** no payload dir is written

### A malformed registry is untouched

- **Given** a registry file that does not parse
- **When** `registerTasks` runs
- **Then** exit 1, the file is byte-identical, and no backup or payload dir is written

### Multiple registries → newest wins with a warning

- **Given** two registry files with distinct mtimes
- **When** `registerTasks` runs
- **Then** only the most-recently-modified is written, and the output warns naming the ignored file

### Verify exit codes

- **Given** a fully registered project
- **Then** `verifyTasks` exits 0 reporting all three ok
- **And given** one entry missing, one disabled, or one whose `filePath` does not exist on disk, it exits non-zero naming each failure

### Cron and model drift is reported, not failed

- **Given** a fully registered project with one entry's cron changed by hand
- **When** `verifyTasks` runs
- **Then** it exits 0 and names the drift

### Cadence table shape

- **Given** `TASK_CADENCE`
- **Then** it has exactly three entries keyed `learn`, `fresh`, `quality`, with crons `0 2 * * *`, `0 4 * * 6`, `0 4 * * 0`, models `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-sonnet-5-5`, and `heartbeatDays` 3, 8, 8

### Plan output shape

- **Given** `planTasks` / `cortex tasks plan --json`
- **Then** the JSON carries `planVersion` 3, the resolved `projectRoot`, `taskCount` 3, and three `tasks[]` entries — each with the scoped `id`, its `canonical` task name, the cadence-table `cronExpression` and `model`, `cwd` = project root, `enabled: true`, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE`, an absolute `payloadPath` under `<home>/.claude/scheduled-tasks/<id>/SKILL.md`, and a non-empty `description`
- **And** the non-JSON output names every scoped id with its cron, model, and payload path
- **And** neither form writes anything

### Register guard: refused while the Desktop app runs

- **Given** a fixture registry and an injected `isDesktopAppRunning` returning true
- **When** `registerTasks` runs
- **Then** exit 1; the registry bytes are untouched, no backup is created, and no payload dir is written
- **And** the message is exactly the Rule 11 line
- **And** with the checker returning false (or omitted), the same call proceeds normally

### The registration skill ships and runs only when typed

- **Given** the package
- **Then** `skills/cortex-register-tasks/SKILL.md` exists and is byte-identical to `.claude/skills/cortex-register-tasks/SKILL.md`
- **And** its frontmatter carries `disable-model-invocation: true`
- **And** its body stops without editing a file when the `mcp__scheduled-tasks__*` tools are absent, reads `cortex tasks plan --json`, stops when `taskCount` is not 3, says to run `cortex sync` for a missing payload, and ends with `cortex tasks verify`
- **And** its body describes the three tasks `learn`, `fresh` and `quality`, and contains neither `planVersion: 2` nor `five bundles`

### Messages give the typed command

- **Given** the output of `plan`, `verify` with a task missing, and `register` with the app running
- **Then** each names `/cortex-register-tasks` wherever it names the skill
- **And** none contains `run cortex-register-tasks`

### Verify failure points at quitting the app

- **Given** a project with one task missing
- **When** `verifyTasks` runs
- **Then** the last line names `/cortex-register-tasks` and says to quit the Desktop app and run `cortex tasks register` as the alternative

### An unaccepted store stays on the 3.x roster

- **Given** a project with `.cortex/` and `cortex/cortex.json` carrying `migration: { accepted: null }`
- **When** `cortex tasks plan --json` runs
- **Then** `taskCount` is 5 and the canonical names are the five bundles
- **And** `cortex tasks verify` reports on those five
- **And** `cortex tasks register` and `cortex tasks heartbeat learn` exit 1 with the Rule 13 message and write nothing
- **And** a fresh 4.0 store with no `migration` field gets the three tasks
- **And** a `cortex/cortex.json` with no `migration` field beside `.cortex/cortex.config.json` stays on the 3.x roster

### 3.x payloads are unchanged

- **Given** `SCHEDULED_TASKS`
- **Then** it holds the five bundles, and no entry names `cortex-learn`

### Payloads dispatch one skill and state the run is unattended

- **Given** the three entries of `STORE_V4_TASKS`
- **Then** each body carries the line `This is an unattended run: the user can't answer during this run.` and its skill's name, and names no other skill
- **And** `requiredSkills` matches Rule 14

### A missing required skill stops register

- **Given** a project whose `.claude/skills/` lacks `specflow-review`
- **When** `registerTasks` runs
- **Then** it exits 1 naming `specflow-review`, before any write

### Heartbeat creates, replaces, and leaves the others alone

- **Given** no `now/cortex-tasks.md`
- **When** `cortex tasks heartbeat learn --today 2026-11-04` runs, then `heartbeat fresh --today 2026-11-04`, then `heartbeat learn --today 2026-11-05`
- **Then** the file has one `## learn last ran 2026-11-05` item with `until: 2026-11-08`, one `## fresh last ran 2026-11-04` item with `until: 2026-11-12`, valid S3 frontmatter, and `cortex store validate` reports no error for it

### A missed run surfaces as an expired item

- **Given** a `learn` item with `until: 2026-11-08` and today 2026-11-09
- **When** `cortex store expire` runs
- **Then** it lists that item

### Sync never registers

- **Given** an accepted project with unregistered tasks, a fixture registry, and the Desktop app not running
- **When** `cortex sync` runs
- **Then** the registry bytes are unchanged and no backup exists
- **And** the three payload dirs exist
- **And** the output contains `/cortex-register-tasks`

### Writing payloads leaves the registry and old tasks alone

- **Given** an accepted project with no 4.0 payloads, a retired scoped payload dir of its own, and a fixture registry
- **When** `writeTaskPayloads` runs
- **Then** `written` holds the three scoped names, `updated` and `kept` are empty, the three payload dirs each hold `SKILL.md` and a `.cortex-installed.json` with its hash, the retired dir is still there, and the registry bytes are unchanged
- **And** a second call returns three empty lists and changes no file

### A dry run reports and writes nothing

- **Given** one payload absent, one unedited and out of date, and one edited
- **When** `writeTaskPayloads` runs with `dryRun: true`
- **Then** it returns the same `written`, `updated` and `kept` a real call would
- **And** no file changes, marker included

### Unedited payloads are replaced, edited ones stay

- **Given** three payloads from an older package: one unedited with a matching marker, one edited after its marker was written, and one with no marker and the current content
- **When** `writeTaskPayloads` runs
- **Then** the first is replaced, its marker rewritten, and its name is in `updated`
- **And** the second keeps its bytes and its name is in `kept`
- **And** the third keeps its content, gains a marker, and is in none of the lists
- **And given** a payload with the current content and a stale marker, its content stays, its marker is rewritten, and it is in none of the lists

### Register leaves no payload without a marker

- **Given** a fixture registry, the app closed, and no payloads
- **When** `registerTasks` runs
- **Then** each of the three payload dirs holds a `.cortex-installed.json` with the hash of its `SKILL.md`

### Registration status follows the roster

- **Given** an accepted project with two of its three tasks registered and enabled
- **When** `registrationStatus` runs
- **Then** it returns `registryFound: true`, `total: 3`, and `unregistered` holding the third canonical name
- **And given** no registry, `registryFound` is false and `unregistered` holds all three
- **And given** a project on the 3.x roster, `total` is 5 and `unregistered` holds bundle names
- **And** no call writes anything

### Collect rejects an unknown task

- **Given** `cortex tasks collect daily` or `cortex tasks heartbeat daily`
- **Then** it exits 2 and prints the Rule 16 usage line

## Notes

- **History of the decision (B-009).** The owner-approved mechanism was option 2 via a skill: `cortex init` set everything up and the user ran `cortex-register-tasks` in a Desktop session, through the app's own tools. Option 1, the direct registry write, was demoted to a guarded fallback after reverse-engineering the app bundle proved the registry is in-memory per launch and rewritten wholesale on every task event. Plan item 10 proposed promoting that fallback to the only route; the sitting kept the skill (P15), because only a Desktop session holds the app's tools. Known fragilities stay accepted: the UUID path changes on reinstall, app updates can wipe the registry (#49276; `verify` is the detector), and the format is undocumented upstream (unknown fields are preserved verbatim to survive format growth).
- **P15 asks for one Round 2 test by hand:** in a real session, confirm a skill with `disable-model-invocation: true` leaves the listing and still runs as `/name`. This session's own listing shows both skills because neither carries the header yet.
- **Entry schema (from the app bundle's zod schema):** required `id` (regex `^[a-z0-9_-]+$`), `enabled`, `filePath`, `createdAt` (number, epoch ms); optional `cronExpression`, `fireAt` (number), `model`, `cwd`, `useWorktree`, `permissionMode` (enum `default|acceptEdits|plan|bypassPermissions|dontAsk|auto`). The app recomputes `filePath` from `id`, so the id MUST equal the payload dir name. The app's `create_scheduled_task` requires the SKILL.md to already exist at `~/.claude/scheduled-tasks/<id>/SKILL.md`.
- A registry wipe stops every task, so every heartbeat expires: that is how a wipe now surfaces without a manual `verify`.
- **`TASK_CADENCE_3X`** is the table as it stood: `daily` `0 2 * * *`, `weekly-curation` `0 4 * * 6` on `claude-opus-4-8`, `weekly-quality` `0 4 * * 0`, `test-runner` `0 6 * * 0`, `monthly-review` `0 6 1 * *`, the four others on `claude-sonnet-5`. It goes with the release that retires 3.x. It and `SCHEDULED_TASKS` stay so `plan` and `verify` can read a project that has not migrated. After Round 2 nothing writes a 3.x payload (P12): the old skills have left the package, so a project still on 3.x that never syncs holds payloads naming skills it may still have installed, and nothing refreshes them. The register criteria of the earlier five-bundle version go; its plan and verify tests stay, on 3.x fixtures.
- **Model ids** `claude-opus-5-5` and `claude-sonnet-5-5` are current per this session's environment notes. Whether the Desktop app accepts them was not checked.
- `.claude/skills/` of an accepted project gets the required skills from `store.migrate` Rule 18.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
