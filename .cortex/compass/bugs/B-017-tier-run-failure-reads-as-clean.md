---
id: B-017
title: A tier whose run fails outright is indistinguishable from a green tier — zero pending, "no failures to classify", exit 0
type: incomplete-rule
severity: medium
status: open
affects:
  - loops.test-runner
  - src/loops/test-runner.ts
proposed_fix: >-
  Add a Rule to loops.test-runner covering the third tier outcome — the run command errored (non-zero exit, timeout/SIGKILL, or collect/transform failure) and produced no parseable `Tests …(N)` summary. Such a tier is a run failure, not a clean tier - it must (a) carry `excerpt(run.output)` on the `TierRunRecord` so the diagnostic tail survives into the worklist and the report, (b) print a distinct console line naming the failed tier instead of "no failures to classify", so a digest reading that line cannot render the cycle green, and (c) surface the failure explicitly in the report's tier section rather than only in the counts suffix. Add an AC + atomic test with a `tierCommands` stub whose command exits non-zero with no summary line, asserting the record keeps the output and the console line names the failed tier. OPEN QUESTION for the fix round — whether the exit code should also become non-zero: Rule 1's sibling degraded paths all exit 0 (spec ACs at lines 82, 87) and the bundle's failure-isolation clause says a failing member is recorded in the digest rather than raised, so a non-zero exit here could make the whole scheduled bundle read as failed. Decide against those two constraints; do not assume it.
opened: 2026-08-30T06:40:00Z
---

# B-017 — a failed tier run reads as a clean tier

## Evidence

Observed live in this project during the 2026-08-30 test-runner run. The report at
`.cortex/pulse/reports/test-failures.md` (generated `2026-08-30T05:21:37Z`) recorded:

```
## Tier: atomic
Command: `pnpm vitest run tests/atomic` — run failed (no parseable summary).
```

while the same invocation printed to the console:

```
cortex loop-test-runner: no failures to classify — report written.
```

and exited 0. A re-run of the same tier by hand
(`/bin/sh -c "pnpm vitest run tests/atomic"`) exited 0 with `Tests 1196 passed (1196)`,
and a subsequent `cortex loop-test-runner --collect` recorded `ok: true, passed: 1196`.
So the tier is healthy; the 05:21 run of it failed and the loop reported success.

## The chain that broke

1. `runShell` (`src/loops/test-runner.ts:322`) resolves `{ ok: !error }`. A non-zero
   exit, a `timeout` SIGKILL (`DEFAULT_TIMEOUT_MS = 300_000`), or a vitest
   collect/transform failure all land as `ok: false` with truncated or summary-less output.
2. `parseVitestFailures` finds no `FAIL`/`×` lines and no `^Tests …(N)$` line, so it
   returns `{ failures: [], passed: null, failed: null }`.
3. `collectIntake` pushes the tier record and iterates `parsed.failures` — empty — so
   **nothing enters `pending`**. `run.output` is never retained: `excerpt(run.output)`
   is attached only to a *pending failure* record (line 384), never to the
   `TierRunRecord`. The only diagnostic evidence is discarded.
4. Bare mode's `worklist.pending.length === 0` branch (line ~1158) writes the report,
   prints `no failures to classify`, and returns 0.

The report body is the one place the truth survives — `t.ok === false` renders
` — run failed (no parseable summary)` (line ~765). Nothing else in the pipeline
reacts to it: not the exit code, not the console line, not the scheduled-task digest,
which reads the console line and reports the cycle green.

## Why `incomplete-rule` and not `missing-criterion`

Rule 1 covers the empty-tier case explicitly ("An empty tier is a stated clean section,
not an error"). Rule 2 covers parsing failures *out of* runner output. Rule 9 requires
per-tier passed counts. **No rule states what a tier that failed to run at all is** —
the third outcome was never written down, so the implementation defaulted it into the
clean path. There is no correct-but-uncriterioned rule here; the rule itself is absent,
same shape as B-007.

## Reproduction

Run the loop with a tier command that errors and emits no vitest summary:

```
cortex loop-test-runner --tier atomic
```

with `tests/atomic` in a state where vitest fails to collect (e.g. a test file with an
unresolvable import), or with the tier run exceeding the 300s timeout. Expect: console
says `no failures to classify`, exit 0, worklist `pending: []`, and the report's tier
line says `run failed (no parseable summary)` with no captured output.

## Root cause of the 05:21 failure — not established

The 05:21 tier run's output was discarded by step 3 above, so *why* atomic failed that
once cannot be recovered. The leading hypothesis is the 300s `DEFAULT_TIMEOUT_MS` on a
cold vitest transform cache (warm, both tiers together finish in ~22s wall). This is
unconfirmed and is not what this entry claims; retaining the excerpt is precisely the
fix that would have settled it.

## Related

- Second-order: `--help` (and any unrecognised flag) is not matched by the option
  parser and falls through to **bare mode**, which is the code-writing, branch-and-PR
  delivering path. A typo runs the autonomous fix loop. Not filed here — different
  mechanism, same "unrecognised input takes the success path" family.
- `src/loops/test-runner.ts` is already named in B-007's `affects:` (line 82 uses a
  raw NUL byte as a key delimiter, which is what makes the file read as binary).
