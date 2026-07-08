# Anatomy — Overview

> **SUPERSEDED at v3 (build-order-v3 step 7):** the anatomy module is retired and absorbed into `insight/` (design §5.10). Every spec in this folder carries a supersession banner; retained for lineage.

## What this is

The native code-structure scanner and its artefacts. `cortex scan` lists files, estimates tokens, parses structure with tree-sitter, resolves one-line file purposes (docstring-first, with the LLM fallback delegated to the agentic refresh pass), cross-links specs, and emits the anatomy artefacts.

## What it covers

**Specs written:**

- `anatomy.scanner` — The deterministic `cortex scan` pipeline: file listing (honouring `.gitignore` + config exclusions), token estimation (chars/4), tree-sitter structure/import parsing, SHA256 change detection, docstring-first purpose lines (LLM fallback delegated to the agentic refresh pass), spec cross-linking, and emitting `files.md`/`graph.json`/`layers.md`.

- `anatomy.refresh-fast` / `anatomy.refresh-deep` — the mark-dirty-fast / refresh-deep pair: post-commit deterministic row+edge refresh (the load-bearing freshness loop), and the daily batched purpose-filler that init's inline pass invokes; both with atomic `last_seen` row writes.

_Planned coverage (not yet written):_ none — the domain is fully specced.

## Why it's grouped this way

This domain owns code structure only. Non-code source material (transcripts, RFPs, design docs) goes to `atlas/`, and the human-facing graph view is the `constellation/` — anatomy produces the machine-readable structure those other domains build on.

The scan is invoked deterministically by the CLI, but the batched purpose-generation pass is the one place anatomy touches an LLM; that pass produces data, not interactive behaviour.

## Related groups

- Business outcomes for this domain: `../../specs-business/anatomy/`
- Invoked by the CLI: `../core-cli/`
- Non-code sources live in: `../atlas/`
- Human-facing graph view: `../constellation/`
- Spec cross-links defined by: `../schema/`
