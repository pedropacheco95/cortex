---
path: src/insight/l1-triage.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 254
size_tokens: 1754
centrality: medium
built_at_commit: "8248c76"
source_sha256: "fc66685de073d4be468658fcb6be0f1629486aafc15c8a35420806734e953154"
---
# src/insight/l1-triage.ts

## Purpose

Deterministic constant tables and pure predicate functions for the L1 pre-triage step: directory/file skip-lists (build artifacts, lockfiles, caches), sensitive-file pattern matching (credentials, keys, `.env`), binary detection (both by extension and by NUL-byte content sniffing), language labeling per extension, and mechanical-hub/barrel-file classification (index/README/CLAUDE.md-style files and majority-re-export files are excluded from the centrality ranking). Adapted near-verbatim from the Graphify extraction study's Axis-4 TAKE verdicts.

## Connections

Uses:
- (none src-internal)

Used by:
- src/insight/l1.ts: uses the skip-dir/sensitive-dir sets and `isSkipListedFile`/`isSensitiveFile`/`looksBinary`/`languageForExt`/`isMechanicalHubName`/`isBarrelFile` during the walk and per-file classification.
- src/insight/refresh-daily.ts: uses `languageForExt` to pick the significance-filter language for a changed file.
- src/insight/refresh-fast.ts: uses the skip-dir/sensitive-dir/binary-extension checks (via `isInsightScope`) and `languageForExt`.
