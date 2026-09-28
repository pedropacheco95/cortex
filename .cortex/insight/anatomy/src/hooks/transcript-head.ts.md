---
path: src/hooks/transcript-head.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 2
size_lines: 76
size_tokens: 831
centrality: medium
built_at_commit: "a66041b"
source_sha256: "54d6d387d94687872751a242e33414eec023f8357cf69ef795fc04134798f3e6"
---
# src/hooks/transcript-head.ts

## Purpose
A cheap session-kind probe for `hooks.pre-read-writeback` Rule 7(g): pre-read.ts cannot afford session-end.ts's full two-pass transcript read on every single Read call, so this reads at most `TRANSCRIPT_HEAD_BYTES` (256 KiB) from the head of the transcript file, finds the first `"type":"user"` line carrying real user text, and classifies it `interactive` / `scheduled` via the shared scheduled-marker predicate. Anything it cannot determine — no path, ENOENT, a directory, an empty file, no user line within the head, a line straddling the truncation boundary, a parse failure — degrades to `unknown`, which Rule 7 treats identically to `scheduled` (never defer). Never throws; one bounded read, no network, no subprocess (R-001).

## Connections
Uses:
- src/hooks/harness.ts: `isScheduledPromptText` — the actual scheduled/interactive classification, delegated rather than re-implemented
- src/sessions/read.ts: `extractMessages`, `parseSessionJsonl` — parses the one candidate line into a message

Used by:
- src/hooks/pre-read.ts: `sessionKindFromTranscriptHead` — Rule 7(g)'s gate, so read-deferral never fires for scheduled or unclassifiable sessions
- tests/atomic/hooks/transcript-head.test.ts: exercises the probe directly

Semantically related (not imports):
- Exists specifically as a cost-bounded alternative to src/hooks/session-end.ts's `readTranscript` two-pass read — same underlying problem (classify a session from its transcript) solved at two very different budgets for two very different call frequencies (once at SessionEnd vs. potentially every Read).
</output>
