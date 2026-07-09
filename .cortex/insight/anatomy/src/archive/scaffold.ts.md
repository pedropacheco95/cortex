---
path: src/archive/scaffold.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 75
size_tokens: 800
centrality: medium
built_at_commit: "8248c76"
source_sha256: "d7c55d9b0d42f3819454cb42a5324e0aec58752ab9bbfe955cc29533f44fb8de"
---
# src/archive/scaffold.ts

## Purpose
Idempotently scaffolds the `.cortex/archive/` module directory tree at init time — `_index.md` (the §7.1 active prompt), `register.md` (human-readable document index), and the empty `documents/` and `types/` directories — using templates from `cli/templates.ts`. Never clobbers an existing `_index.md`/`register.md`, and deliberately seeds no starter document or type file (a judgment call recorded in this file's own doc comment, mirroring how `insight/map/` ships with no seeded content).

## Connections
Uses:
- src/cli/templates.ts: imports `ARCHIVE_INDEX_TEMPLATE` and `ARCHIVE_REGISTER_TEMPLATE` to write the two committed skeleton files

Used by:
- src/cli/init.ts: calls `scaffoldArchive(cortexRoot)` as part of the Rule 3 skeleton step of `cortex init`
