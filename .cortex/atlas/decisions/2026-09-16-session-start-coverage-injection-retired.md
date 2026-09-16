---
id: decision.2026-09-16-session-start-coverage-injection-retired
title: The SessionStart coverage map and rationalization table are retired before being built; coverage is delivered at read, search and prompt time instead
date: 2026-09-16T15:00:00Z
sources:
  - ../evidence/2026-09-15-usage.md
  - ../evidence/2026-09-16-usage.md
bears_on:
  - schema:§5
  - scaffolding.coverage-map
  - scaffolding.rationalization-table
  - hooks.session-start
provenance:
  - derives_from: claude-sessions/pedropacheco1/9a121da9-c7a7-403c-bb80-1cb82cb1cf6f
---

# The session-start coverage injection is retired, unbuilt

On 2026-09-16 Pedro approved removing the two SessionStart sections that schema 3.3 (second
revision) specified and no release ever shipped: the **coverage map** — a generated table of
contents of the knowledge layer, ≤1,800 tokens, later allowed to carry insight concept names —
and the **rationalization table** that rode beside it (≤250 tokens). Schema 3.4 fourth revision
removes both from §5, the two dev specs (`scaffolding.coverage-map`,
`scaffolding.rationalization-table`) are retired in place with a banner, and
`hooks.session-start` Rules 10 and 11 become retired stubs. Nothing is added and no migration
ships: no project ever rendered either section, so no project changes behaviour.

The idea is **parked, not rejected**. The words Pedro used were "lets remove it. But lets make a
note somewhere to revisit this idea in the future and run further investigations." This file is
that note.

## Why

**It was never built.** Specified in the 3.3 second revision, the map and the table stayed at
`status: draft` with `governs:` globs matching no file (`src/hooks/coverage-map.ts` never existed;
the validator warned on it every run). A contract clause that describes a payload no hook emits
is a false claim about the system — exactly the failure the rationalization table's own Rule 3
("every claim must be true at the moment it is read") named.

**The experiment went the other way.** The five-round session-start injection experiment of
2026-08-06 (recorded in the brainstorm session and summarised in
`2026-08-05-insight-pull-only-stance-reversed.md`) found that code-only agents were about 1.6×
cheaper than agents given the session-start injection, and Cortex won no round. A ≤1,800-token
section paid on every session, read in none, is the wrong shape for coverage: it is charged
before there is a question to match it against.

**Steps 3 and 4 of the recall work deliver the same coverage at the moment of need.** The PreRead
marker (`hooks.pre-read-writeback` Rule 6), the search-time pointer (`hooks.search-annotate`), the
generated atlas index blocks (`recall.index-blocks`), `cortex why`/`cortex recall`
(`recall.why`), and the open-thread prompt router (`hooks.prompt-route`) surface what is decided,
measured and open about the thing a session is reading, searching or asking about — as names, ids
and paths, never bodies — and cost **zero tokens when nothing matches**. The business outcome the
map served (`scaffolding.assistant-reaches-for-cortex-instead-of-guessing`) was already rewritten
at step 3 to promise coverage at search and read time rather than at session start.

**The insight-injection stance returns to its 3.1 shape.** The 2026-08-05 decision widened §5,
once and narrowly, to permit insight concept *names* inside the map. With the map gone that
widening has no carrier, so the only SessionStart insight surface is again the observations
digest (§4.10.11). The 2026-08-05 decision's **finding** stands and is not superseded: pull alone
was not reached for (the 2026-09-15 and 2026-09-16 evidence re-confirm `atlas/decisions/` read
zero times in 54 sessions). Only its **remedy** — a standing table of contents at session start —
is withdrawn in favour of pointers at the moment of the read or search. This also dissolves the
tension that decision left open with the insight business rule "never injected as ambient noise
at session start": nothing is injected at session start beyond what 3.1 already carried.

## What this does not license

- No `cortex insight ask`, no question-answering surface (`insight.cli` Rule 7, design §11) — unchanged.
- No new SessionStart section of any kind. The pointer block stays <100 tokens with the digest's
  own ≤150 pool beside it (RULES.md rule 11).
- No loosening of the pointer grammar: names, ids, dates and paths only, never body text, never
  an imperative (schema §5, `hooks.search-annotate` Rule 7).

## Revisit when

Any one of these is a reason to reopen the question; none of them reopens it automatically.

1. **The recall measurement says sessions still ask what the project already answered.** Watch,
   across the next several `atlas/evidence/*-usage.md` files: `pointers.fired` stays low while
   `questions.before-consult` stays at or above its floor of 1 in 54; `pointers.followed` stays
   at 0 once `pointers.fired` is in the tens (2026-09-16: fired 2, followed 0); `Open:`
   resumption lines fire but the resumed question is re-asked anyway; or the read-deferral
   `proceed-rate` sits near 1 (the summary never replaced the read). Point-of-need coverage
   that is not followed is the case for trying a standing map again.
2. **A client project with real domain vocabulary shows a different search pattern.** The
   evidence so far is this repo, whose vocabulary is Cortex's own. If a project with a domain
   glossary (`atlas/domain/`) shows sessions grepping source for terms the glossary defines, a
   map of *terms* at session start may earn its cost where a map of *decisions* did not.
3. **Claude Code adds a cheaper session-start channel** — for example a system-prompt or
   memory surface that is cached across turns rather than re-read as context — so the
   1,800-token figure stops being paid per session.
4. **Context windows grow enough that 1,800 tokens is noise.** The cost argument was about the
   ratio of map to budget; if that ratio falls by an order of magnitude the trade changes.

**What would settle it:** a re-run of the five-round experiment with the **read/search/prompt-time
consumers as the control** and the standing map as the treatment, on the same tasks, measuring
total tokens, questions asked, and pointers followed. The 2026-08-06 run compared injection
against nothing; the honest comparison now is injection against the mechanism that replaced it.
The two dev specs are retained in full for that re-run — their Rules (collapse order, names-only,
budget independence) are the design to reuse, not to redo.
