---
path: src/compass/git-head.ts
extracted_at: 2026-09-22T09:55:29Z
extraction_level: 2
size_lines: 109
size_tokens: 976
centrality: medium
built_at_commit: "a66041b"
source_sha256: "b6c118c7d0671ac3bc52e19cdf46d8674fff99df0c814d0d0ee6816cfe7eff4d"
---
# src/compass/git-head.ts

## Purpose

A dependency-free reader of the current HEAD commit's short sha, built for `compass.bug-currency` Rule 4 (schema §4.2, 3.4 fifth revision). Because Core is forbidden from spawning `git` (rule R-001, RULES.md rule 3), `readHeadCommit` reimplements the file-reading half of `git rev-parse --short HEAD` by hand: it locates the git directory (`gitDirOf`, following a `.git` directory or resolving one hop of a linked-worktree's `gitdir:` pointer file), finds the ref-common directory (`commonDirOf`, following one hop of a worktree's `commondir` file), reads `HEAD` and resolves a symbolic ref (`resolveRef`) either from a loose ref file or by scanning `packed-refs` line-by-line. Every read is wrapped and the whole pipeline returns `null` — never throws — for anything it cannot read or understand: a missing directory, a detached-but-malformed HEAD, an unresolvable ref. The result is the first 7 lowercase hex characters of the resolved 40-char sha, matching git's default short-sha width. Bug files stamp `found_at_commit` from this helper's output.

## Connections

Uses:
- (none src-internal — pure `fs`/`path`, no project imports)

Used by:
- src/pulse/thread-cli.ts — calls `readHeadCommit(root)` to stamp `foundAt` when promoting a thread to a bug/rule file, giving the artefact its `found_at_commit` provenance.
- tests/atomic/compass/git-head.test.ts — unit coverage of the four internal helpers (`gitDirOf`, `commonDirOf`, `resolveRef`, `readHeadCommit`) across the three checkout layouts (plain `.git` dir, detached HEAD, linked worktree).
- tests/spec/compass/bug-currency.spec.test.ts — integrated-slice coverage confirming a freshly-filed bug's `found_at_commit` matches this helper's read of the real checkout.
