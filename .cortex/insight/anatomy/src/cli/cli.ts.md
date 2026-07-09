---
path: src/cli/cli.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 3
size_lines: 440
size_tokens: 4739
centrality: high
built_at_commit: "8248c76"
source_sha256: "073b55f76b5c36eedd094d7f7df9b4d5805f16c2923eb5157788bd920344e847"
---
# src/cli/cli.ts

## Purpose
The thin argv dispatcher for the `cortex` binary — routes every CLI verb (`init`, `hook`, `validate`, `pulse-*`, `loop-*`, `scan`, `constellation`, `insight`, `tasks rename`, `test-run`, and several retired verbs kept as pointed migration messages) to its owning module, almost entirely via dynamic `await import(...)` so the process's static require graph stays minimal. The fallback path — no recognized `argv[0]` — parses `--force`/`--yes`/`--no-llm`/`--partial`/`--timeout-ms` and calls `init()` on the remaining positional target.

## Main players
- `run` (lines 67–432) — the entire dispatch function; matches `argv[0]` against roughly twenty verb branches, each dynamically importing its handler module and awaiting it, returning a process exit code. [critical]
- `parseLoopFlags` (lines 36–65) — shared flag parser for the collect/judge/propose-or-report-or-apply loop commands (`pulse-distil`, `loop-skill-suggest`, `loop-bug-triage`), extracting `--collect`, `--no-llm`, a named file flag, and `--timeout-ms`. [supporting]

## Insights
- Nearly every branch does `await import('../X.js')` rather than a static top-of-file import — this is why the static import graph only resolves `src/cli/init.ts` as a structural dependency; the real fan-out (hooks/cli, schema/cli, pulse/review, pulse/hygiene, every loops/* module, insight/*, constellation/compile, constellation/server, cli/task-scoping) is invisible to static analysis and only exists at runtime.
- Two retired verbs (`anatomy-refresh-fast`, `loop-anatomy-refresh`) are kept as pointed stderr messages rather than deleted outright. `anatomy-refresh-fast` deliberately returns exit code 0 (not 1) with the comment "hook-safe" — a stale git post-commit hook might still invoke it, and a hook must never fail a commit.
- The bottom-of-file guard (`scriptUrl.endsWith(scriptPath)`) lets this module be imported as a library (e.g. by tests calling `run()` directly) without auto-executing `process.argv`.
- The `loop-insight-refresh` verb enforces "exactly one of --fast/--daily/--full" via `Number(fast) + Number(daily) + Number(full) !== 1` — a compact but non-obvious idiom for "exactly one boolean flag set."

## Connections
Uses:
- src/cli/init.ts: imports `init` — the only static import in the file; the fallback path for `cortex init [target]`

Used by:
- (none src-internal — this is the top-level CLI entry point)

Semantically related (not imports):
- src/cli/task-scoping.ts: the `tasks rename` verb dynamically imports `tasksRename` and calls it directly
- src/hooks/cli.ts, src/schema/cli.ts, src/pulse/review.ts, src/pulse/hygiene.ts, src/constellation/compile.ts, src/constellation/server.ts: each dynamically imported by name inside `run` for its corresponding verb

## Query pointers
- If you need to trace a specific `cortex <verb>` to its implementation, grep this file for the `argv[0]` literal, then read the dynamically-imported target module directly.
- If you need the fallback `cortex init` flag contract, also read src/cli/init.ts (`InitOptions`).
