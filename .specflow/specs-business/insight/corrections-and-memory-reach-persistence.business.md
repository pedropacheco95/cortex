---
id: insight.corrections-and-memory-reach-persistence
status: implemented
implemented_by:
  - ../../specs/insight/gaps-loop.spec.md
  - ../../specs/insight/promotion-mechanism.spec.md
---

# Corrections and "remember this" reach persistence — on the right terms

## Outcome

When this works, the two things a developer says most that used to evaporate — "that's wrong, that's not how we do it here" and "remember this for next time" — actually reach durable project knowledge, and each reaches it on the right terms. A correction to unreviewed knowledge is fixed in place, immediately, with an audit trail of what it used to say and why it changed. A correction to reviewed knowledge, or an explicit "make this a rule", never edits the reviewed knowledge silently — it becomes a proposal the developer approves. And a note that has quietly proven itself — survived a while, been seen more than once, never contradicted — can graduate from the unreviewed layer into the curated one, but only when the developer says so.

## Who this is for

Developers who correct and instruct the assistant in the normal course of work, and want those corrections to stick without either being lost or silently overwriting knowledge they meant to keep reviewing.

## User Journey

1. The developer corrects the assistant, or explains something, or says "remember this" — in the ordinary flow of a session.
2. The next day, a background pass reads back the session and sorts what it found: a correction to an unreviewed note is rewritten in place, with the old wording and the reason logged; a correction to reviewed knowledge, or an explicit memory request, is turned into a proposal.
3. The developer reviews the proposals through the usual gate — approving, editing where it should land, or declining.
4. Separately, when an unreviewed note has stabilized and proven load-bearing, it surfaces as a proposal to promote it into the reviewed layer; on approval it graduates, carrying a reference back to where it came from, and the original is marked as promoted rather than quietly deleted.

## Business Rules

1. Reviewed knowledge — rules, decisions, the project's hard constraints — is never edited without the developer's approval through the gate.
2. Unreviewed knowledge is corrected directly and immediately, because keeping a known-wrong note queryable while waiting for a review nobody asked for would be the worst of both worlds — but every such correction leaves an audit trail.
3. An explicit "remember this" is always confirmed, including *where* it should land — even when the assistant's best guess is the unreviewed layer, the developer can redirect it.
4. Nothing is ever promoted automatically, however stable it looks; promotion is always the developer's decision.
5. A promotion is auditable, not destructive: the graduated content records where it came from, and the original is marked, not silently erased.
6. Two passes read the same sessions without duplicating work — an explicit request and a repeated pattern are different things, routed to different owners.

## Success Metrics

- A correction to an unreviewed note is fixed the next day, with the prior wording and reason preserved in a log.
- A correction to a reviewed rule reaches the developer as a proposal — and never as a silent edit.
- A "remember this" lands where the developer confirmed, with their own words as the proposed content.
- A note that stabilized graduates into the reviewed layer on approval, with a traceable link back to its origin.

## Out of Scope

- The mechanics of *how* the review gate applies an approval — that is the review gate's own outcome; this outcome is about what reaches it and on what terms.
- Deleting the promoted original — that stays a deliberate human act, not an automatic one.
- Deciding *what counts* as a stabilized or load-bearing note beyond the agreed, mechanical threshold.

## Notes

- The asymmetry is the design: observations of the assistant's own unreviewed layer are handled autonomously; anything that touches reviewed knowledge, or that the user explicitly named, goes through the gate. One review queue, one rejection memory — no second gate.
