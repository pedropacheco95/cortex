---
id: pulse.developer-approves-what-the-system-proposes
status: implemented
implemented_by:
  - ../../specs/pulse/review-cli.spec.md
---

# A developer approves or declines what the system proposes — in seconds

## Outcome

When this works, the self-maintenance layer's proposals stop being a file the developer has to remember to read and hand-apply. Pending suggestions are listed in one command; accepting one applies it exactly as proposed, in the exact place proposed; declining one makes it stay declined — the same idea doesn't come back next week wearing a new number. The developer stays the sole gatekeeper of the project's curated knowledge, at the cost of seconds per decision.

## Who this is for

Developers on Cortex-managed projects reviewing what the automated maintenance runs have proposed — typically a handful of items after a week of sessions.

## User Journey

1. The developer asks what's pending; each proposal appears with its evidence and exactly what would change where.
2. They accept one — the proposed text lands verbatim in the proposed place, nothing else moves.
3. They decline another — it's recorded as declined and won't be re-proposed for a good while.
4. A proposal declined long ago may eventually return if the evidence keeps accumulating — declining is a snooze with a long timer, not a permanent ban.
5. Asking again shows only what still needs a decision.

## Business Rules

1. Nothing proposed becomes curated knowledge without an explicit accept.
2. Accepting applies the proposal exactly as shown — no reinterpretation between review and application.
3. Proposals can only ever change the curated-knowledge area; a proposal aimed anywhere else is refused outright.
4. Declined proposals stay quiet for the configured window (about three months by default).
5. Deciding twice is safe — repeating an accept or decline changes nothing further.

## Success Metrics

- Reviewing a week's proposals takes under a minute.
- Zero cases of an applied change differing from what was shown at review.
- Zero re-proposals inside the decline window.

## Out of Scope

- Generating the proposals — that is the self-maintenance outcome (the weekly pattern-extraction run).
- Editing a proposal before accepting — v1 is accept-as-is or decline; refinement means declining and writing it yourself.

## Notes

- The one-way flow (system proposes → human disposes) is the load-bearing trust property of the whole self-maintenance layer; this is the gate where it's enforced.
