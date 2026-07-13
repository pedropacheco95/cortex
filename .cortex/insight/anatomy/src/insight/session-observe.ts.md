---
path: src/insight/session-observe.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 762
size_tokens: 7198
centrality: low
built_at_commit: "fd7b55b"
source_sha256: "7d3673e3c69f9c1831bcad39bd834ac7ea91ff7c9d83b6bcfde47febf8e8cd23"
---
# src/insight/session-observe.ts

## Purpose

Implements `cortex loop-session-observe`, the v3 successor to v2's insight-gaps loop: `--collect` reuses the shared session corpus (`pulse/state/session-corpus.json`, built by `pulse-distil` if absent — one corpus, two readers) and emits a worklist of not-yet-observed sessions (tracked in `pulse/state/session-observe-state.json`). `--apply` audits the skill's ungated per-file entry enrichments — only `## Insights`/`## Query pointers` may differ from the git baseline, every added line must carry a `(claude-sessions/<user>/<id>)` provenance trailer, and no gated path (`compass/`, `atlas/`, `RULES.md`) may be touched directly — then routes gated candidates (rule-candidate / decision-candidate) through dismissal-suppression and shared S-id allocation into typed proposal sections in the always-write `pulse/reports/session-observe.md` report. (Pulse reorg this cycle: worklist/state/corpus files moved under `pulse/state/` and the report under `pulse/reports/`, via new `stateDir`/`reportsDir` helpers replacing `pulseDir` — pure path change, no behavioural change.)

## Connections

Uses:
- src/insight/entry.ts: `parseEntry` to confirm a touched entry still conforms to §4.10.2 after enrichment.
- src/loops/report.ts: `writePulseReport` for the always-write session-observe report.
- src/pulse/distil.ts: `collectCorpus`, `CORPUS_FILE`, `readPendingSections`, `readUnexpiredDismissals`, `isDismissed`, `normaliseText` — reuses the shared session corpus and dismissal machinery rather than rebuilding either.
- src/pulse/fences.ts: `chooseOuterFence` to safely fence proposed rule text / decision file payloads in the report.
- src/pulse/suggestion-ids.ts: `allocateSuggestionIds` for S-ids on fresh proposals.

Used by:
- (none src-internal)
