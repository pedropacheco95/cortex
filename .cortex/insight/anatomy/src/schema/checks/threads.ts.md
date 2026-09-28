---
path: src/schema/checks/threads.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 128
size_tokens: 1450
centrality: medium
built_at_commit: "a66041b"
source_sha256: "ce99df7c75c6337c724bec78ccc1a63d9b194632ffa7d1015debd4b724415d78"
---
# src/schema/checks/threads.ts

## Purpose
Implements `check.threads` (schema §4.5.3, new at 3.3 third revision): validates every `.cortex/pulse/threads/*.md` ledger file, entirely at `warning` severity like the rest of pulse. Checks: `id` matches `T-\d{3,}` and agrees with the filename prefix, and is unique across the directory; `kind`/`status` are each in their closed enums (`THREAD_KINDS`/`THREAD_STATUSES`); `opened`/`expires` are iso-datetimes; `answered`/`resolved_by` are present if and only if `status: answered` (present-when-not-answered is also flagged); `session` is a well-formed `claude-sessions/<user>/<id>` citation (cited-not-resolved, per §6) and `sessions` a non-empty list of the same; `bears_on` is a list of strings, shape-only — entries here are never resolved (unlike the gated decisions/evidence carriers `check.bears-on` covers). The `threads/` directory is created on demand by the SessionEnd hook, so its absence is not a finding. `check.pulse` explicitly skips `threads/**` so no file is checked by both.

## Connections
Uses:
- src/insight/storage.ts: `isIsoDatetime` — the shared datetime-shape helper.
- src/pulse/threads.ts: `THREAD_KINDS`, `THREAD_STATUSES`, `THREADS_DIR` — the thread ledger's own enums and directory constant, kept as the single source of truth outside this validator.
- src/schema/provenance-index.ts: `CLAUDE_SESSION_REF_PATTERN` — the same claude-sessions ref grammar `check.insight-observations` reuses, so the two checks never silently drift on what counts as a well-formed session citation.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkThreads(root)`.
- tests/atomic/schema/threads-check.test.ts: the dedicated atomic-layer test.

Semantically related (not imports):
- src/schema/checks/pulse.ts is this file's explicit partner via the `threads/**` skip in `checkPulse`.
- src/schema/checks/bears-on.ts resolves `bears_on` for decisions/evidence but NOT for threads — this file's `bears_on` check stays shape-only by design, since threads are an ungated surface.

## Query pointers
If you need the thread lifecycle end to end (creation, expiry, answering), also read: src/pulse/threads.ts and the SessionEnd hook that creates the directory on demand. If you need the claude-sessions citation grammar, also read: src/schema/provenance-index.ts.
