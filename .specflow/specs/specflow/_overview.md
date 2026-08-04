# SpecFlow — Overview

## What this is

The spec-and-test lineage absorbed into Cortex: the conventions of the two spec trees, the four test layers, the seven-type bug taxonomy, and the Cortex-awareness updates to the eleven specflow-* skills.

## What it covers

**Specs written:**

- `specflow.cortex-awareness` — the three-tier awareness pass over all eleven specflow-* skills (deep: develop/tests/change-router; moderate: onboarding/ingest/new-project/spec-editor; light: viewer/lint/bugs incl. the §4.3 ledger correctness fix), shipped in the package so init installs the aware versions.
- `specflow.brainstorm-skill` — `specflow-brainstorm`: the front of the spine. Scope-check, one question at a time, 2–3 approaches with a recommendation, HARD-GATE against implementing before agreement — terminating in a **spec**, not a design document.
- `specflow.plan-skill` — `specflow-plan`: the planning half extracted from develop (explore, gap analysis, research, implementation plan, size check, `references/planning-protocol.md`), producing a durable plan artefact a fresh agent could execute blind.
- `specflow.develop-split` — `specflow-develop` slimmed to execution + verification, plus the five-round two-stage review ladder that ends in BLOCKED rather than shipping a known load-bearing defect.
- `specflow.review-pair` — `specflow-request-review` / `specflow-receive-review`: craft review anchored to the diff-vs-plan, non-blocking on function except for a compass-rule violation, and "technical rigor over performative agreement" on the receiving end (verify each suggestion before applying it).
- `specflow.bugs-root-cause-gate` — the Phase-1 root-cause investigation gate prepended to `specflow-bugs`: no bug type may be named until the failure has been read, reproduced, dated against recent changes, and localised by instrumenting component boundaries. The seven-type tree and ledger output are unchanged.
- `specflow.tests-red-green` — watch-it-fail-correctly and delete-premature-code in `specflow-tests`: a new test must be observed failing *for the right reason* before its implementation exists, and code written ahead of its test is deleted rather than adapted.

_Planned (not yet written):_

- The conventions of the two spec trees (`specs/` and `specs-business/`)
- The four test layers: atomic, spec, journey, and scenario, with the `covers:` coverage constraint
- The seven-type bug taxonomy
- The Cortex-awareness updates to the eleven specflow-* skills (reading anatomy, compass, and atlas before producing output)

## Why it's grouped this way

This domain owns spec-and-test discipline and its skills. The cortex-* persistence and loop skills live conceptually under `loops/`, `pulse/`, and `atlas/` — this domain holds only the absorbed SpecFlow lineage and the skills that produce and verify specs and tests. The bug *taxonomy* is defined here, but the live bug *ledger* lives in `compass/`.

The specflow-* skills are agentic and so sit apart from the deterministic `core-cli/`; their Cortex-awareness updates make them read the surrounding state before acting.

## Related groups

- Business outcomes for this domain: `../../specs-business/specflow/`
- The contract these conventions formalise: `../schema/`
- The live bug ledger using this taxonomy: `../compass/`
- Persistence/loop skills: `../loops/`, `../pulse/`, `../atlas/`
