# test-runner

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-loop-test-runner` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Tiered test-runner loop — **the only code-writing loop**. Use for the scheduled
**test-runner** bundle, or when the user says "run the test-runner loop", "run
the test cascade", or "triage the failing tests".

Runs `cortex loop-test-runner --collect`, classifies each pending failure
in-session with the `specflow-bugs` discipline, runs `cortex loop-test-runner
--fix-stage <results.json>`, and summarises
`.cortex/pulse/reports/test-failures.md`.

## Discipline

You are the classification judgment between two deterministic Core halves
(spec loops.test-runner Rules 1 & 4). You already ARE a Claude session:
**never spawn a nested `claude` subprocess, and never run bare
`cortex loop-test-runner`** (bare mode exists only for humans at a terminal;
it would spawn one). The fix attempts themselves run inside the CLI's
writer/verifier harness — you never edit project code directly.

1. From the project root, run `cortex loop-test-runner --collect`
   (add `--tier atomic,spec,journey,scenario` or `--trigger manual` when the
   request calls for it; the default is the daily `atomic,spec` pair).
2. Read `.cortex/pulse/state/test-runner-worklist.json`. Failures already
   suppressed by an open test-runner-filed ledger entry appear under
   `suppressed` — leave them alone; resolving the ledger entry is what
   re-arms the test. Only the `pending` array needs judgment.
3. Classify EVERY pending failure **in this session** against the seven-type
   taxonomy (missing-criterion, incomplete-rule, wrong-rule, missing-dev-spec,
   missing-business-spec, layer-drift, test-defect) using the installed
   `specflow-bugs` skill's diagnostic discipline: walk the spec-model
   diagnostic tree to the root-cause layer before naming a type. When a
   failure genuinely fits none of the seven (e.g. flaky infrastructure), use
   the literal type `not-one-of-the-seven` with your reasoning — never
   force-fit a taxonomy gap; it will be reported and nothing else happens.
4. Write the results as a JSON array to a scratchpad file (your session
   scratchpad — never inside the project). Each result is exactly
   `{"testPath": "tests/...", "testName": string, "type": "<one of the seven
   or not-one-of-the-seven>", "severity": "critical|high|medium|low",
   "reasoning": string}`.
5. Run `cortex loop-test-runner --fix-stage <that scratchpad file>`. The
   deterministic half drives the writer/verifier harness per classified
   failure: a verified pass becomes branch `cortex/test-fix-<slug>` plus a
   five-field PR (spec id, criterion, writer reasoning, verifier verdict,
   trigger context); budget exhaustion becomes an open `B-NNN` ledger case
   file that suppresses retries — no push, no PR. It always writes
   `.cortex/pulse/reports/test-failures.md`.
6. Read `.cortex/pulse/reports/test-failures.md` and summarise to the user per tier:
   passed counts, fixed (branch/PR refs), case-filed, suppressed, and
   unclassifiable-reported failures.

**The working tree is inviolate** (spec Rule 8): fixes live on
`cortex/test-fix-*` branches built in fresh worktrees; the loop's only other
writes are `.cortex/pulse/reports/test-failures.md`, the worklist state file
(`.cortex/pulse/state/test-runner-worklist.json`), and NEW
`.cortex/compass/bugs/` case files. Never edit an existing ledger entry.
