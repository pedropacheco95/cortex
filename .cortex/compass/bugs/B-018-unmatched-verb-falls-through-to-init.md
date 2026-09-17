---
id: B-018
title: Any unmatched first argument — `--help`, `--version`, a mistyped verb — falls through the dispatcher into `cortex init` and scaffolds a project
type: incomplete-rule
severity: high
status: resolved
affects:
  - core-cli.init
  - src/cli/cli.ts
proposed_fix: >-
  Add a Rule to core-cli.init (which governs src/cli/**/*.ts and whose Rule 1 already
  owns "when init refuses") stating the invocation gate the dispatcher never had -
  init runs only when argv[0] is the literal `init`; any other argv[0] that no verb
  branch matched is a usage error (exit 2, nothing written in the project or under
  ~/.claude/, stderr names the unrecognised verb and lists the known ones), and
  `--help`/`-h`/`--version`/`-v` print usage or the package version on stdout and
  exit 0. Same "unrecognised input is a usage error, never a silent fallback" shape
  core-cli.init-profile Rule 2 already fixes for --profile. Add three ACs (unknown
  verb refused; --help writes nothing; mistyped verb with sub-arguments refused) and
  atomic tests that call run([...]) from src/cli/cli.ts inside a temp cwd with HOME
  redirected (the withHomeEnv pattern in tests/atomic/core-cli/sync.test.ts), asserting
  the exit code and that the directory and the fake ~/.claude/scheduled-tasks/ stay
  empty. The explicit init branch must slice argv[0] off before parsing - today the
  verb is only kept out of the target by an indexOf(-1)+1 === 0 accident in the
  positional filter (see body). OPEN QUESTION for the fix round - bare `cortex` with
  no arguments also lands in init today; decide whether it stays an init alias or
  prints usage. The README documents only `cortex init`.
opened: 2026-09-15T17:17:00Z
resolved: 2026-09-16T12:00:00Z
---

# B-018 — an unmatched verb falls through the dispatcher into `cortex init`

## Evidence

Reproduced live on 2026-09-15 with the installed binary (the pnpm shim runs this
repo's `dist/cli/cli.js`, built 16:50 from the HEAD source, package 1.0.0) in an
empty, non-git directory with no `.cortex/`:

```
$ cortex --help
cortex init — summary
Project: /private/tmp/…/verb-fallthrough-repro (schema 3.4)
…
Skills installed: 21
Hooks registered in .claude/settings.json: SessionStart, PreToolUse(Write|Edit), …
Scheduled tasks: 5 written to /Users/pedropacheco1/.claude/scheduled-tasks (5 total).
CLAUDE.md: managed cortex block created.
Spec trees: scaffolded .specflow/specs/ and .specflow/specs-business/ …
Self-validation: conformant.
exit=0
```

After that one command the directory held `.cortex/` (all five modules with their
`_index.md`s, `cortex.config.json`, `constellation.json`, `recall-index.json`),
`.claude/settings.json` with seven hook registrations, `.claude/skills/` with 21
bundles, `.specflow/specs/` + `.specflow/specs-business/`, a `CLAUDE.md` and a
`.gitignore`. Outside the directory it wrote five payload directories
`~/.claude/scheduled-tasks/verb-fallthrough-repro-{daily,weekly-curation,weekly-quality,test-runner,monthly-review}/SKILL.md`
into the user's home. `cortex nonsense` in a fresh copy of the directory did exactly
the same (its summary line read "0 written, 5 existing preserved" only because the
first run had already left the payloads in `~/.claude/`). Both exited 0. The app's
`scheduled-tasks.json` registry was not touched (init writes payloads only, Rule 13).

In this project, which already has `.cortex/`, the same fall-through surfaces as
`cortex --help` printing `cortex init: refused — .cortex/ already exists…` (exit 2):
the Rule 1 preflight is the only thing standing between a typo and a scaffold.
The insight entry for `src/cli/cli.ts` records the same family observed earlier:
`cortex --version` printing the init refusal, and `cortex loop-bug-triage --help`
running bug-triage's bare autonomous mode.

## The chain that broke

1. `run()` (`src/cli/cli.ts:105`) is a flat sequence of `if (argv[0] === '<verb>')`
   branches, `hook` first (line 107) through `sync` last (line 512). Every branch
   returns; none is an `else`, and there is no `argv[0] === 'init'` branch anywhere.
2. Line 531 — `// Otherwise argv is everything after cortex init.` — is the
   fall-through. Nothing checks that `argv[0]` was actually `init`: the block reads
   the init flags out of the whole `argv` (lines 532–559) and calls `init()` at
   line 567 with whatever positional survives the filter at lines 561–563.
3. Why the unmatched verb does not even become the init *target*: the filter is
   `!a.startsWith('-') && i !== timeoutIdx + 1 && i !== profileIdx + 1`. When
   `--timeout-ms` and `--profile` are both absent, both `indexOf` calls return -1,
   so **index 0 is always excluded** — `cortex nonsense` and `cortex init` both
   yield `positional = []`, `target = '.'`, and init scaffolds the cwd. Verified by
   replaying the filter: `["nonsense"] → "."`, `["init"] → "."`,
   `["insihgt","file","src/x.ts"] → "file"`,
   `["init","--timeout-ms","5","--profile","specflow","proj"] → "init"`. So the
   literal `init` verb is kept out of the target only by that `-1 + 1 === 0`
   accident, a mistyped verb with sub-arguments initialises a directory named after
   its second word, and giving both flags makes `init` itself the target. The fix
   must slice the verb off explicitly rather than inherit this.
4. From `init(target, …)` on, everything is spec-conformant init behaviour: Rule 1
   preflight, Rules 2–15, exit 0. The direct-invocation guard (line 590) passes
   `process.argv.slice(2)` straight in, so the shell sees no difference.
5. Origin: the file header (lines 1–38) and the fall-through comment show this file
   began as "the thin argv wrapper for `cortex init`" when init was the only verb;
   every later verb was added as a guarded branch above a default that was never
   re-examined. `git log -- src/cli/cli.ts` shows only verb additions since the
   initial commit — nothing recent caused this; it was first noticed in August and
   not filed.

## Why `incomplete-rule` and not `missing-criterion` or `missing-dev-spec`

Diagnostic tree, node 1: a dev spec governs this behaviour. `core-cli.init` declares
`governs: src/cli/**/*.ts`, which includes the dispatcher, and the unwanted behaviour
*is* init running. Node 2: does it have a rule covering the case? Rule 1 (Preflight)
enumerates when init refuses — `.cortex/` exists, non-macOS, target inside a Cortex
layer — and Rule 16 forbids silent destruction. **No rule says when init is entered
at all.** Every AC begins "When `cortex init` runs"; the premise that the user typed
`init` is assumed, never stated, so the dispatcher had nothing to implement. That is
a rule that is absent, not a stated rule without a criterion (Type 1), and not a
behaviour no spec reaches (Type 4). The project already knows the correct shape:
`core-cli.init-profile` Rule 2 fixed the identical problem one level down
("an unrecognised value is a usage error, never a silent fallback, because a typo
would quietly schedule the wrong loop set"), and its implementation sits at lines
537–551 of the very same fallback block. The verb level was never given the same
rule.

Not filed as Type 4 (a separate `core-cli.dispatch` spec) because the domain
overview lists no such planned spec and every verb's invocation currently lives as
Rule 1 of its own spec; whether the CLI surface deserves its own leaf is a
decomposition decision for the owner, noted in the change plan, not something the
ledger should presuppose.

**Severity high, not critical:** Rule 16 held — nothing pre-existing was destroyed;
every write into an existing `CLAUDE.md` or `.claude/settings.json` is a merge.
But a mistyped command writes roughly fifty files into whatever directory the user
is standing in, five more into their home, registers seven hooks for that
directory, and exits 0. In a non-Cortex project that is an unrequested adoption
the user then has to unpick by hand, and `cortex sync` will happily keep it alive.

## Drift check

`core-cli.developer-sets-up-cortex-in-one-command` (business) journey step 1 —
"the developer … runs the setup command" — and business rule 1 — "Redoing setup on
an already-set-up project requires an explicit confirmation" — both assume setup
was asked for. The dev spec does not contradict the business spec; neither states
that setup runs only on request. No Type 6 drift. The business spec may optionally
gain a one-line rule ("setup runs only when explicitly invoked") in the fix round
but is not invalidated by this bug.

## Reproduction

```
mkdir /tmp/x && cd /tmp/x && cortex --help; echo exit=$?; ls -A; ls ~/.claude/scheduled-tasks | grep '^x-'
```

Expect: an init summary, exit 0, `.cortex .claude .specflow CLAUDE.md .gitignore`
in the directory and five `x-<bundle>` payload directories in `~/.claude/`. Clean
both up afterwards — init does not. Same with `cortex nonsense`, `cortex -v`;
`cortex insihgt file src/x.ts` scaffolds `./file/` instead (chain step 3).

### Change Plan

**Spec to modify:** `.specflow/specs/core-cli/init.spec.md`
**Change type:** Add rule + acceptance criteria (Type 2)

**Add this rule (after Rule 17):**

18. **Invocation gate.** `init` runs only when the first CLI argument is the literal
    `init`, and the dispatcher strips that verb before parsing init's own flags and
    target. Any other first argument that no verb branch matched is a usage error:
    exit 2, nothing written in the project or under `~/.claude/`, and a stderr line
    naming the unrecognised verb and listing the known verbs — the same
    "unrecognised input is a usage error, never a silent fallback" contract
    `core-cli.init-profile` Rule 2 fixes for `--profile`. `--help`/`-h` print usage
    and `--version`/`-v` print the package version, both on stdout, exit 0, nothing
    written. *(Owner decision:)* bare `cortex` with no arguments either stays an
    alias for `cortex init .` or prints usage — pick one and state it here.

**Add these criteria:**

### Unknown verb is refused, not initialised
- **Given** an empty directory on macOS with no `.cortex/`, and `HOME` pointing at an empty temp home
- **When** `cortex nonsense` runs
- **Then** exit 2, the directory and `$HOME/.claude/scheduled-tasks/` are still empty, and stderr names `nonsense` and lists the known verbs

### `--help` prints usage and writes nothing
- **Given** the same directory and home
- **When** `cortex --help` runs
- **Then** exit 0, usage text on stdout, and nothing is created in the directory or under `$HOME/.claude/`

### A mistyped verb with sub-arguments is refused
- **Given** the same directory and home
- **When** `cortex insihgt file src/x.ts` runs
- **Then** exit 2, nothing written (in particular no `./file/`), and stderr names `insihgt`

**Then:**
1. Coherence check — the new rule must not contradict Rule 1's exit-2 contract or `init-profile` Rule 2 (it generalises both).
2. Generate atomic tests for the three criteria in `tests/atomic/core-cli/`, calling `run([...])` from `src/cli/cli.ts` with a temp cwd and `withHomeEnv` (pattern in `sync.test.ts`); update `tests/spec/core-cli/init.test.ts`.
3. Run them — all three must fail today (the first two scaffold the cwd; the third scaffolds `./file/`).
4. Fix `src/cli/cli.ts`: replace the line-531 fall-through with an explicit `argv[0] === 'init'` branch that parses `argv.slice(1)`, a `--help`/`--version` branch, and a terminal unknown-verb branch returning 2. Keep the file-header verb list as the single source for the usage text so the two cannot drift.
5. Refresh the stale file map in `.cortex/insight/anatomy/src/cli/cli.ts.md` (its line numbers predate the `thread` verbs) in the same change or the next insight refresh.
6. Run regression for `core-cli` (`pnpm test:atomic`, `pnpm test:spec`).

### Related

- B-017 "Related" already notes the sibling mechanism inside a *matched* verb:
  `cortex loop-test-runner --help` is not an option the loop parser knows, so it runs
  bare (code-writing) mode. Same family — "unrecognised input takes the success
  path" — different dispatch layer; fixing the top-level gate does not fix that one.
- `core-cli.init-profile` Rule 2 and B-013 (init nested inside an existing Cortex
  layer) are the two prior rounds that hardened init's *inputs*; this entry hardens
  its *entry*.

### Resolution

Resolved 2026-09-16 (recall step 3 commit). `cortex --help`, `cortex -h` and any unmatched verb
print the usage table and exit 2; bare `cortex` is no longer an alias for `init`. Covered by the
core-cli dispatch tests.
