---
path: src/loops/bug-triage.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 576
size_tokens: 5556
centrality: medium
built_at_commit: "8248c76"
source_sha256: "a24f0ad080811ccbfe88dcfe207dbe16a6ffa67b01649ee4f33791725043f842"
---

# src/loops/bug-triage.ts

## Purpose

Implements `cortex loop-bug-triage`, the daily bug-ledger triage loop (spec `loops.bug-triage`): it scans `.cortex/compass/bugs/` for `status: open` bugs, partitions them into unclassified/classified in a `--collect` worklist, then applies a classification judgment's results back to the ledger under a strict "fill-only" mutation rule (Rule 3) — absent `type:`/`severity:`/`proposed_fix:` frontmatter fields are filled in, present fields are never overwritten, and disagreements are surfaced as reported divergences rather than silently applied. It supports three modes (`--collect`, `--report <file>`, and a bare mode that shells out to a headless `claude` subprocess for the judgment itself) and always writes `bug-triage.md` with Filled/Agreements/Divergences/Aged sections, even on degraded runs (no binary, timeout, auth failure). This is the one Core loop file permitted to mutate a gated ledger file directly, and only in this narrow, additive, idempotent way.

## Connections

Uses:
- `src/cli/claude-auth.ts` — `AUTH_FAILURE_PATTERN`, used to detect an unauthenticated Claude CLI in the bare-mode subprocess's combined stdout/stderr.
- `src/loops/report.ts` — `writePulseReport`, the shared always-write function used to emit `bug-triage.md` under `.cortex/pulse/`.
- `src/pulse/distil.ts` — `parseCandidatesFromOutput`, reused (despite the name) to extract the JSON results array from the headless judgment subprocess's stdout.

Used by: (none src-internal)
