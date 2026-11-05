---
id: specflow.developer-knows-the-specs-stay-sound
status: implementing
implemented_by:
  - ../../specs/loops/lint-scheduled.spec.md
  - ../../specs/loops/verify-scheduled.spec.md
  - ../../specs/specflow/reorg.spec.md
  - ../../specs/specflow/check.spec.md
  - ../../specs/specflow/git-hooks.spec.md
  - ../../specs/specflow/index.spec.md
  - ../../specs/specflow/port.spec.md
  - ../../specs/specflow/lint.spec.md
  - ../../specs/specflow/viewer.spec.md
  - ../../specs/specflow/onboard-skill.spec.md
  - ../../specs/loops/quality-task.spec.md
---

# The developer knows the specs and their tests stay sound — without checking

## Outcome

When this works, the two questions that quietly rot a specification-driven project — "is the spec tree still structurally sound?" and "does every promise still have the tests it's owed?" — get answered daily, in writing, without anyone asking. Structural breaks and coverage gaps surface as dated reports the morning after they appear, not months later during an audit.

## Who this is for

Developers running spec-first projects under Cortex, where the spec tree is the contract and silent decay of that contract is the failure mode.

## User Journey

1. Every day, one pass checks the spec tree's structure and one checks test coverage against what the specs promise.
2. Each writes its dated report: clean is stated plainly; problems name the exact spec, the exact gap, and the next step.
3. The developer sees findings surface through the usual health line at session start and reads the details when they choose.
4. At each commit, a check compares what changed in the code, the tests and the specs. A commit that would let them drift apart is refused, with a message saying what to do next.
5. The developer can see, for every promise, which behaviours have a test and which are still unproven claims, in one generated index or a page in the browser.
6. An existing project moves its specs into this system without rewriting them, and is told exactly which ones cannot yet be relied on.

## Business Rules

1. The scheduled passes observe and report — neither ever edits a spec or a test. The commit check is the one exception to observing: it may refuse a commit, but it never edits anything either.
2. A coverage gap that exists by explicit deferral is reported as deferred, not hidden and not treated as a failure.
3. Every run leaves a fresh, dated report, clean or not.
4. A behaviour with no test is shown as unproven, never as covered.
5. A check that could not run says so; it never reads as a pass.

## Success Metrics

- A structural break in the spec tree is reported within a day.
- Every promise-without-tests is visible in one file, with deliberate deferrals distinguished from genuine gaps.
- Zero spec or test mutations attributable to either pass.
- Every refusal is followed by a commit that fixes the problem, not by a bypass; refusals are counted by rule, and measured rules are read apart from new ones.

## Out of Scope

- Fixing a failing test. The weekly quality task runs the suite and reports failures on a 4.0 store; the daily passes on a 3.x store check existence and structure only.
- Fixing what they find.

## Notes

- On a 4.0 store the passes are weekly, in `loops.quality-task`, and a structural break can also be caught at commit by `cortex check`. "Daily" above and in the metrics describes a 3.x store. The same task also reviews a rotation of specs against the code and looks for working behaviour no spec describes; both only propose.

- These are the scheduled versions of checks that already exist interactively; the outcome here is the cadence and the paper trail, not new judgment.
