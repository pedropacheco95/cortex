---
id: loops.developer-gets-test-failures-fixed-or-explained
status: implemented
implemented_by:
  - ../../specs/loops/test-runner.spec.md
---

# The developer wakes to fixed tests or precise explanations — never to silence

## Outcome

When this works, a failing test stops being a chore that waits for attention. The scheduled run finds the failure, works out what kind of break it is, and either fixes it — independently double-checked, delivered as a reviewable proposal with its full reasoning attached — or explains exactly why it couldn't. Nothing unverified ever lands anywhere; nothing unfixable gets retried into a wedged loop; nothing that isn't genuinely a project problem gets filed as one.

## Who this is for

Developers whose projects run their tests on a schedule and who want mornings to start with "review this fix" or "here's what broke and why", not with a red suite and no context.

## User Journey

1. The scheduled run executes the fast test tiers; a failure appears.
2. The failure is classified against the shared seven-kinds framework; something that doesn't fit — a flaky run, an infrastructure hiccup — is reported plainly and left alone.
3. For a classifiable break, one worker drafts a fix in isolation and an independent judge verifies it; on a pass, a review-ready proposal arrives carrying the failing test's story: which promise it protects, why the fix is right, and who says so.
4. When the attempts run out without a verified fix, the developer gets the full case file instead — the last attempt, the judge's objection, and what triggered the run — filed in the problem ledger.
5. That failure is left alone on subsequent runs until its ledger entry is dealt with — the loop never wedges itself on an unfixable test.

## Business Rules

1. Nothing unverified is ever proposed, and nothing at all lands without the developer's review.
2. Every proposal carries enough context to distinguish a good fix from a plausible-looking one.
3. Exhausted attempts produce a case file, not a retry storm; the failure stays parked until its ledger entry resolves.
4. Failures that don't fit the classification framework are reported, not force-fitted — no garbage entries in the ledger.

## Success Metrics

- A classifiable failing test becomes either a verified fix proposal or a complete case file within one scheduled run.
- Zero repeat fix-attempts on a failure with an open case file.
- Zero ledger entries for infrastructure or flaky-run noise.

## Out of Scope

- Deciding the test cadence — scheduling belongs to the task definitions.
- Fixing the unfixable — the case file hands those to the developer.

## Notes

- This is the only automation that touches code, and it inherits every safety property of the writer/verifier harness it runs on.
