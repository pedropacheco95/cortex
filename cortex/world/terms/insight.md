---
about: insight
permanence: changing
verified: "2026-07-08 (told)"
origin:
  - migrated:atlas/domain/insight.md@d7ed910
  - source:history/sources/2026-07-07-cortex-v3-reframe.md
aliases:
  - domain.insight
  - insight layer
---

The load-bearing .cortex/ module that holds Cortex's persistent, queryable, actively-refreshed understanding of a codebase — rich per-file entries, concept graph, and cluster assignments produced by LLM extraction. It is ungated (inferred context rather than authority — where it conflicts with a compass rule or a spec, the gated layer wins) and it absorbs v1's anatomy module.
