---
id: decision.2026-08-05-insight-pull-only-stance-reversed
title: Insight's pull-only stance is widened to permit concept names at SessionStart
date: 2026-08-05T18:00:00Z
sources:
  - ../evidence/2026-09-15-usage.md
bears_on:
  - schema:§5
  - insight.cli
  - scaffolding.coverage-map
---

# The pull-only insight stance was falsified by measurement

Schema §5 held, from v2.0 through 3.3, that insight is **pull-only via the CLI**. The one
carve-out — the observations digest added at 3.1 — was explicitly labelled "not a precedent for
injecting the rest of insight", on the reasoning that injecting unreviewed inferred content would
"spend the trust budget on the layer with the weakest trust warrant". §4.10 said the same from the
other side: insight guidance is deliberately "a CLAUDE.md directive, not a hook".

On 2026-08-05 we reversed that stance, narrowly. Schema 3.4 permits insight **concept names** in
the SessionStart coverage map.

## What changed our mind

*(Evidence note, 2026-09-15: the figures below were read from the `pulse/reports/usage.md` of
2026-08-05, a transient report since overwritten. The `sources:` entry now points at
`atlas/evidence/2026-09-15-usage.md`, a re-measurement over 54 sessions with the segment-level
search rule of `pulse.usage` Rule 8, which is why its search counts differ from the 76 quoted
here. The finding it re-confirms is the one this decision rests on: the pull surface is not
reached for — `atlas/decisions/` was read zero times in that window.)*

Nothing about the reasoning — it is sound, and we kept it for everything it was actually
protecting. What changed is that its **premise was measured and did not hold**.

The stance assumes pull works: that a surface available via the CLI will be reached for when
needed. `cortex usage`, run over 55 sessions of the Cortex repo itself, found:

- `cortex insight` invoked **2 times in total**, both `file`
- `concept`: **0**. `element`: **0** — the two verbs the pull-only stance existed to protect
- **76** searches into `.cortex/` over the same window
- module `_index.md` files read **once**; the root index 11 times
- one session invoking **`cortex insight scopes`** — a verb that has never existed

That last one is the finding that settled it. A session did not skip insight out of preference; it
tried to use insight and **guessed the verb**, because nothing told it what the verb set was. A
surface nobody can find is not trust-preserving. It is unused, and the trust budget it was
protecting was never being spent either way.

The CLAUDE.md mandate — "Before substantive work on any file, query its insight entry. This is not
optional." — was in context for all 55 sessions and was followed twice. The instruction channel had
already been tried.

## Why the widening is narrow

**Concept names only.** Never concept bodies, never per-file entries, never any other inferred
content. The distinction that keeps the original trust argument intact: a concept *name* is a
label, not a claim. `hook-safety` asserts nothing about the code that could turn out to be wrong,
in the way an inferred purpose or an inferred connection could. The injected surface stays a table
of contents; it never becomes an answer.

Per-file entries stay out for a second, independent reason: there are 81 of them here against 21
concepts, they grow linearly with the codebase, and the PreRead hook already delivers a file's
purpose at read time.

## What this does not license

This is not a general precedent for hook-injecting insight, and §5 says so in the amended text.
`cortex insight ask` remains forbidden (`insight.cli` Rule 7, design §11). A `cortex lookup` verb
was designed alongside this and deliberately held back pending evidence on whether coverage alone
changes the measured behaviour — `pulse.usage` is the instrument, and its pre-change baseline is
recorded.

## Open

The insight business spec `assistant-has-project-knowledge-when-working` carries business rule 3:
knowledge is "never injected as ambient noise at session start". Under this decision that rule is
literally contradicted unless one accepts that a table of contents is not knowledge content. The
reading taken here is that it is not. **That reading is not yet ratified** — flagged for Pedro on
the specs that depend on it.
