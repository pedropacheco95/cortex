---
path: src/hooks/harness.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 2
size_lines: 69
size_tokens: 821
centrality: medium
built_at_commit: "a66041b"
source_sha256: "6ff447e39b81a54d7e4f0cd2516028d739c61d1aaee82988dcebf4db6940a170"
---
# src/hooks/harness.ts

## Purpose
The shared string-level harness/scheduled-prompt predicate module — pure text inspection, no file I/O (R-001) — that keeps every hook which must agree on "what the human actually said" from drifting apart. `isHarnessText` detects Claude Code's own injected wrappers (teammate messages, system reminders, task notifications, shell echoes — via `HARNESS_MARKERS` and a leading `<`/`[` check within the first `HARNESS_SCAN_CHARS`); `isScheduledPromptText` detects a scheduled Claude Desktop task's first prompt (the skill preamble or the scheduled-task tag); `isHarnessPrompt` is the OR of both, used where a caller cares about either kind of non-human text.

## Connections
Uses: (none — no resolved imports; pure string logic)

Used by:
- src/hooks/prompt-route.ts: `isHarnessPrompt` — Rule 4 silences the router on any harness- or scheduled-shaped prompt
- src/hooks/session-end.ts: `HARNESS_MARKERS`, `isHarnessText` — Rule 7 preamble's `isHarnessInjected`, re-exports `HARNESS_MARKERS` where the spec names it
- src/hooks/transcript-head.ts: `isScheduledPromptText` — classifies the transcript's first user line as `scheduled` vs `interactive`
- tests/atomic/hooks/harness.test.ts: exercises the three predicates directly

Semantically related (not imports):
- The three predicates are independently applied by three different hooks (prompt-route's Rule 4, session-end's Rule 7, transcript-head's session-kind probe) for three different purposes — silencing a router, filtering extraction input, and classifying a session — but all root in the same "what did the harness write vs. the human" judgment; a marker added here changes all three at once.
</output>
