---
path: src/schema/checks/scenario.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 54
size_tokens: 441
centrality: medium
built_at_commit: "8248c76"
source_sha256: "59434fcd787369e1a2840791ed19b277b3f820b0e8cb481224cf2e2a9860c28b"
---
# src/schema/checks/scenario.ts

## Purpose
Validates scenario spec files (schema §4.8) under `tests/scenario/specs/`: each file's frontmatter `name` field must match its own filename stem, and each entry in its `covers` list must resolve (via the project index) to a real business spec ID. This is the mechanical link between the scenario test layer and the business spec tree it exercises.

## Connections
Uses:
- src/schema/index-build.ts: `ProjectIndex`, `resolveId`.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkScenarios(root, index)`.

Semantically related (not imports):
- This validates the same `tests/scenario/specs/` directory the specflow-tests skill generates scenario tests into, and that src/schema/index-build.ts's `buildIndex` scans as one of its index patterns.
