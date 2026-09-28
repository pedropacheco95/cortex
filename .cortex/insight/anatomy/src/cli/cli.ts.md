---
path: src/cli/cli.ts
extracted_at: 2026-09-22T00:00:00Z
extraction_level: 3
size_lines: 739
size_tokens: 8378
centrality: high
built_at_commit: "a66041b"
source_sha256: "ea51308b2f8de4af87918d556ce34ae43370c721d701a93b8f2115246778865c"
---
# src/cli/cli.ts

## Purpose
The thin argv dispatcher for the `cortex` binary — routes every CLI verb to its owning module, almost entirely via dynamic `await import(...)` so the process's static require graph stays minimal. Significant change this pass (core-cli.init Rule 18, B-018): `cortex init` is no longer the unguarded fall-through default for any unmatched `argv[0]`. `run` now ends with an explicit `USAGE_TABLE`-driven usage system — `USAGE_TABLE` (the single source of every live verb's one-line synopsis, mirrored by the header docblock's `Verbs:` line and asserted equal by `tests/atomic/core-cli/dispatch.test.ts`), the exported `usageText(unrecognised?)`, and the exported `USAGE_VERBS` — and `cortex init [target]` only runs on the literal verb `init`, with its own flag/target parsing now scoped to `rest = argv.slice(1)` rather than the whole `argv`. Any other unmatched first argument, `--help`, `-h`, and a bare `cortex` all print the usage text and exit 2 having written nothing; bare `cortex` is deliberately NOT an init alias. Four new verbs landed alongside this: `usage [--record]` (the read-side adoption report, added to `PULSE_LOOP_COMMANDS`), `thread list|drop|close|promote …` (the human verbs over the threads ledger, also pulse-migration-gated), `id next rule|bug [--slug <slug>]` (the human id-registry allocator, refusing with exit 1 when no `.cortex/` exists and exit 2 on bad grammar), and `why <ref>`/`recall <word…>` (the pull side of recall, both dispatched together to `recall/cli.ts`). `cortex scan` now also writes the recall index and rewrites the two atlas `_index.md` generated blocks after the constellation compile, mirroring the sequence `init` runs at its own Rule 3.

## Main players
- `run` (lines 178–731) — the dispatch function; matches `argv[0]` against roughly twenty-five verb branches, each dynamically importing its handler and awaiting it, returning a process exit code. Now owns `usage`, `thread`, `id`, `why`/`recall`, and the Rule-18-gated `init`/usage-fallback tail. [critical]
- `USAGE_TABLE` (lines 63–94, NEW) — the ordered `[verb, synopsis]` pairs that are the single source of the usage text; retired verbs (`loop-skill-suggest`, `anatomy-refresh-fast`, `loop-anatomy-refresh`, `loop-insight-gaps`) still match in `run` with a pointed message but are deliberately absent from this table. [critical]
- `usageText` (lines 107–114, NEW, exported) — renders the usage text; with an `unrecognised` argument the first line names it, otherwise identical for `--help`/`-h`/bare invocation. Deterministic — no environment or package-version read. [critical]
- `USAGE_VERBS` (line 97, NEW, exported) — `USAGE_TABLE`'s verb names in order; what the header docblock's `Verbs:` line mirrors, test-pinned against drift. [supporting]
- `PULSE_LOOP_COMMANDS` (lines 148–176) — the verb set that triggers the one-shot `migratePulseLayout` call before real dispatch; now also includes `usage` and `thread` (NEW). Hooks are deliberately excluded — they self-heal per-file instead of paying for a full-tree scan on a latency-critical path. [critical]
- `parseLoopFlags` (lines 116–146) — shared flag parser for the collect/judge/propose-or-report-or-apply loop commands (`pulse-distil`, `loop-bug-triage`); unchanged this pass. [supporting]

## Insights
- **Rule 18/B-018 closes a real, previously-documented failure mode.** The prior extraction of this file recorded, from a live session observation, that an unrecognised `argv[0]` (a typo'd verb, `--version`, `--help`) fell straight through every branch into the unguarded `cortex init` fallback — `cortex --version` printed an `init: refused` message instead of a version string, and `cortex loop-bug-triage --help` silently ran bug-triage's autonomous mode instead of showing help. This pass's diff shows that fallback replaced outright: `init` is now reached only via `if (argv[0] === 'init')`, and every other path (empty argv, `--help`, `-h`, any other unmatched token) goes through `usageText`/`USAGE_EXIT` (exit 2, nothing written). The observation that motivated the fix is now historical, not current behaviour — confirmed by reading the current source, not assumed from the stale entry.
- The `init` branch's own doc comment (lines 658–662) names the specific old bug directly: the previous parsing kept the verb out of the target only by accident, because an absent `--timeout-ms`/`--profile` made `indexOf(-1) + 1 === 0` exclude index 0 from the positional filter — i.e. it worked, but for the wrong reason, and would have broken had the flag-index arithmetic ever changed. Scoping to `rest = argv.slice(1)` removes the coincidence.
- `cortex scan`'s recall-index and index-block steps (lines 476–483) are the read-time mirror of `init`'s Rule 3 additions in `init.ts` — both now produce `constellation.json` + `recall-index.json` + the two atlas generated blocks in the same order, so a fresh project and a re-scanned one stay in the same regenerable-artefact shape.
- `id`'s grammar validation (lines 535–568) is unusually strict for this file's normal "just forward the rest" dispatch style: it hand-parses `next rule|bug [--slug <slug>]`, checks for `.cortex/cortex.config.json` existence itself (rather than delegating that check to `compass/registry.ts`), and prints the allocated id ALONE on stdout — deliberately scriptable (`ID=$(cortex id next bug)`), unlike every other verb's multi-line summary output.
- Nearly every branch still does `await import('../X.js')` rather than a static top-of-file import — the static import graph resolves only `src/cli/init.ts` and `src/cli/profile.ts` as structural dependencies; the real fan-out (now also including `pulse/thread-cli.js`, `compass/registry.js`, `recall/cli.js`, `recall/index.js`, `recall/index-blocks.js`) is invisible to static analysis and exists only at runtime.
- Two retired verbs (`anatomy-refresh-fast`, `loop-anatomy-refresh`) remain pointed stderr messages rather than deletions; `anatomy-refresh-fast` still returns exit 0 ("hook-safe") since a stale git post-commit hook might still invoke it and must never fail a commit.
- The bottom-of-file guard (`scriptUrl.endsWith(scriptPath)`) still lets this module be imported as a library (e.g. tests calling `run()` directly) without auto-executing `process.argv`.

## File map
- Lines 1–52: file-level doc comment enumerating every verb this dispatcher owns (now including `usage`, `thread`, `id`, `why`/`recall`) and its Rule-18 invocation-gate paragraph plus the test-pinned `Verbs:` mirror line.
- Lines 53–54: static imports — `init` from `./init.js`, `PROCESS_PROFILES`/`isProcessProfile`/`ProcessProfile` from `./profile.js`.
- Lines 56–94: `USAGE_TABLE` doc comment + array (NEW).
- Lines 96–100: `USAGE_VERBS`, `USAGE_EXIT` (NEW).
- Lines 102–114: `usageText` (NEW).
- Lines 116–146: `parseLoopFlags`.
- Lines 148–176: `PULSE_LOOP_COMMANDS` (now incl. `usage`, `thread`).
- Lines 178–731: `run()` body.
  - Lines 180–195: `hook` dispatch, then the best-effort pulse-layout migration chokepoint.
  - Lines 197–221: `validate`, `pulse-list|accept|reject`, `pulse-hygiene`.
  - Lines 222–235: `usage` (NEW).
  - Lines 236–276: the three deterministic loops (`rule-decay`, `atlas-staleness`, `onboarding-drift`), `pulse-distil`, retired `loop-skill-suggest`.
  - Lines 291–326: `loop-bug-triage`, `loop-specflow-lint`, `loop-specflow-verify`.
  - Lines 327–348: retired `anatomy-refresh-fast` (exit 0, hook-safe) and `loop-anatomy-refresh` (exit 1).
  - Lines 349–377: `loop-test-runner`/`test-run`, `loop-spec-drift`.
  - Lines 378–421: `insight-refresh-fast`, three-tier `loop-insight-refresh --fast|--daily|--full`.
  - Lines 423–465: `loop-session-observe`, retired `loop-insight-gaps`.
  - Lines 467–494: `scan` (now also recall index + index blocks).
  - Lines 496–519: `constellation [--port N]`.
  - Lines 521–528: `thread` (NEW).
  - Lines 530–568: `id` (NEW).
  - Lines 570–577: `why`/`recall` (NEW).
  - Lines 579–586: `insight file|concept|element`.
  - Lines 588–634: `tasks rename|plan|register|verify`.
  - Lines 636–656: `sync`.
  - Lines 658–719: `init` — now gated behind the literal verb (Rule 18), `--profile` parsing at 673–685.
  - Lines 721–731: Rule 18 terminal branches — usage/help/unrecognised (NEW).
- Lines 733–738: direct-invocation guard (`scriptUrl.endsWith(scriptPath)`).

## Connections
Uses:
- src/cli/init.ts: imports `init` — the handler for the now Rule-18-gated `cortex init [target]` verb.
- src/cli/profile.ts: imports `PROCESS_PROFILES`, `isProcessProfile`, `ProcessProfile` — validates the `--profile` flag.

Used by:
- (none src-internal — this is the top-level CLI entry point)

Semantically related (not imports, all via dynamic `await import`):
- src/cli/sync.ts: `sync` — the `sync` verb, forwarding `--yes`/target plus an `onProgress` stderr sink.
- src/pulse/migrate.ts: `migratePulseLayout` — the pulse-loop chokepoint, best-effort before any `PULSE_LOOP_COMMANDS` verb.
- src/pulse/usage.ts: `runUsage` — the `usage` verb (NEW).
- src/pulse/thread-cli.ts: `threadCli` — the `thread` verb (NEW).
- src/compass/registry.ts: `allocateId` — the `id next` verb (NEW).
- src/recall/cli.ts: `recallCli` — the `why`/`recall` verbs (NEW).
- src/recall/index.ts, src/recall/index-blocks.ts: `writeRecallIndex`, `writeRecallIndexBlocks` — the `scan` verb's new second and third steps (NEW use).
- src/cli/task-scoping.ts: `tasksRename` — `tasks rename`.
- src/cli/tasks-register.ts: `tasksPlan`, `registerTasks`, `verifyTasks`, `desktopAppRunning` — `tasks plan|register|verify`, supplying the real home/app-support-dir.
- src/pulse/distil.ts: `runDistil` — `pulse-distil`, carrying the retired skill-suggest loop's workflow-mining lens.
- src/hooks/cli.ts, src/schema/cli.ts, src/pulse/review.ts, src/pulse/hygiene.ts, src/constellation/compile.ts, src/constellation/server.ts: each dynamically imported by name for its corresponding verb.

## Query pointers
- If you need to trace a specific `cortex <verb>` to its implementation, grep this file for the `argv[0]` literal, then read the dynamically-imported target module directly.
- If you need the usage/help contract, read `USAGE_TABLE`/`usageText`/`USAGE_VERBS` here, then `tests/atomic/core-cli/dispatch.test.ts` (the drift-pin between the docblock and the table).
- If you need the fallback `cortex init` flag contract (including `--profile`), also read src/cli/init.ts (`InitOptions`) and src/cli/profile.ts (`PROCESS_PROFILES`/`isProcessProfile`).
- If you need the `cortex sync` flag contract or its progress-sink shape, also read src/cli/sync.ts (`SyncOptions`, `SyncOptions.onProgress`).
- If you need the id-allocation or recall verbs' actual behaviour, read src/compass/registry.ts (`allocateId`) or src/recall/cli.ts (`recallCli`) respectively — this file only forwards argv.
- If you need to see which verbs pay the pulse-migration cost, read `PULSE_LOOP_COMMANDS` here together with src/pulse/migrate.ts.
