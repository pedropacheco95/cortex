---
path: src/schema/checks/archive.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 191
size_tokens: 1942
centrality: medium
built_at_commit: "8248c76"
source_sha256: "64bd855bf6aa64af9c17bd3e77ebef08d28dc95504b0b275e9dff7523f14c097"
---
# src/schema/checks/archive.ts

## Purpose
Implements the three archive-module validator checks (schema §4.4 / Appendix A) that keep `.cortex/archive/` conformant: `checkArchiveLayout` verifies the required layout (`_index.md`, `register.md`, `types/`, and per-document `source.*` + `metadata.yaml` + `extracted/` under `documents/<slug>/`); `checkArchiveMetadata` validates each document's `metadata.yaml` frontmatter (`id` matches `archive.<slug>`, `kind` resolves to a declared type, `supersedes` paths resolve); `checkArchiveType` validates each `types/*.yaml` declaration's `id` matches its filename stem. All three tolerate the module being entirely absent, following the "spine" convention that every v3 module check must degrade gracefully when its directory doesn't exist yet.

## Connections
Uses:
- src/archive/formats.ts: `parseArchiveMetadata` and `parseArchiveTypeDef` — the actual YAML shape parsers; this file only orchestrates file-tree walking and calls into them for parsing/validation logic.
- src/schema/types.ts: `Violation` type for the return shape of all three checks.

Used by:
- src/schema/validate.ts: calls all three checks (`checkArchiveLayout`, `checkArchiveMetadata`, `checkArchiveType`) as part of the full validation run.

Semantically related (not imports):
- src/schema/checks/atlas.ts and src/schema/checks/compass.ts follow the same "tolerant of absent module" pattern and per-artefact frontmatter validation style.
