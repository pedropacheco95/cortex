# Protocols: collisions, contention, merging

## Reserve identifiers before dispatch

Parallel sessions all reach for "the next number". Before dispatching, hand each session a
**range**: RULES.md rule numbers, spec rule and criterion numbers in a shared spec, schema
section numbers, `cortex check` rule letters. Sessions self-number inside their range and
mark the identifier **unconfirmed**; you veto rather than approve, so nobody waits on you.

A collision that lands is invisible until someone trips over it. **If two things must have
distinct numbers, there should be a test that says so.**

## Shared files have one owner

`cortex-schema.md`, `RULES.md`, `CLAUDE.md`, the CLI dispatcher and the tests that pin the
skill set are edited by one named session. Others send that session the change they need.

## Append-only lists are keep-both

Some shared files are lists that only grow: spec indexes, `_overview.md` tables, the
`implemented_by:` list of a business spec. A merge conflict in one resolves **keep both**,
never prefer-one, or somebody's entry silently stops existing. Say so in the commit message.

For a *numbered item restated on both sides*, the opposite applies: establish which side is
stale and take the current one.

## Machine contention

Sessions share one machine. `pnpm test` is fast here, so sessions run it freely in their own
worktree. Watch memory, not load, if anything heavier runs.

- **Never kill by process name.** Kill your own PIDs only. Nothing unattended kills what it
  did not start.
- **Identify processes by working directory, not by name.**
- **A starved run is worse than a slow one**, because you cannot trust it and will repeat it.
- The global `cortex` runs the main checkout's `dist/`. In a worktree, run
  `node dist/cli/cli.js` after `pnpm build`, or you are testing someone else's code.

## Merging to main

1. **One at a time, in a stated order**, full suite and `cortex validate` green each time.
   Combination failures exist that neither author can see alone: a guard arriving with the
   rule it demands passes on both branches and fails on the merge.
2. **Say where the merged work lives.** Main here can run ahead of GitHub; until the owner
   asks for a push, the machine is the only copy. Tell the owner when that gap grows.
3. **Freeze the set during verification.** Adding a head invalidates a run in flight.
4. **Require a measurement, not an inference**, for anything that decides whether it merges.
5. **Fix how the result will be read before it exists.** "Green means X, red means Y",
   written down in advance.
6. Remove each worktree and branch after its merge.

## Conflict routing

Conflicts go to **whoever understands both sides**, not automatically to you or the original
author. If a session has already established which side is stale, let it resolve and
*inform* the author afterwards. Warn about the quiet risk in a keep-both resolution: **check
the behaviour afterwards, not that it compiles.**

## Interrupting

Sessions bring you decisions as **plain text**, never a modal question; a modal question
blocks the session that asks it. Interrupt the owner only for what is theirs (see "What this
repo keeps for the owner") and for a genuinely new behaviour no spec or decision covers.
Everything else you decide and document: **it is better to decide and correct than not to
get it done.**
