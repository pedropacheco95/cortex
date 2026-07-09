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

# cortex tasks register / verify — Real Desktop-App Registration

## Intent

Writing `~/.claude/scheduled-tasks/<name>/SKILL.md` produces a prompt **payload** only — the Claude Desktop app never scans that directory (B-009). The app's real registry is a `scheduled-tasks.json` under `<app-support>/claude-code-sessions/<uuid>/<uuid>/` (shape `{"scheduledTasks": [...], "recordedSkips": {...}}`), polled every minute while the app runs. This spec owns `cortex tasks register` — refresh the payload roster, then upsert this project's fourteen entries into that registry directly (B-009 change-plan option 1; unsupported upstream: issue #41364 closed not-planned, #47797 open) — and `cortex tasks verify`, the silent-loss detector app updates make necessary (registry wipes observed, issue #49276).

## Entities

- **READS:** the project root (scoping inputs, `cwd`); `<appSupportDir>/claude-code-sessions/**/scheduled-tasks.json`; the payload tree under `<home>/.claude/scheduled-tasks/`.
- **WRITES:** the payload roster (via init's `writeScheduledTasks`); the discovered registry file (atomic temp+rename); a `<file>.cortex-backup-<stamp>` copy before every write.
- **CREATES:** `registerTasks({projectRoot, home, appSupportDir})`, `verifyTasks(...)`, the cadence table `TASK_CADENCE` (canonical name → cron), and the constant `TASK_PERMISSION_MODE`.

## Rules

1. **Injected roots, real defaults only at the CLI entry.** `registerTasks`/`verifyTasks` take `projectRoot`, `home`, and `appSupportDir` as parameters; the `cortex tasks register|verify` dispatch alone supplies the real `os.homedir()` and `~/Library/Application Support/Claude`. Tests run exclusively against fixture trees.
2. **Payload roster first.** `register` re-runs init's payload writer (non-force: missing payloads written, user-edited ones preserved, this project's retired scoped dirs removed) before touching the registry, so every registry `filePath` it writes has a payload behind it.
3. **Registry discovery.** Glob `claude-code-sessions/**/scheduled-tasks.json` under `appSupportDir`. Zero matches → exit 1 with a message saying the app itself creates the registry (open the Desktop app once); Cortex never creates the registry file. Multiple matches → the most-recently-modified wins and a warning names the ignored files.
4. **Upsert the fourteen, own only your fields.** Per task: `id` = the §9.1 scoped name, `cronExpression` from the cadence table, `enabled: true`, `filePath` = the absolute payload SKILL.md path, `cwd` = the resolved project root, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE` (`"bypassPermissions"`, matching observed app-created entries). `createdAt` (epoch ms) is stamped **only on newly created entries**. Entries are parsed as unknown JSON: on update, fields Cortex does not own survive untouched; every foreign entry, `recordedSkips`, and any unknown top-level key pass through structurally intact.
5. **Retired entries removed, this project only.** Registry entries whose `id` equals this project's scoped name for a retired canonical task are dropped; no other project's entries are ever counted, modified, or removed.
6. **Backup then atomic write; idempotent.** Before writing: copy the registry to `<file>.cortex-backup-<ISO-ish stamp>`. Write via temp file + rename. A re-run with nothing to change writes nothing (no new backup) and reports already-up-to-date. Malformed registry JSON → exit 1, file untouched.
7. **Cadence table is data.** One cron expression per canonical task, exactly fourteen entries: dailies staggered 02:00–03:20 one per 20 min (hygiene, bug-triage, spec-drift, insight-refresh-daily, session-observe); weeklies spread across Sat/Sun small hours (distil, rule-decay, skill-suggest, specflow-lint, specflow-verify, test-runner, insight-refresh-full); monthlies on the 1st (atlas-staleness, onboarding-drift). No two dailies share a minute-of-day.
8. **`verify` reports per task and fails loudly.** For each of the fourteen: registered / enabled / cron / payload `filePath` exists on disk. Exit non-zero if any is missing, disabled, or dangling; cron drift from the cadence table is reported but does not fail. Zero registries → exit 1 (same message as Rule 3).
9. **Deterministic Core** (R-001): pure file I/O; no LLM, no network.

## Acceptance Criteria

### Register upserts fourteen entries and preserves everything foreign

- **Given** a fixture app-support tree whose registry holds two foreign entries carrying extra unknown fields, plus a non-empty `recordedSkips`
- **When** `registerTasks` runs
- **Then** the registry holds the two foreign entries (unknown fields structurally identical) plus this project's fourteen, each with scoped `id`, cadence-table `cronExpression`, `enabled: true`, absolute `filePath`, `cwd` = project root, `useWorktree: false`, `permissionMode` = `TASK_PERMISSION_MODE`, and a numeric `createdAt`
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

- **Given** a registry entry whose id is this project's scoped name for a retired canonical task
- **When** `registerTasks` runs
- **Then** that entry is gone and the fourteen current entries are present

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
- **Then** `verifyTasks` exits 0 reporting all fourteen ok
- **And given** one entry missing, one disabled, or one whose `filePath` does not exist on disk, it exits non-zero naming each failure

### Cadence table shape

- **Given** `TASK_CADENCE`
- **Then** it has exactly fourteen entries keyed by the §9.1 canonical names, and no two daily entries share the same minute-of-day

## Notes

- **Decision (B-009 option 1, owner-approved):** write the app's registry directly. Known fragilities accepted: the UUID path changes on reinstall (re-run `register`), app updates can wipe the registry (#49276 — `verify` is the detector), and the format is undocumented upstream (the entry TYPE here is derived from observed fields; unknown fields are preserved verbatim to survive format growth).
- **Field parity check before first live run:** the entry field set (id, cronExpression, enabled, filePath, createdAt, cwd, useWorktree, permissionMode) was designed from B-009's observed evidence, not re-inspected against a live entry — the owner session must eyeball one real app-created entry before running `register` on the real machine.
- Follow-up (not in this spec): a hygiene-loop finding when `verify` fails, so registry wipes surface on the daily cadence without a manual run.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
