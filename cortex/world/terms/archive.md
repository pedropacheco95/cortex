---
about: archive
permanence: changing
verified: "2026-07-08 (told)"
origin:
  - migrated:atlas/domain/archive.md@d7ed910
  - source:history/sources/2026-07-07-cortex-v3-reframe.md
aliases:
  - domain.archive
---

A new .cortex/ module holding ingested documents and the structured content extracted from them, one directory per document under archive/documents/ plus a browsable register.md and per-type extraction schemas in archive/types/. Every authoritative document that authorizes downstream rules, specs, or decisions enters through this pipeline, and superseded versions are preserved for audit.
