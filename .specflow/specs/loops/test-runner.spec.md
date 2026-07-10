---
id: loops.test-runner
status: implemented
depends_on:
  - loops.writer-verifier
  - loops.bug-triage
  - schema.validator
  - core-cli.init
governs:
  - "src/loops/test-runner.ts"
  - "skills/cortex-loop-test-runner/**"
implements: ../../specs-business/loops/developer-gets-test-failures-fixed-or-explained.business.md
governed_by:
  - R-001
---

# Test-Runner Loop

## Intent

`cortex loop-test-runner` (design §11.4 item 11 — the heaviest loop, shipped last) runs the test tiers on their cadences, classifies failures via the `specflow-bugs` seven-type discipline, and for classifiable failures drives the writer/verifier harness to a verified fix — delivered as a branch + PR with the full case attached — or to a complete ledger case-file when the budget exhausts. It is the only loop that writes code, and it does so exclusively through the harness's isolation plus a branch: the working tree is never touched.

## Entities

- **READS:** the `tests/` tiers (per schema §3); failing-test output; the specs the failing tests trace to (`governs`/path conventions); `cerebrum/bugs/` (suppression, Rule 5); `cortex.config.json` (`harness.maxIterations`).
- **WRITES:** `pulse/reports/test-failures.md` (always-write report); `cerebrum/bugs/B-NNN-*.md` (budget-exhaustion case files — within the bug-triage fill-only precedent: new entries only, never edits); git branches `cortex/test-fix-*` (via worktree — the §11.3 sanctioned code path); PRs via `gh` when available.
- **CREATES:** the report per §4.5 (`kind: pulse-test-failures`).

## Rules

1. **Tiers and cadence.** `cortex loop-test-runner [--tier atomic|spec|journey|scenario] [--trigger scheduled|manual]` — default `--tier atomic,spec` (the daily pair; journey weekly, scenario on-demand per design). Tier commands follow the §3 tree paths (engineering-call constants in the module footer). An empty tier is a stated clean section, not an error. `cortex test-run` aliases manual invocation (design §15).
2. **Failure intake.** Parse failing test files/names from the runner output. Each failure carries its **trigger context** (tier, trigger flag, timestamp) through everything downstream.
3. **Suppression — the ledger IS the memory (Pedro pin 1c).** A failure whose test path appears in the `affects:` of an **open** test-runner-filed bug is skipped with a notice — no classification, no fix attempt — until that entry leaves `open`. No separate suppression file: resolving the ledger entry is what re-arms the test. (Most-likely-missed property; pinned explicitly.)
4. **Classification gate (Pedro pin 3).** Remaining failures are classified against the seven types using the `specflow-bugs` discipline (agentic: in-session for the scheduled skill; headless subprocess for bare mode, init-Rule-6 semantics). A result of **"not one of the seven"** → the failure is reported with the classifier's reasoning and *nothing else happens*: no bug filed, no fix attempted, no branch. Taxonomy gaps are `specflow-bugs`'/the schema's business, never force-fitted here.
5. **Fix attempt.** Classifiable failures go to `runWriterVerifier` — brief = the traced spec's relevant excerpts + the failing output + the classification; `testCommand` = the failing tests, scoped. `maxIterations` per the harness config chain.
6. **Verified pass → branch + PR (Pedro pin 2).** The diff is applied in a fresh worktree on branch `cortex/test-fix-<slug>`, committed, pushed when a remote exists, PR opened when `gh` is available (else: branch + report notice). **The PR body always carries all five contract fields:** the failing spec's id, the criterion the tests trace to, the writer's reasoning, the verifier's verdict/reasoning, and the trigger context. Minimal diff, rich body. The PR states its automated origin; authorship rides the user's own gh auth (design Q13, engineering call recorded here).
7. **Budget exhaustion → case file, no PR (Pedro pin 1a-b).** `outcome: fail` → nothing is pushed or proposed; a ledger entry is filed carrying the classification `type:`, the **writer's last diff**, the **verifier's rejection reasoning** (full verdict history), and the trigger context, with `affects:` naming the test path (arming Rule 3's suppression) and the traced spec.
8. **Working tree inviolate.** Runner + harness writes are confined to: worktrees/branches, `pulse/reports/test-failures.md`, new ledger entries. A run leaves the checked-out tree byte-identical.
9. **Always-write report** (§4.5): per-tier sections — passed counts, fixed (branch/PR refs), case-filed, suppressed, unclassifiable-reported — with explicit empty states; footer names tier commands and budget used.
10. **Bundle.** Shipped `skills/cortex-loop-test-runner/SKILL.md` (satisfies the scoped task's `requiredSkills`): run intake `--collect`-style, classify in-session, then invoke the CLI's fix/report stages. Deterministic Core orchestration throughout (R-001); the agentic touches are the classifier and the harness's two roles.

## Acceptance Criteria

### Green tiers → clean report, zero side effects

- **Given** a fixture whose atomic+spec tiers pass
- **When** the runner executes
- **Then** the report states clean tiers; no branch, no ledger entry, no PR; the tree snapshot is byte-identical

### Verified fix → branch plus five-field PR body

- **Given** one failing test, a classifier stub returning `wrong-rule`, harness stubs converging on iteration 1, and a `gh` stub capturing the PR call
- **When** the runner executes
- **Then** branch `cortex/test-fix-*` exists with exactly the harness diff committed
- **And** the captured PR body contains the spec id, the traced criterion, the writer's reasoning, the verifier's verdict, and `trigger: manual`
- **And** the working tree is byte-identical

### Budget exhaustion → case file, suppression armed, no PR

- **Given** harness stubs that always fail across the budget
- **When** the runner executes
- **Then** no branch is pushed and the `gh` stub was never invoked
- **And** a ledger entry exists with the classification type, the last diff, the full verifier rejection history, the trigger context, and `affects:` naming the test path
- **And** the report lists the case file

### Open case file suppresses retries; resolution re-arms

- **Given** the ledger entry from the previous AC still `open`
- **When** the runner executes again with the same failure
- **Then** the failure is skipped with a notice — classifier and harness stubs never invoked
- **And** with the entry edited to `status: resolved`, the next run attempts it again

### Unclassifiable → report only

- **Given** a classifier stub returning not-one-of-the-seven with reasoning "flaky: passes on immediate rerun"
- **When** the runner executes
- **Then** the report carries the failure and that reasoning; no ledger entry, no fix attempt, no branch

### gh unavailable degrades to branch + notice

- **Given** a verified fix and no `gh` on PATH
- **Then** the branch exists, the report notes the missing PR path, exit 0

### Empty tier stated

- **Given** `--tier journey` on a project with no journey tests
- **Then** the report's journey section states there is nothing to run, exit 0

## Notes

- The three spec-time pins are Pedro's (gate review, test-runner round): budget-exhaustion contract incl. ledger-armed retry suppression; the five-field PR contract; the classification gate deferring taxonomy scope to `specflow-bugs`. If a genuinely missing category emerges (infrastructure-failure the likely one), that is a schema §4.3 change, not a test-runner change.
- Journey/scenario tiers run mechanically once such tests exist; today they are empty-tier sections (the project-wide v1.1 deferral).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
