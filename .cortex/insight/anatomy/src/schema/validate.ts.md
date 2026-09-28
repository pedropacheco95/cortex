---
path: src/schema/validate.ts
extracted_at: 2026-09-22T09:54:56Z
extraction_level: 2
size_lines: 203
size_tokens: 2148
centrality: high
built_at_commit: "a66041b"
source_sha256: "b241c17e0636733ec14da350e431e3f081dc3b490746ff10210ccc22ea28aa38"
---
# src/schema/validate.ts

## Purpose
The top-level orchestrator of the entire schema validator: `validate(target, opts)` finds the project root (walking up from the target until it finds `.cortex/cortex.config.json`), runs `checkConfig` first and short-circuits with config-only violations if the major schema version is unsupported, then builds the shared `ProjectIndex` and the per-run `ClauseIndex` (§6.2, loaded once via `loadClauseIndex`) and runs every check function from the ~24 check modules in a fixed hardcoded sequence, concatenating their violations (and `checkVisibility`'s `notes` side channel) into one flat list. Supports an optional `scope: 'file'` mode that filters the aggregated violations down to only those touching one specific file (plus config errors, which always apply) — filtering happens after all checks run in full, not as a skip-optimization. Returns a `ValidationReport` with counts and a `conformant` flag (true iff zero errors).

## Connections
Uses:
- src/schema/types.ts: `ValidationReport`, `Violation`.
- src/schema/version.ts: `SUPPORTED_VERSION` — stamps the returned report's `schemaVersion`.
- src/schema/index-build.ts: `buildIndex` — builds the project-wide id/frontmatter index once, threaded into most checks.
- src/schema/clauses.ts: `loadClauseIndex` — builds the §6.2 clause index once, threaded into `checkBearsOn`.
- src/schema/checks/*.ts (config, layout, specs, compass, index-completeness, registry, visibility, atlas, pulse, threads, devspec, bizspec, scenario, xref, provenance, bears-on, evidence, hooks, claude-md, loop-md, constellation, recall-index, insight, archive): every check module is called here, in a fixed order with no dependency-based ordering or plugin discovery — adding a check means manually inserting both the import and the call site.

Used by:
- src/cli/init.ts: calls `validate` as part of project initialization.
- src/cli/sync.ts: calls `validate` as part of Rule 10 self-validation.
- src/loops/lint-scheduled.ts: calls `validate` for the scheduled lint loop.
- src/schema/cli.ts: calls `validate` from the `cortex validate` CLI verb.
- tests/atomic/core-cli/*, tests/atomic/loops/test-runner.test.ts, tests/atomic/schema/* (archive, business-status, compass-heading, constellation, index-completeness, intent-register, provenance, threads-check, validator, xref-unique), tests/spec/* (atlas/evidence, constellation/compiler, core-cli/init, core-cli/sync, hooks/pre-read, hooks/prompt-route, hooks/search-annotate, insight/storage-format, pulse/usage, recall/index-blocks, recall/recall-index, schema/bears-on, schema/validator-insight-checks, schema/validator, schema/version-2, schema/visibility, specflow/intent-reconcile): exercise `validate` end-to-end across nearly every check module and both the file-scope and project-scope paths.
