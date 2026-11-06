---
about: "Superseded at schema 4.0, which has no insight layer. Was: initial extraction is a plan not a pipeline — scoped, recursive, with a cross-scope unification pass"
permanence: changing
verified: "2026-11-06 (told)"
origin:
  - migrated:atlas/decisions/2026-07-07-scoped-extraction.md@d7ed910
  - source:history/sources/2026-07-07-cortex-v3-reframe.md
  - session:13ecca9a-2346-4535-8492-95892e9bd065
aliases:
  - decision.2026-07-07-scoped-extraction
  - 2026-07-07-scoped-extraction
---

## Answer

**Superseded by schema 4.0.** A 4.0 store has no insight layer: insight is dropped by decision and not migrated (schema S9.3, `store.migrate` Rule 12), so there is nothing to extract. This repo accepted 4.0 on 2026-10-19. The text below is the 3.x answer, kept as the record.

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

## Why

The reasons are part of the answer above: a 3.x narrative decision, migrated verbatim.

## Rejected

none recorded
