---
path: src/hooks/pre-read.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 3
size_lines: 620
size_tokens: 7296
centrality: high
built_at_commit: "a66041b"
source_sha256: "006a479e189dbe4e5b3b55d9928799d0dfd29e6e59874a3df19ad6c75a82965c"
---
# src/hooks/pre-read.ts

## Purpose
The PreRead hook — PreToolUse on Read (spec hooks.pre-read-writeback, re-pointed to insight at build-order-v3 step 7; schema §5). The priming half of refine-during-use: before a file read, it injects a one-line summary sourced from the target's insight per-file entry (first line of `## Purpose`, `size_tokens`, applicable compass rule ids), a writeback invitation (unless the entry's Purpose already carries a read-time provenance marker), a duplicate-read note, and — for marked targets (specs, compass rules, atlas decisions/evidence, the schema document) or any source file with open/triaged bugs — a recall marker line. It also implements Rule 7's read-deferral mode: the ONE measured, default-off exception to warn-never-block (RULES.md rule 6) — under a specific gate (flag on, interactive session, deferrable source file, entry ≥40 lines, not already held/read this session, circuit breaker not tripped) it denies the Read outright with a four-line reason instead of the file's content, on the theory that the insight entry is cheaper to hand over than the file. Every failure inside Rule 7 falls through to the ordinary allow payload, never to a deny. With no insight entry the hook injects nothing (graceful absence — extraction owns entry creation, never fabricated).

## Main players
- `run` (lines 405–619) — orchestrates the entire flow: config/flag gating, marker computation, insight lookup via `fileQuery`, the Rule 7 read-deferral gate, Rule 4 duplicate-read memory, and budget-truncated payload composition. [critical]
- `recallMarker` (lines 260–277) — Rule 6: the marker line for a *marked* target (spec/rule/decision/evidence/schema doc), merging subjects for the schema document's aggregate case. [critical]
- `bugsOnlyMarker` (lines 287–298) — Rule 6's fifth-revision widening: for any other (source-file) target, the `Bugs:` part alone when its own path subject has open/triaged bugs. [critical]
- `deferReason` (lines 360–388) — Rule 7: builds and fits the four-line deny reason (Deferred/Connections/Rules/retry sentence) to `DEFER_REASON_MAX_CHARS`, dropping Connections items before ever trimming the purpose. [critical]
- `isDeferrableKind` (lines 140–146) — Rule 7(c): a deferrable target is a source file — never a marked target, never under `.cortex/`/`.specflow/`, never RULES.md/CLAUDE.md/the schema doc, never an `_index.md`/`_overview.md`. [supporting]
- `applicableRuleIds` (lines 164–198) — collects compass rule ids whose `governs` glob matches the target path, silently skipping retired or malformed rule files. [supporting]
- `fitMarker` (lines 238–250) — the ≤50-token trim for any marker line: drops the `more:` tail, then cuts `Open:`, then `Decided:`, then `Bugs:` (in that order) to one id each. [supporting]
- `staleMarker` (lines 308–310) — Rule 8: renders ` (stale: built at <commit, 7 chars>)`, never itself trimmed. [supporting]
- `connectionItems` (lines 335–351) — extracts `<path>: <symbols>` items from an entry's `## Connections` section, `Uses:`/`Used by:` bullets only, for the Rule 7 deny reason. [supporting]
- `purposeFirstLine` (lines 397–403) — first non-empty, whitespace-collapsed line of an entry's `## Purpose`. [supporting]
- `readsMemoryPath` / `legacyReadsMemoryPath` (lines 101–110) — Rule 4's per-session read-memory path and its pre-reorg flat-file predecessor (self-healed via `renameIfLegacy`). [supporting]
- `readDeferPath` (lines 129–132) — the per-session Rule 7 deferral ledger path, a sibling of the read-memory path. [supporting]
- `isMarkedTarget` (lines 213–215) — Rule 6: whether a path is a spec/rule/decision/evidence file or the schema document; source files are never marked. [supporting]

## Insights
- Rule 7 (read-deferral) is the single, measured, default-off exception to warn-never-block across this entire scope (and per the module doc, across RULES.md rule 6 generally) — every other hook in `src/hooks/` is unconditionally silent-on-failure; this one can legitimately return `permissionDecision: deny`, and that is treated as a deliberate, load-bearing carve-out rather than a bug.
- The Rule 7 ledger append happens BEFORE the deny is returned, specifically so a crash between the two never leaves a file deniable twice — "the ledger first; if the append fails, no deny" is stated explicitly in the code, guaranteeing at-most-one-deny-per-file-per-session even under partial failure.
- `fitMarker`'s trim order (`Open`, then `Decided`, then `Bugs`) is not alphabetical or arbitrary — the comment says `Bugs:` is cut last "because it is the part most likely to be acted on," i.e. the trim priority encodes an editorial judgment about which pointer is most valuable to a reader under budget pressure.
- Two independent budget ceilings apply to the main payload (75 tokens with the writeback invite, 50 without) and the recall marker gets its own separate ~50-token budget added on top — RULES.md rule 11's "combined ceiling" is documented as one extended figure, not literally one pool, so the marker is fitted independently via `fitMarker` before the purpose is ever trimmed.
- The Rule 8 stale marker and the Rule 6/7 recall marker are two independently-computed subsystems layered onto one wire payload: staleness compares `source_sha256` against the target's current body via `entryStaleness` (never git), while the recall marker reads an entirely separate `.cortex/recall-index.json`. Either can fail independently without affecting the other (both fail open to "no marker, no log").
- `bugsOnlyMarker` deliberately zeroes out every list except `bugs` before calling the same `markerLine` renderer `recallMarker` uses — reusing one line-building function for two structurally different marker shapes (full recall marker vs. bugs-only) rather than duplicating the grammar.
- A target with an insight entry but an empty `## Purpose` section returns exactly the same result as a target with no entry at all (`markerAlone()`) — an entry that exists but has nothing to say is treated as equivalent to no entry, not as a smaller injection.

## File map
Lines 1–58: module doc (Rules 1–8 narrative) + imports + the two/three payload budget constants.
Lines 59–110: Rule 4's read-memory path helpers (current + legacy, for `renameIfLegacy` self-heal).
Lines 112–146: Rule 7 constants (`READ_DEFER_MIN_LINES`, `READ_DEFER_CIRCUIT_BREAKER`, `DEFER_REASON_MAX_CHARS`, `READ_DEFER_DIR`) and `isDeferrableKind`.
Lines 148–198: the allow envelope and `applicableRuleIds` (compass rule matching).
Lines 200–298: Rule 6's recall marker subsystem — `isMarkedTarget`, `mergeSubjects`, `fitMarker`, `recallMarker`, `bugsOnlyMarker`.
Lines 300–403: Rule 8's stale marker, the Rule 7 deny envelope and `deferReason`, `ledgerLines`, `purposeFirstLine`.
Lines 405–619: `run` — the full hook: gating, marker computation, insight lookup, Rule 7 deferral gate, Rule 4 duplicate-read memory, payload composition and budget enforcement.

## Connections
Uses:
- src/hooks/errors.ts: `appendHookError` — every degradation path (unreadable insight entry, marker/staleness failure, ledger read/write failure, unexpected crash) logs here, never blocking
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only
- src/hooks/transcript-head.ts: `sessionKindFromTranscriptHead` — Rule 7(g)'s interactive-only gate for read-deferral
- src/insight/query.ts: `fileQuery`, `entryStaleness` — the read-only insight lookup the whole payload (and Rule 8 staleness) is built from
- src/pulse/migrate.ts: `renameIfLegacy` — self-heals both the legacy read-memory file and (implicitly, same pattern) other pre-reorg paths
- src/recall/index.ts: `RecallSubject` type only
- src/recall/query.ts: `candidateKeys`, `loadRecallIndex`, `markerLine`, `moreTail` — Rule 6's index lookup and line-rendering, shared with `search-annotate.ts`
- src/schema/clauses.ts: `SCHEMA_DOC_FILENAME` — identifies the schema document as a Rule 6 marked target

Used by:
- src/hooks/cli.ts: dispatches `case 'pre-read'`
- src/hooks/session-end.ts: imports `readsMemoryPath` only, to record whether the session read anything
- tests/atomic/hooks/pre-read.test.ts; tests/atomic/insight/session-observe.test.ts; tests/spec/hooks/post-read.test.ts, pre-read.test.ts

## Query pointers
- If you need the exact PreRead wire payload (line order: summary, invite, dedupe note, marker), read `compose`/`composeSummary` inside `run` (lines ~584–605) — the budget-trim logic is pinned there and never touches the invite tag or the two markers.
- If you're touching the writeback loop end-to-end, also read src/hooks/post-read.ts (`READ_TIME_MARKER`, the `<cortex:purpose>` tag grammar) — owned there, only checked here.
- If you're changing Rule 7 read-deferral, also read src/pulse/usage.ts (Rule 13's measurement of the feature) and src/hooks/transcript-head.ts (the session-kind gate); the ledger scheme mirrors the Rule 4 read-memory idiom, so keep both in step.
- If you need the recall marker grammar or the index shape, read src/recall/query.ts (`markerLine`, `candidateKeys`) and src/recall/index.ts (`RecallSubject`) — this file only consumes them.
- If you need the insight entry shape (`fileQuery` result, staleness comparison), read src/insight/query.ts — that module owns `source_sha256` semantics and `entryStaleness`.
</output>
