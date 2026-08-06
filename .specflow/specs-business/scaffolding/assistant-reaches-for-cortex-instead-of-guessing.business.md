---
id: scaffolding.assistant-reaches-for-cortex-instead-of-guessing
status: draft
implemented_by:
  - ../../specs/scaffolding/coverage-map.spec.md
  - ../../specs/scaffolding/rationalization-table.spec.md
  - ../../specs/pulse/usage.spec.md
  - ../../specs/scaffolding/skill-listing-budget.spec.md
---

# The assistant reaches for Cortex instead of guessing

## Outcome

When this works, the assistant stops asking the developer questions the project has already
answered, and stops reading its way through unrelated source files to rediscover things the
project already knows. It knows what Cortex holds — not that Cortex exists, which it already
knew and ignored, but *what subjects it covers* — so consulting it stops being a gamble
against an unknown hit rate and becomes the obvious first move. The developer stops saying
"check Cortex."

## Who This Is For

The developer working with an assistant on a Cortex-managed project, who currently pays twice:
once for the knowledge to be captured, and again in every session where it is not used. And
the assistant itself, which has no way today to tell whether asking is worth the round trip.

## User Journey

1. A session begins. The assistant learns, in one place and without asking, which subjects the
   project holds knowledge about — the rules in force, what has been decided, the terms this
   project uses in its own way, the operational details, and the concepts its code is organised
   around.
2. Working a task, it hits a question the code cannot answer — why something is the way it is,
   what was decided, what the gotcha is, which tool or account this project uses.
3. It recognises the question as one the project has covered, because it was told the coverage
   at the start, and goes straight to the one small file that holds it.
4. It answers from the project's own knowledge instead of asking the developer or reading
   unrelated files to infer it.
5. The developer can see, without instrumenting anything, whether this is actually happening.

## Business Rules

1. Knowing what Cortex covers is delivered without being asked for. Everything *below* the
   coverage level stays pull — the assistant asks for the content when it wants it.
2. What is delivered is coverage, not content: the subjects the project has knowledge about,
   never the knowledge itself. A table of contents, not the book.
3. Guidance about consulting Cortex must anticipate and answer the specific reasons for
   skipping it, not merely instruct that it be consulted. An instruction that is ignored is
   worse than nothing, because it teaches that this class of instruction is ignorable.
4. Every claim made to the assistant about Cortex must be true at the moment it is made.
   Guidance that promises more than the system delivers costs more trust than it buys.
5. Whether this outcome is being met is measured from evidence the project already produces,
   never by adding instrumentation that costs something at runtime.
6. Nothing here blocks, gates, or slows the assistant's work. This outcome is delivered by
   giving it better information, never by putting an obstacle in front of the alternatives.

## Success Metrics

- The assistant answers project questions — conventions, decisions, environment, gotchas —
  without asking the developer, in cases where the answer exists in the project's knowledge.
- Consulting the project's knowledge is measurably more frequent after this ships than before;
  the before-figure is recorded, not estimated.
- The developer stops needing to say "check Cortex."
- The cost of knowing what Cortex covers stays smaller than the cost of one mistaken file read.

## Out of Scope

- **The content of the knowledge, and its quality.** This outcome is about the knowledge being
  reached; whether it is right, current, or well-written belongs to the capture and refresh
  outcomes.
- **A conversational question-answering surface.** Deliberately deferred until there is
  evidence that knowing the coverage is not enough on its own.
- **Any mechanism that predicts, per moment, which knowledge is relevant.** Relevance-guessing
  costs something every turn and is wrong invisibly; this outcome delivers stable coverage once
  and lets the assistant do the matching.

## Notes

- This outcome is the one the `scaffolding/` group was reserved for and never written: its
  overview names "awareness from session one", "a clear path to the knowledge", and "a sense of
  when to look". It is written now because there is finally evidence about which of those was
  actually missing — awareness was present and useless; coverage was the gap.
- Adjacent but distinct: `../insight/assistant-has-project-knowledge-when-working.business.md`
  covers the *insight* layer answering when asked. This outcome covers the whole knowledge
  layer being reached for at all. That spec's business rule 3 ("never injected as ambient noise
  at session start") is written about knowledge content; the reading taken here is that coverage
  is not content. **OPEN — flagged for the developer:** if that reading is rejected, the rule
  needs revisiting explicitly rather than this outcome working around it.
