# Cortex Developer Spec Tree — Overview

## What this is

This is the developer-facing spec tree for Cortex: the implementation contract. Specs here carry schemas, CLI/API surfaces, dependency chains, file formats, and Given/When/Then acceptance criteria. It is the engineering counterpart to the stakeholder-facing tree in `../specs-business/`.

Cortex is a holistic, owned-end-to-end system for understanding a codebase — a globally-installed Node.js CLI binary (TypeScript, npm-distributed, macOS-only for v1) that links inferred codebase understanding (insight), conventions/rules and a bug ledger (compass), project knowledge (atlas), ingested source documents (archive), specs across two trees, tests across four layers, and runtime scaffolding (hooks, CLAUDE.md, `_index.md`). Core is deterministic (no LLM calls); Skills are agentic. Cortex absorbs SpecFlow as its spec-and-test lineage.

## What it covers

1. `schema/` — the `cortex-schema.md` contract plus the schema validator; the load-bearing artefact that defines layout, file formats, frontmatter, traceability, and versioning.
2. `core-cli/` — the deterministic Node.js CLI binary surface, including the day-1 `cortex init` bootstrap. No LLM calls.
3. `anatomy/` — the native code-structure scanner and its artefacts (SUPERSEDED at v3 — the module is removed and its role absorbed into `insight/`; specs retained for lineage).
4. `compass/` — the write-time enforcement layer plus the unified bug ledger, rules, and preferences (renamed from `cerebrum/` at v3; decisions consolidated into `atlas/`).
5. `atlas/` — the project knowledge base (Karpathy LLM Wiki pattern): stakeholders, narrative decisions, domain terms, and raw sources.
6. `hooks/` — Claude Code hooks plus the git post-commit hook; runtime reinforcement, WARN-NEVER-BLOCK.
7. `scaffolding/` — the CLAUDE.md Cortex-section template and the `_index.md` prompt templates that make Cortex actively used.
8. `pulse/` — the two original self-maintenance loops, Hygiene and Distil; propose-don't-mutate.
9. `loops/` — the thirteen Cortex loops plus the shared loop infrastructure (scheduler writer, session-reading layer, writer/verifier harness, dismissed-suggestions memory).
10. `constellation/` — the read-only graph compiler and Cytoscape renderer for humans.
11. `specflow/` — the absorbed spec-and-test lineage: two spec trees, four test layers, seven-type bug taxonomy, and the Cortex-aware specflow-* skills.
12. `insight/` — the ungated, queryable codebase-understanding layer: at v3, per-file understanding entries, the `cortex-extract-insight` skill, the `cortex insight file/concept/element` query CLI, and the fast/daily/full refresh loops.
13. `archive/` — ingested source documents (client specs, transcripts, contracts) and the one type-routed ingestion skill, `cortex-archive-ingest`.
14. `provenance/` — the `provenance:`/`derives_from:` frontmatter contract, `check.provenance`, and the backward-traversal index from any source to its derivations.
15. `migration/` — the v3 module migration: the `cerebrum`→`compass` rename and the decisions single-home consolidation.
16. `discipline/` — process-agnostic discipline primitives both process profiles invoke (verification gate, hardening convention).
17. `recall/` — the recall surface (2026-09): the compiled `recall-index.json` that inverts every `bears_on` edge into per-subject lists of decisions, evidence, open threads and observations, and — in step 3 — the hooks and verbs that read it.

## Why it's grouped this way

Every developer spec links to the business outcome it serves via `implements:` (single value), and each business spec lists the developer specs that realise it via `implemented_by:` (list). The two trees are kept in sync through these links.

## Status

Specs are being written in the design doc's §16.2 dependency order. Implemented so far: `schema.validator`, `anatomy.scanner`, `core-cli.init`. Each domain folder's `_overview.md` lists what is written vs planned.
