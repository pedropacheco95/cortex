---
path: src/util/log.ts
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 2
size_lines: 84
size_tokens: 610
centrality: low
built_at_commit: 9f2c1ab
source_sha256: 0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0
---

# src/util/log.ts

## Purpose

Thin structured-logging wrapper: one `log(level, event, fields)` function that
serialises to JSON lines. Exists so call sites never touch the transport.

## Connections

Uses:
- (nothing project-local)
Used by:
- src/auth/session.ts: logs every auth decision
