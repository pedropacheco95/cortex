# Insight — Overview

## What this is

The outcomes of the ungated knowledge layer: the project knowledge Claude needs while it works — setup, conventions, testing, deploy, and an inferred map of how everything relates — kept queryable through one command instead of re-investigated every session, and the path by which corrections and "remember this" requests reach durable project memory.

## What it covers

**Outcomes written:**

- **The assistant has the project knowledge it needs, right when it's working** — one query surface returns the setup quirks, conventions, and concept map a session would otherwise re-derive; it stays useful immediately because it never waits on a review gate.

- **Corrections and memory requests reach persistence cleanly** — when the user corrects the assistant or says "remember this", that reaches durable knowledge on the right terms: ungated notes updated in place with an audit trail, gated knowledge changed only through the review gate, and stabilized notes graduating into the curated layers on the user's say-so.

## Why it's grouped this way

This group exists because the review gate that makes the curated knowledge trustworthy also makes it slow, and three kinds of knowledge had nowhere to live in the meantime: what a reader would *infer* about how the project hangs together, what sessions *observe* but never write down, and knowledge *in transit* toward the gate. Insight holds all three as a complementary, ungated layer — fast but fallible where the curated layers are right but slow — and owns the discipline that keeps a fast layer honest: traceability instead of a gate, and a one-way promotion path when ungated content earns its way in.

What deliberately does not belong here is enforcement or review authority: nothing in insight is ever treated as gated, and nothing crosses into the curated layers except through the human review gate. That boundary is the whole point of keeping the two layers distinct.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/insight/`
- The review gate corrections and promotions flow through: `../pulse/`
- The curated layers insight feeds and complements: `../cerebrum/`, and the atlas via `../../specs/atlas/`
- The inferred map's viewer overlay: `../constellation/`
- The sessions the observation loop reads back: `../loops/`
