---
path: src/insight/l1-triage.ts
extracted_at: 2026-07-14T01:10:58Z
extraction_level: 2
size_lines: 259
size_tokens: 1789
centrality: medium
built_at_commit: "c170f95"
source_sha256: "897d6d3f8b7030456dfda2c4ec9bb473aa62b0ebe1e2aaff7855afe7e23ee240"
---
# src/insight/l1-triage.ts

## Purpose

Deterministic constant tables and pure predicate functions for the L1 pre-triage step: directory/file skip-lists (build artifacts, lockfiles, caches, plus Cortex's own meta-directories `.cortex`/`.specflow`/`.claude` — insight is understanding of the code, not of the knowledge layer, specs, or skill/settings bundles), sensitive-file pattern matching (credentials, keys, `.env`), binary detection (both by extension and by NUL-byte content sniffing), language labeling per extension, and mechanical-hub/barrel-file classification (index/README/CLAUDE.md-style files and majority-re-export files are excluded from the centrality ranking). Adapted near-verbatim from the Graphify extraction study's Axis-4 TAKE verdicts.

## Connections

Uses:
- (none src-internal)

Used by:
- src/insight/l1.ts: uses the skip-dir/sensitive-dir sets and `isSkipListedFile`/`isSensitiveFile`/`looksBinary`/`languageForExt`/`isMechanicalHubName`/`isBarrelFile` during the walk and per-file classification.
- src/insight/refresh-daily.ts: uses `languageForExt` to pick the significance-filter language for a changed file.
- src/insight/refresh-fast.ts: uses the skip-dir/sensitive-dir/binary-extension checks (via `isInsightScope`) and `languageForExt`.
