---
path: src/hooks/session-start.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 3
size_lines: 157
size_tokens: 1450
centrality: high
built_at_commit: "8248c76"
source_sha256: "1bee3741fa985337b52c846e2b99c5526f5c717c5985135bbb20d5fefe6423f2"
---
# src/hooks/session-start.ts

## Purpose
The SessionStart hook — injects a sub-100-token pointer payload on every session (schema version, `.cortex/_index.md` pointer, present module list) plus an optional one-line hygiene summary when `.cortex/pulse/hygiene-report.md` is fresh (within a configurable window). Degrades to whatever part of the payload is still derivable on any internal error, always exiting 0.

## Main players
- `run` (lines 65–156) — reads config, builds the pointer+modules payload, conditionally appends the hygiene summary within its budget, and returns the envelope; a top-level catch falls back to the bare pointer line. [critical]
- `firstSummaryLine` (lines 56–63) — extracts the first meaningful (non-heading, non-blank) line of a report body for the hygiene summary. [supporting]
- `envelope` / `silent` (lines 34–45) — the two `HookRunResult` shapes: a `SessionStart` hookSpecificOutput payload, or a fully silent no-op. [supporting]

## Insights
- Also exports the shared `HookRunResult`/`HookRunOptions` interfaces that every other hook module in this scope imports purely for typing — this file is the de facto type-anchor for the hooks layer even though its own runtime logic is SessionStart-specific.
- `MAX_PAYLOAD_CHARS = 396` encodes the <100-token budget (RULES.md rule 11) at the project's chars/4 token-estimate convention — the hygiene line's own room is computed dynamically (`MAX_PAYLOAD_CHARS - used`) rather than a fixed slice, so the pointer lines are never truncated to make room for the hygiene summary.
- On total failure, the catch block still returns a real payload (`Cortex is active (schema ...)`) rather than a silent no-op — SessionStart is the one hook considered too valuable to ever go fully silent.

## Connections
Uses:
- src/cli/templates.ts: `SCHEMA_VERSION` — fallback schema version string
- src/hooks/errors.ts: `appendHookError` — logs unparseable config and malformed hygiene reports

Used by:
- src/hooks/cli.ts: dispatches `case 'session-start'` to this module's `run`
- src/hooks/post-write.ts: imports `HookRunResult`, `HookRunOptions` types only
- src/hooks/pre-read.ts: imports `HookRunResult`, `HookRunOptions` types only
- src/hooks/pre-write.ts: imports `HookRunResult`, `HookRunOptions` types only

## Query pointers
- If you need the shared hook result/options types, this file is their source even for hooks whose logic lives elsewhere.
- If you need the hygiene report's frontmatter shape, also read the loop that writes `.cortex/pulse/hygiene-report.md` (outside this scope).
