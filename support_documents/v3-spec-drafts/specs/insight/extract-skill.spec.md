---
id: insight.extract-skill
status: draft
depends_on:
  - insight.storage-format
  - insight.cli
  - insight.l1-structural
implements: ../../specs-business/insight/assistant-understands-codebase.business.md
governs:
  - "skills/cortex-extract-insight/**"
---

# Insight Extraction Skill — the plan-not-pipeline codebase-understanding builder

## Intent

`cortex-extract-insight` is the Claude Code **skill** (no CLI wrapper — RULES 3, v3 design §5.3) that produces the initial `.cortex/insight/` layer for a codebase Claude doesn't yet understand. It is not a fixed pipeline: Claude reads the L1 structural pass and *decides* how to analyze the rest, in four phases — structural (consumed, not owned here), planning, scoped execution, cross-scope unification (v3 design §5.3). The orchestration contract is lifted verbatim from the Graphify extraction study's TAKE verdicts: parallel sub-agents dispatched in one message, each writing its fragment to disk, "the file exists on disk" as the success signal, a missing fragment as warn-don't-silently-skip, and more than half missing as an abort (study Axis 1, design §5.3). Recursion for oversized scopes re-plans from the top rather than letting a scope sub-agent spawn its own sub-agents (build-order flag F7) — the skill's own fan-out stays one level deep.

## Entities

- **READS:** the L1 structural output (`insight.l1-structural` — import/export graph, sizes, centrality, skip-listed paths excluded); the existing `.cortex/insight/` layout when resuming (`scope-registry.yaml`, `ledger.json`, per-scope completion state) for checkpoint recovery; `cortex.config.json` for the auto-run-vs-confirm threshold (`insight.extractionAutoRunThreshold` or equivalent, config-name TBD by `insight.cli`/`insight.storage-format`).
- **WRITES:** the full `.cortex/insight/` output contract owned by `insight.storage-format` — `anatomy/` (or `scopes/<scope>/anatomy/`) per-file entries, `concepts/`, `graph.json`, `tags.json`, `clusters.json`, `scope-registry.yaml`, `ledger.json`, `reverse-index.json`; `.cortex/pulse/insight-extraction-plan.md`; `.cortex/pulse/insight-extraction-progress.md`. Never gated content — this skill has no target in `compass/`, `atlas/`, or `RULES.md`.
- **CREATES:** the scope registry and every per-file entry, concept file, and JSON artefact on a first run; the plan and progress pulse artefacts on every run.

## Rules

1. **Four phases, in dependency order (design §5.3).** Phase 1 (structural, L1) is a prerequisite this skill consumes, owned by `insight.l1-structural`. Phase 2 (planning) reads L1 output and drafts the extraction plan and scope registry. Phase 3 (scoped execution) runs L2 on every file in every scope and L3 on scope-locally-central files, one parallel sub-agent per root scope. Phase 4 (cross-scope unification) runs once every scope completes, producing L4 concepts, patterns, and cross-scope semantic edges.
2. **The scope registry is the durable planning record (design §5.4).** Written to `scope-registry.yaml` (per `insight.storage-format`'s `check.insight-scope-registry`): `path`, `depends_on`, `shared_by` per scope. A scope shared by multiple parents is extracted **once** and referenced from each parent — never re-extracted.
3. **Same-module vs. similar-module is Claude's judgment during planning, made by reading the code.** Same underlying files (imports, path resolution, symlinks) → one scope, referenced from both parents. Independently-implemented similar functionality (e.g., two unrelated `notifications/` directories) → two separate scopes, connected by a Phase-4 `semantically-similar-to` edge, never merged into one scope (study's dedup guardrail: same label ≠ same entity across scopes).
4. **Recursion re-plans from the top (build-order flag F7).** When planning finds a scope still too large after the initial pass, the top-level orchestrator breaks it into sub-scopes and re-dispatches — it does **not** let an already-running scope sub-agent spawn its own nested sub-agents. Recursion terminates when every leaf scope is small enough for one extraction agent; very small collections with no cross-scope sharing (roughly 5–10 files) fold into their parent instead of becoming their own scope.
5. **Auto-run vs. confirm gate (design §5.3).** Below the configured cost/size threshold, the skill executes the plan without waiting. At or above it — large scope trees, ambiguous boundaries, high estimated cost — the skill writes the plan to `insight-extraction-plan.md` and waits for the user to confirm or adjust before Phase 3 begins.
6. **Parallel-sub-agent-per-root-scope orchestration (study Axis 1, verbatim adoption).** All root-scope sub-agents for a given wave are dispatched in a single message. Each writes its L2/L3 output fragment to a disk file before returning; the orchestrator's success signal is **the file existing on disk**, never the sub-agent's own report. A scope whose fragment is missing after dispatch is a **warn**, not a silent skip. If **more than half** of the dispatched scopes' fragments are missing, the run **aborts** rather than continuing on a majority-incomplete result.
7. **Resumability and checkpointing (design §5.11, A5.2).** Scope completion is checkpointed as each scope's fragment lands on disk and merges cleanly. A crashed or interrupted run, re-invoked, skips scopes already checkpointed complete and resumes only the incomplete ones — it never re-extracts a completed scope.
8. **Progress and plan are pulse artefacts, not durable insight state.** `.cortex/pulse/insight-extraction-plan.md` (`kind: insight-extraction-plan`) carries the root/shared/sub-scope tree, estimated cost, and peak parallelism. `.cortex/pulse/insight-extraction-progress.md` (`kind: insight-extraction-progress`) carries per-scope status (pending/running/complete/failed), files done, checkpoints, and warnings. Both are transient (gitignored, `pulse/` header conventions apply) — the durable output is the `.cortex/insight/` tree itself.
9. **No CLI wrapper (RULES 3, design §5.3).** There is no `cortex extract-insight` command. The skill is invoked from a Claude Code session or directly by a scheduled task; Core never orchestrates or triggers extraction.
10. **Output validation before a scope or run is considered done (design §A5.2).** Every written per-file entry, JSON artefact, and the scope registry is validated against `insight.storage-format`'s checks (`check.insight-entry`, `check.insight-scope-registry`, `check.insight-graph`, `check.insight-ledger`) before the corresponding checkpoint is marked complete.

## Acceptance Criteria

### Planning drafts a scope tree with shared-scope references

- **Given** a codebase with `auth/` (~2,400 files) and `billing/` (~1,800 files) both importing a shared `notifications/` module
- **When** Phase 2 planning runs over the L1 output
- **Then** `.cortex/pulse/insight-extraction-plan.md` lists `auth/` and `billing/` as root scopes each referencing shared scope `notifications/`, and `scope-registry.yaml` records `notifications` with `shared_by: [auth, billing]`

### Same-underlying-files scopes are extracted once

- **Given** `auth/` and `billing/` both resolve their `notifications/` import to the identical `src/shared/notifications/` directory
- **When** Phase 3 execution runs
- **Then** `notifications/` is extracted by exactly one sub-agent, and both `auth/`'s and `billing/`'s scope outputs reference the same `scopes/notifications/` fragment rather than duplicating it

### Similar-but-independent modules are connected, not merged

- **Given** two unrelated directories `legacy/notifications/` and `v2/notifications/` implementing overlapping-but-independent notification logic with no shared imports
- **When** Phase 2 planning classifies them and Phase 4 unification runs
- **Then** they are extracted as two separate scopes, and Phase 4 produces a `semantically-similar-to` edge between their concept nodes rather than collapsing them into one scope or one node

### Recursion re-plans from the top, not via nested sub-agent spawn

- **Given** planning finds `admin-panel/` too large for a single extraction agent, with a `reporting/` sub-tree cohesive enough to be its own sub-scope
- **When** the orchestrator recurses
- **Then** the top-level orchestrator re-plans and dispatches `admin-panel/reporting/` as its own scope in a subsequent wave — no already-dispatched scope sub-agent spawns a nested sub-agent of its own

### Below-threshold codebases auto-run without confirmation

- **Given** a small codebase whose estimated extraction plan is below the configured auto-run threshold
- **When** planning completes
- **Then** Phase 3 execution begins immediately without waiting for user confirmation, and the plan is still written to `insight-extraction-plan.md` for the record

### Above-threshold codebases wait for confirmation

- **Given** a codebase whose plan estimates 5 concurrent extraction agents and ~14 hours, above the configured threshold
- **When** planning completes
- **Then** the skill writes `insight-extraction-plan.md` and stops, waiting for the user to confirm or adjust the plan before any scope is dispatched

### Parallel dispatch treats the on-disk fragment as the success signal

- **Given** three root scopes ready for Phase 3 dispatch
- **When** the orchestrator dispatches all three sub-agents in one message
- **Then** each scope's completion is determined by its fragment file existing on disk — a sub-agent's own textual claim of success without a corresponding fragment file is **not** treated as success

### A missing fragment warns; more than half missing aborts

- **Given** four scopes dispatched in one wave
- **When** one scope's fragment file is missing after the wave completes
- **Then** the run continues with a warning naming the missing scope
- **Given** three of the four scopes' fragments are missing
- **When** the orchestrator checks completion
- **Then** the run **aborts** rather than proceeding on a majority-incomplete result

### A crashed run resumes from its last checkpoint

- **Given** a run that completed and checkpointed scopes `auth` and `notifications` before being killed mid-`billing`
- **When** the skill is re-invoked on the same project
- **Then** it skips re-extracting `auth` and `notifications` and resumes only `billing` and any scopes after it

### Cross-scope unification runs only after every scope completes

- **Given** all root and shared scopes checkpointed complete
- **When** Phase 4 begins
- **Then** a single unification pass produces `concepts/` spanning multiple scopes and cross-scope edges in the top-level `graph.json`, and this pass does not start while any scope is still `pending` or `running` per `insight-extraction-progress.md`

### Malformed output fails validation before checkpointing

- **Given** a scope's L3 fragment omits the required `## Main players` section for an `extraction_level: 3` entry
- **When** the skill validates the fragment against `insight.storage-format`'s `check.insight-entry`
- **Then** the scope is not marked complete, and the progress artefact records the validation failure rather than silently accepting the malformed entry

## Notes

- `insight.l1-structural` (build-order 5a) and `insight.storage-format` (5b) and `insight.cli` (5c) are built *before* this skill (5d) — consumer-before-producer, per v2 design §13's idiom carried into v3 (build-order-v3 §5). This spec assumes those contracts exist and does not redefine them.
- The four-phase structure, the scope registry, and the cross-scope L4 unification pass are **Cortex-original** — the Graphify study confirms Graphify has "no scope registry, no recursion, and no plan-the-extraction step" and that its merge step is a dumb dedup-by-ID union with no unification reasoning (study Axis 1; design §5.3, §5.11). Only the orchestration mechanics (parallel dispatch, disk-file-is-success, warn/abort thresholds) are adopted verbatim from the study.
- **OPEN:** the exact auto-run-threshold config key and its default value are not fixed by the design pass (design §5.3 says only "configurable; defaults are conservative") — left to `insight.cli`/`insight.storage-format` or this spec's implementation pass to name concretely.
- **OPEN:** whether a killed-mid-scope (not just killed-between-scopes) run recovers partial per-file entries within that scope, or re-runs the whole scope from empty, is not specified by the design/addendum pass; the acceptance criterion above only asserts scope-level (not sub-scope-file-level) resumability, matching the "scope completions are checkpointed" language in design §5.11/A5.2.
- Journey-layer tests are expected to follow the project-wide convention of deferring to v1.1 pending the test-runner loop, consistent with the two live insight loop specs this draft mirrors.
