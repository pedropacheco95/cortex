---
id: anatomy.assistant-refines-the-map-while-working
status: implemented
implemented_by:
  - ../../specs/hooks/pre-read-writeback.spec.md
  - ../../specs/hooks/post-read.spec.md
---

# The map improves during normal work, not just during scheduled maintenance

> **SUPERSEDED at v3 (build-order-v3 step 7; design §5.10).** The outcome
> survives — the map sharpens during ordinary reading — re-homed to insight:
> PreRead now injects the insight entry's Purpose line and PostRead captures
> corrections into the entry with read-time-tagged `claude-sessions/*`
> provenance (schema §5). The hooks specs it points at describe the mechanism.
> Retained for lineage.

## Outcome

When this works, the moment of highest understanding — the assistant actually reading a file — stops being wasted. Opening a file shows the assistant what the map currently believes about it; if that belief turns out wrong or stale once the file is read, the correction is offered in passing and quietly captured. The map gets sharper as a side effect of ordinary work, with corrections made at the moment of understanding outranking descriptions generated in bulk.

## Who this is for

Developers whose assistant works in the codebase daily — the more reading happens, the more the map refines itself, with zero scheduled runs involved.

## User Journey

1. The assistant opens a file; one line tells it what the map believes the file is for, and invites a correction only if the belief is wrong.
2. Most reads produce no correction — the belief was right, and silence costs nothing.
3. When the belief was wrong, the assistant says so in passing, in one line, as it works.
4. The correction is captured quietly and marked as witnessed-while-reading — the most trusted kind of description the map holds.
5. Bulk maintenance never overwrites a witnessed correction unless the file itself has changed since.

## Business Rules

1. Corrections are invited only where they could help — a description already witnessed during reading isn't re-litigated on every subsequent read.
2. Capture is silent and never interrupts the work.
3. Witnessed corrections outrank generated descriptions; the ordering is only reset when the file's content actually changes.
4. The whole mechanism is one switch — developers who prefer to skip the token cost turn the pair off together.

## Success Metrics

- A wrong description encountered during real work is corrected in that same session, without a maintenance run.
- Reads where the description is right add near-zero overhead and no noise.
- No witnessed correction is ever silently replaced by a bulk-generated one.

## Out of Scope

- Bulk description generation and post-commit freshness — the other three tiers own those.
- Corrections to anything beyond the file's one-line description.

## Notes

- This is the fourth tier of the map's freshness mechanism: refine-during-use, alongside mark-dirty-fast, bulk-fill-on-schedule, and inline-on-init.
- **Read deferral (added 2026-09-16; `pre-read-writeback.spec.md` Rule 7) is not part of this promise.** That spec also carries a default-off, measured gate that holds a source file's first read for one turn and offers the map's summary in its place; it serves the *reaching-for-Cortex* outcome (`../scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md`, business rule 6 and the deferral proceed-rate metric), which owns the exception and its measurement. Business rule 2 here ("capture is silent and never interrupts the work") is about the capture half and holds unchanged: nothing in the correction loop is held.
- **The belief now says how old it is (added 2026-09-17; `pre-read-writeback.spec.md` Rule 8).** When the file has changed since the map last described it, the one line in journey step 1 ends with a mark saying so and when the description was built. It is the same line, within the same budget — the invitation to correct is unchanged, and a mark on a description that turns out right costs the assistant nothing but a glance.
