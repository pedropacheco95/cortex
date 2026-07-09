---
path: src/constellation/server.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 224
size_tokens: 2207
centrality: medium
built_at_commit: "8248c76"
source_sha256: "94a8b2d24034ffecce8f1a0f9ab87f486af1791ec0e661a5db96a374bec7c561"
---
# src/constellation/server.ts

## Purpose
A localhost-only, read-only Node HTTP server that re-reads `.cortex/constellation.json` per request, filters it through one of three locked presets (`default`/`orphans`/`domain`), and serves the single-page Cytoscape renderer plus its vendored JS bundle and the `/api/constellation` JSON endpoint. Never writes and never invokes the compiler itself — a stale or missing map reports 404 rather than triggering a rebuild.

## Connections
Uses:
- src/constellation/compile.ts: `Constellation`, `ConstellationNode` types for the compiled map shape it reads and filters
- src/constellation/spa.ts: `SPA_HTML` — the static page served at `/`

Used by:
- (none src-internal — imported dynamically by src/cli/cli.ts for the `cortex constellation` verb, invisible to the static slice)
