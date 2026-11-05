---
name: cortex-quality
description: 'Find spec drift and measure store use.'
---

# cortex-quality

## When to use

**This skill is callable-only** — it carries no trigger surface in the skill listing and is not routed into by a matching sentence.

Run by the weekly `quality` task, or typed as `/cortex-quality`. It checks the spec tree, reads coverage, runs the suite, files failures, runs the two spec jobs and measures how the store is used. It reports and proposes; it fixes nothing. Fixing is an ordinary session. Its two spec jobs only propose: never write a spec.

Never spawn a nested `claude` process. Every `cortex` command here runs in the background and is polled with a 10-minute limit; the suite has its own limit below. macOS has no `timeout` command, so start it with `&`, poll, and kill it at the limit; a command past its limit is killed, named in your final message and skipped.

**Every agent runs in the foreground, or is awaited before the next step.** A headless session can end while a background agent runs, and its work is lost.

## Steps, in order

1. **The write gate.** Apply the write gate of `cortex-remember`. On an unaccepted store, print its refusal line and stop.
2. Run `cortex tasks collect quality --json`.
3. Run the suite.
4. Run the at-rest review.
5. Run the silent-spec job.
6. Write the measurement.
7. Run `cortex store validate` and fix any error in a file this run wrote.
8. Run `cortex tasks heartbeat quality`.

When `ported` is false, skip steps 4 and 5 and the measurement says `not ported`. A step that fails is recorded in the measurement and the next step runs.

## The suite

With a null `testCommand`, the measurement says `no test command configured` and the step is skipped. Otherwise run it once from the project root, with a limit of 30 minutes.

Each failing test is one `##` item in `now/quality-failures.md`: heading `## <test file> › <test name>`, then `until: <today + 14>`, `first seen: <date>`, the criterion its tag names, and at most 20 lines of failure output with no secret. A test already there keeps its `first seen`, and its other lines are refreshed. Remove an item whose test now passes.

Change no code and no test. After the run, name in the measurement any tracked files outside `cortex/` that the suite changed.

## The at-rest review

For each spec in `rotation`, one fresh agent runs **spec mode** of `specflow-review`. Give it the spec path and the repository root and nothing else: never this session's conversation, and a fork does not count.

Findings keep that skill's format and go to `now/quality-findings.md` as one `##` item per spec, heading `## <spec id> <today>`, with `until: <today + 14>`. A finding that would change a spec or a rule also becomes one item in `now/proposals.md` by `cortex-remember`'s propose mode, id `P-<today>-quality-<slug>`. That file is only ever appended to.

## The silent-spec job

It finds working behaviour no spec describes. On `area`, in this order:

1. **Tickets.** One fresh agent sees only `specflow/INDEX.md` and that area's spec files, no code in view, and writes 5 change requests as JSON `[{ slug, prompt }]`: one to three sentences each, from the user's point of view, each on a different part of the area, with no spec id, rule number, file name or technical term, nothing the specs forbid, at least one changing a limit, one changing what a person sees, one adding a small behaviour.
2. **The nothing-agent.** For each ticket, run `git worktree add --detach <os tmpdir>/cortex-quality-<today>/<slug> HEAD`, then delete `specflow/`, `.specflow/`, `cortex/`, `.claude/`, `CLAUDE.md` and `AGENTS.md` inside it. One fresh agent gets only the ticket text and that folder, and implements the ticket there without committing.
3. **Flags.** From the project root, run `cortex tasks collect quality --flags <folder> --base <HEAD sha> --json`. At most 10 flags per ticket go on; count the rest.
4. **Classifier.** One fresh agent per ticket gets the flagged files, their diff and the area's spec text, and classifies each flag `described` or `not described`, quoting the spec line for `described`. Each `not described` becomes an item in `now/proposals.md` proposing a missing criterion, id `P-<today>-silent-<slug>`.
5. **Discard.** Remove and prune every throwaway worktree (`git worktree remove --force <folder>`, then `git worktree prune`), also after a failure, and say so in the measurement. No edit from the job reaches any branch.

A ticket on which the agent edits nothing is counted as `blind`: it is the method's known limit.

## The measurement

One new `history/measurements/<today>-quality.md` per run (first free name: `-2`, `-3`): `about`, `permanence: stable`, `verified: <today> (observed)`, `origin: session:<id>`. These headings, in this order, each with its numbers, never omitted:

- `## Specs`: lint errors and warnings, or `lint not run` when `lint.notRun` is set, then criteria, tagged, unverified, untagged tests;
- `## Tests`: passed, failed, new failures, failures open more than 7 days, or the skip reason;
- `## At-rest review`: specs reviewed, findings by severity, proposals written;
- `## Reviewed specs`: one line `- <spec id> <YYYY-MM-DD>` per spec reviewed;
- `## Silent-spec job`: tickets, blind, flags, flags over the limit, `described`, `not described`, worktrees removed;
- `## Store use`: the `usage` counts, and `filed` against `alreadyThere` as a ratio;
- `## Store shape`: the `store` key.

## Limits

Write nothing outside `cortex/` and the throwaway worktrees, never a spec, and do not stage or commit: no `git rm`, no `git add`.
