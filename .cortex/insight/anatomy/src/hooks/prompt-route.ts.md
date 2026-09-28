---
path: src/hooks/prompt-route.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 2
size_lines: 292
size_tokens: 3117
centrality: high
built_at_commit: "a66041b"
source_sha256: "eae20921355e7ff5ccb0e90d257f014ebeaf2fef924d920f0ad130e6f602871b"
---
# src/hooks/prompt-route.ts

## Purpose
The UserPromptSubmit hook (spec hooks.prompt-route) — the first moment a session says anything, and this hook's chance to surface at most two `Open:` pointer lines from open threads in `.cortex/pulse/threads/` (never the recall index, which lacks a thread's kind/status). Two deterministic modes merge in a fixed order: resumption (Rule 6 — on the session's first prompt, the newest prior interactive session's still-open question/offer, regardless of prompt vocabulary) and mention (Rule 7 — a prompt naming an open thread's `T-NNN` id or sharing ≥2 distinct tokens with its key text). A per-session fired-memory shared with `search-annotate.ts` ensures a thread named by either hook is never named by the other again. Strict warn-never-block: exit 0 always, silent and unlogged on every expected empty state (no stdin, no prompt, no `.cortex/`, a harness-shaped prompt, no match), logging only on an unexpected exception.

## Connections
Uses:
- src/hooks/errors.ts: `appendHookError` — the one unexpected-exception log path
- src/hooks/harness.ts: `isHarnessPrompt` — Rule 4's silence gate for harness/scheduled-shaped prompts
- src/hooks/search-annotate.ts: `recallFiredPath` — the shared per-session fired-memory path (Rule 8) that both hooks read and append to
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only
- src/hooks/stop.ts: `stopStatePath` — existence check used (with the fired-memory) to detect whether this is the session's first prompt
- src/pulse/threads.ts: `keyText`, `parseThreadFile`, `THREADS_DIR`, `Thread`/`ThreadKind` types — the thread ledger this hook reads
- src/recall/query.ts: `fitOpenLines`, `readFiredKeys`, `tokenise`, `OpenLineItem` type — the shared line-grammar/budget and tokenisation logic (Rule 9)

Used by:
- src/hooks/cli.ts: dispatches `case 'prompt-route'`
- tests/atomic/hooks/prompt-route.test.ts: exercises the hook directly

Semantically related (not imports):
- Shares the "at most two pointer lines, once per session" design and the `recallFiredPath` memory file with src/hooks/search-annotate.ts — the two hooks are a matched pair (prompt-time vs. search-time) built on the same recall-injection budget and dedupe contract, even though prompt-route reads the thread ledger and search-annotate reads the recall index.
</output>
