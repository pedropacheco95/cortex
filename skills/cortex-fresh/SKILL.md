---
name: cortex-fresh
description: 'Keep the store from going stale.'
---

# cortex-fresh

## When to use

**This skill is callable-only** — it carries no trigger surface in the skill listing and is not routed into by a matching sentence.

Run by the weekly `fresh` task, or typed as `/cortex-fresh`. Core detects what may have rotted; you read it and say whether it still holds, and you fix what you find. You may edit, merge and retire any file in `cortex/`, following the MAP filing rules. Never write a spec: anything that would change one is a proposal. You write no code, and you neither stage nor commit.

Never spawn a nested `claude` process. Every `cortex` command here runs in the background and is polled with a 10-minute limit. macOS has no `timeout` command, so start it with `&`, poll, and kill it at the limit; a command past its limit is killed, named in your final message and skipped.

## Steps, in order

1. **The write gate.** Apply the write gate of `cortex-remember`. On an unaccepted store, print its refusal line and stop.
2. Run `cortex store expire --apply` and keep its output.
3. Run `cortex tasks collect fresh --json`.
4. Act on each finding by **Changing a store file**, **Stale code files**, **Aged, dead and duplicate** and **Proposals**.
5. Write the record `history/changes/<today>-fresh.md`.
6. Run `cortex store validate` and fix any error in a file this run wrote.
7. Run `cortex tasks heartbeat fresh`.

## Changing a store file

Every edit follows the MAP filing rules. Set `verified` to `<today> (observed)` only after reading the evidence. Add this run's `session:<id>` to the file's `origin` list. Keep one fact in one file.

- **Retiring** a file removes it and repoints or removes links to it. The record names it with its `about` line; git keeps the text.
- **Merging** two files keeps one, adds the other's name and aliases to its `aliases`, joins the `origin` lists, repoints links, and removes the other.

Never edit a file under `history/`.

## Stale code files

For each `stale` file, read the file and the code its `depends_on` names. If the file still holds, update `verified`. If not, correct the text. If the subject is gone, retire the file.

## Aged, dead and duplicate

- **`aged`:** update the file when the repository, the store or a session shows it still holds, and correct it when they show otherwise. When nothing you can read confirms it, leave the file alone, count it as `unconfirmed`, and write one proposal asking a person. The proposal names `citedBy`, and a file nobody cites says so.
- **`deadRules`:** retire the rule when the code its globs named is gone, and correct it when the code moved. Its dead globs go in the record.
- **`nearDuplicates`:** read the pair and merge only if the two files hold one subject. Otherwise count it as `not a duplicate`.
- **`scaffolding`:** fix it with `cortex store map`.
- **`validate`:** fix each error.
- **`openPitfalls.aged`:** read each file against the code. Close a pitfall, by `cortex-remember`'s bug section, only on observed evidence that the fix landed: a commit or a change that shows it. A missing file or symbol is not evidence, because the code may have moved. Without that evidence, write one proposal asking a person, and name the file in the record.

## Proposals

A finding that would change a spec, or that needs a person, is one item appended to `now/proposals.md` by `cortex-remember`'s propose mode, with the id `P-<today>-fresh-<slug of the file's path>` and its evidence: the commit, the age, the dead glob. If a pending item already names the same file, write no new item and count the finding as `already proposed`. `now/proposals.md` is only ever appended to: never rewrite or reorder it.

## The record

Each run writes one new `history/changes/<today>-fresh.md` (first free name: `-2`, `-3`), also when nothing was found, with `kind: other`, `status: done`, `origin: session:<id>`, and one body line each with a count, followed by the paths:

`expired`, `re-verified`, `corrected`, `retired`, `merged`, `not a duplicate`, `unconfirmed`, `scaffolding`, `open pitfalls`, `open pitfalls aged`, `proposed`, `already proposed`.

A quiet run says `Nothing went stale this cycle.` as the last line.

## Limits

Write nothing outside `cortex/`, never a spec, and do not stage or commit: no `git rm`, no `git add`.
