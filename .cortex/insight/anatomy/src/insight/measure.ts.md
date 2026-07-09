---
path: src/insight/measure.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 17
size_tokens: 159
centrality: low
built_at_commit: "8248c76"
source_sha256: "29be10ac44b7fde112ac1f0970c0bc2edada010541c1f549406dcaea1153c11c"
---
# src/insight/measure.ts

## Purpose

Two tiny shared content-measure helpers: `computeSha256` (a source body's sha256 digest, used across hooks/loops/insight staleness comparisons) and `computeTokens` (the project-wide chars/4 token estimate, rounded up). Relocated verbatim from the retired `src/anatomy/files-md.ts`.

## Connections

Uses:
- (none src-internal — uses Node's `crypto` module only)

Used by:
- src/loops/onboarding-drift.ts: uses both measures (the only importer within this slice).

Semantically related (not imports):
- The sha256 algorithm here is the same one entry.ts/storage.ts validate frontmatter `source_sha256` fields against, though those modules don't import this file directly — the refresh-fast/refresh-daily tiers compute their own sha256 locally instead.
