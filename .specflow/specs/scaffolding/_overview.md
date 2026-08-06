# Scaffolding — Overview

## What this is

The artefacts that make Cortex *actively used* rather than nominally present: the CLAUDE.md Cortex-section template and the `_index.md` prompt templates for each module — active prompts disguised as documentation, with token budgets.

## What it covers

**Specs written:**

- `scaffolding.coverage-map` — the **SessionStart payload** carries a generated map of what Cortex *holds* (rules with their `governs`, decisions, domain terms, observations, insight concept names) rather than a module roster; separately budgeted, with a fixed collapse order past budget, computed fresh each session so it cannot go stale, and never carrying content.

- `scaffolding.rationalization-table` — replaces the ignored "query insight, this is not optional" mandate with a table that names the thought preceding the skip and answers it; ships in the same payload as the coverage map so every claim it makes is true.

- `scaffolding.skill-listing-budget` — the shipped skill listing is a permanently-resident routing surface (`name` + `description` only; bodies are lazy-loaded), so a description's ceiling is set by how the bundle is actually reached: name-dispatched bundles get 120 chars, cold-phrasing entry points 250, `specflow-entry` is exempt as the gate on arbitrary phrasing, and callable-only bundles carry no trigger surface at all. Everything a description sheds moves into the free body.

The first two moved from the CLAUDE.md block to the hook in the schema 3.3 revision: a hook computes fresh (no `cortex sync`, no git churn), and §5's payload text is asserted by hook-spec tests rather than pinned verbatim like §8's block. CLAUDE.md gets lighter — it loses the insight mandate rather than gaining a map.

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
