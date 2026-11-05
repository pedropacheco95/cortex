# Scaffolding — Overview

## What this is

The artefacts that make Cortex *actively used* rather than nominally present: the CLAUDE.md Cortex-section template and the `_index.md` prompt templates for each module — active prompts disguised as documentation, with token budgets.

## What it covers

**Specs written:**

- `scaffolding.coverage-map` — **RETIRED 2026-09-16, unbuilt** (schema 3.4 fourth revision; `.cortex/atlas/decisions/2026-09-16-session-start-coverage-injection-retired.md`). Specified a generated SessionStart map of what Cortex *holds* (rules with their `governs`, decisions, domain terms, observations, insight concept names), separately budgeted with a fixed collapse order. Its intent is delivered at the moment of need by `hooks.pre-read-writeback` Rule 6, `hooks.search-annotate`, `recall.index-blocks` and `hooks.prompt-route`. Retained with a banner as the design to reuse if reopened.

- `scaffolding.rationalization-table` — **RETIRED 2026-09-16, unbuilt** (same decision). Specified a table answering the thoughts that precede skipping Cortex, shipping only alongside the map; retired with it. Its Rule 1 (drop the "query insight, this is not optional" mandate from the CLAUDE.md block) did not land and is now a separate call.

- `scaffolding.skill-listing-budget` — the shipped skill listing is a permanently-resident routing surface (`name` + `description` only; bodies are lazy-loaded), so a description's ceiling is set by how the bundle is actually reached: name-dispatched bundles get 120 chars, cold-phrasing entry points 250, `specflow-entry` is exempt as the gate on arbitrary phrasing, and callable-only bundles carry no trigger surface at all. Everything a description sheds moves into the free body.

The first two were placed in the SessionStart hook rather than the CLAUDE.md block in the schema 3.3 revision (a hook computes fresh, no `cortex sync`, no git churn) and were then retired before being built: the 2026-08-06 five-round experiment found session-start injection made agents dearer and won no round, and the recall work's steps 3 and 4 deliver the same coverage at read, search and prompt time at zero cost when nothing matches. The SessionStart payload is back to its 3.1 shape (pointer block plus observations digest).

_Planned (not yet written):_

- The `_index.md` prompt templates for each module
- Token budgets for the `_index.md` templates

## Why it's grouped this way

This is the prompt/template layer — the static text that directs Claude into Cortex on every session and at every module. It is deliberately separate from `hooks/`, which provides the runtime nudges that fire at decision points. Scaffolding is what is *present* in the repo; hooks are what *fires* during work.

These templates are the primary scaffolding (more central than hooks): without CLAUDE.md and `_index.md` pointing at Cortex, the rest of the system is present but unused.

## Related groups

- Business outcomes for this domain: `../../specs-business/scaffolding/`
- Runtime nudges that complement these templates: `../hooks/`
- Written during bootstrap: `../core-cli/`
