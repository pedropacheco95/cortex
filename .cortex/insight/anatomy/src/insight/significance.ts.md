---
path: src/insight/significance.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 208
size_tokens: 2209
centrality: medium
built_at_commit: "8248c76"
source_sha256: "a49cfb2d0ae66c463179ee0cb34c851cbb2ea6512d8cb7ddd484a821507ad326"
---
# src/insight/significance.ts

## Purpose

The Core structural significance filter shared by the fast and daily refresh tiers: pure, deterministic content-comparison heuristics that rule out formatting-only/comment-only/whitespace-only/import-reordering changes as `cosmetic` (never reaching L2/L3), and classify surviving changes as `real` (small, L2-worthy), `significant-candidate` (exports added/removed, large size delta, or large change ratio — L3-worthy), or `uncertain` (mid-band — routed to Haiku triage). Comment-stripping is a documented heuristic, not a tokenizer — it spares `//` inside URL-like strings via a whitespace/line-start check.

## Connections

Uses:
- (none src-internal — pure functions only)

Used by:
- src/insight/refresh-daily.ts: `classifyChange` to classify each flagged file's change during `--collect`.
- src/insight/refresh-fast.ts: `classifyChange` to filter out cosmetic changes before ever flagging a file.
