---
path: src/insight/exclude.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 70
size_tokens: 686
centrality: medium
built_at_commit: "8248c76"
source_sha256: "cf0ac5595cc3c7ca619b7e4ed522337d4c768e754f1478f293a6926b515d36f6"
---
# src/insight/exclude.ts

## Purpose

Shared path-exclusion logic deciding whether a path is in insight scope: hard-excluded segments (`node_modules`/`.git`/`.cortex`) are never indexed regardless of config, and `.gitignore` plus config-declared excludes (the new `insight.exclude` key unioned with the legacy `anatomy.exclude` for back-compat) widen the exclusion further. It is the single scope-agreement point shared by the L1 walk, the fast refresh tier, and the pulse hygiene sweep.

## Connections

Uses:
- (none src-internal — relies only on `fs`, `path`, and the `ignore` npm package via `createRequire`)

Used by:
- src/insight/l1.ts: uses `hasExcludedSegment` and `buildIgnoreFilter` during the repo walk.
- src/insight/refresh-fast.ts: uses `hasExcludedSegment` to check whether changed/deleted commit paths are in insight scope.
- src/pulse/hygiene.ts: uses the same filter so the hygiene sweep agrees with insight's notion of scope (outside this extraction scope).
