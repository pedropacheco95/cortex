---
id: insight.refresh-loop
status: implemented
depends_on:
  - insight.module-contract
  - schema.validator-insight-checks
  - insight.cli
  - anatomy.refresh-fast
  - constellation.compiler
implements: ../../specs-business/insight/assistant-has-project-knowledge-when-working.business.md
governed_by:
  - R-001
governs:
  - "src/insight/refresh.ts"
  - "skills/cortex-loop-insight-refresh/**"
---

# Insight Refresh Loop — the inferred-map maintainer

## Intent

`cortex-loop-insight-refresh` is the JSON producer: it maintains `insight/map/graph.json`, `tags.json`, and `clusters.json` — and nothing else — deriving the inferred concept map (tags, typed confidence-carrying edges, domain clusters) over the shared node set (schema §4.10.2, v2 design §4.1). Same deterministic-bookends idiom as distil: Core `--collect` assembles the node set via the constellation compiler's node-emission path, the in-session judgment derives tags/edges/clusters, Core `--apply` validates shape, applies cluster-id carry-over, sorts deterministically, and writes the three files atomically. One daily Desktop scheduled task decides full-vs-incremental internally (full when ≥7 days since the last full rebuild). It is the machine-owned-state maintainer class (schema Decision 13): it maintains ungated regenerable state directly and proposes nothing. Core halves deterministic (R-001).

## Entities

- **READS:** the node set via the constellation compiler's node-emission path (same code, same ids as `constellation.compiler`); `anatomy/files.md` (`last_seen`/`sha256` for the incremental change signal); the loop's own watermark `pulse/.insight-refresh-last-full` (last full-rebuild timestamp); the existing `map/*.json` (for carry-over).
- **WRITES:** `insight/map/graph.json`, `tags.json`, `clusters.json` — **only**; `pulse/.insight-refresh-last-full`; the transient collect corpus `pulse/.insight-refresh-worklist.json`. Never prose `.md`, never anything gated.
- **CREATES:** the three JSON files on first run; the worklist batches.

## Rules

1. **Two deterministic halves, three entry modes.** `--collect` assembles the node set (full: all nodes; incremental: the changed subset) into `pulse/.insight-refresh-worklist.json`. `--apply <derivation.json>` validates, carries over, sorts, and writes the three files. Bare `cortex loop-insight-refresh` = collect → spawn the Claude CLI headless for tag/edge/cluster judgment (the `core-cli.init` Rule 6 subprocess boundary; same failure semantics: `--no-llm`/absent/timeout → degrade with notice and retain collect output, auth → named) → apply. The shipped `skills/cortex-loop-insight-refresh/SKILL.md` runs collect, does the judgment **itself** (already a Claude session — no nested subprocess), then `--apply`.
2. **Writes only `.json` in `map/` (schema §4.10.3, the coordination rule).** The write-target set is disjoint from the gaps loop's `.md` lane. `--apply` refuses any `.md` path or any non-`graph/tags/clusters` basename — defence in depth inside Core, not just skill instructions (`check.insight-ownership` enforces the same shape at validation).
3. **Node ids are the constellation grammar (schema §4.10.2, §4.9).** Assembled via the compiler's node-emission path, so identity is shared and the §4.9 insight-preset overlay is a join, not a mapping. `graph.json` edges carry `kind` in the closed enum `semantically-related|same-cluster|mentions-same-entity`, `confidence` in `high|medium|low`, and a non-empty `rationale` each.
4. **Cluster-id carry-over (schema §4.10.2, Decision 14).** On a **full** rebuild, a newly-derived cluster reuses an existing cluster's id and label when the member-set **Jaccard similarity ≥ `insight.clusterCarryOverJaccard`** (default 0.5); highest match wins, ties broken by existing-id lexical order. This keeps cluster ids stable across rebuilds despite membership churn, so external references survive.
5. **Determinism + rationale carry-over (schema §4.10.2, git-noise mitigation).** The three files serialize deterministically: nodes, edges (by `from`,`to`,`kind`), tags (by node id, tags sorted), clusters (by id, members sorted) are stably ordered; the only per-run-varying field is `generated`. On a full rebuild, when an edge/tag/cluster whose identity matches an existing entry is re-derived, the existing `rationale`/`confidence` text is preserved **verbatim** rather than regenerated — only genuinely new or changed inferences produce diff lines.
6. **Incremental via the loop's own watermark (v2 design §4.1).** The incremental change signal is this loop's own last-refresh timestamp compared against anatomy `last_seen`/`sha256` — deliberately **not** the `needs_purpose_refresh` flag, which is owned and cleared by anatomy-refresh-deep; sharing it would couple two loops' correctness. `--collect` chooses full when ≥7 days since `pulse/.insight-refresh-last-full`, incremental otherwise; a successful full rebuild updates the watermark.
7. **Atomic three-file write; shape valid.** `--apply` writes the three files atomically and the result passes `check.insight-graph`.
8. **Deterministic Core bookends** (R-001): collect and apply are pure file I/O; only the tag/edge/cluster judgment is LLM work, and it never runs inside Core.

## Acceptance Criteria

### A full rebuild produces schema-valid JSON

- **Given** a project whose node set includes `anatomy:src/pulse/review.ts`, `spec:insight.cli`, `rule:R-001`
- **When** a full `cortex loop-insight-refresh` runs
- **Then** `graph.json`, `tags.json`, `clusters.json` are written and pass `check.insight-graph` — closed `kind` enum, `high|medium|low` confidence, every edge carrying a non-empty `rationale`

### A second full run over unchanged input is byte-identical but for `generated`

- **Given** an unchanged project and existing `map/*.json`
- **When** a second full rebuild runs
- **Then** the three files are byte-identical to the prior run except the `generated` timestamp (determinism + carry-over hold; re-derived `rationale`/`confidence` text is preserved verbatim)

### Cluster ids carry over across a membership change

- **Given** an existing `cluster:pulse-gate` with members `{spec:pulse.review-cli, spec:insight.promotion-mechanism}` and a full rebuild deriving a cluster over `{spec:pulse.review-cli, spec:insight.promotion-mechanism, spec:insight.gaps-loop}` (Jaccard 0.67 ≥ 0.5)
- **When** `--apply` runs
- **Then** the rebuilt cluster keeps id `cluster:pulse-gate` and its label — not a freshly-generated id

### Incremental touches only changed nodes

- **Given** a watermark under 7 days old and only `anatomy:src/insight/query.ts` changed since (per anatomy `sha256`)
- **When** `--collect` runs
- **Then** the worklist holds the changed subset (the changed node and its neighbourhood), not the full node set, and `rebuild` is `incremental`

### --apply refuses a prose path (write-lane enforcement)

- **Given** a derivation attempting to write `insight/map/setup.md`
- **When** `--apply` runs
- **Then** the `.md` write is refused (out-of-lane) — the refresh loop writes only `.json`

### Subprocess degradation preserves the worklist

- **Given** no claude binary and no `--no-llm`
- **When** bare `cortex loop-insight-refresh` runs
- **Then** exit 0, the run states the judgment pass was skipped, and the collect worklist is retained for the scheduled skill run

### Watermark decides full vs incremental

- **Given** `pulse/.insight-refresh-last-full` is 8 days old
- **When** `--collect` runs
- **Then** it chooses a full rebuild, and a successful `--apply` updates the watermark to now

## Notes

- This is the anatomy-loop pattern pointed at insight's machine-owned files — schema Decision 13's "maintains machine-owned ungated state directly and proposes nothing." It never mutates gated content and needs no lock against the gaps loop (disjoint write lanes, schema §4.10.3).
- The judgment prompt/skill body instructs explainable inference (every edge names its rationale; no embeddings) — prompt content is pinned by string assertions on the shipped SKILL.md, same convention as distil.
- **OPEN:** if deterministic serialization + carry-over prove insufficient against diff noise, the OQ4 rationale-sidecar option is revisited here (schema Decision 20) — deferred, not adopted.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
