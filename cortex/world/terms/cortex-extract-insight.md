---
about: cortex-extract-insight
permanence: changing
verified: "2026-11-05 (observed)"
origin:
  - migrated:atlas/domain/cortex-extract-insight.md@d7ed910
  - source:history/sources/2026-07-07-cortex-v3-reframe.md
aliases:
  - domain.cortex-extract-insight
---

The Claude Code skill (deliberately not a CLI command, with no CLI wrapper) that runs the insight extraction pipeline — orchestrating the Level 1 structural pass, planning, scoped parallel execution, and cross-scope unification, with progress reporting and crash-resumable checkpointing. Invoked from Claude Code sessions and from scheduled tasks, positioning Cortex as infrastructure on top of Claude Code.

The package stopped shipping this skill on 2026-11-05 (owner decision P12). A project on the 3.x store keeps its installed copy until it migrates.
