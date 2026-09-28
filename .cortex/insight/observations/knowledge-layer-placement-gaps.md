---
kind: insight-observation
updated: 2026-09-22T09:47:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/a38766cb-f9aa-487b-8bd0-af66490219b2
---

The knowledge layer has five modules but roughly fourteen distinct places a
fact can be written. Typed artefacts with an ID allocator and a schema
section — rules, bugs, decisions, evidence, threads — are unambiguous about
where they go. A loose "I learned this today" fact is not: there is no
capture verb and no placement table in `cortex-schema.md`, so the flat
compass prose files (`preferences.md`, `environment.md`,
`do-not-repeat.md`, `standing-authorities.md`) have become the dumping
ground, each still carrying its scaffolded "(nothing recorded yet)" header
above real prose appended below it.

**Enforcement reaches only R-NNN rules, not the flat compass files.** The
PreToolUse write hook (`src/hooks/pre-write.ts`) matches a write's path
against each rule's `governs:` glob and runs its predicate when one exists —
that is the only enforcement path in the codebase. A lesson written into
`do-not-repeat.md` (which by its own header should hold zero prose, only an
index of rules) has no glob and no predicate, so it never fires; it
surfaces only if the recall carrier happens to index one of its headings or
bold spans as a keyword. `standing-authorities.md` is not referenced as a
gate by any skill or by CLAUDE.md — a skill cites it once, in passing —
so "read this before asking the user" currently depends on the assistant
having found it by chance (recall match, or its own private memory) rather
than any wired reflex.

**Rule usage is real but unmeasured.** Only three R-NNN rules exist; the
write hook warns on a matching write but records nothing about whether the
warning fired or whether the write proceeded anyway. The rule-decay/retirement
loop's own "violated recently without correction" signal is stated as
deferred until violation telemetry exists. `cortex why` and recall together
were invoked four times across 55 sessions as of this audit.

**`atlas/domain/` duplicates `insight/concepts/`.** Domain holds ten terms,
all extracted once on 2026-07-07 from the v3 reframe source, nine of ten
without `related_specs`; domain terms are not a recall entry kind so they
never surface unprompted, reachable only via `cortex why domain.<term>`.
`insight/concepts/` covers the same ground with more entries, kept fresh by
the loops — domain is doing insight's job, by hand, with staler data.

**`atlas/stakeholders/` is filled only by archive-ingest** (one entry as of
this audit, an unnamed external coordinator) — there is no schema field for
what someone works on, owns, or may approve; adding one is a schema change
that also touches RULES.md rule 20 (this repo is public — no account ids,
hosts, or ports).

**Five clusters of near-duplicate homes**, all current as of this audit:
(1) operational gotchas span `compass/environment.md`, `compass/do-not-repeat.md`,
`insight/observations/`, and the assistant's own private Claude-memory
files — the same fact (the headless-CLI hang, the pnpm-link binary) has
existed as both an observation and a private memory simultaneously; (2)
"conventions" has `preferences.md` plus a `compass/conventions/` directory
named in `cortex-schema.md` §1 that was never created; (3) `atlas/sources/`
and `archive/documents/<slug>/source.<ext>` are both gitignored raw-material
homes; (4) `atlas/domain/` and `insight/concepts/` describe the same
objects (see above); (5) four separately-ID'd "decide later" ledgers
(B-NNN bugs, S-NNN suggestions, T-NNN threads, G-NNN gaps) each carry a
different lifecycle, and `pulse/gaps.md` is not named in the schema or the
pulse `_index.md` at all. The 2026-07-07 decision that made atlas the
single home for decisions cited exactly this failure mode ("two homes for
the same data inevitably drift") but the principle was applied only to
decisions, nowhere else in the layer.

**Fixes were proposed but NOT approved or built in this session** — this is
a diagnostic finding, not a decision: add a placement table to the schema
plus a `cortex note` capture verb that routes by kind; fold
`do-not-repeat.md`/`environment.md` into observations, or make observations
directly session-writable; delete the phantom `compass/conventions/` entry
from the schema layout; move the one atlas source into archive and retire
`atlas/sources/`; either document `pulse/gaps.md` in the schema/index or
fold it into threads. Two cheaper fixes needing no schema change were also
raised: a CLAUDE.md/protocol reflex to grep `compass/bugs/` on an
unexpected error before diagnosing, and a reflex to read
`standing-authorities.md` before asking the user something. None of this
had shipped as of this session.
