---
path: src/pulse/promote.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 129
size_tokens: 1326
centrality: low
built_at_commit: "8248c76"
source_sha256: "74c30f819017e8a95364c8d68ff4040526d1fbc3a73a42bf2a69f1a5c3abeac0"
---

## Purpose

Computes the side-effects of accepting a `promotion` suggestion (schema §4.5.1 `promotion`, §4.10.4): given a suggestion whose `**Source:**` field names an insight file it graduates from, `planPromotion` extracts that insight source path, computes the landed content for the gated compass/atlas target (injecting a `source:` back-reference into frontmatter for a create, or appending a source-reference trailer for an append), and computes the updated insight-original content with a `_(promoted <date> → <target> via <id>)_` trailer appended — the insight original is marked, never deleted. This module only computes the plan (`PromotionPlan` or a `PromotionRefusal` when the insight source is missing/unnamed/nonexistent); `src/pulse/review.ts` owns actually writing both files as one atomic transaction, so a missing insight source is a refusal that blocks the whole accept rather than a partial write.

## Connections

Uses: (none src-internal — only Node `fs`/`path`)

Used by:
- `src/pulse/review.ts` — calls `planPromotion` (and presumably `extractInsightSource`/`promotedTrailer`) as the compute step of its transactional promotion-accept flow, then performs the actual atomic writes itself.
