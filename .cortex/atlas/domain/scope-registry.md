---
id: domain.scope-registry
term: scope-registry
definition: The structure Claude's planning phase builds to track extraction scopes, their paths, their depends_on relationships, and which parents share them (shared_by). It determines execution order and prevents redundant work — a scope shared by multiple parents is extracted once and referenced from each.
sources:
  - ../sources/cortex-v3-reframe.md
---
