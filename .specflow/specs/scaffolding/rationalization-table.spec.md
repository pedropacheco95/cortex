---
id: scaffolding.rationalization-table
status: draft
depends_on:
  - scaffolding.coverage-map
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
governs:
  - "src/hooks/session-start.ts"
  - "src/cli/templates.ts"
---

# Rationalization Table — answer the excuse, don't repeat the instruction

## Intent

The CLAUDE.md block currently instructs: *"Before substantive work on any file, query its insight
entry. Before changes touching multiple files or a concept, query the concept. This is not
optional."* Across 55 measured sessions it was followed twice. The instruction was in context every
time and was skipped essentially always — including in sessions working directly on Cortex.

An instruction that is ignored is worse than absent: it teaches that this class of instruction is
ignorable, and it occupies the slot a working mechanism would need. This spec **removes it from
CLAUDE.md** and puts a **rationalization table** in the SessionStart payload instead — the pattern
`specflow-brainstorm` and the discipline skills already use — naming the specific thought that
precedes the skip and answering it, rather than restating the requirement more firmly.

The distinction is the whole point. "Query insight, this is not optional" forbids an action.
"Grepping is safer because I don't know what's in Cortex → the coverage map above lists exactly what
is in it" dismantles the reasoning that made the action look correct. Only the second survives
contact with a model that is being locally rational.

## Entities

- **READS:** nothing at runtime — the table is static text. Its *claims* are about the coverage map
  `scaffolding.coverage-map` renders into the same payload.
- **WRITES:** nothing. The table is a section of the SessionStart `additionalContext` payload owned
  by `hooks.session-start`; removing the superseded mandate is an edit to `claudeMdBlock()` in
  `src/cli/templates.ts`.
- **CREATES:** nothing.

## Rules

1. **The mandate is removed from CLAUDE.md, not supplemented.** The "This is not optional"
   instruction and its two accompanying directives leave `claudeMdBlock()` in the same change that
   adds the table to the payload. Keeping both would put a demonstrably-ignored instruction beside a
   new one, teaching that the new one is the same kind of thing. CLAUDE.md gets **lighter**; the
   guidance moves to where it is computed alongside the evidence for it.

2. **Every row names a thought, not an action.** The left column is a rationalization stated in the
   first person as it would actually be constructed ("the code will tell me why this is here"). A
   row whose left column names a behaviour rather than the reasoning behind it ("skipping Cortex")
   is a restated prohibition and does not belong in the table.

3. **Every claim must be true at the moment it is read.** The table may only assert what the shipped
   system delivers. It ships together with `scaffolding.coverage-map` and never before it — a table
   promising that the payload lists what Cortex covers, in a payload that does not yet list it, is
   false on arrival and costs more trust than the instruction it replaced.

4. **Minimum coverage.** The table answers at least these four, because each was observed or is
   directly implied by the measured behaviour:
   - *"Grepping is safer — I don't know what's in Cortex, so a query is a gamble."* → The coverage
     map above lists what it holds. The gamble was real before the map; it is not now.
   - *"Reading the actual file is more reliable than reading a summary."* → It is also more
     expensive than the entire map. One unrelated source file costs more tokens than knowing
     everything the project has recorded.
   - *"I'll check Cortex if the code doesn't explain it."* → The code cannot explain why a decision
     was taken, what was rejected, what the gotcha is, or which account or tool this project uses.
     That is the only content Cortex holds; by the time the code has failed to explain it, the
     search has already been paid for.
   - *"I'll just ask — it's one question."* → The developer has already answered it, once, and it
     was written down. Asking again spends their attention on work already done.

5. **It informs, it never gates.** The table adds no requirement, no check, and no step before any
   tool call. Nothing in it blocks, slows, or redirects work. It changes what Claude believes about
   the trade-off; it does not stand between Claude and the alternative.

6. **Separately budgeted, and warn-never-block.** The table is its own small budgeted section of the
   payload, never counted against the pointer block's <100 tokens, the observations digest's ≤150,
   or the coverage map's own budget. Any internal error omits the table and exits 0, appending to
   `.cortex/pulse/reports/hook-errors.md` (`hooks.session-start` Rule 7).

7. **Each row is falsifiable, and stays checkable.** A row asserting a cost ("one file read costs
   more than the map") must be checkable against something real, so the claim can be re-verified as
   the project grows and corrected if it stops holding. A row that cannot be checked is an
   exhortation wearing a table's formatting.

## Acceptance Criteria

### The mandate is gone from the CLAUDE.md block

- **Given** the current block template containing "Before substantive work on any file, query its
  insight entry" and "This is not optional"
- **When** `claudeMdBlock()` renders after this spec ships
- **Then** neither phrase appears anywhere in the block

### The table is present in the payload with its four minimum rows

- **Given** a project with a populated `.cortex/`
- **When** the SessionStart hook renders its payload
- **Then** it contains a two-column table whose rows include the grepping-is-safer, the
  reading-is-more-reliable, the code-will-explain-it, and the just-ask rationalizations
- **And** each has a right-column response

### Every left-column entry states a thought, not a prohibition

- **Given** the rendered table
- **When** each left-column cell is read
- **Then** each is phrased as a reason a reader might hold, and none is an imperative or a
  prohibition

### The table never renders without the coverage map

- **Given** a project where `scaffolding.coverage-map` omits the map entirely because `.cortex/`
  holds no rules, decisions, terms, or concepts
- **When** the payload is rendered
- **Then** the rows asserting that the payload lists Cortex's coverage are omitted
- **And** no row makes a claim about content the payload does not carry

### It adds no gate

- **Given** a session started with the table in its payload
- **When** the session performs a Read, an Edit, or a Bash call
- **Then** no additional check, prompt, confirmation, or required step occurs as a result of the
  table being present

### The table is separately budgeted

- **Given** a project whose coverage map has collapsed categories to fit its own budget
- **When** the payload is rendered
- **Then** the table is still present in full — the map's budget pressure never trims it

## Notes

- **Evidence this pattern works, and its limit.** In the session that produced this spec, the
  `specflow-brainstorm` rationalization table measurably shaped behaviour — the grounding pass ran,
  spec conflicts were surfaced rather than designed around, questions came one at a time. But that
  table was loaded by a *skill invocation, at the moment of the work*. This one arrives at session
  start, further from the moment of temptation. The honest position is that this is an experiment
  with a known weakness.
- **Why the payload and not CLAUDE.md.** Placing it beside the coverage map means the table's claims
  and the evidence for them are rendered together and cannot drift apart — Rule 3 is enforceable
  because both are computed in the same pass. It also keeps CLAUDE.md lighter rather than heavier,
  which is the stated preference this placement serves.
- **How we will know.** `pulse.usage` is the instrument, and its baseline is already recorded
  (55 sessions; `cortex insight` invoked 2×; `concept`/`element` 0; 76 searches into `.cortex/`;
  root `_index.md` read 11×, module-level once). If the table plus the map do not move those
  numbers, the fallback is delivery at the moment of work — a skill or a discipline primitive — not
  a more strongly worded table.
- **Deliberately not done:** no hook fires this beyond SessionStart, and no gate enforces it. The
  brainstorm that produced this spec explicitly rejected obstacle-shaped mechanisms in favour of
  better information; a table that blocks would be the thing it was written to avoid.
- **Step 3 of the recall work (2026-09-15) answers the excuse differently.** The search-time
  pointer (`hooks.search-annotate`), the PreRead marker (`hooks.pre-read-writeback` Rule 6) and the
  generated atlas index blocks (`recall.index-blocks`) deliver the coverage this table argues for
  at the moment of the search or read, at zero session-start cost, with no instruction at all — a
  pointer that names what exists is the answer to "it probably isn't there". Whether the SessionStart
  table (and the coverage map it depends on) should be removed from schema §5 is a **pending
  decision for Pedro**; this spec's status, Rules and the §5 text are unchanged until then.
