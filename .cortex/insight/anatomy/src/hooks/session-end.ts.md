---
path: src/hooks/session-end.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 2
size_lines: 513
size_tokens: 5702
centrality: high
built_at_commit: "a66041b"
source_sha256: "c79100dcb1bb70328cd08a807e8118aa0a3538d05d8e649cedb9ea2f5ebf5566"
---
# src/hooks/session-end.ts

## Purpose
The SessionEnd hook (spec hooks.session-end; schema §4.5.3) — on `SessionEnd`, reads the transcript exactly once and deterministically writes one session record to `.cortex/pulse/sessions/<session-id>.json`: header (title, session kind, citation, reason), the hanging open question or offer, approvals with what they approved, tagged and lexicon-detected findings, and copied scratchpad artefacts. The record is then handed to `pulse/threads.ts` — threads are opened from what it carries, and threads open before this run are checked for being answered by it. The read is bounded (Rule 5): a 2 MiB tail parse for message-level extraction plus a whole-file prefix scan that parses only lines carrying a trigger substring, skipping oversized lines and skipping entirely past 64 MiB; `partial` flags when something may have been lost. Always silent, always exit 0, fail-open on every path, writes only under `.cortex/pulse/` (RULES.md rule 7).

## Connections
Uses:
- src/hooks/errors.ts: `appendHookError` — logs every internal degradation (unreadable transcript, thread-step failure, unexpected crash)
- src/hooks/harness.ts: `HARNESS_MARKERS` (re-exported where the spec names it), `isHarnessText` — Rule 7 preamble's `isHarnessInjected`, filtering harness-injected user text out of every extractor's input
- src/hooks/pre-read.ts: `readsMemoryPath` — computes the `reads` pointer recorded in the session record from PreRead's per-session read-memory file
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only
- src/hooks/stop.ts: `stopStatePath` — locates, reads and (on success) deletes the Stop companion file that supplies the last assistant message when the transcript lagged
- src/insight/session-observe.ts: `provenanceUser` — builds the `claude-sessions/<user>/<session-id>` citation
- src/pulse/distil.ts: `sessionKind` (aliased `detectSessionKind`), `SessionKind` type — classifies interactive vs. scheduled from the first user message
- src/pulse/threads.ts: `listThreads`, `openThreadsFromRecord`, `detectAnswered`, `scratchCopyBasename`, plus `SessionRecord`/`SessionRecordOpenQuestion`/`SessionRecordApproval`/`SessionRecordFinding`/`SessionRecordArtefact` types — the ledger this hook feeds and the record shape it builds
- src/sessions/read.ts: `parseSessionJsonl`, `extractMessages`, `extractToolUses`, `sessionTitle` — transcript parsing primitives

Used by:
- src/hooks/cli.ts: dispatches `case 'session-end'`
- tests/atomic/hooks/harness.test.ts, session-end.test.ts; tests/spec/hooks/session-end.test.ts

Semantically related (not imports):
- Forms a producer/consumer pair with src/hooks/stop.ts (this file reads and deletes what Stop writes every turn) and with src/hooks/pre-read.ts (this file only reads pre-read.ts's `readsMemoryPath`, never its ledger contents, to record whether the session read anything).
- Filters input through the same `isHarnessText`/`HARNESS_MARKERS` predicates that src/hooks/prompt-route.ts uses via `isHarnessPrompt` — both hooks must agree on what counts as harness-injected text, but session-end applies it to extraction while prompt-route applies it to silencing itself.
</output>
