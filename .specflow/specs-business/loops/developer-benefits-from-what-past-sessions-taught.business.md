---
id: loops.developer-benefits-from-what-past-sessions-taught
status: implementing
implemented_by:
  - ../../specs/loops/session-reading.spec.md
  - ../../specs/loops/skill-suggest.spec.md
  - ../../specs/pulse/distil.spec.md
  - ../../specs/loops/learn-task.spec.md
---

# A developer benefits from what past sessions already taught

## Outcome

When this works, the things said and learned in past working sessions stop evaporating when the window closes. The system can look back over the project's session history — safely, locally, and only for this project — and notice what repeats: corrections given twice, preferences stated three times, workflows re-derived weekly. Those observations feed the proposal pipeline, so the developer sees "you've said this three times — want it remembered?" instead of saying it a fourth time.

## Who this is for

Developers who work with the assistant regularly on the same project — the more sessions, the more there is to learn back from them.

## User Journey

1. The developer works normally; sessions accumulate as a side effect.
2. Once a day, the learn task reads back over finished sessions for this project only.
3. What the developer said goes into the project's memory, each item citing its session; a told rule carries the developer's own words. Rules and best practices the sessions show without anyone stating them go in too, marked as inferred.
4. Anything that would change a spec waits as a proposal for the developer to approve. The developer can correct any filed item, and the digest of each session shows what was filed, what was already known, and what was skipped.

## Business Rules

1. Only this project's sessions are ever read — never another project's.
2. Reading history changes nothing: the look-back is strictly read-only.
3. Session content never leaves the machine. What reaches the project's memory is cited and has secrets removed.
4. If history is missing or unreadable, everything else still works — the look-back finds nothing rather than failing.

## Success Metrics

- A rule stated once in a session is in the project's rules the next day, with the quote and its session.
- Zero cross-project leakage: nothing filed or proposed cites another project's session.
- Sessions with unreadable portions still contribute their readable parts.

## Out of Scope

- Deciding *what counts* as a pattern worth proposing — that judgment belongs to the weekly extraction run built on top of this.
- Reading history from other tools or machines.
- Any interactive "search my sessions" feature — this serves the maintenance layer, not a query box.

## Notes

- Pedro's ruling (P11): a deep read of a conversation can yield rules and best practices, so learning is not limited to quoted words. Specs stay proposals.

- This is deliberately infrastructure-shaped: the user-visible value arrives through the proposal queue, but the reading layer is what makes it possible for every learning loop at once.
