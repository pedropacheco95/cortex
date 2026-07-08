---
id: decision.2026-07-07-five-module-architecture
title: .cortex/ reorganizes to five modules (atlas, compass, archive, insight, pulse)
date: 2026-07-07T12:00:00Z
sources:
  - ../sources/cortex-v3-reframe.md
---

# .cortex/ reorganizes to five modules

On 2026-07-07 we chose to reorganize `.cortex/` into **five modules**, each an
evocative noun describing what the module *is*:

- **atlas** — reference knowledge: stakeholders, decisions, domain language (the
  "why").
- **compass** — enforceable rules, conventions, and bugs (the enforcement
  layer). **Renamed from v1's `cerebrum`** because that name didn't match what
  the module held.
- **archive** — ingested documents and their derived content (new module; see
  the ingestion pipeline).
- **insight** — inferred codebase understanding: rich per-file entries, concept
  graph, cluster assignments; ungated. **Absorbs v1's `anatomy` module**, which
  deprecates and disappears as a standalone directory.
- **pulse** — transient activity artifacts (loop outputs, working state);
  unchanged from v1.

We chose this because the v1 names were inconsistent (`cerebrum` didn't describe
its contents) and there were two overlapping modules for codebase understanding
(`anatomy` alongside the new insight work). One family of descriptive nouns,
one home per concern.

Per the owner's versioning call this ships as v3 layered on v2; the source's
"v2" labels for this reorganization should be read as v3.

See source: atlas/sources/cortex-v3-reframe.md ("The five-module architecture",
"Anatomy-insight relationship").
