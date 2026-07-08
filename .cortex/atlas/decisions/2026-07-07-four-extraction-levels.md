---
id: decision.2026-07-07-four-extraction-levels
title: Insight extraction runs at four levels with a configurable per-project target
date: 2026-07-07T12:00:00Z
sources:
  - ../sources/cortex-v3-reframe.md
---

# Four insight extraction levels

On 2026-07-07 we chose to run insight extraction at **four distinct levels**,
each with its own role and cost profile, with the target level configurable per
project:

- **Level 1 — Structural.** Tree-sitter parse, import/export graph, file sizes,
  entry points, module structure, centrality analysis. Deterministic, no LLM;
  minutes.
- **Level 2 — Purpose.** LLM pass (Sonnet) per file producing a one-paragraph
  purpose grounded in the file's content plus Level 1 context; tens of minutes.
- **Level 3 — Deep understanding.** LLM pass (Sonnet, multi-agent) on files
  centrality-identified as important: main players, insights, patterns, quirks,
  file map for large files; hours.
- **Level 4 — Cross-file semantic graph.** LLM inference (Sonnet) over Level 3
  outputs: concept extraction, cross-file semantic edges, pattern and convention
  detection; hours to days.

We chose the level split because understanding has a genuine cost gradient —
structure is cheap and deterministic, deep semantic inference is expensive — and
projects differ in how deep they need to go, so the target level should be a
per-project configuration rather than a fixed pipeline.

See source: atlas/sources/cortex-v3-reframe.md ("The four extraction levels").
