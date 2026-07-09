---
path: src/insight/l1-parse.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 398
size_tokens: 3082
centrality: low
built_at_commit: "8248c76"
source_sha256: "439c21d92a7d86066ee3df3cf617a01dd0b17fcd28610688d2e79d1d86c7f4ea"
---
# src/insight/l1-parse.ts

## Purpose

Tree-sitter-backed structural extraction for the L1 pass: per-language (TS/JS, Python, Rust, Go) purpose/imports/definitions extraction from a parsed syntax tree, plus the single relative-import resolver (`resolveImport`) that every import-graph consumer in the codebase shares. Loads WASM grammars lazily and caches parsers per grammar name.

## Connections

Uses:
- (none src-internal — loads `web-tree-sitter` and `tree-sitter-wasms` directly)

Used by:
- src/insight/l1.ts: calls `extract()` per included file to get definitions/imports/purpose, and `resolveImport()` as the base of its own NodeNext-aware resolver.
