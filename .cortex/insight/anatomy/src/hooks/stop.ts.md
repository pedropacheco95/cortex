---
path: src/hooks/stop.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 2
size_lines: 66
size_tokens: 725
centrality: medium
built_at_commit: "a66041b"
source_sha256: "6b29f8d257518734e059bee22bbfb7378e14b0cd15f60103ca1a485b4e2a34bc"
---
# src/hooks/stop.ts

## Purpose
The Stop companion hook (spec hooks.session-end Rule 11) — fires on every turn to keep Claude Code's `last_assistant_message` (from the `Stop` event) in `.cortex/pulse/state/sessions/<session-id>.last.json` as `{ text, at }`, write-then-rename, capped to `STOP_TEXT_CHARS`. It exists because the transcript file is written asynchronously, so by `SessionEnd` its last lines may not have landed yet; this file is the documented workaround, consumed and deleted by `session-end.ts`. Deliberately does nothing else — no transcript read, no output, no decision — and stays silent on any missing or malformed input, unlogged, because it fires every turn and would otherwise flood `hook-errors.md`.

## Connections
Uses:
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only

Used by:
- src/hooks/cli.ts: dispatches `case 'stop'`
- src/hooks/prompt-route.ts: `stopStatePath` — checked (existence only) to detect whether this is the session's first prompt (Rule 6 resumption gate)
- src/hooks/session-end.ts: `stopStatePath` — reads and then deletes the companion file this hook writes

Semantically related (not imports):
- Forms a tightly-coupled write/read pair with src/hooks/session-end.ts despite the import running only one direction (session-end imports `stopStatePath` from here): this hook is the producer, session-end is the sole consumer and the one that deletes the file.
</output>
