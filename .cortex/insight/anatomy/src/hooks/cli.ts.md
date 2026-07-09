---
path: src/hooks/cli.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 3
size_lines: 80
size_tokens: 687
centrality: high
built_at_commit: "8248c76"
source_sha256: "ad6f71c2424c07a5baea1550c0b15b697c56890dbe6be84bbe15773f14973521"
---
# src/hooks/cli.ts

## Purpose
Implements `cortex hook <name>` — the single dispatcher every Claude Code hook registration (SessionStart, PreToolUse/PostToolUse on Write|Edit|Read) funnels through: reads stdin JSON, routes by hook name to the matching handler module, writes its stdout, and always returns exit code 0 (warn-never-block, RULES.md rule 6).

## Main players
- `runHook` (lines 20–45) — parses stdin JSON (tolerating malformed input as `{}`) and switches on `name` to call the matching hook's `run()`; unknown names silently no-op. [critical]
- `main` (lines 61–72) — the argv entry point: reads stdin, calls `runHook`, writes stdout, and returns exit code 0 even on an internal crash. [critical]
- `readStdin` (lines 47–58) — reads stdin to completion unless it's a TTY (no piped input), tolerating stream errors by returning an empty string. [supporting]

## Insights
- `post-read` is dispatched here (lines 17, 39) but its module is NOT in this scope's slice — L1 misclassified `src/hooks/post-read.ts` as a binary and excluded it; the dispatch wiring exists in code even though the file itself wasn't extracted in this pass.
- Two layers of warn-never-block are stacked: `main`'s own try/catch guarantees exit 0 even if `runHook` itself throws, on top of each individual hook's own internal warn-never-block — defense-in-depth around the one invariant this whole module exists to protect.
- The switch's `default` case (unknown hook name) is indistinguishable at the output level from a successfully-run silent hook — both return `{ exitCode: 0, stdout: '' }`.

## Connections
Uses:
- src/hooks/post-write.ts: `run` — PostToolUse Write|Edit handler
- src/hooks/pre-read.ts: `run` — PreToolUse Read handler
- src/hooks/pre-write.ts: `run` — PreToolUse Write|Edit handler
- src/hooks/session-start.ts: `run`, `HookRunResult` type — SessionStart handler

Used by:
- (none src-internal — invoked dynamically by src/cli/cli.ts's `hook` verb branch, invisible to the static slice)

Semantically related (not imports):
- src/hooks/post-read.ts: dispatched by name at lines 17/39 but excluded from this extraction pass (see Insights)

## Query pointers
- If you need to add a new hook name, also read src/cli/init.ts's `cortexHookEntries` (the registrations must match this dispatcher's `case` labels exactly).
- If you need the warn-never-block contract itself, also read src/hooks/errors.ts (the shared degradation log every individual hook writes to).
