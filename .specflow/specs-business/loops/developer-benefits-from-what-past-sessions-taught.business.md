---
id: loops.developer-benefits-from-what-past-sessions-taught
status: implemented
implemented_by:
  - ../../specs/loops/session-reading.spec.md
  - ../../specs/loops/skill-suggest.spec.md
  - ../../specs/pulse/distil.spec.md
---

# A developer benefits from what past sessions already taught

## Outcome

When this works, the things said and learned in past working sessions stop evaporating when the window closes. The system can look back over the project's session history — safely, locally, and only for this project — and notice what repeats: corrections given twice, preferences stated three times, workflows re-derived weekly. Those observations feed the proposal pipeline, so the developer sees "you've said this three times — want it remembered?" instead of saying it a fourth time.

## Who this is for

Developers who work with the assistant regularly on the same project — the more sessions, the more there is to learn back from them.

## User Journey

1. The developer works normally; sessions accumulate as a side effect.
2. On its weekly cadence, the maintenance layer reads back over recent sessions for this project only.
3. Patterns that repeat show up as proposals, each citing the sessions it was seen in.
4. The developer accepts or declines through the usual review gate; nothing is learned into the project without their say.

## Business Rules

1. Only this project's sessions are ever read — never another project's.
2. Reading history changes nothing: the look-back is strictly read-only.
3. Session content never leaves the machine and never lands anywhere except the proposal queue the developer reviews.
4. If history is missing or unreadable, everything else still works — the look-back finds nothing rather than failing.

## Success Metrics

- A preference stated in three separate sessions surfaces as a proposal, citing all three.
- Zero cross-project leakage — a proposal never cites another project's session.
- Sessions with unreadable portions still contribute their readable parts.

## Out of Scope

- Deciding *what counts* as a pattern worth proposing — that judgment belongs to the weekly extraction run built on top of this.
- Reading history from other tools or machines.
- Any interactive "search my sessions" feature — this serves the maintenance layer, not a query box.

## Notes

- This is deliberately infrastructure-shaped: the user-visible value arrives through the proposal queue, but the reading layer is what makes it possible for every learning loop at once.
