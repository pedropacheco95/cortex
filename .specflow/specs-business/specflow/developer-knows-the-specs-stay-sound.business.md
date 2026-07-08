---
id: specflow.developer-knows-the-specs-stay-sound
status: implemented
implemented_by:
  - ../../specs/loops/lint-scheduled.spec.md
  - ../../specs/loops/verify-scheduled.spec.md
  - ../../specs/specflow/reorg.spec.md
---

# The developer knows the specs and their tests stay sound — without checking

## Outcome

When this works, the two questions that quietly rot a specification-driven project — "is the spec tree still structurally sound?" and "does every promise still have the tests it's owed?" — get answered daily, in writing, without anyone asking. Structural breaks and coverage gaps surface as dated reports the morning after they appear, not months later during an audit.

## Who This Is For

Developers running spec-first projects under Cortex, where the spec tree is the contract and silent decay of that contract is the failure mode.

## User Journey

1. Every day, one pass checks the spec tree's structure and one checks test coverage against what the specs promise.
2. Each writes its dated report: clean is stated plainly; problems name the exact spec, the exact gap, and the next step.
3. The developer sees findings surface through the usual health line at session start and reads the details when they choose.

## Business Rules

1. Both passes observe and report — neither ever edits a spec or a test.
2. A coverage gap that exists by explicit deferral is reported as deferred, not hidden and not treated as a failure.
3. Every run leaves a fresh, dated report, clean or not.

## Success Metrics

- A structural break in the spec tree is reported within a day.
- Every promise-without-tests is visible in one file, with deliberate deferrals distinguished from genuine gaps.
- Zero spec or test mutations attributable to either pass.

## Out of Scope

- Running the tests — that is the test-runner's outcome; these passes check existence and structure.
- Fixing what they find.

## Notes

- These are the scheduled versions of checks that already exist interactively; the outcome here is the cadence and the paper trail, not new judgment.
