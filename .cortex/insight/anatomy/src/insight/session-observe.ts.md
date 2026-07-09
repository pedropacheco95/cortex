---
path: src/insight/session-observe.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 758
size_tokens: 7122
centrality: low
built_at_commit: "8248c76"
source_sha256: "d4cf8a6fe9b79846d785ae9f91323971b5998ed00c48bed5d13941e8fa0b20b2"
---
# src/insight/session-observe.ts

## Purpose

Implements `cortex loop-session-observe`, the v3 successor to v2's insight-gaps loop: `--collect` reuses the shared session corpus (built by `pulse-distil` if absent — one corpus, two readers) and emits a worklist of not-yet-observed sessions. `--apply` audits the skill's ungated per-file entry enrichments — only `## Insights`/`## Query pointers` may differ from the git baseline, every added line must carry a `(claude-sessions/<user>/<id>)` provenance trailer, and no gated path (`compass/`, `atlas/`, `RULES.md`) may be touched directly — then routes gated candidates (rule-candidate / decision-candidate) through dismissal-suppression and shared S-id allocation into typed proposal sections in the always-write `pulse/session-observe.md` report.

## Connections

Uses:
- src/insight/entry.ts: `parseEntry` to confirm a touched entry still conforms to §4.10.2 after enrichment.
- src/loops/report.ts: `writePulseReport` for the always-write session-observe report.
- src/pulse/distil.ts: `collectCorpus`, `CORPUS_FILE`, `readPendingSections`, `readUnexpiredDismissals`, `isDismissed`, `normaliseText` — reuses the shared session corpus and dismissal machinery rather than rebuilding either.
- src/pulse/fences.ts: `chooseOuterFence` to safely fence proposed rule text / decision file payloads in the report.
- src/pulse/suggestion-ids.ts: `allocateSuggestionIds` for S-ids on fresh proposals.

Used by:
- (none src-internal)
