---
id: B-002
title: A killed harness process orphans its worktree with no recovery path
type: missing-criterion
severity: low
status: open
affects:
  - loops.writer-verifier
  - src/harness/run.ts
proposed_fix: Add a Rule + AC to loops.writer-verifier for crash recovery — on startup, runWriterVerifier sweeps stale cortex-harness-* workspace dirs (older than a threshold) and prunes orphaned git worktrees for root — then implement the sweep with a regression test (plant a stale workspace, assert it is removed and git worktree list is clean).
opened: 2026-07-02T19:17:02Z
---

# B-002 — Killed harness process orphans its worktree

## Evidence

Real-repo verification, harness round: the first probe run was SIGKILLed by a shell timeout mid-iteration (a stub bug caused the hang). The harness's `finally` cleanup never ran — no code survives SIGKILL — leaving `/var/folders/.../cortex-harness-7QPoxW/workspace` registered as a worktree of the live repo. `git worktree prune` alone did not remove it (the directory still existed). Cleaned manually.

## Diagnosis (seven-type classification)

Spec Rule 2 pins cleanup via `finally`, which is correct for every in-process failure — but the spec has no criterion for the process-killed case, so the implementation is conformant while the gap is real. **type: missing-criterion** — the dev spec exists but lacks an AC for crash recovery.

## Intended semantics

Workspace dirs are predictably named (`cortex-harness-*`); a startup sweep in `runWriterVerifier` removes stale ones and prunes orphaned worktrees before creating a new workspace. Alternative/complement: the hygiene loop flags them. Sweep-at-startup is self-contained and needs no scheduling.
