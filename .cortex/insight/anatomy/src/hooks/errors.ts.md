---
path: src/hooks/errors.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 102
size_tokens: 921
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "b612b68aefbea5b3142e1381ed3f813c6b3b538b6980b07817646744c5882c3e"
---
# src/hooks/errors.ts

## Purpose
Implements the shared hooks' degradation log at `.cortex/pulse/reports/hook-errors.md` (schema §4.5) — appends one structured entry per internal hook error (hook name, file, failure, iso-datetime), capping the file at the most recent 100 entries. The appender itself is wrapped so it can never throw, since it IS the degradation path for the warn-never-block invariant (RULES.md rule 6) — a failure logging a failure must not itself fail.

## Connections
Uses:
- src/pulse/migrate.ts: `renameIfLegacy` — self-heals a legacy flat `.cortex/pulse/hook-errors.md` into `reports/hook-errors.md` the first time a hook touches it this session (before any loop has run the full pulse migration)

Used by:
- src/hooks/pre-read.ts: `appendHookError` — logs unreadable insight entries and read-memory write failures
- src/hooks/pre-write.ts: `appendHookError` — logs malformed compass rule files and invalid check patterns
- src/hooks/session-start.ts: `appendHookError` — logs unparseable config and malformed hygiene reports
- src/insight/refresh-fast.ts: `appendHookError` — logs its own internal degradations (outside this scope)
