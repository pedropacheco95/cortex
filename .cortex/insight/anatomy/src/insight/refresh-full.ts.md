---
path: src/insight/refresh-full.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 301
size_tokens: 2884
centrality: medium
built_at_commit: "8248c76"
source_sha256: "f839c9811cdb6f50733743e3751f15610753e69c9b7b62d173e26fb2674f6f43"
---
# src/insight/refresh-full.ts

## Purpose

Implements `cortex loop-insight-refresh --full`, the weekly ground-truth tier: `--collect` emits the full L4-regeneration worklist (every ledger path, every scope, the current graph/tags/clusters baseline counts, carried stale references, and confidence-aged edges), and `--report` validates the regenerated store against the §4.10 checks and, when clean, blesses it as ground truth — advancing the ledger's module-wide `built_at_commit`, clearing the stale set entirely, advancing the cycle history, and rebuilding `reverse-index.json`. A legitimate shrink during full regeneration is sanctioned and only noted in the report, not blocked.

## Connections

Uses:
- src/insight/refresh-daily.ts: reuses `agedEdges`, `headCommit`, `readConfidenceAgingCycles`, `readGraph`, `readScopeRegistry`, `rebuildReverseIndex`, and the shared report file/kind constants.
- src/insight/refresh-fast.ts: reuses `readLedger`.
- src/insight/storage.ts: `parseTagsV3`, `parseClustersV3`, `serializeLedger`, `serializeReverseIndex`.
- src/loops/report.ts: `writePulseReport`.
- src/schema/checks/insight.ts: `checkInsightGraph`/`checkInsightLedger`/`checkInsightEntry` to validate the regenerated store before blessing it as ground truth.

Used by:
- (none src-internal)
