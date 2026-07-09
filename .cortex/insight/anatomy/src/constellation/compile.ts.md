---
path: src/constellation/compile.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 433
size_tokens: 4152
centrality: medium
built_at_commit: "8248c76"
source_sha256: "9786e844cf7edc7440c8bab9a7983c1751e6fa8610f5cca496001f798daf3dba"
---
# src/constellation/compile.ts

## Purpose
Reads the curated knowledge surfaces (compass rules/bugs/core files, atlas artefacts, both spec trees) and assembles the deterministic §4.9 citation graph — three top-level groups (compass/atlas/specs), globally-unique-id nodes, and edges resolved from frontmatter cross-references (`implements`, `depends_on`, `governed_by`, `source`, `related_specs`, `supersedes`, `sources`) — tolerating missing surfaces and dropping (and counting) dangling references rather than failing. `compile()` writes the result to `.cortex/constellation.json`; `assembleConstellation()` exposes the pure in-memory assembly for reuse by the insight-refresh loop.

## Connections
Uses:
- src/paths.ts: `specsRoot`, `businessRoot`, `SPECS_GLOB`, `BUSINESS_GLOB` — locates the two spec trees

Used by:
- src/constellation/server.ts: imports the `Constellation`/`ConstellationNode` types for the compiled map shape it reads and filters

Semantically related (not imports):
- src/cli/init.ts: dynamically imports `compile` to build the constellation as part of `cortex init`'s Rule 3 skeleton step
- src/cli/cli.ts: dynamically imports `compile` for the `cortex scan` verb
