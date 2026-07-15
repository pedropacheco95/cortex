---
path: src/insight/exclude.ts
extracted_at: 2026-07-14T01:10:58Z
extraction_level: 2
size_lines: 72
size_tokens: 706
centrality: medium
built_at_commit: "c170f95"
source_sha256: "7f20a632a0d91b5ee942d4345f1684465eeb9fa374a40acb66b1c8279e41eeca"
---
# src/insight/exclude.ts

## Purpose

Shared path-exclusion logic deciding whether a path is in insight scope: hard-excluded segments (`node_modules`/`.git`/`.cortex`/`.specflow`/`.claude`) are never indexed regardless of config — Cortex's own meta-directories (knowledge layer, specs, skill/settings bundles) are not codebase and would only add self-referential noise — and `.gitignore` plus config-declared excludes (the new `insight.exclude` key unioned with the legacy `anatomy.exclude` for back-compat) widen the exclusion further. It is the single scope-agreement point shared by the L1 walk, the fast refresh tier, and the pulse hygiene sweep.

## Connections

Uses:
- (none src-internal — relies only on `fs`, `path`, and the `ignore` npm package via `createRequire`)

Used by:
- src/insight/l1.ts: uses `hasExcludedSegment` and `buildIgnoreFilter` during the repo walk.
- src/insight/refresh-fast.ts: uses `hasExcludedSegment` to check whether changed/deleted commit paths are in insight scope.
- src/pulse/hygiene.ts: uses the same filter so the hygiene sweep agrees with insight's notion of scope (outside this extraction scope).
