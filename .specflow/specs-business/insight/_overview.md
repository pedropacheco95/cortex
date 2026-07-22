# Insight — Overview

## What this is

The outcomes of the ungated understanding layer: the assistant behaves like it already knows the codebase — what each file is for, what matters inside it, and how the pieces connect — because a persistent, queryable, inferred understanding builds up once and keeps itself current, instead of being re-derived from scratch every session. Alongside it, the assistant also gets better at working *in this project specifically* — audience, scale, working style, the things a developer would otherwise re-explain every session — because a daily pass commits what conversations teach automatically, with only genuinely binding knowledge held for review. And the path by which corrections and "remember this" requests reach durable project memory on the right terms.

## What it covers

**Outcomes written:**

- **The assistant behaves like it already knows this codebase** — point Cortex at a project and a per-file, per-concept understanding of the source code builds up, survives across sessions, stays current as the code moves, and is honest about what it doesn't richly know. This is the v3 outcome; it supersedes the codebase-understanding half of the earlier project-knowledge outcome below.

- **The assistant gets better at working here, because it learns from every session** — the re-specified sessions-teach-us half of the earlier project-knowledge outcome: what a session teaches — project context, working knowledge, corrections — commits automatically and ungated into insight, with only the binding minority (a convention, a decision) pausing for review. Automatic learning is now `insight.session-observe`'s primary promise.

- **The assistant has the project knowledge it needs, right when it's working** — the v2-era outcome: one query surface for setup quirks, conventions, and an inferred concept map. Its codebase-understanding half is superseded by the first outcome above; retained for the history of what shipped.

- **Corrections and memory requests reach persistence cleanly** — when the user corrects the assistant or says "remember this", that reaches durable knowledge on the right terms: ungated notes updated in place with an audit trail, gated knowledge changed only through the review gate, and stabilized notes graduating into the curated layers on the user's say-so.

## Why it's grouped this way

This group exists because the review gate that makes curated knowledge trustworthy also makes it slow, and the largest body of knowledge a project has — what its own source code means — was never going to be hand-curated at all. Insight holds the inferred understanding as a complementary, ungated layer: fast and immediately useful where the curated layers are right but slow, honest about being unreviewed, and disciplined about the boundary — nothing here overrules a reviewed rule or spec, and nothing crosses into the curated layers except through the human review gate.

What deliberately does not belong here is enforcement or review authority: nothing in insight is ever treated as gated. That boundary is the whole point of keeping the two layers distinct.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/insight/`
- The review gate corrections and promotions flow through: `../pulse/`
- The curated layers insight feeds and complements: `../compass/`, and the atlas via `../../specs/atlas/`
- The traceability discipline session-borne enrichment carries: `../provenance/`
- The sessions the observation loop reads back: `../loops/`
