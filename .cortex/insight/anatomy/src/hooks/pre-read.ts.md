---
path: src/hooks/pre-read.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 224
size_tokens: 2357
centrality: medium
built_at_commit: "8248c76"
source_sha256: "9d7bc4ffb6854dda923358a970726d79881f9e2217ccd1ac40498244c4bf2ff2"
---
# src/hooks/pre-read.ts

## Purpose
The PreToolUse Read hook — before a file read, injects a one-line summary sourced from the target's insight per-file entry (first line of `## Purpose`, `size_tokens`, applicable compass rule ids) plus a writeback-invitation instruction (unless the entry already carries a read-time provenance marker) and a duplicate-read note via per-session read-memory. Silent whenever there's no `.cortex/`, the `hooks.preRead` flag is off, or the target has no insight entry — extraction owns entry creation, this hook never fabricates one.

## Connections
Uses:
- src/hooks/errors.ts: `appendHookError` — logs unreadable insight entries and read-memory write failures
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only
- src/insight/query.ts: `fileQuery` — the read-only insight lookup this hook's whole payload is built from

Used by:
- src/hooks/cli.ts: dispatches `case 'pre-read'` to this module's `run`

Semantically related (not imports):
- src/hooks/post-read.ts: shares the `READ_TIME_MARKER` constant (imported at line 27) that governs whether the writeback invitation rides along — post-read is out of this scope's slice (L1 misclassified it as binary)
