---
path: src/cli/cli.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 3
size_lines: 574
size_tokens: 6198
centrality: high
built_at_commit: "0998c19"
source_sha256: "593277f54481f057d3016f9dcec1d7aa32bc13763d3991f73f073af157a7f366"
---
# src/cli/cli.ts

## Purpose
The thin argv dispatcher for the `cortex` binary — routes every CLI verb (`init`, `sync`, `hook`, `validate`, `pulse-*`, `loop-*`, `scan`, `constellation`, `insight`, `tasks rename|plan|register|verify`, `test-run`, `usage`, and several retired verbs kept as pointed migration messages) to its owning module, almost entirely via dynamic `await import(...)` so the process's static require graph stays minimal. Before dispatching any of a fixed set of pulse/loop verbs, it also runs a single best-effort pulse-layout migration chokepoint. `cortex sync` wires an `onProgress` sink into `sync()`'s options so a long-running sync doesn't look hung. New this pass: the fallback `cortex init [target]` path now parses an optional `--profile <name>` flag (spec `core-cli.init-profile` Rule 2) — validated against `PROCESS_PROFILES` via `isProcessProfile`, an unrecognised value is a hard usage error (exit 2, nothing written) rather than a silent fallback to the default, because a typo'd profile would otherwise quietly schedule the wrong scheduled-task set. Omitted → `init()` receives no `profile` key at all (its own default applies). The fallback path otherwise still parses `--force`/`--yes`/`--no-llm`/`--partial`/`--timeout-ms` and calls `init()` on the remaining positional target.

## Main players
- `run` (lines 103–567) — the entire dispatch function; matches `argv[0]` against roughly twenty-one verb branches, each dynamically importing its handler module and awaiting it, returning a process exit code. Owns `cortex sync` (forwarding an `onProgress` stderr sink) alongside `tasks plan|register|verify`, `tasks rename`, and the fallback `cortex init` path's new `--profile` parsing. [critical]
- `PULSE_LOOP_COMMANDS` (lines 74–101) — the set of pulse/loop verb names that trigger the one-shot `migratePulseLayout` call before their real dispatch; deliberately excludes hooks, which self-heal per-file instead of paying for a full-tree scan on their latency-critical path. [critical]
- `parseLoopFlags` (lines 42–72) — shared flag parser for the collect/judge/propose-or-report-or-apply loop commands (`pulse-distil`, `loop-bug-triage`), extracting `--collect`, `--no-llm`, a named file flag, and `--timeout-ms`. [supporting]

## Insights
- **New this pass — `--profile <name>` (lines 519–534):** looked up via `argv.indexOf('--profile')`; the next token is validated with `isProcessProfile` (imported from `./profile.js`). An invalid or missing value prints every valid profile name to stderr and returns exit code 2 — the same "nothing was written" contract the platform/existing-`.cortex/` preflight refusals use, so a bad flag never partially scaffolds a project. The flag's index (and its value's index) are excluded from the `positional` filter (line 543–545) alongside `--timeout-ms`'s value, so `--profile specflow myproject` still resolves `myproject` as the target, not `specflow`.
- Nearly every branch does `await import('../X.js')` rather than a static top-of-file import — this is why the static import graph only resolves `src/cli/init.ts` and `src/cli/profile.ts` as structural dependencies; the real fan-out (hooks/cli, schema/cli, pulse/review, pulse/hygiene, pulse/usage, every loops/* module, insight/*, constellation/compile, constellation/server, cli/task-scoping, cli/tasks-register, cli/sync) is invisible to static analysis and only exists at runtime.
- The pulse-layout migration chokepoint (`PULSE_LOOP_COMMANDS` + the `migratePulseLayout` call right after the `hook` branch) runs for any of the named verbs (now including `usage`), wrapped in a try/catch that swallows every failure — a migration failure must never block the loop command it precedes.
- `cortex sync`'s `onProgress` sink is a one-line closure created fresh per invocation (`(message) => process.stderr.write('cortex sync: ' + message + '\n')`); it is purely a caller-side convenience over `sync()`'s existing `SyncOptions.onProgress` seam.
- `cortex loop-skill-suggest` is a RETIRED, pointed stderr message (exit 1) rather than a live dispatch: the standalone workflow-mining loop is gone and its judgment folds into `cortex pulse-distil` as an extra lens.
- The `tasks` verb branches four ways (`rename`, `plan`, `register`, `verify`); `plan` and `register`/`verify` dynamically import `./tasks-register.js` and supply the real `os.homedir()` and Desktop app-support path — these real defaults are injected ONLY here, so `tasks-register.ts`'s functions stay testable against fixture paths.
- Two retired verbs (`anatomy-refresh-fast`, `loop-anatomy-refresh`) are kept as pointed stderr messages rather than deleted outright. `anatomy-refresh-fast` deliberately returns exit code 0 (not 1, "hook-safe") — a stale git post-commit hook might still invoke it, and a hook must never fail a commit.
- The bottom-of-file guard (`scriptUrl.endsWith(scriptPath)`) lets this module be imported as a library (e.g. by tests calling `run()` directly) without auto-executing `process.argv`.
- The `loop-insight-refresh` verb enforces "exactly one of --fast/--daily/--full" via `Number(fast) + Number(daily) + Number(full) !== 1` — a compact but non-obvious idiom for "exactly one boolean flag set."
- An unrecognized or typo'd `argv[0]` (no matching `if` branch above the fallback) falls straight through to the unguarded default `cortex init [target]` path — it silently scaffolds a full project (`.cortex/`, `.claude/`, `.specflow/`, `CLAUDE.md`, a modified `.gitignore`) in the current directory with no confirmation and no "unknown verb" error. The only guard is init's own existing-`.cortex/`-refusal, so this is safe inside an existing Cortex project but not from an arbitrary directory with a mistyped verb. (claude-sessions/pedropacheco1/f2a2b32d-7342-4527-99e4-a7716db566b6)
- There is no `--help`/`-h` handling anywhere in this dispatcher (nor elsewhere under `src/cli/`) — grepping the file for "help" returns nothing. A `--help` token passed after any verb is just an unrecognized extra argument that branch ignores; the verb still runs for real (e.g. `cortex sync --help` performs an actual sync rather than printing usage). Verified live 2026-08-09; the observed run happened to report zero changes, so no mutation occurred that time, but the flag provides no actual safety. (claude-sessions/pedropacheco1/15ba58ed-d9ef-49ef-800d-27df25cfe94d)

## File map
- Lines 1–38: file-level doc comment enumerating every verb this dispatcher owns and the spec each maps to.
- Lines 39–40: static imports — `init` from `./init.js`, `PROCESS_PROFILES`/`isProcessProfile`/`ProcessProfile` from `./profile.js` (NEW).
- Lines 42–72: `parseLoopFlags` — shared collect/judge/propose-or-report-or-apply flag parser.
- Lines 74–101: `PULSE_LOOP_COMMANDS` — the migration-chokepoint verb set.
- Lines 103–567: `run()` body.
  - Lines 104–120: `hook` dispatch, then the best-effort pulse-layout migration chokepoint.
  - Lines 122–146: `validate`, `pulse-list|accept|reject`, `pulse-hygiene`.
  - Lines 147–158: `usage`.
  - Lines 159–213: the three deterministic loops (`rule-decay`, `atlas-staleness`, `onboarding-drift`), `pulse-distil`, and the retired `loop-skill-suggest` pointed message.
  - Lines 214–249: `loop-bug-triage`, `loop-specflow-lint`, `loop-specflow-verify`.
  - Lines 250–271: retired `anatomy-refresh-fast` (hook-safe exit 0) and `loop-anatomy-refresh` (exit 1) messages.
  - Lines 272–300: `loop-test-runner`/`test-run` and `loop-spec-drift`.
  - Lines 301–344: `insight-refresh-fast` and the three-tier `loop-insight-refresh --fast|--daily|--full`.
  - Lines 346–388: `loop-session-observe` and the retired `loop-insight-gaps` message.
  - Lines 390–432: `scan` and `constellation [--port N]`.
  - Lines 434–441: `insight file|concept|element [--json]`.
  - Lines 443–489: `tasks rename|plan|register|verify`.
  - Lines 491–511: `sync` — builds the `onProgress` stderr sink and forwards `--yes`/target.
  - Lines 513–546: fallback — parses init flags including the NEW `--profile <name>` validation (519–534), then filters positionals.
  - Lines 548–566: calls `init(target, opts)` with `profile` spread in only if present.
- Lines 569–574: direct-invocation guard (`scriptUrl.endsWith(scriptPath)`), calls `run(process.argv.slice(2))` and exits with its return code.

## Connections
Uses:
- src/cli/init.ts: imports `init` — the fallback path for `cortex init [target]`
- src/cli/profile.ts: imports `PROCESS_PROFILES`, `isProcessProfile`, `ProcessProfile` (NEW) — validates the `--profile` flag

Used by:
- (none src-internal — this is the top-level CLI entry point)

Semantically related (not imports):
- src/cli/sync.ts: the `sync` verb dynamically imports `sync` and forwards `--yes`/target plus the `onProgress` stderr sink
- src/pulse/migrate.js: the pulse-loop chokepoint dynamically imports `migratePulseLayout` and calls it best-effort before any of seventeen pulse/loop verbs
- src/pulse/usage.js: the `usage` verb dynamically imports `runUsage`
- src/cli/task-scoping.ts: the `tasks rename` verb dynamically imports `tasksRename` and calls it directly
- src/cli/tasks-register.ts: the `tasks plan|register|verify` verbs dynamically import `tasksPlan`, `registerTasks`, `verifyTasks`, `desktopAppRunning` and supply the real home/app-support-dir
- src/pulse/distil.ts: `pulse-distil` dynamically imports `runDistil`, which also carries the retired skill-suggest loop's workflow-mining lens
- src/hooks/cli.ts, src/schema/cli.ts, src/pulse/review.ts, src/pulse/hygiene.ts, src/constellation/compile.ts, src/constellation/server.ts: each dynamically imported by name inside `run` for its corresponding verb

## Insights
- Any unrecognised `argv[0]` (a typo'd verb, `--version`, `--help`, or any other flag-shaped first argument) falls through every `argv[0] === '<verb>'` check straight into the `cortex init` fallback at the bottom of `run` — there is no usage-error branch for an unmatched verb. Observed recurring live: `cortex --version` printed an `init: refused` message instead of a version string, and `cortex loop-bug-triage --help` silently ran bug-triage's bare autonomous mode (collect → headless judgment subprocess → report) instead of showing help. (claude-sessions/pedropacheco1/48235c09-94b4-4161-80b4-b9bf15253041)

## Query pointers
- If you need to trace a specific `cortex <verb>` to its implementation, grep this file for the `argv[0]` literal, then read the dynamically-imported target module directly.
- If you need the fallback `cortex init` flag contract (including `--profile`), also read src/cli/init.ts (`InitOptions`) and src/cli/profile.ts (`PROCESS_PROFILES`/`isProcessProfile`).
- If you need the `cortex sync` flag contract or its progress-sink shape, also read src/cli/sync.ts (`SyncOptions`, `SyncOptions.onProgress`).
- If you need the `tasks plan|register|verify` registration mechanism, also read src/cli/tasks-register.ts.
- If you need to see which verbs pay the pulse-migration cost, read `PULSE_LOOP_COMMANDS` here together with src/pulse/migrate.ts.
