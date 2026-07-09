---
path: src/loops/git-info.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 63
size_tokens: 495
centrality: medium
built_at_commit: "8248c76"
source_sha256: "b439b6ec6dd77e474e19f91a352aaeda4d600594c7a5e349d466aefa0788255e"
---

# src/loops/git-info.ts

## Purpose

A small shared read-only git query module consumed by three deterministic loops (`rule-decay`, `spec-drift`, `pulse/hygiene`): it wraps `execFile('git', …)` in a never-throwing promise (`gitExec`), provides a cheap repo-detection check (`isGitRepo`, tests for `.git` presence), and exposes `gitLastCommitEpoch` to get a project-relative path's last-commit unix-second timestamp (or `null` when untracked / not a repo). The header explicitly frames all git access here as "reading, never egress" per `pulse.hygiene` Rule 6, keeping this Core module deterministic — no LLM calls, no mutation, only local git history/ref reads.

## Connections

Uses: (none src-internal)

Used by:
- `src/loops/rule-decay.ts` — likely uses `gitLastCommitEpoch`/`isGitRepo` to judge how stale a rule's backing file is.
- `src/loops/spec-drift.ts` — likely uses the same to compare a spec file's last-commit time against its implementing code.
- `src/pulse/hygiene.ts` — uses git repo/commit-time checks as part of its deterministic hygiene sweep.

Semantically related (not imports): `src/loops/bug-triage.ts` and `src/loops/skill-suggest.ts` both wrap `execFile` with similar never-throwing error classification (`ok`/`missing`/timeout-style outcomes), though those wrap the `claude` binary for LLM judgments rather than `git` for read-only history.
