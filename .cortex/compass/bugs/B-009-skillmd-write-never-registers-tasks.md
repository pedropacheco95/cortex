---
id: B-009
title: Writing ~/.claude/scheduled-tasks/<name>/SKILL.md never registers a task — the entire loop roster has been silently inert since day 1
type: wrong-rule
severity: high
status: resolved
affects:
  - core-cli.init
  - core-cli.task-scoping
  - cortex-schema.md §9.1
  - src/cli/init.ts (writeScheduledTasks)
  - .specflow/specs/loops/ (all 14 scheduled loops — none has ever fired autonomously)
proposed_fix: Decision pending owner among three registration mechanisms (write the app's scheduled-tasks.json registry; one-time manual Desktop registration with init printing instructions; wait for upstream #47797 task.json-beside-SKILL.md) — whichever is chosen, correct init.spec Rule 13 + Notes decision OQ#11 and schema §9.1 to describe the real mechanism (RULES 19), refresh the stale on-disk roster to the v3 fourteen, and add a "task is actually registered" verification to init's summary or the hygiene loop.
resolved: 2026-07-09T00:00:00Z
opened: 2026-07-09T00:00:00Z
---

# B-009 — SKILL.md-on-disk is not registration: Cortex's scheduled tasks have never been active

## Evidence

Verified on this machine, 2026-07-09:

- **The Desktop app's real task registry is not `~/.claude/scheduled-tasks/`.** It is a `scheduled-tasks.json` under `~/Library/Application Support/Claude/claude-code-sessions/<uuid>/<uuid>/`, holding `cronExpression`, `enabled`, `filePath`, `cwd`, and `permissionMode` per task. On this machine it has 6 entries, all app-created; **zero** cortex entries.
- **Official docs confirm the mechanism.** code.claude.com/docs/en/desktop-scheduled-tasks.md: schedule/enabled/folder metadata is NOT in SKILL.md; the app does not scan the directory for new tasks; it polls its own JSON registry every minute while running. GitHub issue #41364 (programmatic/CLI registration) closed not-planned; #47797 (move task metadata beside SKILL.md) open, unshipped.
- **Local corroboration: no cortex loop has ever fired autonomously.** No `hygiene-report.md` exists in `.cortex/pulse/` despite the "daily" hygiene task directory existing since Jul 3; the only loop reports on disk match manual in-session runs during the build.
- **Secondary (moot until registration works):** the on-disk roster is also stale — it still contains the retired `cortex-e030b9-cortex-loop-anatomy-refresh-deep` and is missing the three v3 tasks (`insight-refresh-daily`, `insight-refresh-full`, `session-observe`), because `cortex init` hasn't been re-run since the v3 roster landed in schema §9.1.

**What happens:** `cortex init` writes fourteen (currently twelve on disk, stale) `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` payloads and reports "scheduled tasks written"; nothing ever runs.
**What should happen:** the loops named in schema §9.1 fire on their cadences — the autonomous-maintenance layer the business spec promises ("the routine upkeep is scheduled", `developer-sets-up-cortex-in-one-command.business.md`).

## Diagnosis (seven-type classification)

Diagnostic-tree walk:

1. **Dev spec governing this behaviour?** YES — `core-cli.init` (`.specflow/specs/core-cli/init.spec.md`) Rule 13 owns "Desktop scheduled tasks (design §13 step 12)"; `core-cli.task-scoping` and schema §9.1 own the naming; `src/cli/init.ts` `writeScheduledTasks()` implements it.
2. **Does the spec have a rule covering this case?** YES — Rule 13 prescribes the full mechanism: "Write one `~/.claude/scheduled-tasks/<scoped-task-name>/SKILL.md` per scheduled loop … Cadence is confirmed by the user in the Desktop app on first open (design open question #11, conservative path)." The Notes decision makes the assumption explicit: "init writes SKILL.md files only; cadence/config is confirmed in the Desktop app UI on first open."
3. **Is the rule itself correct?** NO — the rule's factual claim about the external system is false. The Desktop app never sees a directory-written task: its registry is its own `scheduled-tasks.json`, it does not scan `~/.claude/scheduled-tasks/` for new entries, and there is no "confirm cadence on first open" flow for tasks it doesn't know exist. Open question #11's hypothesis was encoded as the mechanism without ever being verified against the app; it is now falsified. Schema §9.1 inherits the error — its example says a project "**registers** `api-a3f2b1-cortex-pulse-hygiene` …" when nothing is registered.

First NO at step 3 → **type: wrong-rule**.

**Drift check (Type 6):** no textual drift — the business spec promises scheduled upkeep, the dev spec claims writing SKILL.md achieves it, and the code implements the dev spec faithfully (AC "Twelve scheduled task definitions written" passes). The layers agree with each other; they are jointly wrong about the outside world. Root cause stays at the rule.

**Not Type 7:** the tests correctly encode the criteria; the criteria correctly encode a rule whose registration premise is false. Fixing tests or code without correcting the rule reproduces the bug.

Severity **high**: the entire autonomous-loop layer — 14 tasks across pulse, insight, compass, atlas, specflow, and test-runner — is silently inert. The system's self-maintenance promise (hygiene, drift detection, insight freshness, bug triage) does not hold, and init's summary actively misreports success.

## Intended semantics

"Registered" must mean "the Desktop app will fire this task on its cadence", not "a payload directory exists". Whatever mechanism is chosen, init (or its documented manual step) must end in an entry the app actually polls, and the spec/schema must describe that mechanism truthfully.

### Change Plan

**Spec to modify:** `.specflow/specs/core-cli/init.spec.md` (Rule 13, the affected ACs, Notes decision OQ#11) and `cortex-schema.md` §9.1 (schema change — user approval required, RULES 19 applies).
**Change type:** Correct existing rule + update criteria. **Decision pending the owner** between three corrected mechanisms:

1. **Unsupported-but-practical — write the app's registry directly.** `cortex init` (or a new `cortex tasks register` verb) also writes entries into the app's `scheduled-tasks.json` (path discoverable by glob under `~/Library/Application Support/Claude/claude-code-sessions/*/*/`), supplying per task the SKILL.md `filePath`, `cronExpression`, `cwd` = project root, `enabled`, `permissionMode`. Fragile: the UUID path changes on reinstall and the registry is wiped by app updates (issue #49276); undocumented format may change without notice.
2. **Supported, manual — register once through the Desktop UI.** Each task is registered conversationally/in the UI in a Desktop session, pointing at the existing SKILL.md payloads; `cortex init` keeps writing the payloads and prints explicit registration instructions in its summary instead of claiming registration.
3. **Wait for upstream #47797** (task metadata file beside SKILL.md) and implement against it when it ships; until then, option 2's instructions are the interim truth.

**Whichever option is chosen, all of:**
- Rewrite Rule 13 and the OQ#11 Notes decision to the real mechanism; update the "Twelve scheduled task definitions written" AC family (and `--partial` ACs) so "registered" asserts the chosen mechanism's observable outcome, not directory existence.
- Correct schema §9.1's "registers" language to distinguish *payload written* from *task registered* (user approval — schema is the contract).
- Refresh the stale on-disk roster to the v3 fourteen (retire `anatomy-refresh-deep`; add `insight-refresh-daily`, `insight-refresh-full`, `session-observe`) — re-run of the writer once the mechanism is truthful.
- Add a "task is actually registered" verification: init's summary reports registry state per task (or explicitly states registration is pending manual/upstream action), and/or the daily hygiene loop checks the app registry for this project's `<slug>-<hash6>-` prefix and flags absences.
- Regenerate tests for the changed criteria; run regression for core-cli and the loops domain.

### Resolution

**Resolved 2026-07-09 — option 1 (owner-approved): Cortex writes the app's registry directly.**

- **New spec + code:** `core-cli.tasks-register` (`.specflow/specs/core-cli/tasks-register.spec.md`) / `src/cli/tasks-register.ts`. `cortex tasks register` refreshes the payload roster via init's writer (missing payloads written, this project's retired scoped dirs removed — the stale-roster secondary finding), discovers the registry by glob (`claude-code-sessions/**/scheduled-tasks.json`; zero → exit 1, multiple → newest wins with a warning), backs the file up (`.cortex-backup-<stamp>`), and upserts this project's fourteen entries atomically (temp+rename) — owning only id/cronExpression/enabled/filePath/cwd/useWorktree/permissionMode (+ createdAt on create), preserving every foreign entry, unknown field, and `recordedSkips` verbatim. Cadence comes from a fourteen-row data table (dailies staggered 02:00–03:20, weeklies Sat/Sun 04:00–05:30, monthlies 1st 06:00–06:30).
- **Verification (silent-loss detector, #49276):** `cortex tasks verify` reports per task registered/enabled/cron/payload-exists and exits non-zero on any missing/disabled/dangling entry. Follow-up (not shipped here): surface a hygiene finding on verify failure so wipes are caught on the daily cadence.
- **Rule corrected:** init.spec Rule 13 (payloads ≠ registration; registration = `cortex tasks register`), Rules 15/17 wording, the task AC family (twelve → fourteen; "registered" → observable payload/registration outcomes), and the Notes OQ#11 decision rewritten as falsified-and-revised. Schema §9.1 gains the payload-vs-registration paragraph and drops the false "registers" example wording (the one sanctioned schema edit). Init's summary now states payloads are not yet registered and points at register/verify. Business specs `developer-sets-up-cortex-in-one-command` and `developer-runs-cortex-on-every-project` updated in the same change (no tree drift).
- **Live run:** executed separately by the owner session on the real machine — including eyeballing one real app-created registry entry for field parity (the entry type here derives from this bug's observed evidence; `permissionMode: "bypassPermissions"` is a single constant, `TASK_PERMISSION_MODE`) before the first `cortex tasks register` against the real registry.
