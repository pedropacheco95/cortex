---
id: decision.2026-07-07-scoped-extraction
title: Initial extraction is a plan not a pipeline — scoped, recursive, with a cross-scope unification pass
date: 2026-07-07T12:00:00Z
sources:
  - ../sources/cortex-v3-reframe.md
---

# Initial extraction is a plan, not a pipeline

On 2026-07-07 we chose to make initial insight extraction a **plan, not a fixed
pipeline**: after a deterministic Level 1 structural pass, Claude reads the
output and drafts an extraction plan that identifies **logically coherent
scopes** — subsets of the codebase analyzable as units, which may nest and may
reference shared sub-scopes. A **scope registry** tracks scope dependencies and
shared references so shared scopes are extracted once and referenced from every
parent (deduplication), and execution order respects dependencies. Claude
**recurses** on scopes still too large, decomposing them with the same planning
process until each leaf scope fits a single agent; granularity is Claude's
judgment based on cohesion and shared-use, not a fixed file count. After all
scopes complete, a final **cross-scope unification pass** (Level 4 for the whole
codebase) produces the ambient global understanding that keeps scope-level
insights from being siloed.

We chose this because a fresh, large codebase can't be understood by a single
uniform sweep — coherent boundaries and shared modules need judgment, and
without the unification pass scoped analyses would stay disconnected.

**Delivery:** via the `cortex-extract-insight` **skill**, invoked from Claude
Code sessions and scheduled tasks — deliberately **no CLI wrapper**, positioning
Cortex as infrastructure on top of Claude Code rather than a replacement for it.

See source: atlas/sources/cortex-v3-reframe.md ("Initial extraction — the
primary capability", "Extraction skill").
