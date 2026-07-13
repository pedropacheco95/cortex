---
path: src/hooks/post-read.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 302
size_tokens: 3184
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "c2a3c66ac6d7c6fe5a3039cab72d50fd6dcfbe00079288b284ce3504ae8a13e0"
---
# src/hooks/post-read.ts

## Purpose
The PostToolUse Read hook — the capture half of refine-during-use. After a Read, silently sweeps the bounded transcript tail's recent assistant messages for `<cortex:purpose file="...">...</cortex:purpose>` tags emitted in response to PreRead's invitation, validates each payload (non-empty, single-line, ≤120 chars), and applies valid tags to the target's *existing* insight per-file entry: the `## Purpose` section's content is replaced with the corrected one-liner plus a read-time provenance trailer (`*(read-time, claude-sessions/<user>/<session-id>)*`). A tag whose file has no insight entry is dropped-and-remembered — extraction owns entry creation, this hook only refines what extraction already wrote. Always silent (exit 0, empty stdout); deterministic Core — it never calls an LLM, only parses what the session already said.

## Connections
Uses:
- src/insight/query.ts: `fileQuery` — resolves the tag's target to an existing insight entry (no entry, no write)
- src/insight/measure.ts: `computeSha256` — hashes each tag's file+payload for the applied-tag dedupe memory
- src/sessions/read.ts: `parseSessionJsonl`, `extractMessages` — parses the bounded transcript tail into role-tagged messages
- src/hooks/errors.ts: `appendHookError` — logs missing/unreadable transcripts, unreadable entries, and rejected writebacks
- src/pulse/migrate.ts: `renameIfLegacy` — self-heals the legacy flat `.readback-applied` into `state/readback-applied`
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only

Used by:
- src/hooks/cli.ts: dispatches `case 'post-read'` to this module's `run`
- src/hooks/pre-read.ts: imports `READ_TIME_MARKER` — governs whether PreRead's writeback invitation rides along on the entry's next fire

## Insights
- Only the `## Purpose` section is rewritten (`replacePurposeSection` slices from the heading to the next `##`, or end-of-file) — frontmatter and every other section stay byte-identical; an entry with no `## Purpose` heading at all is left untouched (shape-invalid, not this hook's job to fix).
- The applied-tag memory (`pulse/state/readback-applied`, one sha256 per tag) only prevents redundant re-application — it is not a correctness guard. A failed entry write is deliberately left OUT of that memory so the next PostRead fire retries it, while an *invalid* tag (bad payload, or file with no entry) IS remembered so it's never retried.
