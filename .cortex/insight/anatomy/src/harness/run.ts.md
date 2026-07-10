---
path: src/harness/run.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 509
size_tokens: 4859
centrality: low
built_at_commit: "8248c76"
source_sha256: "2fac16cdbc66af4c2c69aa8d14ab8b36bb4fff9bef5635c2a1b2ace284ee34f0"
---
# src/harness/run.ts

## Purpose
The deterministic writer/verifier sub-agent harness (spec loops.writer-verifier) — spawns two independent headless Claude CLI subprocesses in a bounded retry loop: a writer that edits an isolated workspace (a detached git worktree, or a temp copy for non-git roots) against a brief, and a verifier that judges only the resulting diff plus check output, never seeing the writer's stdout or reasoning. Computes the diff itself (`git diff` for worktrees, a hand-rolled recursive file comparison for copies) and always cleans up the workspace via `finally`, with a stale-workspace sweep at the start of every run to self-heal after a killed process.

## Connections
Uses:
- src/cli/claude-auth.ts: `AUTH_FAILURE_PATTERN` — detects an unauthenticated Claude CLI subprocess and short-circuits to an `unavailable` outcome

Used by:
- (none src-internal in this slice — consumed dynamically, most likely by a test-runner loop module outside this scope)

## Insights

- Includes a stale-worktree sweep/prune (bug B-002): if the harness is killed mid-run (e.g. a stub reading stdin times out), `finally` cleanup never runs and a `cortex-harness-*` git worktree is orphaned against the real repo; the sweep reclaims these on a later run rather than relying on a clean exit. (claude-sessions/pedropacheco1/75ef81a0-97bd-4fa1-8c2a-72ddb2d98405)
