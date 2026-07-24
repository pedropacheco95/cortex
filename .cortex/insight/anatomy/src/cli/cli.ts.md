---
path: src/cli/cli.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 3
size_lines: 535
size_tokens: 5805
centrality: high
built_at_commit: "bcbda52"
source_sha256: "4ae61a2067cb32b1b2dccbee7c6c46ae8c727d669d068b87b7f57b7286c244ec"
---
# src/cli/cli.ts

## Purpose
The thin argv dispatcher for the `cortex` binary — routes every CLI verb (`init`, `sync`, `hook`, `validate`, `pulse-*`, `loop-*`, `scan`, `constellation`, `insight`, `tasks rename|plan|register|verify`, `test-run`, and several retired verbs kept as pointed migration messages) to its owning module, almost entirely via dynamic `await import(...)` so the process's static require graph stays minimal. Before dispatching any of a fixed set of pulse/loop verbs, it now also runs a single best-effort pulse-layout migration chokepoint. The fallback path — no recognized `argv[0]` — parses `--force`/`--yes`/`--no-llm`/`--partial`/`--timeout-ms` and calls `init()` on the remaining positional target.

## Main players
- `run` (lines 99–528) — the entire dispatch function; matches `argv[0]` against roughly twenty-one verb branches, each dynamically importing its handler module and awaiting it, returning a process exit code. Now also owns `cortex sync` alongside `tasks plan|register|verify` and the pre-existing `tasks rename`. [critical]
- `PULSE_LOOP_COMMANDS` (lines 79–97) — the set of pulse/loop verb names that trigger the one-shot `migratePulseLayout` call before their real dispatch; deliberately excludes hooks, which self-heal per-file instead of paying for a full-tree scan on their latency-critical path. [critical]
- `parseLoopFlags` (lines 40–69) — shared flag parser for the collect/judge/propose-or-report-or-apply loop commands (`pulse-distil`, `loop-bug-triage`), extracting `--collect`, `--no-llm`, a named file flag, and `--timeout-ms`. [supporting]

## Insights
- Nearly every branch does `await import('../X.js')` rather than a static top-of-file import — this is why the static import graph only resolves `src/cli/init.ts` as a structural dependency; the real fan-out (hooks/cli, schema/cli, pulse/review, pulse/hygiene, every loops/* module, insight/*, constellation/compile, constellation/server, cli/task-scoping, cli/tasks-register, cli/sync) is invisible to static analysis and only exists at runtime.
- The pulse-layout migration chokepoint (`PULSE_LOOP_COMMANDS` + the `migratePulseLayout` call right after the `hook` branch) runs for any of seventeen named verbs, wrapped in a try/catch that swallows every failure — a migration failure must never block the loop command it precedes. This is a single centralized call site rather than one duplicated inside every loop's own entry function.
- `cortex sync` is new: it forwards `--yes`/`-y` and the first non-flag positional (defaulting to `.`) into `./sync.js`'s `sync()`, printing to stdout on exit 0 and stderr otherwise — mirroring the `init` fallback path's own success/failure stdout-vs-stderr split just above it.
- `cortex loop-skill-suggest` is now a RETIRED, pointed stderr message (exit 1) rather than a live dispatch: the standalone workflow-mining loop is gone at v3.0 and its judgment folds into `cortex pulse-distil` as an extra lens (workflow-shaped patterns become `skill-proposal` suggestions).
- The `tasks` verb branches four ways (`rename`, `plan`, `register`, `verify`); `plan` and `register`/`verify` dynamically import `./tasks-register.js` and supply the real `os.homedir()` and Desktop app-support path (`~/Library/Application Support/Claude`) — these real defaults are injected ONLY here, so `tasks-register.ts`'s functions stay testable against fixture paths.
- Two other retired verbs (`anatomy-refresh-fast`, `loop-anatomy-refresh`) are kept as pointed stderr messages rather than deleted outright. `anatomy-refresh-fast` deliberately returns exit code 0 (not 1) with the comment "hook-safe" — a stale git post-commit hook might still invoke it, and a hook must never fail a commit.
- The bottom-of-file guard (`scriptUrl.endsWith(scriptPath)`) lets this module be imported as a library (e.g. by tests calling `run()` directly) without auto-executing `process.argv`.
- The `loop-insight-refresh` verb enforces "exactly one of --fast/--daily/--full" via `Number(fast) + Number(daily) + Number(full) !== 1` — a compact but non-obvious idiom for "exactly one boolean flag set."

## Connections
Uses:
- src/cli/init.ts: imports `init` — the only static import in the file; the fallback path for `cortex init [target]`

Used by:
- (none src-internal — this is the top-level CLI entry point)

Semantically related (not imports):
- src/cli/sync.ts: the `sync` verb dynamically imports `sync` and forwards `--yes`/target
- src/pulse/migrate.js: the pulse-loop chokepoint dynamically imports `migratePulseLayout` and calls it best-effort before any of seventeen pulse/loop verbs
- src/cli/task-scoping.ts: the `tasks rename` verb dynamically imports `tasksRename` and calls it directly
- src/cli/tasks-register.ts: the `tasks plan|register|verify` verbs dynamically import `tasksPlan`, `registerTasks`, `verifyTasks`, `desktopAppRunning` and supply the real home/app-support-dir
- src/pulse/distil.ts: `pulse-distil` dynamically imports `runDistil`, which now also carries the retired skill-suggest loop's workflow-mining lens
- src/hooks/cli.ts, src/schema/cli.ts, src/pulse/review.ts, src/pulse/hygiene.ts, src/constellation/compile.ts, src/constellation/server.ts: each dynamically imported by name inside `run` for its corresponding verb

## Query pointers
- If you need to trace a specific `cortex <verb>` to its implementation, grep this file for the `argv[0]` literal, then read the dynamically-imported target module directly.
- If you need the fallback `cortex init` flag contract, also read src/cli/init.ts (`InitOptions`).
- If you need the `cortex sync` flag contract, also read src/cli/sync.ts (`SyncOptions`).
- If you need the `tasks plan|register|verify` registration mechanism, also read src/cli/tasks-register.ts.
- If you need to see which verbs pay the pulse-migration cost, read `PULSE_LOOP_COMMANDS` here together with src/pulse/migrate.ts.
