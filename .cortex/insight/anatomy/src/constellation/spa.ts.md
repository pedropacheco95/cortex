---
path: src/constellation/spa.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 145
size_tokens: 1438
centrality: low
built_at_commit: "8248c76"
source_sha256: "7ab24fe7a7c0d31e2902e9cb0ac647164ea825ea6fb9bc5eb93362b308397b80"
---
# src/constellation/spa.ts

## Purpose
A single static HTML string implementing the constellation renderer's browser-side page — a Cytoscape.js graph using compound nodes for the group/child hierarchy, a preset switcher (`default`/`orphans`/`domain`) that fetches `/api/constellation`, and a coverage-counter footer. Deliberately minimal chrome with no animation; all graph computation happens server-side, the browser only renders what the API returns.

## Connections
Uses:
- (none src-internal)

Used by:
- src/constellation/server.ts: serves `SPA_HTML` verbatim at the `/` route
