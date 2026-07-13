---
path: src/loops/test-runner.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 3
size_lines: 1233
size_tokens: 12164
centrality: high
built_at_commit: "fd7b55b"
source_sha256: "43d0750e8a8810a2ac92721930c101c6d1eb58c97c42960bfe01c46cdc20449f"
---

# src/loops/test-runner.ts

## Purpose

Implements `cortex loop-test-runner` / `cortex test-run` — the tiered test-runner loop (spec `loops.test-runner`, design §11.4 item 11) and, by project-wide convention, the ONLY loop permitted to write code. It runs a deterministic Core pipeline (R-001: no LLM calls from Core itself) around exactly two agentic touch points: a seven-type failure classifier (in-session for the shipped skill, or a headless `claude` subprocess in bare/scheduled mode) and the writer/verifier harness reused unmodified from `src/harness/run.ts`. Three CLI modes share one binary: `--collect` runs the configured tiers (atomic/spec/journey/scenario), parses vitest failures, applies ledger-based suppression, and writes a worklist (`.cortex/pulse/state/test-runner-worklist.json`) plus an interim always-write report; `--fix-stage <results.json>` consumes an already-classified results array and, per failure, invokes the writer/verifier harness, then either delivers a verified fix as a fresh-worktree branch + PR (five-field body) or files a `.cortex/compass/bugs/` case file on budget exhaustion; bare mode (no flags) chains both phases itself, shelling out to a headless `claude -p` classifier subprocess when `--no-llm` isn't set. Every mode ends by overwriting `.cortex/pulse/reports/test-failures.md` via `writePulseReport` (Rule 9, the always-write guarantee) — the loop never leaves silence where a report should be.

## Main players

- `parseVitestFailures` (lines 74-99, exported) — deterministic regex-based parser (`FAIL_LINE_RE`) turning raw vitest stdout/stderr into `ParsedFailure[]` plus passed/failed summary counts. [critical]
- `tierHasTests` (lines 102-115, exported) — recursive walk deciding whether a tier directory has any `.test.ts` file; an empty tier is a stated clean section, never an error (Rule 1). [supporting]
- `traceSpec` / `traceCriterion` (lines 158-228, exported) — §3 path-convention-first spec tracing (`tests/<tier>/<rest>.test.ts` → `.specflow/specs/<rest>.spec.md`), falling back to a `governs:` glob scan, then best-word-overlap criterion-heading matching (Rule 5). [supporting]
- `findSuppressingBug` (lines 246-272, exported) — Rule 3/Pedro-pin-1c: only an `open`, `FILED_BY_MARKER`-carrying ledger entry whose `affects:` names the test path suppresses a re-run; any other status re-arms it. [critical]
- `collectIntake` (lines 350-392, exported) — runs each requested tier's shell command, parses failures, applies suppression, and assembles the `TestWorklist` (tiers/pending/suppressed) — the deterministic first bookend shared by `--collect` and bare mode. [critical]
- `writeWorklist` / `writeTestFailuresReport` (lines 394-400, 747-821, exported) — the two sanctioned state/report writes: the worklist JSON under `.cortex/pulse/state/`, and the always-write markdown report (funnelled through `writePulseReport`, Rule 9). [critical]
- `validateClassification` / `isSevenType` (lines 421-440, exported) — shape-validates one raw classifier result and gates it against the seven bug types (`BUG_TYPES` from `./bug-triage.js`); anything else is "not-one-of-the-seven" and stays report-only (Rule 4, Pedro pin 3). [critical]
- `buildCaseFileContent` / `fileCaseFile` (lines 492-563, exported) — Rule 7/Pedro-pins-1a-b: on budget exhaustion, allocates the next `B-NNN` id and writes a NEW (never edited) `.cortex/compass/bugs/` case file with the classification, the writer's last diff, and the full verifier verdict history. [critical]
- `testFixBranch` / `buildPrBody` / `deliverFix` (lines 569-728, exported) — Rule 6/Pedro-pin-2: on a verified pass, creates a detached fresh worktree, applies the harness diff, commits, pushes if a remote exists, and opens a PR via `gh` with a mandatory five-field body (spec, criterion, writer reasoning, verifier verdict, trigger context) — degrading gracefully (branch-only notice) when there's no git repo, an empty diff, no remote, or no `gh` binary. The checked-out working tree itself is never touched. [critical]
- `runFixStage` (lines 863-953, exported) — the per-classified-failure orchestrator: routes each pending failure through the classification gate, then `runWriterVerifier` (harness/run.ts), then `deliverFix` (pass) or `fileCaseFile` (budget exhausted), building the tier-by-tier `TierReport`s consumed by the report writer. [critical]
- `runClassifier` (lines 966-994) — spawns the headless `claude -p <prompt>` subprocess for bare-mode classification, classifying the subprocess outcome as ok/no-binary/timeout/auth/error (auth detection via `AUTH_FAILURE_PATTERN` from `cli/claude-auth.js`). [supporting]
- `parseTestRunnerFlags` (lines 1010-1057, exported) — argv parser for `loop-test-runner`/`test-run`: `--tier`, `--trigger`, `--collect`, `--fix-stage`, `--no-llm`, `--timeout-ms`, enforcing `--collect`/`--fix-stage` mutual exclusivity. [critical]
- `runTestRunner` (lines 1074-1208, exported) — the single entry point dispatching the three modes (fix-stage / collect / bare) described in Purpose; called directly by `src/cli/cli.ts`'s `loop-test-runner`/`test-run` handler. [critical]
- `TIERS` / `DEFAULT_TIERS` / `TIER_DIRS` / `TIER_COMMANDS` (lines 1214-1233, exported constants) — the module footer: the four tiers, the daily-default pair (`atomic`, `spec`; journey is weekly, scenario on-demand), their `tests/<tier>` directories, and their `pnpm vitest run tests/<tier>` commands. [critical]

## Insights

- This is explicitly called out (in the file's own header comment) as "the heaviest loop, shipped last, and the ONLY loop that writes code" — every other Cortex loop is read/propose-only, writing solely to `.cortex/pulse/`; this file is the sole exception, and the exception is fenced tightly: writes are confined to worktrees/branches, the pulse report/worklist, and brand-new ledger entries. It never mutates the checked-out working tree (Rule 8) — all code changes happen inside a `fs.mkdtempSync` scratch parent, in a `git worktree add --detach` sandbox that gets force-removed and pruned in a `finally` block even on failure.
- The writer/verifier harness itself (`runWriterVerifier`) is deliberately REUSED from `src/harness/run.ts`, not reimplemented — the module comment stresses this ("never duplicated"), keeping the code-writing mechanics owned by one shared harness rather than forked per caller.
- Ledger suppression (`findSuppressingBug`) is the memory mechanism preventing infinite refiling: only entries carrying the literal `FILED_BY_MARKER` string (`'Filed-by: cortex-loop-test-runner'`) count, so a human-filed bug touching the same test never silently mutes the runner — suppression is scoped strictly to the runner's own automated case files, and only while `status: open`.
- The classification gate (`isSevenType`) treats "not one of the seven" as a legitimate, non-forced verdict — the classifier prompt (`classifierPrompt`) explicitly instructs "Never force-fit a taxonomy gap," pushing genuinely novel failure shapes to report-only rather than mis-filing them into one of the seven types.
- Budget exhaustion (case file) vs. verified pass (branch+PR) are the only two harness outcomes that produce durable artifacts; a third outcome, `'unavailable'` (e.g., the harness itself couldn't run), produces neither — just a notice — so a broken harness never silently creates either a false-positive fix or a false bug report.
- The always-write report (Rule 9) is written at every exit path of `runTestRunner`, including early returns for flag errors, `--no-llm` degradation, classifier auth failure, and classifier timeout/no-binary/error — the `degrade()` closure (lines 1164-1169) centralises "retain the worklist, write the report with a notice, return an exit code" so no code path can exit silently.
- PR delivery degrades through four levels (created / gh-missing / gh-failed / skipped) rather than failing hard — a missing `gh` binary or push failure still leaves a local branch carrying the verified fix, with the shortfall recorded as a notice string surfaced in the report.
- Exit code 3 is reserved specifically for classifier/harness authentication failure (`authFailure`), distinguishing "the Claude CLI needs `/login`" from ordinary degradation (exit 0) or flag errors (exit 1) — callers (e.g. a scheduled task runner) can branch on this to alert a human rather than silently retry.

## File map

- lines 1-53: module doc comment (pipeline narrative + Rule/pin references), imports, exported constants (`TEST_WORKLIST_FILE`, `TEST_FAILURES_REPORT_FILE`, `FILED_BY_MARKER`), internal constants (severities, timeouts, excerpt bounds), `Tier`/`Trigger` types.
- lines 54-115: failure intake — `parseVitestFailures`, `tierHasTests`.
- lines 117-228: spec + criterion tracing — `traceSpec`, `traceCriterion`, `walkSpecFiles`, `specIdOf`.
- lines 230-272: suppression — `findSuppressingBug` (the ledger-is-memory gate).
- lines 274-400: intake result + worklist types, `runShell`, `excerpt`, `collectIntake`, `writeWorklist`.
- lines 402-452: classification gate — `validateClassification`, `isSevenType`, `classifierPrompt`.
- lines 454-563: ledger case files — `nextBugNumber`, `slugify`, `buildCaseFileContent`, `fileCaseFile`.
- lines 565-728: verified-pass delivery — `testFixBranch`, `buildPrBody`, git helpers (`git`, `branchExists`, `uniqueBranch`, `runGh`), `deliverFix` (the fresh-worktree branch/commit/push/PR sequence).
- lines 730-821: the always-write report — `TierReport` type, `emptyTierReport`, `writeTestFailuresReport`.
- lines 823-953: fix stage — `briefFor` (harness brief assembly), `runFixStage` (per-failure orchestration).
- lines 955-994: classifier subprocess — `runClassifier` (headless `claude -p` invocation + outcome classification).
- lines 996-1072: CLI flags + option types — `parseTestRunnerFlags`, `TestRunnerOptions`.
- lines 1074-1208: entry point — `runTestRunner` (fix-stage mode, collect mode, bare mode).
- lines 1210-1233: module footer — `TIERS`, `DEFAULT_TIERS`, `TIER_DIRS`, `TIER_COMMANDS`.

## Connections

Uses:
- `src/harness/run.ts`: `runWriterVerifier`, `resolveMaxIterations`, `HarnessResult` — the shared writer/verifier code-fix harness this loop reuses rather than reimplementing.
- `src/cli/claude-auth.ts`: `AUTH_FAILURE_PATTERN` — detects an unauthenticated headless `claude` CLI in `runClassifier`'s subprocess output.
- `src/pulse/distil.ts`: `parseCandidatesFromOutput` — parses the headless classifier's JSON-array stdout into candidate results (bare mode only).
- `src/pulse/fences.ts`: `chooseOuterFence` — picks a safe outer code-fence for embedding failing output and the writer's diff inside a generated bug case file.
- `src/loops/bug-triage.ts`: `BUG_TYPES` — the seven-type taxonomy the classification gate (`isSevenType`) checks classifier verdicts against.
- `src/loops/report.ts`: `writePulseReport` — the sole write path for `.cortex/pulse/reports/test-failures.md` (Rule 9).
- `src/paths.ts`: `specsRoot` — resolves `.specflow/specs/` for spec tracing.

Used by:
- `src/cli/cli.ts` (lines 258-274): the `loop-test-runner` / `test-run` verb handler dynamically imports `parseTestRunnerFlags` and `runTestRunner`, parses argv, and dispatches into this module — the sole caller of the loop's public entry point.
- `src/pulse/migrate.ts` (line 46): references the literal worklist filename `test-runner-worklist.json` as a migration-path constant (legacy dotfile → `state/` subdirectory), not a code import of this module.
- `src/cli/templates.ts` (lines 418-425): the `test-runner` scheduled-task bundle template describes this loop's `--collect` / `--fix-stage` cycle in its generated agent instructions (documentation reference, not a runtime import).
- `src/cli/tasks-register.ts` / `src/cli/task-scoping.ts`: reference the `'test-runner'` bundle name/schedule and the `cortex-loop-test-runner` skill name for scheduled-task registration and scoping (name references, not imports).

## Query pointers

- To see how a verified fix becomes a branch and PR (worktree isolation, commit, push, `gh` fallback ladder), read `deliverFix` (lines 648-728) alongside `src/harness/run.ts` for what `HarnessResult` actually carries.
- To see the three-mode CLI dispatch (`--collect` / `--fix-stage` / bare) and how each degrades on classifier failure, read `runTestRunner` (lines 1074-1208) together with the `degrade()` closure (lines 1164-1169).
- To see the classification gate and how "not one of the seven" is handled without forcing a taxonomy fit, read `validateClassification`/`isSevenType` (lines 421-440) and their use inside `runFixStage` (lines 900-909), plus `src/loops/bug-triage.ts` for `BUG_TYPES` itself.
