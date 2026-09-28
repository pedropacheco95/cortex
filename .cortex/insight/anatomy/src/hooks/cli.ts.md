---
path: src/hooks/cli.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 2
size_lines: 95
size_tokens: 855
centrality: high
built_at_commit: "a66041b"
source_sha256: "85572388f0c1eb4f3b54943d3ee7382f3cd9635d84df4006bdb4f31e0ebbf612"
---
# src/hooks/cli.ts

## Purpose
`cortex hook <name>` dispatch: the single fan-in point every Claude Code hook registration (SessionStart, PreToolUse/PostToolUse on Write|Edit|Read, the search-time PreToolUse on Grep|Bash, and the UserPromptSubmit router) funnels through. `runHook` parses the stdin JSON (a parse failure degrades to `{}` rather than throwing), switches on `name` to the matching handler's `run()`, and an unknown name silently no-ops. `main` reads stdin to completion via `readStdin`, calls `runHook`, writes its stdout, and always returns exit code 0 — even on an internal crash — so the dispatcher itself can never make a hook registration fail (warn-never-block, RULES.md rule 6).

## Connections
Uses:
- src/hooks/session-start.ts: `run` (case `'session-start'`) and the `HookRunResult` type every handler returns
- src/hooks/pre-write.ts: `run` (case `'pre-write'`)
- src/hooks/post-write.ts: `run` (case `'post-write'`)
- src/hooks/pre-read.ts: `run` (case `'pre-read'`)
- src/hooks/post-read.ts: `run` (case `'post-read'`) — imported and dispatched (line 20/46) but absent from this file's L1 `resolvedImports` (see Insights)
- src/hooks/session-end.ts: `run` (case `'session-end'`)
- src/hooks/stop.ts: `run` (case `'stop'`)
- src/hooks/search-annotate.ts: `run` (case `'search-annotate'`)
- src/hooks/prompt-route.ts: `run` (case `'prompt-route'`)

Used by:
- tests/spec/hooks/hooks.test.ts, post-read.test.ts, post-write.test.ts, pre-read.test.ts, pre-write.test.ts, prompt-route.test.ts, search-annotate.test.ts, session-end.test.ts, session-start.test.ts: exercise the dispatcher directly
- (no src-internal consumer in this scope's slice — invoked dynamically by the CLI's `hook` verb, invisible to the static import graph)
</output>
