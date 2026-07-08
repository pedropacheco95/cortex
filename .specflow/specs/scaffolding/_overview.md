# Scaffolding — Overview

## What this is

The artefacts that make Cortex *actively used* rather than nominally present: the CLAUDE.md Cortex-section template and the `_index.md` prompt templates for each module — active prompts disguised as documentation, with token budgets.

## What it covers

_No specs written yet — this tree is scaffolded structure only. Planned coverage:_

- The CLAUDE.md Cortex-section template, with substitution points
- The `_index.md` prompt templates for each module
- Token budgets for each template
- The framing of these templates as active prompts that direct Claude into Cortex

## Why it's grouped this way

This is the prompt/template layer — the static text that directs Claude into Cortex on every session and at every module. It is deliberately separate from `hooks/`, which provides the runtime nudges that fire at decision points. Scaffolding is what is *present* in the repo; hooks are what *fires* during work.

These templates are the primary scaffolding (more central than hooks): without CLAUDE.md and `_index.md` pointing at Cortex, the rest of the system is present but unused.

## Related groups

- Business outcomes for this domain: `../../specs-business/scaffolding/`
- Runtime nudges that complement these templates: `../hooks/`
- Written during bootstrap: `../core-cli/`
