---
id: decision.2026-07-07-cortex-v3-reframe
title: Cortex reframed as a codebase-understanding system with insight as the load-bearing module
date: 2026-07-07T12:00:00Z
sources:
  - ../sources/cortex-v3-reframe.md
---

# Cortex reframed as a codebase-understanding system

On 2026-07-07 we chose to reframe Cortex as, first and foremost, a
**codebase-understanding system** — its persistence layer, self-maintenance
loops, and spec-driven capabilities are properties that support the
understanding, not the point of the system. The load-bearing thesis: Cortex
maintains a persistent, queryable, actively-refreshed understanding of a
codebase deep enough that Claude behaves like it knows the codebase, including
on codebases the user hasn't extensively worked in. The **insight layer**
(`.cortex/insight/`) is the load-bearing module that holds this understanding —
persistent, queryable, actively refreshed, deep, and ungated.

We chose this because existing tools only address slices: Understand Anything
does fast structural indexing; Graphify does deeper LLM extraction but as a
one-shot artifact that goes stale; neither treats Claude as the primary user or
integrates a persistent cross-session layer.

**Versioning framing (owner decision, this session):** this reframe is planned
as a **separate next-major version (v3) layered on top of the already-shipped v2
foundation — not a rework of v2 in place.** The source document is written in
"v2" language throughout because it predates that call; where it says "v2" for
the new insight/archive/compass work, read "v3". The shipped v2 system stands;
v3 builds on it.

See source: atlas/sources/cortex-v3-reframe.md ("What Cortex actually is
(reframe)", "The insight layer").
