---
id: scaffolding.assistant-reaches-for-cortex-instead-of-guessing
status: draft
implemented_by:
  - ../../specs/scaffolding/coverage-map.spec.md
  - ../../specs/scaffolding/rationalization-table.spec.md
  - ../../specs/pulse/usage.spec.md
  - ../../specs/scaffolding/skill-listing-budget.spec.md
  - ../../specs/pulse/threads.spec.md
  - ../../specs/atlas/evidence.spec.md
  - ../../specs/recall/recall-index.spec.md
  - ../../specs/hooks/search-annotate.spec.md
  - ../../specs/recall/why.spec.md
  - ../../specs/recall/index-blocks.spec.md
  - ../../specs/hooks/prompt-route.spec.md
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

1. A session begins, and works. At the moment it searches for something or opens a file the
   project has knowledge about — a rule, a spec, a source file, the contract document — it
   learns, without asking and only then, which subjects the project holds knowledge about *for
   that thing*: what has been decided, what was measured, what question is still open. And when
   the developer's first words pick up where the last session stopped, or name a question that
   session left hanging, the assistant is told which open question that is — by id, in one line.
2. Working a task, it hits a question the code cannot answer — why something is the way it is,
   what was decided, what the gotcha is, which tool or account this project uses.
3. It recognises the question as one the project has covered, because the coverage arrived with
   the search or the read that raised it, and goes straight to the one small file that holds it
   — or asks the project directly, by name, for everything that bears on the subject.
4. It answers from the project's own knowledge instead of asking the developer or reading
   unrelated files to infer it.
5. The developer can see, without instrumenting anything, whether this is actually happening.

## Business Rules

1. Knowing what Cortex covers is delivered without being asked for — at the moment of the search,
   the read, or the developer's prompt that makes it relevant, not as a standing list at session
   start. Everything *below* the coverage level stays pull — the assistant asks for the content
   when it wants it.
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
   giving it better information, never by putting an obstacle in front of the alternatives —
   with **one exception, off by default and run only to measure**: the read-deferral gate
   (`../../specs/hooks/pre-read-writeback.spec.md` Rule 7), which may hold the *first* read of a
   source file for one turn and offer the map's summary in its place, lets the second read
   through unconditionally, never touches a rule, a spec, a decision or the contract, gives up
   after 25 holds in a session, and is switched on for a bounded experiment only. It exists to
   answer one question — does better information ever replace the read? — and the answer
   (the deferral proceed-rate below) decides whether it stays or is removed. While it is off,
   this rule reads exactly as it did before.

## Success Metrics

- The assistant answers project questions — conventions, decisions, environment, gotchas —
  without asking the developer, in cases where the answer exists in the project's knowledge.
- Consulting the project's knowledge is measurably more frequent after this ships than before;
  the before-figure is recorded, not estimated.
- The developer stops needing to say "check Cortex."
- The cost of knowing what Cortex covers stays smaller than the cost of one mistaken file read
  — and is paid only in the sessions, and at the moments, where there is something to point at.
- When the project points the assistant at a decision, a measurement or an open question, the
  assistant follows the pointer more often than not; the follow rate is read from the sessions
  the project already records, and the first measured value is the number to beat.
- **Deferral proceed-rate.** When the read-deferral gate is on, the share of held reads the
  assistant repeats within three tool calls. A rate near one says the summary did not replace
  the read and the gate costs a turn for nothing — it stays off for good. Only a markedly lower
  rate with no loss in the work's quality is a case for it. Read from the same session records
  as the follow rate; the gate ships with its measurement or not at all.

## Out of Scope

- **The content of the knowledge, and its quality.** This outcome is about the knowledge being
  reached; whether it is right, current, or well-written belongs to the capture and refresh
  outcomes.
- **A conversational question-answering surface.** Deliberately deferred until there is
  evidence that knowing the coverage is not enough on its own.
- **Any mechanism that guesses, per moment, which knowledge is relevant.** Relevance-guessing
  — inferring from the conversation what the assistant might want next — costs something every
  turn and is wrong invisibly. What this outcome does instead is exact: it matches the subject
  the assistant is *already* searching for or reading against what the project has recorded
  about that subject — or the developer's own words against the questions still open, and the
  first words of a session against the question the previous session left hanging — costs
  nothing when nothing matches, and is wrong visibly, because the pointer names the subject it
  matched. The assistant still does the matching for everything else.

## Notes

- This outcome is the one the `scaffolding/` group was reserved for and never written: its
  overview names "awareness from session one", "a clear path to the knowledge", and "a sense of
  when to look". It is written now because there is finally evidence about which of those was
  actually missing — awareness was present and useless; coverage was the gap.
- The threads ledger (`pulse/threads.spec.md`, added 2026-09-15) is the first piece of the recall
  work: it makes the questions, offers, approvals, and findings that sessions leave behind into
  project knowledge with an id and a lifecycle, so a later session has something to reach for
  instead of re-asking or re-deriving. In this step it is a ledger only — nothing is pushed into a
  session (business rules 1, 2 and 6 unchanged); the consumers that make it "reached for" arrive
  in a later step, and `pulse/usage.spec.md` already records the before-figure for them.
- Step 2 of the recall work (added 2026-09-15; schema 3.4) makes the recording durable and the
  knowledge reachable from the other end. `atlas/evidence.spec.md` gives a measurement a gated,
  committed home with its window and instrument, so "the before-figure is recorded" means a file a
  later session can compare against, not a line in a report that the next run overwrites; and
  `recall/recall-index.spec.md` compiles, per subject a session might be reading or searching, what
  was decided about it, what was measured, and what is still open — the table of contents business
  rule 2 asks for, extended from "what Cortex holds" to "what bears on the thing in front of you".
  Still nothing is pushed into a session in this step (rules 1, 2 and 6 unchanged): the index is
  built, not read; the consumers that read it are step 3.
- Step 3 of the recall work (added 2026-09-15; schema 3.4, second revision in place) is where the
  knowledge is finally pushed — as pointers, at the moment they can be followed. Four consumers of
  the recall index: `hooks/search-annotate.spec.md` (a search into a subject the project has
  recorded something about gets at most two lines naming it), `hooks/pre-read-writeback.spec.md`
  Rule 6 (a read of a spec, a rule, a decision, a measurement or the contract document gets one
  line naming what is decided, measured and open about it — that spec keeps its own business
  parent and names this outcome as also-supported), `recall/why.spec.md` (`cortex why` and
  `cortex recall`, the pull side the pointers end with), and `recall/index-blocks.spec.md` (the
  two atlas indexes list what they hold, so opening the index is enough). The journey's steps 1
  and 3, business rule 1 and the third out-of-scope bullet were rewritten in this step because
  the earlier text promised coverage *at session start*; coverage is now delivered at search and
  read time and the session-start map was never built (its removal is a pending decision — see
  `scaffolding/coverage-map.spec.md` Notes). Rules 2, 4, 5 and 6 hold unchanged: pointers carry
  names, ids and paths, never bodies or instructions; every pointer is compiled from files that
  exist at the moment it fires; the follow rate is read from transcripts the project already has
  (`pulse/usage.spec.md` Rule 11); and nothing blocks — a hook that finds nothing says nothing.
- Step 4 of the recall work (added 2026-09-16; schema 3.4, third revision in place) closes the
  two gaps the search-and-read pointers cannot reach. `hooks/prompt-route.spec.md` routes the
  developer's prompt against **open threads only** — the first prompt of a session surfaces the
  previous session's hanging question or offer; any prompt that names a thread or shares two
  words with one surfaces it — as at most two `Open:` lines, never the general index (the
  proposal's evidence: the general form would not have fired for the case that motivated all of
  this, and lowering the bar buys wrong pointers). Journey step 1, business rule 1 and the third
  out-of-scope bullet gained the prompt moment. And `hooks/pre-read-writeback.spec.md` Rule 7
  carries the read-deferral gate — the one place this outcome allows anything to hold the
  assistant's work — **default off**, one hold per file per session, never for gated files,
  fail-open, shipped as an instrument (that spec keeps its own business parent; this outcome
  owns the exception, business rule 6 amended, and its measurement, the deferral proceed-rate
  metric, read by `pulse/usage.spec.md` Rule 13). Rules 2, 4 and 5 hold unchanged: `Open:` lines
  carry an id, a date, the question's own words and a path — a name for a gap, not knowledge;
  every line is compiled from a ledger file that exists when it fires; both measurements come
  from transcripts the project already has.
- Adjacent but distinct: `../insight/assistant-has-project-knowledge-when-working.business.md`
  covers the *insight* layer answering when asked. This outcome covers the whole knowledge
  layer being reached for at all. That spec's business rule 3 ("never injected as ambient noise
  at session start") is written about knowledge content; the reading taken here is that coverage
  is not content. **OPEN — flagged for the developer:** if that reading is rejected, the rule
  needs revisiting explicitly rather than this outcome working around it.
