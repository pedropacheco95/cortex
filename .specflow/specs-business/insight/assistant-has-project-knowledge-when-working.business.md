---
id: insight.assistant-has-project-knowledge-when-working
status: implemented
implemented_by:
  - ../../specs/insight/module-contract.spec.md
  - ../../specs/insight/refresh-loop.spec.md
---

# The assistant has the project knowledge it needs, right when it's working

## Outcome

When this works, the assistant stops re-investigating the same project from scratch every session. The knowledge it needs to work here — how setup actually goes, the testing gotchas, the deploy steps, the conventions in formation, and an inferred map of how the pieces relate to each other — is there to be asked for through one command, instead of re-derived by reading half the codebase again. And because this layer never waits on a review gate, what a session learned yesterday is answerable today: it is useful immediately, offered plainly as unreviewed, and kept current on its own cadence.

## Who this is for

The AI assistant working a task on a Cortex-managed project — and, through it, the developer, who stops paying for the same investigation twice and gets faster, better-grounded work because the assistant can orient itself before it starts.

## User Journey

1. The assistant picks up a task and, before grepping the codebase, asks the knowledge layer about the concepts involved — "how does this area hang together", "how do we do testing here".
2. It gets back what past work observed and what the map infers: the relevant notes, the related pieces, the domain cluster the task sits in — each answer honest about being unreviewed.
3. It works with that context instead of rebuilding it, tracing anything load-bearing back to its source before relying on it.
4. Meanwhile, on their own cadences, two background passes keep the layer fresh — one refreshes the inferred map as the code changes, one captures what new sessions observed — so the next task starts warmer than this one did.

## Business Rules

1. This knowledge is offered as unreviewed — it is useful immediately and never presented as an enforced rule or a gated fact.
2. It is never used to block or enforce a change; only the reviewed, curated knowledge carries that authority.
3. Asking is a pull, not a push — the layer answers when the assistant asks, and is never injected as ambient noise at session start.
4. The map stays as fresh as its cadence: an inferred connection is regenerated as the code moves, and an observed note lands the day it was seen, not weeks later.
5. An honest miss — nothing captured about a concept — is a miss, not a wrong guess; it is a signal to capture that knowledge next, never a reason to fabricate an answer.

## Success Metrics

- The assistant answers "how does X hang together here" from one query, in seconds, without re-reading the codebase.
- A setup quirk observed in one session is queryable in the next, without a review step in between.
- A collaborator cloning the project inherits the same knowledge — it travels with the project, not per-machine.

## Out of Scope

- Deciding what to *capture* or how to *infer* it — that judgment belongs to the two background passes built on top of this layer.
- Reviewing, enforcing, or trusting this knowledge as durable fact — it is deliberately the fast, fallible layer; the reviewed layers are its complement.
- A conversational or semantic search box — the query surface is a small, deterministic command set, not a ranking model.

## Notes

- The value is complementary by construction: the reviewed layers are right but slow, this layer is fast but fallible, and each covers the other's failure mode. Content that stabilizes here can later graduate into the reviewed layers — that path is a separate outcome (see the corrections-and-memory outcome in this folder).
- **v3 note (spec promotion, 2026-07-08):** the codebase-understanding half of this outcome is superseded by `insight.assistant-understands-codebase` — the v3 insight rebuild replaced the concept-map-over-curated-artefacts layer this outcome described with per-file understanding of the source code itself. The v2 query CLI dev spec was replaced in place by the v3 `insight.cli` (which now implements the successor outcome), so it no longer appears in `implemented_by:` here; the remaining implementers (`insight.module-contract`, `insight.refresh-loop`) are SUPERSEDED-bannered v2 lineage, retained for history.
