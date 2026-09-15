---
id: pulse.hygiene
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
  - anatomy.scanner
implements: ../../specs-business/pulse/developer-sees-project-health-without-asking.business.md
governed_by:
  - R-001
governs:
  - "src/pulse/hygiene.ts"
  - "skills/cortex-loop/references/hygiene.md"
---

# Hygiene Loop

## Intent

`cortex pulse-hygiene` is the daily deterministic sweep (design §10.2): it surveys the project for unfinished or broken state and writes `pulse/reports/hygiene.md`, which the SessionStart hook already surfaces (freshness window, schema §5). Deterministic Core CLI; the shipped `cortex-pulse-hygiene` skill bundle wraps it for scheduled runs.

## Entities

- **READS:** git state (local branches, last-commit ages); `.cortex/anatomy/files.md` vs the filesystem; cerebrum rules/bugs cross-refs; the spec trees; project files (TODO/FIXME scan); `gh` CLI output when available (open PRs).
- **WRITES:** `.cortex/pulse/reports/hygiene.md` — the only file it writes, ever (design §11.3 property 2).
- **DELETES:** stale per-session read ledgers under `.cortex/pulse/state/reads/` whose mtime is older than the retention window (default 14 days) — the first of the two deletions this loop performs; and (Rule 8) session records under `.cortex/pulse/sessions/` and scratch copies under `.cortex/pulse/scratch/<session-id>/` older than 30 days — the second. Both counts are reported in `reports/hygiene.md`.
- **EDITS IN PLACE:** `.cortex/pulse/threads/T-NNN-<slug>.md` files whose `status` is `open` and whose `expires` has passed — `status` becomes `expired` (Rule 8; `pulse.threads` Rule 10). Never deleted.
- **CREATES:** the report per schema §4.5 (`kind: pulse-hygiene-report`, always-write convention).

## Rules

1. **Command + bundle.** `cortex pulse-hygiene` runs the sweep; the package ships `skills/cortex-loop/references/hygiene.md` instructing scheduled runs to invoke the CLI and read the result (making the `hygiene` scheduled task registrable under `--partial`).
2. **Deterministic checks (v1 set):** (a) orphan local branches — unmerged, no commits in 30 days; (b) stale open PRs via `gh` when on PATH, else the section reads "skipped — gh unavailable"; (c) anatomy drift — `files.md` rows whose file is gone, and on-disk files missing from anatomy; (d) cerebrum dead references — rule `source:`/`governs:` targets that no longer resolve (reuse the validator's resolution logic, don't reimplement); (e) spec/anatomy orphans — dev specs whose `governs` matches nothing; (f) aged TODO/FIXME comments (count + locations). Thresholds are engineering-call constants noted in the report footer.
3. **Always-write (schema §4.5).** Every run overwrites the report with a fresh `generated`; a clean project yields explicit "No findings this cycle." sections.
4. **Report shape.** One `##` section per check with concrete findings ("thing, problem, suggested next step") — no scores. Footer names skipped checks (gh absent, drop-off detection deferred) and the thresholds used.
5. **Mid-conversation drop-off detection is deferred** to the agentic layer (design §10.2 names it the sole LLM check): the CLI's footer states it was not run; the skill bundle may add it in a later round. Never blocks the deterministic sweep.
6. **Read-only Core.** No LLM, no mutation of anything but its own report, the reads-ledger pruning of Rule 7, and the thread expiry and record/scratch retention of Rule 8; no network beyond `gh`/`git ls-remote` queries (observing remotes is reading, not egress of content). Governed by R-001.
7. **Reads-ledger retention (the first of two sanctioned deletions — Rule 8 is the second).** Delete every `pulse/state/reads/<session-id>` ledger whose mtime is older than `READS_RETENTION_DAYS` (default 14, currently in-code in `src/pulse/hygiene.ts`; flagged as a future `cortex.config.json` `pulse.readsRetentionDays` key, schema §10.1). The count deleted is reported in a report section; a run with none to prune reports "No reads ledgers past retention this cycle." No other `pulse/state/`, `reports/`, or `extraction/` file is ever deleted.
8. **Thread expiry and session-record retention (the second sanctioned deletion; schema §4.5.3).** Every sweep: (a) every `pulse/threads/T-NNN-*.md` whose frontmatter parses, whose `status` is `open`, and whose `expires` is earlier than now gets `status: expired` — an in-place frontmatter edit, body and every other field untouched, no file ever deleted (`pulse.threads` Rule 10); a thread whose frontmatter does not parse is skipped and counted. (b) every `pulse/sessions/<session-id>.json` whose mtime is older than `SESSION_RECORD_RETENTION_DAYS` (30, in-code next to `READS_RETENTION_DAYS`) is deleted, and so is the whole `pulse/scratch/<session-id>/` directory whose name matches a deleted record **or** whose own mtime is past the same window; (c) every `pulse/state/sessions/<session-id>.last.json` Stop-companion file (`hooks.session-end` Rule 11) whose mtime is past the same window is deleted — these are orphans of sessions that never reached `SessionEnd`. Threads referencing a deleted record keep their `session`/`sessions` citations (cited-not-resolved, schema §6). One report section, "Threads and session records", carries four counts — expired, records deleted, scratch directories deleted, companion files deleted — and reads "No threads past expiry and no session records past retention this cycle." when all are zero. Absent `threads/`, `sessions/` or `scratch/` directories are tolerated (nothing to do). No other file under `pulse/` is subject to age-based deletion.

## Acceptance Criteria

### Always-writes, even when clean

- **Given** a freshly initialised, fully conformant project with one branch and no TODOs
- **When** `cortex pulse-hygiene` runs
- **Then** `pulse/reports/hygiene.md` has `kind: pulse-hygiene-report`, a fresh `generated`, and every section reads "No findings this cycle."

### Anatomy drift both directions

- **Given** a scanned project where one indexed file was deleted and one new file was created
- **When** the sweep runs
- **Then** the anatomy section names the missing file and the unscanned file

### Cerebrum dead reference caught

- **Given** a rule whose `source:` points at a deleted file
- **When** the sweep runs
- **Then** the cerebrum section names the rule and the dead path

### Orphan branch flagged

- **Given** a git fixture with an unmerged branch whose last commit is 40 days old
- **When** the sweep runs
- **Then** the branches section names it with its age

### gh absence degrades to a notice

- **Given** no `gh` on PATH
- **When** the sweep runs
- **Then** the PR section reads skipped-with-reason and the exit code is 0

### Only the report is written

- **Given** any run
- **Then** the only file created or modified under the project is `pulse/reports/hygiene.md` (aside from the Rule 7 pruning of aged `pulse/state/reads/` ledgers and the Rule 8 thread expiry edits and record/scratch deletions)

### An open thread past its expiry is expired in place

- **Given** `pulse/threads/T-001-x.md` with `status: open` and `expires: 2026-08-01T00:00:00Z`, `T-002-y.md` with `status: open` and `expires` one day in the future, and `T-003-z.md` with `status: answered` and `expires: 2026-08-01T00:00:00Z`
- **When** the sweep runs on 2026-09-15
- **Then** `T-001` has `status: expired` with every other line byte-identical, `T-002` and `T-003` are unchanged, all three files still exist, and the "Threads and session records" section reports 1 expired

### Old session records and their scratch copies are deleted together

- **Given** `pulse/sessions/old.json`, `pulse/scratch/old/notes.md` and `pulse/state/sessions/gone.last.json` with mtimes 31 days ago, and `pulse/sessions/new.json` with `pulse/scratch/new/notes.md` and `pulse/state/sessions/new.last.json` from yesterday
- **When** the sweep runs
- **Then** `old.json`, the `scratch/old/` directory and `gone.last.json` are gone, `new.json`, `scratch/new/notes.md` and `new.last.json` remain, and the section reports 1 record, 1 scratch directory and 1 companion file deleted

### Nothing to expire reports the empty line

- **Given** no `pulse/threads/`, `pulse/sessions/` or `pulse/scratch/` directory
- **When** the sweep runs
- **Then** the section reads "No threads past expiry and no session records past retention this cycle." and the exit code is 0

## Notes

- SessionStart integration already exists (schema §5): the hook reads this report's `generated` against the freshness window — no new wiring in this spec.
- Drop-off detection (design §10.2) is the deliberate v1 deferral; noted in the report footer, owned by the skill layer later.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
