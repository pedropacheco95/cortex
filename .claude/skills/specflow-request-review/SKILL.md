---
name: specflow-request-review
description: 'Review a completed task diff for craft, anchored to its plan task and spec criterion. "review this", "review the diff", "code review". Correctness belongs to the tests, not to this review.'
---

# Specflow: Request Review

## When to use

Review a completed task's diff for craft — naming, structure, duplication, whether it matches
the patterns around it — anchored to the plan task and the spec criterion that task cites,
never an open-ended sweep of the codebase. Correctness belongs to the test suite: a reviewer
who suspects the code is functionally wrong reports a missing-test signal instead of a verdict.
Findings are non-blocking on function, with one exception — a compass-rule violation is
load-bearing. Use after a task's tests pass, when the user says "review this", "review the
diff", "code review", or when specflow-develop reaches its review ladder. Pairs with
specflow-receive-review.

## The Iron Law

NO FINDING WITHOUT A FILE, A LINE, AND A FIX

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this observation is useful without being specific, that construction is the
violation.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## What this is for

Craft. Whether the next person can work with this code: naming, structure, duplication, whether
it looks like the code around it, whether it will be understood in six months.

**Correctness is not your job here.** The test suite owns that, it is mechanical, and it
already ran. This review is additive — it never becomes a second gate over a change whose
tests pass.

## Scope: the diff, not the tree

You are reviewing **what changed**, against:

1. **The plan task** it implements — did it do the thing the plan said, in the place the plan
   said?
2. **The spec criterion** that task cites — does the change serve the promise it claims to?
3. **The compass rules** whose `governs` globs match the touched files — read
   `.cortex/compass/rules/` so your feedback cites recorded conventions rather than your taste.

Code the diff did not touch is **out of scope**. It was not changed here, nobody agreed to
change it, and reviewing it turns every task into a refactor. If you find something genuinely
bad outside the diff, say so in one line at the end as a note — not as a finding on this task.

## Writing a finding

Every finding has three parts. Missing any one of them, it is not a finding:

```markdown
- **`src/schema/checks/devspec.ts:88`** — the `governs` glob validation duplicates the identical
  block in `compass.ts:41-60`.
  **Instead:** extract `validateGovernsGlobs(data, filePath)` into `checks/shared.ts` and call
  it from both. (Standing authority: extraction preference — two modules, one contract.)
```

- **Where** — file and line.
- **What** — what is wrong, concretely.
- **Instead** — what to do about it. A finding without a fix is a complaint.

Rank them. Three findings that matter beat eleven that include three that matter.

## When you think the code is actually wrong

Stop. Do not write a correctness verdict.

If the code were verifiably wrong, a test would be failing — and none is. So one of two things
is true, and both are the same finding:

- there is **no test for this case** (a missing criterion), or
- there is a test and it **encodes the criterion wrongly**.

Report it as a **missing-test signal** and route it to `specflow-bugs`, which will classify it
(likely Type 1 — missing acceptance criterion, or Type 7 — wrong/missing test). That produces a
test, which produces an answer. Your intuition that "this looks wrong" is a good reason to go
get evidence and a bad reason to assert a verdict over a green suite.

## What blocks and what does not

**Nothing here blocks a change whose tests pass — with one exception.**

A finding that the code **violates a compass rule** is load-bearing: rules are the project's
recorded, gated constraints, not preferences. Mark it as such; it feeds the `specflow-develop`
review ladder, where a load-bearing finding surviving five rounds halts the work.

Everything else — naming, structure, duplication, a pattern you would have chosen differently —
is recorded and does not block. Say so explicitly when you report, so the receiving agent does
not treat advice as a gate.

## Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "The whole file is a mess — I should review all of it." | Then say so in one line as a note and review the diff. An unrequested refactor smuggled in through a review is how a two-line task becomes a two-hundred-line one nobody agreed to. |
| "This is obviously wrong, I don't need a test to say so." | The suite is green, so "obviously wrong" is a hypothesis. Turn it into a missing-test signal and you get an answer; assert it and you get an argument. |
| "'This could be cleaner' is a legitimate observation." | It is an observation, not a finding. The receiving agent cannot act on it, so it costs attention and buys nothing. Name the line and the alternative or drop it. |
| "I'll list everything I noticed so nothing is missed." | Eleven findings get skimmed and the three that mattered get skimmed with them. Ranking is part of the work, not a nicety. |
| "It doesn't follow the pattern I'd use, so it's a finding." | Is it the pattern the surrounding code uses, or the one you prefer? The first is a finding and you can cite it. The second is taste, and taste does not survive being written down as a defect. |
| "Craft findings should block — otherwise nobody fixes them." | Then they block working changes over naming, and within a week reviews get skipped entirely. Non-blocking findings that are recorded outlive blocking ones that get bypassed. |

## Output

```markdown
### Review: [task name]
**Anchored to:** [plan task] → [spec id] "[criterion]"
**Tests:** passing (correctness is not in scope here)

**Load-bearing** (compass-rule violations only)
- [finding, or "none"]

**Craft findings** (non-blocking)
1. [ranked findings]

**Missing-test signals** (routed to specflow-bugs)
- [finding, or "none"]

**Out-of-diff notes** (not findings)
- [one line each, or omit]
```

Hand the result to `specflow-receive-review`.

## What this skill does NOT do

- **Does not decide correctness.** Tests do.
- **Does not edit code.** It reports; `specflow-receive-review` decides what to apply.
- **Does not review outside the diff.**
- **Does not gate the human.** This is agent-to-agent feedback inside a run.
