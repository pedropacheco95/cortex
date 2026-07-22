---
id: insight.assistant-understands-codebase
status: implemented
implemented_by:
  - ../../specs/insight/storage-format.spec.md
  - ../../specs/insight/cli.spec.md
  - ../../specs/insight/extract-skill.spec.md
  - ../../specs/insight/refresh-loops.spec.md
  - ../../specs/insight/l1-structural.spec.md
---

# The assistant behaves like it already knows this codebase

## Outcome

When this works, Claude stops treating an unfamiliar codebase as a blank page. Point Cortex at a project — any project, seen for the first time or worked in for years — and a persistent, queryable understanding of the *source code itself* builds up: what each file is for, its important pieces, the non-obvious things worth knowing before touching it, and how it connects to the rest of the codebase, including connections no import statement reveals. That understanding survives across sessions, travels with the project on clone, and keeps itself current as the code moves — so the fifth session on a codebase starts as grounded as the fiftieth.

## Who this is for

The AI assistant working a task in a Cortex-managed project — and, through it, the developer, who no longer pays the cost of the assistant re-deriving context it should already have, and no longer watches the assistant confidently pattern-match to a generic codebase's conventions instead of this one's.

## User Journey

1. A developer points Cortex at a codebase — new to Claude, or one it has worked in before — and asks for it to be understood. Claude reads the codebase's structure, decides how to break it into analyzable pieces, and either proceeds or presents its plan when the scope of the work warrants a look before committing to it.
2. Understanding builds up per file: what a file is for, its important named pieces, the things about it that aren't obvious from a quick read, and how it relates to other files — including files it doesn't import but is nonetheless connected to in what it's for.
3. Before doing substantive work on a file, Claude queries what's already understood about it instead of re-reading it cold; before a change that reaches across files or touches a concept the codebase cares about (auth, billing, retries), it queries that concept and gets back which files carry it and how.
4. When a query comes back empty for something specific — an atomic piece of code too minor to have earned its own rich understanding — Claude is told plainly that nothing rich exists for it, and falls back to the file it lives in, rather than being left guessing or fed a fabricated answer.
5. As the codebase changes, the understanding changes with it on its own cadence — small changes update quickly and cheaply, changes that alter what a file *is* earn a deeper look, and connections that were only ever inferred and never re-confirmed are flagged for another look rather than trusted forever.
6. Throughout, the assistant and the developer both know this understanding is inferred, not reviewed — useful immediately, but never the layer that overrules a project's actual rules or specs when the two disagree.

## Business Rules

1. Understanding is offered as inferred, not authoritative — it is useful immediately and never presented as an enforced rule or a gated fact; where it conflicts with a reviewed rule or a spec, the reviewed layer wins.
2. The understanding is queried, not read off disk — Claude and the developer ask a question and get an answer built for that grain (a file, a concept, an atomic element), never expected to open and parse the underlying store by hand.
3. A miss is honest — an atomic element too minor to have earned rich treatment says so plainly, and remains discoverable through the file that holds it, instead of the query silently returning nothing or something invented.
4. The understanding scales to codebase size — a small codebase is understood as a whole; a large one is broken into coherent pieces first, with parts shared across those pieces understood once, not repeatedly, and the way the assistant queries it never depends on which of those two happened.
5. The understanding stays current in proportion to how much the code actually changed — a change that only reformats or reorders costs nothing; a change to what a file *is* earns a full re-look; and a connection between files that was only ever inferred is re-checked periodically rather than assumed to still hold forever.
6. Every non-obvious connection the understanding asserts carries a reason it believes that, and a mark of how strong that belief is — never a bare, unexplained assertion of relatedness.

## Success Metrics

- On a codebase Claude has never worked in, a query about a specific file or concept returns grounded, specific understanding — not a generic guess — within the same session the codebase was first pointed at.
- Across a session boundary, understanding built up in a previous session about a file or concept is still there and still answers the same query, without having been rebuilt from scratch.
- After a real code change, the understanding of the changed file reflects the change within one refresh cycle, at a depth proportional to how much actually changed.
- Querying an atomic piece of code that was never analyzed deeply returns an honest "nothing rich here" plus a path to the file, never a fabricated description.
- A connection between two files that was only ever inferred, and hasn't been re-confirmed across several refreshes, is surfaced for a second look rather than silently carried forward indefinitely.

## Out of Scope

- Answering open-ended natural-language questions about the codebase directly from a command — that reasoning happens in the assistant's own session, over the answers this understanding layer returns; there is no standalone "ask" surface here.
- Deciding whether an inferred connection or observation should ever become a reviewed rule or decision — that judgment, and the review it requires, belongs to the project's gated knowledge layers, not to this one.
- Any write-time enforcement — this understanding never blocks a change or triggers a warning at the moment of editing; it is consulted by choice, not injected.

## Notes

- This outcome supersedes the v2 outcome of the same shape (`insight.assistant-has-project-knowledge-when-working`) for the codebase-understanding half of that promise; the corrections-and-promotion half (an unreviewed note graduating into reviewed knowledge) is out of scope here and is expected to be re-specified separately against the v3 layout once this substrate ships. That re-specification has now happened: `assistant-learns-from-sessions.business.md` closes the loop this note anticipated.
- The five dev specs in `implemented_by:` split the promise: `insight.l1-structural` is the deterministic structural raw material; `insight.storage-format` fixes what the understanding looks like on disk; `insight.cli` is how it's asked for; `insight.extract-skill` is how it first comes into being; `insight.refresh-loops` is how it stays true over time.
- `insight.session-observe` no longer appears above — its `implements:` now points at `assistant-learns-from-sessions.business.md`, whose automatic, ungated learning is its primary promise. The loop still enriches per-file entries in service of this outcome (a deliberate cross-reference, not a link, since `implements:` is single-valued): a session-observed fact about one file lands here; a session-observed fact about the project as a whole lands in the sibling outcome's `insight/observations/` surface instead.
