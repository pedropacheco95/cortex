---
path: src/hooks/search-annotate.ts
extracted_at: 2026-09-22T12:00:00Z
extraction_level: 2
size_lines: 209
size_tokens: 2293
centrality: high
built_at_commit: "a66041b"
source_sha256: "dae26916e033671da861eef576b5afc2e7faa26fab9a30b8f8fc1a70e783e3d5"
---
# src/hooks/search-annotate.ts

## Purpose
The search-time annotation hook — PreToolUse on Grep and Bash (spec hooks.search-annotate) — the moment a session declares what it does not know. Before a search runs, it classifies the tool call (`classify`: a Grep's `pattern`/`path`, or a Bash command's search segments via `searchTargetsIn`/`stripQuotedSpans`, capped to `MAX_SEARCH_SEGMENTS`), matches the target path and pattern tokens against `.cortex/recall-index.json` (the only knowledge surface it opens), and injects at most two pointer lines (names, ids, dates, paths — never a body or an instruction). The matching/ranking/formatting logic lives in `../recall/query.ts`; this file is purely the envelope: stdin classification, the Bash pattern-text extraction, the once-per-session fired-memory (shared with `prompt-route.ts`), and fail-open on every expected empty state.

## Connections
Uses:
- src/hooks/errors.ts: `appendHookError` — the one unexpected-exception log path
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only
- src/pulse/usage.ts: `searchTargetsIn`, `stripQuotedSpans` — Rule 3/4's classification of what counts as a search and its target operand
- src/recall/query.ts: `candidateKeys`, `keywordMatches`, `loadRecallIndex`, `selectPointers`, `tokenise` — the shared index-matching and pointer-selection logic this hook is a thin envelope around

Used by:
- src/hooks/cli.ts: dispatches `case 'search-annotate'`
- src/hooks/prompt-route.ts: `recallFiredPath` — the fired-memory path this file defines, read by prompt-route to keep the two hooks' pointer budgets from double-naming a thread
- tests/atomic/hooks/prompt-route.test.ts, search-annotate.test.ts; tests/spec/hooks/prompt-route.test.ts, search-annotate.test.ts

Semantically related (not imports):
- Owns `recallFiredPath` (the per-session fired-memory file) even though src/hooks/prompt-route.ts also writes and reads it — the two hooks share one dedupe ledger by convention (a path function, not a shared write lock), so a change to the path scheme here must stay in lockstep with prompt-route.ts's usage.
</output>
