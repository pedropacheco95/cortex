---
about: extraction-scope
permanence: changing
verified: "2026-07-08 (told)"
origin:
  - migrated:atlas/domain/extraction-scope.md@d7ed910
  - source:history/sources/2026-07-07-cortex-v3-reframe.md
aliases:
  - domain.extraction-scope
  - scope
---

A logically coherent subset of a codebase that can be analyzed as a unit during insight extraction, identified by Claude during the planning phase. Scopes may nest and may reference shared sub-scopes; each root scope runs as a parallel sub-agent, and a scope's granularity is judged by cohesion and shared-use rather than a fixed file count.
