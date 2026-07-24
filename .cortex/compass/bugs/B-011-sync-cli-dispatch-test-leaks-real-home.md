---
id: B-011
title: sync CLI-dispatch tests leaked 45 real scheduled-task directories into the actual ~/.claude/scheduled-tasks/ before HOME was stubbed
type: test-defect
severity: high
status: resolved
affects:
  - core-cli.sync
  - src/cli/cli.ts (run — the dispatcher, no injectable `home`)
  - src/cli/sync.ts (sync — resolves os.homedir() when no `home` option is passed)
  - tests/atomic/core-cli/sync.test.ts
proposed_fix: Add a withHomeEnv() test helper that redirects process.env.HOME for the duration of a CLI-dispatch call, apply it to every existing and new test in sync.test.ts that calls run(['sync', ...]) instead of sync() directly with an explicit home option.
resolved: 2026-07-22T18:24:02Z
opened: 2026-07-22T18:24:02Z
---

# B-011 — `cortex sync` CLI-dispatch tests wrote real scheduled-task directories into the user's actual home

## Evidence

Found live-testing `cortex sync` against a real project (`berd`) during this round.
Inspecting `~/.claude/scheduled-tasks/` on this machine turned up 45 directories
matching `cortex-init-sync-atomic-r12-noforce-proj-<timestamp>-10-*` — five per
run (`daily`, `monthly-review`, `test-runner`, `weekly-curation`, `weekly-quality`),
accumulated across nine separate test invocations, none of which the user ever ran
`cortex sync` for. Traced to `tests/atomic/core-cli/sync.test.ts`'s "Rule 12: sync
has no --force flag" describe block: it built a fixture `root` and `home` via
`bootstrap()`, but then called `run(['sync', root, '--force'])` — the real CLI
dispatcher (`src/cli/cli.ts`) — instead of calling `sync(root, { home, ... })`
directly. `run()` has no seam to inject `home`; `sync.ts` resolves it via
`os.homedir()` whenever no `home` option is supplied, and by design that must stay
true for real usage (a real `cortex sync` should write to the real machine's
scheduled-tasks directory). The fixture `home` the test built was therefore never
consulted — every scheduled-task payload the run wrote landed under the actual
`~/.claude/scheduled-tasks/` instead.

## Diagnosis (seven-type classification)

1. **Dev spec governing this behaviour?** YES — `core-cli.sync`
   (`.specflow/specs/core-cli/sync.spec.md`) Rule 8 owns scheduled-task payload
   refresh; `src/cli/sync.ts` implements it, resolving `home` via `os.homedir()`
   when no override is given — this is the *correct*, spec-conformant production
   behaviour, not a defect in the rule.
2. **Does the spec have a rule covering this case?** N/A to the actual bug — the
   rule correctly describes real usage. The break is not in what `sync.ts` does,
   but in how a *test* exercised it: `core-cli.sync`'s AC family already includes
   "Task payloads refresh and the instruction block appears when unregistered"
   with "a stubbed home directory" as an explicit Given — the convention that
   every test dispatching through the payload-writing path must supply a stubbed
   home was already established elsewhere in the same suite; this one test simply
   didn't follow it.
3. Walking the tree for the actual defect: is there a wrong/missing test? YES —
   the "Rule 12: sync has no --force flag" test called the real CLI dispatcher
   with no mechanism redirecting `os.homedir()`, so it exercised the payload-write
   path against the real machine. First relevant NO is at the test-correctness
   step, not at spec/rule/criterion — the spec, rule, and code are all correct;
   only the test's own isolation was wrong.

**Type: test-defect.** Not incomplete-rule or missing-criterion: `core-cli.sync`
already states (and other tests in the same file already demonstrate) that a
stubbed home is required to exercise this path safely; this test alone omitted it.

Severity **high**: 45 real directories accumulated silently in the user's actual
home directory across routine test runs, with no error or test failure signalling
the leak — this is exactly the kind of test-isolation defect that pollutes a real
machine rather than a disposable fixture, and would have kept accumulating on
every future `pnpm test` run.

## Intended semantics

Any test that exercises `cortex sync` (or `cortex init`) through the real CLI
dispatcher (`run([...])` in `src/cli/cli.ts`) — as opposed to calling `sync()`/
`init()` directly with an explicit `home` option — must redirect
`process.env.HOME` for the duration of that call. `os.homedir()` reads `$HOME`
first on POSIX (this project is macOS-only, RULES.md rule 5), so a temporary
environment-variable override is sufficient; no spy on the `os` module namespace
is needed.

## Resolution (2026-07-22)

**Test (`tests/atomic/core-cli/sync.test.ts`):** added a `withHomeEnv(home, fn)`
helper that swaps `process.env.HOME` to the fixture home for the duration of an
`async` callback and restores the original value (or deletes the key, if it was
previously unset) in a `finally`. Applied it to:
- the existing "Rule 12: sync has no --force flag" CLI-dispatch test (the one
  that leaked), now `await withHomeEnv(home, () => run(['sync', root, '--force']))`;
- a new regression test, "B-011 regression: cortex sync CLI dispatch honours a
  stubbed os.homedir(), never the real one" — dispatches `run(['sync', root])`
  through `withHomeEnv`, then asserts the five scheduled-task payload directories
  exist under the stubbed `home`, proving the dispatch actually resolved `home`
  through `os.homedir()` (the only seam `sync.ts` reads absent an explicit
  option) rather than some cached or hardcoded path;
- the preflight-refusal CLI-dispatch test (`bareRoot`) as belt-and-suspenders,
  since that path exits before `home` is ever used for I/O but should stay safe
  under a future reordering.

**Verification:** confirmed no other test file dispatches `sync`/`init` through
`run([...])` — `tests/atomic/core-cli/init.test.ts` and the `tests/spec/core-cli/`
counterparts call `sync()`/`init()` directly with an explicit `home` option and
never touch the dispatcher, so `sync.test.ts` was the only leak vector. Counted
`~/.claude/scheduled-tasks/cortex-init-sync-*` before and after running
`tests/atomic/core-cli tests/spec/core-cli` (191 tests, all passing): 45 before,
45 after — the count did not increase, confirming the fix holds. The 45
pre-existing leaked directories from before this fix landed were left in place
(not deleted) pending explicit user approval, since they sit in the user's real
home directory outside any fixture root.

**Tests:** `pnpm vitest run tests/atomic/core-cli tests/spec/core-cli` — 8 files,
191 passed.
