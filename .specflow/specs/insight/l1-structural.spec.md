---
id: insight.l1-structural
status: implemented
depends_on: []
implements: ../../specs-business/insight/assistant-understands-codebase.business.md
governed_by:
  - R-001
governs:
  - "src/insight/l1.ts"
  - "src/insight/l1-parse.ts"
  - "src/insight/l1-triage.ts"
  - "src/insight/exclude.ts"
  - "src/insight/measure.ts"
---

# L1 Structural Extraction — the deterministic Core pass

## Intent

The Level 1 structural pass (build-order-v3 step 5a; v3 design §5.2) is the deterministic raw material every other insight phase consumes: a tree-sitter parse (RULES 18 — the only parser) producing the import/export graph, file sizes, entry points, module structure, and centrality analysis over the project's source files. It runs **in Core** with no LLM anywhere in its path (RULES 3, R-001) — L1 is what makes the extraction skill's planning phase (`insight.extract-skill` Phase 2) and the fast refresh tier's structural filter (`insight.refresh-loops`) possible without spending judgment on what structure alone can answer.

## Entities

- **READS:** the project's source tree (files not excluded by the skip-lists); `cortex.config.json` for any configured exclusions.
- **WRITES:** the L1 structural output (import/export graph, sizes, centrality ranking) consumed in-memory or on disk by the extraction skill's planning phase; nothing under gated modules.
- **CREATES:** no durable `.cortex/insight/` content of its own — per-file entries, concepts, and the JSON trio are written by `insight.extract-skill` against `insight.storage-format`'s contract, informed by this pass.

## Rules

1. **Deterministic Core, tree-sitter only (RULES 3, RULES 18, R-001).** The pass is pure parsing and graph arithmetic — no LLM SDK anywhere in its code path, and tree-sitter is the only parser used.
2. **Skip-lists exclude mechanical and sensitive paths pre-triage (design §5.2, study adoption).** `node_modules`, build/output directories, lockfiles, and sensitive-file patterns (credentials, secrets) are excluded before any parsing or measurement — they never enter the graph, the size accounting, or the centrality ranking.
3. **Cortex's own meta-directories are never indexed.** `.cortex/`, `.specflow/`, and `.claude/` are hard-excluded from both the L1 walk (`L1_SKIP_DIRS`) and the shared insight-scope filter (`EXCLUDED_SEGMENTS`): insight is understanding of the *codebase*, not of the knowledge layer, the spec trees, or the skill/settings bundles — each already has its own representation, and indexing them would only add self-referential entries and refresh churn.
4. **Centrality excludes mechanical hubs.** Files that are structurally central only because everything imports them mechanically (barrel files, generated indexes, config re-exports) are excluded from the centrality ranking, so L3-selection pressure (which reads centrality) lands on genuinely load-bearing files.
4. **Output is deterministic.** Two runs over an unchanged tree produce byte-identical output — same graph, same ordering, same centrality ranking — so downstream planning and the staleness ledger can diff meaningfully.

## Acceptance Criteria

### The pass produces a structural graph with no LLM involved

- **Given** a project source tree
- **When** the L1 pass runs
- **Then** it produces an import/export graph, per-file sizes, entry points, and a centrality ranking, and no LLM call occurs anywhere in its execution path

### Skip-listed paths never enter the output

- **Given** a tree containing `node_modules/`, a `dist/` build directory, `pnpm-lock.yaml`, a file matching a sensitive pattern, and Cortex's own `.cortex/`, `.specflow/`, and `.claude/` directories
- **When** the L1 pass runs
- **Then** none of those paths appear in the graph, the size accounting, or the centrality ranking — the three meta-directories are hard-excluded, so extraction produces no insight entries for them

### Mechanical hubs are excluded from centrality

- **Given** a barrel `index.ts` re-exporting every module in its directory, imported by most of the tree
- **When** the centrality ranking is computed
- **Then** the barrel file is excluded from the ranking, and the genuinely load-bearing files it re-exports rank on their own connectivity

### Output is byte-identical across runs on unchanged input

- **Given** an unchanged source tree
- **When** the L1 pass runs twice
- **Then** the two outputs are byte-identical

## Notes

- This spec was authored retroactively at v3 spec-promotion time: L1 shipped as part of build-order-v3 step 5a without a dedicated spec file, but `insight.extract-skill` load-bears on it via `depends_on`, so the contract is recorded here at the grain the build order fixed (its "Done when": deterministic, skip-lists, hub-excluded centrality).
- The storage of L1-derived facts (e.g. `size_lines`, `centrality` in per-file entry frontmatter, the ledger's hashes) is owned by `insight.storage-format`; this spec owns the pass that computes them.
