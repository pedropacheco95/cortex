---
id: core-cli.tasks-register
status: implemented
depends_on:
  - core-cli.init
  - core-cli.task-scoping
governs:
  - "src/cli/tasks-register.ts"
implements: ../../specs-business/core-cli/developer-runs-cortex-on-every-project.business.md
governed_by:
  - R-001
---

# cortex tasks plan / register / verify — Real Desktop-App Registration

## Intent

Writing `~/.claude/scheduled-tasks/<name>/SKILL.md` produces a prompt **payload** only — the Claude Desktop app never scans that directory (B-009). The app's real registry is a `scheduled-tasks.json` under `<app-support>/claude-code-sessions/<uuid>/<uuid>/` (shape `{"scheduledTasks": [...], "recordedSkips": {...}}`), loaded into memory **once per app launch** and rewritten wholesale from memory on every task event — so direct writes are only safe while the app is fully quit. The **primary registration mechanism** is therefore the `cortex-register-tasks` skill, run inside a Claude Desktop session, using the app's own internal MCP tools (`mcp__scheduled-tasks__create_scheduled_task` / `update_scheduled_task` / `list_scheduled_tasks`, exposed only to Desktop-spawned sessions). This spec owns the Core surface behind that flow: `cortex tasks plan [--json]` — the authoritative, read-only registration plan the skill consumes; `cortex tasks register` — the **guarded direct-write fallback** (app closed only; B-009 change-plan option 1, demoted after the app's in-memory clobber behaviour was proven; unsupported upstream: issue #41364 closed not-planned, #47797 open); and `cortex tasks verify`, the silent-loss detector app updates make necessary (registry wipes observed, issue #49276).

## Entities

- **READS:** the project root (scoping inputs, `cwd`); `<appSupportDir>/claude-code-sessions/**/scheduled-tasks.json`; the payload tree under `<home>/.claude/scheduled-tasks/`; the injected Desktop-app process check.
- **WRITES:** (`register` only) the payload roster (via init's `writeScheduledTasks`); the discovered registry file (atomic temp+rename); a `<file>.cortex-backup-<stamp>` copy before every write. `plan` and `verify` write nothing.
- **CREATES:** `planTasks`/`tasksPlan` (+ `TASK_PLAN_VERSION`, `TaskPlanEntry` — now carrying `model`), `registerTasks({projectRoot, home, appSupportDir, isDesktopAppRunning?})`, `verifyTasks(...)`, `registrationStatus(...)` (init's read-only summary check), `desktopAppRunning()` (the real macOS `pgrep` check, CLI-entry only), the cadence/model table `TASK_CADENCE` (canonical bundle name → `{cron, model}`), and the constant `TASK_PERMISSION_MODE`.

## Rules

1. **Injected roots, real defaults only at the CLI entry.** `registerTasks`/`verifyTasks`/`tasksPlan`/`registrationStatus` take `projectRoot`, `home`, and (where they read the registry) `appSupportDir` as parameters; the `cortex tasks plan|register|verify` dispatch alone supplies the real `os.homedir()`, `~/Library/Application Support/Claude`, and the real `desktopAppRunning` process check. Tests run exclusively against fixture trees with injected fakes.
2. **Payload roster first.** `register` re-runs init's payload writer (non-force: missing payloads written, user-edited ones preserved, this project's retired scoped dirs removed) before touching the registry, so every registry `filePath` it writes has a payload behind it.
3. **Registry discovery.** Glob `claude-code-sessions/**/scheduled-tasks.json` under `appSupportDir`. Zero matches → exit 1 with a message saying the app itself creates the registry (open the Desktop app once); Cortex never creates the registry file. Multiple matches → the most-recently-modified wins and a warning names the ignored files.
4. **Upsert the five bundles, own only your fields.** Per bundle: `id` = the §9.1 scoped name, `cronExpression` from the cadence/model table, `model` from the cadence/model table (`claude-opus-4-8` for `weekly-curation`, `claude-sonnet-5` for the other four), `enabled: true`, `filePath` = the absolute payload SKILL.md path, `cwd` = the resolved project root, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE` (`"bypassPermissions"`, matching observed app-created entries). `createdAt` (epoch ms) is stamped **only on newly created entries**. Entries are parsed as unknown JSON: on update, fields Cortex does not own survive untouched; every foreign entry, `recordedSkips`, and any unknown top-level key pass through structurally intact.
5. **Retired entries removed, this project only.** Registry entries whose `id` equals this project's scoped name for a retired canonical task are dropped; no other project's entries are ever counted, modified, or removed.
6. **Backup then atomic write; idempotent.** Before writing: copy the registry to `<file>.cortex-backup-<ISO-ish stamp>`. Write via temp file + rename. A re-run with nothing to change writes nothing (no new backup) and reports already-up-to-date. Malformed registry JSON → exit 1, file untouched.
7. **Cadence/model table is data.** One `{cron, model}` per canonical bundle, exactly five entries: `daily` → `0 2 * * *`, `claude-sonnet-5`; `weekly-curation` → `0 4 * * 6`, `claude-opus-4-8`; `weekly-quality` → `0 4 * * 0`, `claude-sonnet-5`; `test-runner` → `0 6 * * 0`, `claude-sonnet-5`; `monthly-review` → `0 6 1 * *`, `claude-sonnet-5`. Each bundle runs its member loops sequentially, failure-isolated (schema §9.1); the cron staggering that used to separate individual dailies is now internal ordering within the `daily` bundle, so the table needs no minute-of-day disambiguation.
8. **`verify` reports per bundle and fails loudly.** For each of the five: registered / enabled / cron / `model` / payload `filePath` exists on disk. Exit non-zero if any is missing, disabled, or dangling; cron or model drift from the cadence/model table is reported but does not fail. Zero registries → exit 1 (same message as Rule 3). On failure the bottom line points at the Desktop-session skill flow first (`register` named only as the app-quit fallback). `verify` is read-only and is never guarded.
9. **Deterministic Core** (R-001): pure file I/O; no LLM, no network.
10. **`plan` is the authoritative registration plan — read-only, exit 0.** `cortex tasks plan` prints, for each of the five: scoped `id`, `cronExpression` from the cadence/model table, `model`, `cwd` = resolved project root, `permissionMode`, absolute payload path, and the one-line description from `SCHEDULED_TASKS`. `--json` emits the stable machine shape (`planVersion` — bumped on any shape change —, `projectRoot`, `taskCount`, `tasks[]` with `id`/`canonical`/`cronExpression`/`model`/`cwd`/`enabled`/`useWorktree`/`permissionMode`/`payloadPath`/`description`) that the `cortex-register-tasks` skill consumes, keeping Core the single source of truth — the skill never hardcodes ids, cadences, or models.
11. **`register` refuses while the Desktop app runs.** The app holds the registry in memory (loaded once per launch, flushed wholesale on every task event): a direct write while it runs is clobbered, and a write it cannot parse makes it wipe every task. `registerTasks` takes an injected `isDesktopAppRunning` check (omitted = guard off, for fixtures); when it reports true, exit 1 **before any write** (payload roster included) with a message explaining the clobber/wipe hazard and pointing at the skill flow. **No `--force`-style escape hatch exists by design.** The real check (`desktopAppRunning`) is a deterministic `pgrep -f` against the app bundle's main-binary path, macOS-only like Cortex v1, supplied only at the CLI entry.
12. **In-session skill registration is the primary mechanism.** The `cortex-register-tasks` skill (shipped in `skills/` + `.claude/skills/`, byte-identical) runs in a Claude Desktop session: preflight that the `mcp__scheduled-tasks__*` tools exist (else stop and instruct the user to open the repo in Desktop), read `cortex tasks plan --json`, diff against `list_scheduled_tasks` by id, create missing tasks / update drifted ones (mapping plan fields onto the tool's runtime input schema; never inventing prompt content — the payload SKILL.md already exists at the id-derived path), touch nothing foreign, and finish with `cortex tasks verify`. `cortex init` prints the open-Desktop-and-run-the-skill instruction block (spec `core-cli.init` Rules 13/15) via `registrationStatus`, the read-only registered-and-enabled check that tolerates registry-not-found.

## Acceptance Criteria

### Register upserts five entries and preserves everything foreign

- **Given** a fixture app-support tree whose registry holds two foreign entries carrying extra unknown fields, plus a non-empty `recordedSkips`
- **When** `registerTasks` runs
- **Then** the registry holds the two foreign entries (unknown fields structurally identical) plus this project's five, each with scoped `id`, cadence/model-table `cronExpression` and `model`, `enabled: true`, absolute `filePath`, `cwd` = project root, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE`, and a numeric `createdAt`
- **And** the `weekly-curation` bundle's `model` is `claude-opus-4-8` and the other four are `claude-sonnet-5`
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

- **Given** a registry entry whose id is this project's scoped name for a retired canonical task (one of the fourteen pre-consolidation identities, e.g. `<slug>-cortex-loop-skill-suggest` or `<slug>-<h6>-cortex-pulse-hygiene`)
- **When** `registerTasks` runs
- **Then** that entry is gone and the five current bundle entries are present

### Zero registries → clear error, exit 1

- **Given** an app-support fixture with no `scheduled-tasks.json` anywhere under `claude-code-sessions/`
- **When** `registerTasks` (or `verifyTasks`) runs
- **Then** exit 1 with a message stating the Desktop app creates the registry and Cortex never does

### Multiple registries → newest wins with a warning

- **Given** two registry files with distinct mtimes
- **When** `registerTasks` runs
- **Then** only the most-recently-modified is written, and the output warns naming the ignored file

### Verify exit codes

- **Given** a fully registered project
- **Then** `verifyTasks` exits 0 reporting all five ok
- **And given** one entry missing, one disabled, or one whose `filePath` does not exist on disk, it exits non-zero naming each failure

### Cadence/model table shape

- **Given** `TASK_CADENCE`
- **Then** it has exactly five entries keyed by the §9.1 canonical bundle names (`daily`, `weekly-curation`, `weekly-quality`, `test-runner`, `monthly-review`), each carrying a `cron` and a `model`, with `weekly-curation`'s model `claude-opus-4-8` and the rest `claude-sonnet-5`

### Plan output shape

- **Given** `planTasks` / `cortex tasks plan --json`
- **Then** the JSON carries `planVersion`, the resolved `projectRoot`, `taskCount` 5, and five `tasks[]` entries — each with the scoped `id`, its `canonical` bundle name, the cadence/model-table `cronExpression` and `model`, `cwd` = project root, `enabled: true`, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE`, an absolute `payloadPath` under `<home>/.claude/scheduled-tasks/<id>/SKILL.md`, and a non-empty `description`
- **And** the non-JSON output names every scoped id with its cron, model, and payload path and points at the Desktop-session skill flow
- **And** neither form writes anything

### Register guard: refused while the Desktop app runs

- **Given** a fixture registry and an injected `isDesktopAppRunning` returning true
- **When** `registerTasks` runs
- **Then** exit 1; the registry bytes are untouched, no backup is created, and no payload dir is written
- **And** the message explains the in-memory clobber/wipe hazard and points at running `cortex-register-tasks` in a Claude Desktop session
- **And** with the checker returning false (or omitted), the same call proceeds normally

### The cortex-register-tasks skill ships in both trees

- **Given** the package
- **Then** `skills/cortex-register-tasks/SKILL.md` exists, is byte-identical to `.claude/skills/cortex-register-tasks/SKILL.md`, preflights the `mcp__scheduled-tasks__*` tools, consumes `cortex tasks plan --json`, and finishes with `cortex tasks verify`

## Notes

- **Decision (B-009 final mechanism, owner-approved):** the shipped registration path is **option 2 via skill** — `cortex init` sets everything up headlessly and prints instructions; the user opens the repo in a Claude Desktop session and runs `cortex-register-tasks`, which registers through the app's own internal `mcp__scheduled-tasks__*` MCP tools. Option 1 (direct registry write) is **demoted to a guarded, app-closed-only fallback** after reverse-engineering the app bundle proved the registry is in-memory per launch and rewritten wholesale on every task event — an external write while the app runs is clobbered, and a malformed one wipes all tasks. Known fragilities of the fallback remain accepted: the UUID path changes on reinstall, app updates can wipe the registry (#49276 — `verify` is the detector), and the format is undocumented upstream (unknown fields are preserved verbatim to survive format growth).
- **Entry schema (from the app bundle's zod schema):** required `id` (regex `^[a-z0-9_-]+$`), `enabled`, `filePath`, `createdAt` (number, epoch ms); optional `cronExpression`, `fireAt` (number), `model`, `cwd`, `useWorktree`, `permissionMode` (enum `default|acceptEdits|plan|bypassPermissions|dontAsk|auto`). The app recomputes `filePath` from `id`, so the id MUST equal the payload dir name. The app's `create_scheduled_task` requires the SKILL.md to already exist at `~/.claude/scheduled-tasks/<id>/SKILL.md`.
- Follow-up (not in this spec): a hygiene-loop finding when `verify` fails, so registry wipes surface on the daily cadence without a manual run.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
