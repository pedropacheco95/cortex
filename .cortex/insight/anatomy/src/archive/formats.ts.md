---
path: src/archive/formats.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 263
size_tokens: 2629
centrality: low
built_at_commit: "8248c76"
source_sha256: "03d8d1f1bcd89e507072668ddde57d8472afb8ee767f1675c3906c344b54a71c"
---
# src/archive/formats.ts

## Purpose
Defines the shared types and pure parse/validate helpers for the two archive-module YAML shapes described in cortex-schema.md §4.4 — `metadata.yaml` (per-document status/version/supersedes) and `types/*.yaml` (document-type classification plus the extraction-output contract) — reusing gray-matter's own YAML engine (by wrapping raw content in `---` frontmatter delimiters) rather than adding a new top-level YAML dependency. Pure module: no fs, no LLM; callers read files and pass in already-in-memory strings.

## Connections
Uses:
- (none src-internal)

Used by:
- src/insight/storage.ts: consumes the `ArchiveMetadata`/`ArchiveTypeDef` shapes and parse helpers this module defines
- src/schema/checks/archive.ts: calls `parseArchiveMetadata` and `parseArchiveTypeDef` to validate `.cortex/archive/` documents and type declarations
