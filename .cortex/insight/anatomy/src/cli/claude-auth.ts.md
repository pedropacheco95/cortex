---
path: src/cli/claude-auth.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 17
size_tokens: 204
centrality: low
built_at_commit: "8248c76"
source_sha256: "b4140ae57b6d345236c926d61b82a3ef0c687328e51da525c3e7e9719833988a"
---
# src/cli/claude-auth.ts

## Purpose
Centralizes the one regex-based detection of a Claude CLI subprocess reporting an authentication failure (`AUTH_FAILURE_PATTERN` / `isAuthFailureOutput`), extracted out of `src/cli/init.ts` so every Core surface that spawns the Claude CLI headless — the writer/verifier harness and the loop modules — shares one detection contract instead of drifting independent copies.

## Connections
Uses:
- (none src-internal)

Used by:
- src/harness/run.ts: tests the combined stdout/stderr of writer/verifier subprocesses against `AUTH_FAILURE_PATTERN` to short-circuit to an `unavailable` harness outcome
- src/loops/bug-triage.ts: detects an unauthenticated Claude CLI subprocess in its own headless invocation (outside this scope)
- src/loops/skill-suggest.ts: same detection use (outside this scope)
- src/pulse/distil.ts: same detection use (outside this scope)
