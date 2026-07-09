---
path: src/hooks/errors.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 97
size_tokens: 799
centrality: medium
built_at_commit: "8248c76"
source_sha256: "b842e53b67132dcd84d53df70880a054d83a68f949c488d202af17605bffa9cd"
---
# src/hooks/errors.ts

## Purpose
Implements the shared hooks' degradation log at `.cortex/pulse/hook-errors.md` (schema §4.5) — appends one structured entry per internal hook error (hook name, file, failure, iso-datetime), capping the file at the most recent 100 entries. The appender itself is wrapped so it can never throw, since it IS the degradation path for the warn-never-block invariant (RULES.md rule 6) — a failure logging a failure must not itself fail.

## Connections
Uses:
- (none src-internal)

Used by:
- src/hooks/pre-read.ts: `appendHookError` — logs unreadable insight entries and read-memory write failures
- src/hooks/pre-write.ts: `appendHookError` — logs malformed compass rule files and invalid check patterns
- src/hooks/session-start.ts: `appendHookError` — logs unparseable config and malformed hygiene reports
- src/insight/refresh-fast.ts: `appendHookError` — logs its own internal degradations (outside this scope)
