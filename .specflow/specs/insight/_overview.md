# Insight — Overview

## What this is

The engineering specs for the `.cortex/insight/` module (schema §4.10): the ungated, queryable project-knowledge layer holding inferred structure (a concept map of nodes, tags, edges, and clusters) and observed-but-unreviewed context (setup/testing/deploy/conventions prose). It covers the module's file contracts, its four-command query CLI, its two producer loops with disjoint write lanes, and the promotion pipeline that graduates stabilized content into the gated layers through the existing pulse gate.

## What it covers

**Specs written:**

- `insight.module-contract` — the module skeleton and formats: `insight/_index.md` (the ungated-trust-model prompt, §7.4), the flat `map/` directory, the `insight-prose` `.md` contract with its provenance trailer and `## Corrections` log (§4.10.1), the three inferred JSON files (§4.10.2), the `cortex.config.json` `insight` block, and `cortex init` scaffolding it committed.

- `insight.cli` — the four deterministic commands `cortex insight query|get|neighbors|list` (§4.10.5): lexical query over prose + tags + cluster labels, node-graph traversal, all `--json`, no LLM at query time.

- `insight.refresh-loop` — `cortex-loop-insight-refresh`, the JSON producer: deterministic bookends around agentic tag/edge/cluster judgment, cluster-id carry-over, determinism + carry-over of unchanged rationale text, write-lane enforcement (`.json` only).

- `insight.gaps-loop` — `cortex-loop-insight-gaps`, the prose + proposal producer: the five gap signals routed to direct prose writes (ungated) or typed pulse proposals (gated), distil coordination, write-lane enforcement (`.md` only).

- `insight.promotion-mechanism` — the typed pulse gate and promotion accept path (§4.5.1/§4.5.2/§4.10.4): the five `**Type:**` values, the three payload shapes including the new byte-exact `edit`, extended `Target:` roots, and the promoted-marking side effect.

- `constellation.insight-preset` — the sixth constellation preset (§4.9): a serve-time overlay of `map/graph.json` + `clusters.json` over the curated graph, dashed inferred edges and cluster background regions, curated staying the default.

## Why it's grouped this way

The module is a single durable unit with one audience surface (the query CLI) and two disjoint producers; its defining property is that it is *ungated* — useful immediately, never having passed the human review gate, never carrying write-time enforcement authority. Grouping its contract, CLI, loops, and promotion path together keeps that trust boundary in one place. The typed-pulse-gate and constellation-preset specs live partly outside this domain (they extend `pulse/` and `constellation/`), but their insight-specific behaviour is specified here because insight is what makes them load-bearing.

## Related groups

- Business outcomes for this domain: `../../specs-business/insight/`
- The contract these specs implement: `../schema/` (§4.10, §4.5.1/§4.5.2, §4.9)
- The review gate promotions and corrections flow through: `../pulse/`
- The shared session-reading layer the gaps loop reads: `../loops/`
- The node-id grammar and compiler the map reuses: `../constellation/`
