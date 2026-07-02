---
id: loops.developer-trusts-changes-the-system-writes
status: implemented
implemented_by:
  - ../../specs/loops/writer-verifier.spec.md
---

# A developer can trust a change the system wrote without reading every line

## Outcome

When this works, automated work that touches actual code stops being an act of faith. Any change the system writes is produced by one worker and judged by an independent second opinion that never saw the worker's thinking — only the requirement, the change itself, and whether the checks pass. Changes arrive as proposals with a verdict and the judge's reasoning attached; nothing lands in the developer's working copy by itself. The developer reads a verdict, not a diff, and digs into the diff only when they choose to.

## Who this is for

Developers running automated maintenance that writes code — starting with the automatic test-fixer, and extending to any future automation that proposes changes rather than reports.

## User Journey

1. An automated run needs to change code — say, fixing a failing test.
2. A worker drafts the change in an isolated copy of the project; the developer's own working copy is never touched.
3. An independent judge — deliberately kept blind to the worker's reasoning — reads the requirement, the change, and the check results, and rules pass or fail with its reasoning written down.
4. On a fail, the worker tries again against the failing checks, up to a set number of attempts; the judge stays blind each time.
5. The developer receives the outcome: a verified change ready to apply, or an honest "couldn't fix it" with every verdict attached.

## Business Rules

1. The worker and the judge are genuinely independent — neither ever sees the other's reasoning. The judge's blindness is what makes its verdict worth something.
2. Nothing is ever written to the developer's working copy — verified changes arrive as proposals to apply, not applied facts.
3. Every attempt is bounded: a set number of tries, then an honest failure report. No unbounded retry loops burning cost.
4. The judge's ruling and reasoning are always preserved for the developer, pass or fail.
5. If the assistant isn't available to do the work, that is reported as "unavailable" — distinct from "tried and failed".

## Success Metrics

- Zero cases of an automated change landing in a working copy without an explicit apply.
- Every delivered change carries an independent pass verdict; every failure carries the full verdict history.
- Retry cost is capped and predictable — never more attempts than configured.

## Out of Scope

- What the worker is asked to fix and where verified changes go afterwards (branch, PR, apply) — those belong to the consuming automation, starting with the test-runner.
- Judging without checks to run — the judge always has the requirement and check results in hand.

## Notes

- This is the safety mechanism that design principle "propose, don't mutate" requires before any automation may write code. It ships before the automations that need it.
