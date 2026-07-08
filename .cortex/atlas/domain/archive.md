---
id: domain.archive
term: archive
definition: A new .cortex/ module holding ingested documents and the structured content extracted from them, one directory per document under archive/documents/ plus a browsable register.md and per-type extraction schemas in archive/types/. Every authoritative document that authorizes downstream rules, specs, or decisions enters through this pipeline, and superseded versions are preserved for audit.
sources:
  - ../sources/cortex-v3-reframe.md
---
