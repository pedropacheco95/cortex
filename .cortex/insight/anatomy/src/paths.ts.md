---
path: src/paths.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 46
size_tokens: 502
centrality: medium
built_at_commit: "8248c76"
source_sha256: "e90c1e00c82f51e77fdab6eeac6b9fd286c6735e34b721b3362e0225e0c3d45a"
---
# src/paths.ts

## Purpose
The single source of truth for the two SpecFlow spec-tree root paths (`.specflow/specs/`, `.specflow/specs-business/`) and their glob patterns (schema §2.3) — pure path math, no I/O — so the hidden-namespace re-rooting under `.specflow/` has exactly one place to change across every Core module that needs a spec-tree path.

## Connections
Uses:
- (none src-internal)

Used by:
- src/cli/init.ts: `specsRoot`, `businessRoot`, `SPECS_REL`, `BUSINESS_REL` — Rule 8 spec-tree scaffolding
- src/constellation/compile.ts: `specsRoot`, `businessRoot`, `SPECS_GLOB`, `BUSINESS_GLOB` — locating spec files for node/edge assembly
- src/loops/lint-scheduled.ts: spec-tree path resolution for its loop (outside this scope)
- src/loops/spec-drift.ts: spec-tree path resolution for its loop (outside this scope)
- src/loops/verify-scheduled.ts: spec-tree path resolution for its loop (outside this scope)
- src/pulse/hygiene.ts: spec-tree path resolution for hygiene checks (outside this scope)
- src/schema/checks/bizspec.ts: spec validator path resolution (outside this scope)
- src/schema/checks/devspec.ts: spec validator path resolution (outside this scope)
- src/schema/checks/specs.ts: spec validator path resolution (outside this scope)
- src/schema/checks/xref.ts: spec validator path resolution (outside this scope)
- src/schema/index-build.ts: spec index building (outside this scope)
- src/schema/provenance-index.ts: spec index building (outside this scope)
