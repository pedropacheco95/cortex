---
path: src/hooks/post-write.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 22
size_tokens: 253
centrality: medium
built_at_commit: "8248c76"
source_sha256: "cebcaa89763a414a5fe66cd5c38b70220166b4d02c6a160aebc2d956d169dcf0"
---
# src/hooks/post-write.ts

## Purpose
The PostToolUse Write|Edit hook — a deliberate pure no-op retained only because its registration is part of `cortex init`'s settings.json contract. The v2.0 anatomy writeback it used to perform (tokens/sha256/last_seen/needs_purpose_refresh) was removed with the anatomy module at build-order-v3 step 7, with no v3 replacement: intra-commit change tracking now belongs to the post-commit `cortex insight-refresh-fast` tier instead.

## Connections
Uses:
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only — no runtime dependency

Used by:
- src/hooks/cli.ts: dispatches `case 'post-write'` to this module's `run`
