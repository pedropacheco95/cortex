# Insight — Overview

## What this is

The engineering specs for the `.cortex/insight/` module at v3: the ungated, queryable **codebase-understanding layer**. Insight moved at v3 from a concept-map over curated artefacts to a leveled (L1–L4), optionally scoped, per-file understanding of the source code itself — what each file is for, its main players, its non-obvious quirks, and how it connects to the rest of the codebase, including connections no import statement reveals. It covers the storage contract, the deterministic L1 structural pass, the three-verb query CLI, the extraction skill that builds the layer, the three refresh loops that keep it current, and the session-observe loop that enriches it from how sessions actually went.

## What it covers

**v3 specs (current):**

- `insight.l1-structural` — the deterministic Core structural pass: tree-sitter parse, import/export graph, sizes, centrality with mechanical hubs excluded, skip-lists as pre-triage.
- `insight.storage-format` — the on-disk contract: scoped vs. flat layouts, the per-file understanding entry, `scope-registry.yaml`, the staleness ledger, the reverse-dependency index, and the `graph.json`/`tags.json`/`clusters.json` shapes with closed edge-type and confidence-tier enums.
- `insight.cli` — the three deterministic query verbs `cortex insight file|concept|element`, all `--json`, no LLM at query time; the scoped/flat difference invisible to the caller.
- `insight.extract-skill` — `cortex-extract-insight`, the plan-not-pipeline initial extraction: L1 consumption, scope planning, parallel per-scope L2/L3 execution, cross-scope L4 unification, checkpointed resumability.
- `insight.refresh-loops` — the fast (post-commit, deterministic), daily (hybrid significance triage), and full (weekly ground-truth L4) maintenance loops, plus reverse-dependency invalidation, confidence-aging, and scope-scoped invalidation.
- `insight.session-observe` — `cortex-loop-session-observe`: type-routed session observation — ungated observations enrich per-file entries directly with session provenance; conventions and decisions become typed pulse proposals.

**v2 lineage (SUPERSEDED-bannered, retained for history):**

- `insight.module-contract` — the v2 `map/` layout and its three JSON contracts, replaced by `insight.storage-format`.
- `insight.refresh-loop` / `insight.gaps-loop` — the v2 producer pair, replaced by `insight.refresh-loops` and `insight.session-observe`.
- `insight.promotion-mechanism` — **survives**: the typed pulse gate and promotion accept path, still the mechanism by which stabilized ungated content graduates into the gated layers (archive-era producers feed the same gate).

## Why it's grouped this way

The module is a single durable unit with one audience surface (the query CLI) and a strict producer split: extraction writes first content, the refresh loops maintain it, session-observe enriches it — all against one storage contract. Its defining property is unchanged from v2: it is *ungated* — inferred, useful immediately, never carrying enforcement authority; where insight conflicts with a compass rule or a spec, the gated layer wins. Grouping the contract, the CLI, the producers, and the surviving promotion path together keeps that trust boundary in one place. Anatomy's role (the per-file map) was absorbed here at v3 — the `anatomy/` name survives as the per-file-entry directory inside insight.

## Related groups

- Business outcomes for this domain: `../../specs-business/insight/`
- The contract these specs implement: `../schema/` (schema §4.10 as superseded by the v3 addendum §A4/§A5)
- The review gate promotions and typed proposals flow through: `../pulse/`
- The provenance forms session enrichment carries: `../provenance/`
- The superseded per-file map this module absorbed: `../anatomy/`
- The shared session-reading layer session-observe reads: `../loops/`
