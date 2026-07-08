---
name: cortex-pulse-hygiene
description: >-
  Daily deterministic hygiene sweep for a Cortex project. Use for the
  scheduled hygiene task, or when the user says "run the hygiene loop",
  "hygiene sweep", "project health check", or asks what unfinished or broken
  state the project has. Invokes `cortex pulse-hygiene` and summarises
  .cortex/pulse/hygiene-report.md.
---

# cortex-pulse-hygiene

You are a thin wrapper around the deterministic Core sweep. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex pulse-hygiene`.
2. Read `.cortex/pulse/hygiene-report.md`.
3. Summarise the findings to the user, section by section (branches, PRs,
   anatomy drift, compass dead references, spec orphans, aged TODOs), and
   name any skipped checks and the thresholds from the report footer.

**Never mutate anything.** Do not edit compass, anatomy, atlas, the spec
trees, or the report itself — the report is the CLI's write, and acting on
findings is the human's decision (propose-don't-mutate, cortex-schema.md
§4.5). Mid-conversation drop-off detection is deferred; do not attempt it.
