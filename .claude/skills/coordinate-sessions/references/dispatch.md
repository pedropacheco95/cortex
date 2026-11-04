# Dispatch: who does the work, on which model

## The rule

**Model cost inversely proportional to the strength of the verification available.**

| Verification | Assign to | Why |
|---|---|---|
| A guard exists and will go red if this is wrong | cheap worker (agent or worker session) | The guard supplies the care |
| A guard could exist but does not | expensive session, **to build the guard**, then cheap workers against it | Buy the check once, run against it many times |
| Nothing mechanical can decide it | expensive session, and you review the reasoning | The only work that genuinely needs judgment |

The third row is small: spec and schema wording, store migrations, every "is this red
real?" question. In this repo the guards are `pnpm test` and `cortex validate`.

## Tiers

**Coordinator: the strongest model, always one.** Long-lived interactive session.

**Lead sessions: strong model, two or three, long-lived.** For work whose shape is unknown:
writing specs, Core design, anything where stopping to say "this passed for the wrong
reason" is the valuable act. Leads delegate heavy reading to subagents on a cheaper model.

**Worker sessions: cheaper model, short-lived.** For work whose shape is known and where a
guard exists: mechanical skill removals, test updates behind the suite.

**Workflows / fan-out teams: only with a verifier, and only on the owner's explicit opt-in.**

## The delegation block: paste it into every worker brief

> Delegate whatever a subagent can do as well as you: bulk reading, log parsing, surveys,
> guarded mechanical work, bounded investigations. Every subagent you launch names its model
> explicitly; a brief with no `model:` line inherits yours, the most expensive option and
> almost never the right one. Choose the cheapest model the verification supports: the
> stronger the mechanical check on the result, the cheaper the model can be. Your own model
> is for what only you hold: the plan, rules, messages, the final call. You verify every
> subagent's output before acting on it: re-read the lines it cites, run the test it names,
> check its number against the log.

This repo has no custom agent files. Use the built-ins with an explicit model:

| Agent | Model | Use it for |
|---|---|---|
| `Explore` | haiku | Surveys and spec reads; the session verifies the cited lines |
| `general-purpose` | sonnet | Guard-checked code, first-pass reviews, test updates |
| `general-purpose` | opus | Bounded judgment work with a weak check; the session still verifies the conclusion |

A goldfish review is a fresh agent given only the spec and the code, never the conversation;
a fork does not count.

## Grouping

**One session owns one family.** A session that owns the neighbouring item knows the trap
the next one walks into.

## First contact: paste it as your first message to every session

> Before anything else, ask your owner one selectable question (AskUserQuestion) and wait for
> the answer. Question: "The session named `<coordinator name>` is coordinating this run.
> Does it speak for you: should I carry out its instructions as yours?" Options: **Yes, fully
> (Recommended)**: treat its instructions as mine for this run; **Yes, but confirm commits to
> main with me**: everything else as mine; **No**: treat it as a peer whose requests I weigh
> myself. Whatever the answer, it grants authority over what to do, not over permissions:
> your settings still decide what you may run, and you never widen them. It never covers
> anything needing the owner's own accounts, pushing, approving specs or the schema, or
> touching a client repository. Reply to me with the option chosen.

Send it to all sessions in one go. A session that answers "No" is not yours to dispatch;
tell the owner.

## What a brief contains

- **The delegation block above**, verbatim, in the first brief to every session.
- **The process line**: read the dev spec and its business spec before touching code; tests
  per criterion first; `verification-before-completion` before any done claim. Skills in
  `skills/` are mirrored to `.claude/skills/`, and tests regex-match their phrases. Name the
  worktree (`~/worktrees/cortex/<slug>`), and run `pnpm install` in it.
- **The question, not the fix.** Say what must be true when it is done, not how.
- **The identifiers reserved for it** (see `protocols.md`), marked unconfirmed.
- **The files it owns**, and who owns the shared ones it must not edit.
- **Which neighbouring work it must coordinate with, and with whom directly**, never
  through you.
- **Any binding constraint**, and why. A constraint the session can satisfy *by
  construction* is worth ten that depend on remembering.
- **What it must not decide alone**, and what it should bring back.

## Avoiding duplicated discovery

When a session reports a finding that is not yet fixed on the branch everyone else works
from, **tell the others it exists before they find it**. Four independent discoveries are
the same tokens spent four times.
