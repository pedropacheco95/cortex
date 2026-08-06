# bug-triage

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-loop-bug-triage` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Daily bug-ledger triage. Use for the scheduled **daily** bundle's bug-triage
member, or when the user says "run the bug-triage loop", "triage the open bugs",
or "classify the bug ledger".

Runs `cortex loop-bug-triage --collect`, classifies each worklist bug in-session
with the `specflow-bugs` discipline, runs `cortex loop-bug-triage --report`, and
summarises `.cortex/pulse/reports/bug-triage.md`.

## Discipline

You are the judgment middle between two deterministic Core halves (spec
loops.bug-triage Rule 1). You already ARE a Claude session: **never spawn a
nested `claude` subprocess, and never run bare `cortex loop-bug-triage`**
(bare mode exists only for humans at a terminal; it would spawn one).

1. From the project root, run `cortex loop-bug-triage --collect`.
2. Read `.cortex/pulse/state/triage-worklist.json` — the open bugs partitioned into
   *unclassified* (any of `type`/`severity`/`proposed_fix` absent) and
   *classified* (all three present).
3. Classify EVERY worklist bug **in this session** against the seven-type
   taxonomy (missing-criterion, incomplete-rule, wrong-rule, missing-dev-spec,
   missing-business-spec, layer-drift, test-defect) using the installed
   `specflow-bugs` skill's diagnostic discipline: walk the spec-model
   diagnostic tree to the root-cause layer before naming a type. Classify the
   already-classified bugs too — your independent re-derivation is calibration
   signal both ways.
4. Write the results as a JSON array to a scratchpad file (your session
   scratchpad — never inside the project). Each result is exactly
   `{"bugId": "B-NNN", "type": "<one of the seven>",
   "severity": "critical|high|medium|low", "proposedFix": string,
   "reasoning": string}`.
5. Run `cortex loop-bug-triage --report <that scratchpad file>`. The
   deterministic report half applies results **fill-only** (spec Rule 3):
   absent `type`/`severity`/`proposed_fix` fields on open bugs are filled;
   present fields are NEVER overwritten — divergences go to the report with
   both readings and your reasoning. It writes `.cortex/pulse/reports/bug-triage.md`.
6. Read `.cortex/pulse/reports/bug-triage.md` and summarise to the user: fields
   filled, agreements, divergences, and aged open bugs.

**Never overwrite an existing classification.** The fill-only write to open
bug files is this loop's single sanctioned compass write (spec Rule 3).
Never mutate anything else outside `.cortex/pulse/`.
