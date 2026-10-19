---
about: scope-registry
permanence: changing
verified: "2026-07-08 (told)"
origin:
  - migrated:atlas/domain/scope-registry.md@d7ed910
  - source:history/sources/2026-07-07-cortex-v3-reframe.md
aliases:
  - domain.scope-registry
---

The structure Claude's planning phase builds to track extraction scopes, their paths, their depends_on relationships, and which parents share them (shared_by). It determines execution order and prevents redundant work — a scope shared by multiple parents is extracted once and referenced from each.
