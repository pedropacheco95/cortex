---
path: src/insight/refresh-full.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 301
size_tokens: 2912
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "09b0a87d110305084dbda0969cff028a07ce51364cee5c178518a83609955e7d"
---
# src/insight/refresh-full.ts

## Purpose

Implements `cortex loop-insight-refresh --full`, the weekly ground-truth tier: `--collect` emits the full L4-regeneration worklist (every ledger path, every scope, the current graph/tags/clusters baseline counts, carried stale references, and confidence-aged edges) to `.cortex/pulse/state/insight-full-worklist.json`, and `--report` validates the regenerated store against the §4.10 checks and, when clean, blesses it as ground truth — advancing the ledger's module-wide `built_at_commit`, clearing the stale set entirely, advancing the cycle history, and rebuilding `reverse-index.json` — writing the pulse report to `.cortex/pulse/reports/insight-refresh.md`. A legitimate shrink during full regeneration is sanctioned and only noted in the report, not blocked. (Pulse reorg this cycle: machine worklist state moved under `pulse/state/`, human-read reports under `pulse/reports/`, via a renamed `stateDir` helper — pure path change, no behavioural change.)

## Connections

Uses:
- src/insight/refresh-daily.ts: reuses `agedEdges`, `headCommit`, `readConfidenceAgingCycles`, `readGraph`, `readScopeRegistry`, `rebuildReverseIndex`, and the shared report file/kind constants.
- src/insight/refresh-fast.ts: reuses `readLedger`.
- src/insight/storage.ts: `parseTagsV3`, `parseClustersV3`, `serializeLedger`, `serializeReverseIndex`.
- src/loops/report.ts: `writePulseReport`.
- src/schema/checks/insight.ts: `checkInsightGraph`/`checkInsightLedger`/`checkInsightEntry` to validate the regenerated store before blessing it as ground truth.

Used by:
- (none src-internal)
