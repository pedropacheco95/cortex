---
name: cortex-loop-onboarding-drift
description: >-
  Monthly scaffolding-drift review for a Cortex project. Use for the
  scheduled onboarding-drift task, or when the user says "run the
  onboarding-drift loop", "is the scaffolding current", or "check the
  CLAUDE.md block and indexes". Invokes `cortex loop-onboarding-drift` and
  summarises .cortex/pulse/reports/scaffolding-review.md.
---

# cortex-loop-onboarding-drift

You are a thin wrapper around the deterministic Core loop. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex loop-onboarding-drift`.
2. Read `.cortex/pulse/reports/scaffolding-review.md`.
3. Summarise the refresh proposals to the user: managed-block version drift,
   malformed or over-budget `_index.md` prompts, and never-localised template
   indexes (flagged as heuristic hints) — with the proposed refresh actions.

**Never mutate anything.** Do not run `cortex init --force`, edit CLAUDE.md,
or rewrite any `_index.md` — refreshing is the human's action
(loops.onboarding-drift, propose-don't-mutate).
