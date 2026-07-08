---
id: B-005
title: init --force overwrites human-localised _index.md prompts with shipped templates
type: missing-criterion
severity: low
status: open
affects:
  - core-cli.init
  - src/cli/init.ts
proposed_fix: Add a Rule/AC to core-cli.init treating localised _index.md files like preferences.md — never overwritten even under --force (or overwritten only with a per-file prompt). Detection is cheap; init already ships the templates, so byte-comparison identifies localised copies. Restore-and-regress test included.
opened: 2026-07-03T16:04:01Z
---

# B-005 — --force clobbers localised index prompts

## Evidence

Reconciliation round's closing verification: onboarding-drift re-flagged `cerebrum/rules/_index.md` and `bugs/_index.md` as template-identical — both were localised in the constellation round, then silently reverted by the `init --force` re-runs in the read-time and awareness rounds.

## Diagnosis (seven-type classification)

init Rule 16 permits --force-gated overwrites and Rule 3 writes skeleton indexes; no criterion protects a *localised* index. The curation-preserving carve-out exists for `preferences.md`/`dismissed.md` but not for index prompts, which the scaffolding-review loop treats as curatable. **type: missing-criterion.**
