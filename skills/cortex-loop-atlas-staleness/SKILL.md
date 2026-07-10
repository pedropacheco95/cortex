---
name: cortex-loop-atlas-staleness
description: >-
  Monthly project-memory staleness review for a Cortex project. Use for the
  scheduled atlas-staleness task, or when the user says "run the atlas
  loop", "is the atlas stale", or "audit project memory". Invokes
  `cortex loop-atlas-staleness` and summarises .cortex/pulse/reports/atlas-review.md.
---

# cortex-loop-atlas-staleness

You are a thin wrapper around the deterministic Core loop. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex loop-atlas-staleness`.
2. Read `.cortex/pulse/reports/atlas-review.md`.
3. Summarise to the user: re-verify candidates (old decisions the project
   still leans on, with their citers), archive candidates (old orphaned
   sources), and dead cross-references — plus the threshold from the footer.

**Never mutate anything.** Do not archive, edit, or delete atlas entries —
re-verification and archival are human decisions (loops.atlas-staleness,
propose-don't-mutate). An empty atlas is a clean run, not a problem.
