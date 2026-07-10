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
  - "skills/cortex-pulse-hygiene/**"
---

# Hygiene Loop

## Intent

`cortex pulse-hygiene` is the daily deterministic sweep (design §10.2): it surveys the project for unfinished or broken state and writes `pulse/reports/hygiene.md`, which the SessionStart hook already surfaces (freshness window, schema §5). Deterministic Core CLI; the shipped `cortex-pulse-hygiene` skill bundle wraps it for scheduled runs.

## Entities

- **READS:** git state (local branches, last-commit ages); `.cortex/anatomy/files.md` vs the filesystem; cerebrum rules/bugs cross-refs; the spec trees; project files (TODO/FIXME scan); `gh` CLI output when available (open PRs).
- **WRITES:** `.cortex/pulse/reports/hygiene.md` — the only file it writes, ever (design §11.3 property 2).
- **DELETES:** stale per-session read ledgers under `.cortex/pulse/state/reads/` whose mtime is older than the retention window (default 14 days) — the sole deletion this loop performs; the count deleted is reported in `reports/hygiene.md`.
- **CREATES:** the report per schema §4.5 (`kind: pulse-hygiene-report`, always-write convention).

## Rules

1. **Command + bundle.** `cortex pulse-hygiene` runs the sweep; the package ships `skills/cortex-pulse-hygiene/SKILL.md` instructing scheduled runs to invoke the CLI and read the result (making the `hygiene` scheduled task registrable under `--partial`).
2. **Deterministic checks (v1 set):** (a) orphan local branches — unmerged, no commits in 30 days; (b) stale open PRs via `gh` when on PATH, else the section reads "skipped — gh unavailable"; (c) anatomy drift — `files.md` rows whose file is gone, and on-disk files missing from anatomy; (d) cerebrum dead references — rule `source:`/`governs:` targets that no longer resolve (reuse the validator's resolution logic, don't reimplement); (e) spec/anatomy orphans — dev specs whose `governs` matches nothing; (f) aged TODO/FIXME comments (count + locations). Thresholds are engineering-call constants noted in the report footer.
3. **Always-write (schema §4.5).** Every run overwrites the report with a fresh `generated`; a clean project yields explicit "No findings this cycle." sections.
4. **Report shape.** One `##` section per check with concrete findings ("thing, problem, suggested next step") — no scores. Footer names skipped checks (gh absent, drop-off detection deferred) and the thresholds used.
5. **Mid-conversation drop-off detection is deferred** to the agentic layer (design §10.2 names it the sole LLM check): the CLI's footer states it was not run; the skill bundle may add it in a later round. Never blocks the deterministic sweep.
6. **Read-only Core.** No LLM, no mutation of anything but its own report and the reads-ledger pruning of Rule 7, no network beyond `gh`/`git ls-remote` queries (observing remotes is reading, not egress of content). Governed by R-001.
7. **Reads-ledger retention (the one sanctioned deletion).** Delete every `pulse/state/reads/<session-id>` ledger whose mtime is older than `READS_RETENTION_DAYS` (default 14, currently in-code in `src/pulse/hygiene.ts`; flagged as a future `cortex.config.json` `pulse.readsRetentionDays` key, schema §10.1). The count deleted is reported in a report section; a run with none to prune reports "No reads ledgers past retention this cycle." No other `pulse/state/`, `reports/`, or `extraction/` file is ever deleted.

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
- **Then** the only file created or modified under the project is `pulse/reports/hygiene.md` (aside from the Rule 7 pruning of aged `pulse/state/reads/` ledgers)

## Notes

- SessionStart integration already exists (schema §5): the hook reads this report's `generated` against the freshness window — no new wiring in this spec.
- Drop-off detection (design §10.2) is the deliberate v1 deferral; noted in the report footer, owned by the skill layer later.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
