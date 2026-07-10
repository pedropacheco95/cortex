---
name: cortex-loop-spec-drift
description: >-
  Daily spec-content drift detector for a Cortex project. Use for the
  scheduled spec-drift task, or when the user says "run the spec-drift
  loop", "have the specs drifted", or "which specs lag their code". Invokes
  `cortex loop-spec-drift` and summarises .cortex/pulse/reports/spec-drift.md.
---

# cortex-loop-spec-drift

You are a thin wrapper around the deterministic Core loop. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex loop-spec-drift`.
2. Read `.cortex/pulse/reports/spec-drift.md`.
3. Summarise the suspects to the user: each spec, its newer governed files
   with both dates, and the three possible readings (spec wrong /
   implementation regressed / new ACs needed). Mention specs noted as not in
   git history and the grace window from the footer.

**Never mutate anything.** Do not edit specs or code, and do not classify the
drift yourself — classification belongs to the human or to `specflow-bugs`
(loops.spec-drift, propose-don't-mutate).
