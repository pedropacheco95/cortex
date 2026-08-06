---
name: specflow-receive-review
description: 'Verify review feedback before applying it. "here is the feedback".'
---

# Specflow: Receive Review

## When to use

Process review feedback with technical rigor instead of performative agreement — verify each
suggestion against the spec, the compass rules, and the code as it actually is before applying
it, and reject the ones that do not hold, with the reason. Use when a review has come back,
when the user says "here's the feedback", "the reviewer said", "address these comments", or
when specflow-develop's review ladder returns findings. Pairs with specflow-request-review.
Disagreements are settled by the spec, a rule, or a command someone can run — never by who
sounded more certain.

## The Iron Law

NO SUGGESTION APPLIED WITHOUT VERIFYING IT FIRST

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this suggestion is obviously right and needs no check, that construction is
the violation.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## The failure this prevents

Agreeing is cheap and checking is not, so an agent under review drifts toward agreement. It
thanks the reviewer, applies the suggestion, and the transcript looks excellent. Two of the
five suggestions were wrong, and working code is now broken in a way that reads, in the diff,
as responsiveness.

A review suggestion is a **claim about your code made by someone who read less of it than you
did**. Claims get checked.

## The loop, per suggestion

Take them one at a time.

**1. Understand it.** What exactly is being claimed — that the code is wrong, that it is
unclear, that a convention exists it does not follow? If the finding does not name a file, a
line, and a fix, it is not actionable: say so and move on.

**2. Verify it against something.** Not against your impression of whether it sounds right:

| The suggestion claims | Check it against |
|---|---|
| The code violates a convention | The compass rule in `.cortex/compass/rules/` — quote it, or the convention does not exist |
| The code doesn't satisfy the spec | The spec's acceptance criterion, read as written |
| The code is functionally wrong | A test. Write it or run it — if it passes, the claim is refuted; if it fails, this was never a review finding, it is a bug |
| Something is duplicated | Open both places. Are they the same contract, or do they merely look alike? |
| A pattern is inconsistent | The surrounding code. Is this the codebase's pattern, or the reviewer's preference? |

**3. Decide, and say why.**

- **Apply** — the claim held. Make the change.
- **Reject** — the claim did not hold. Say what you checked and what you found. "Rejected: the
  duplication is superficial — `compass.ts` validates rule globs against a different contract
  (`check:` predicates); extracting would couple two checks that change independently."
- **Escalate** — you cannot tell, and it matters. Name the specific question and who or what
  could answer it. Do not guess and do not silently drop it.

## Disagreement

When you and the reviewer disagree, the tiebreaker is **the spec, the compass rule, or a
command either of you can run**.

Not seniority. Not which model reviewed. Not how confident the finding sounded — confidence is
uncorrelated with correctness in review feedback, and a firmly-worded wrong suggestion is the
most dangerous kind.

If nothing decides it, it was never a load-bearing finding: record the disagreement and keep
the code as it is. The one that must be resolved is a **compass-rule violation** — that is
gated project law, and it goes to the `specflow-develop` review ladder rather than being
settled by preference.

## Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "The reviewer is probably right — they were looking at it fresh." | Fresh eyes see structure and miss context. They read the diff; you read the spec, the rule, and the surrounding code. Being fresh is an advantage on craft and a disadvantage on whether the change is correct. |
| "Pushing back looks defensive." | Applying a wrong change looks cooperative right up until it breaks, at which point nobody remembers who was gracious. Reject with the evidence and the tone takes care of itself. |
| "It's a small change and applying it is faster than checking." | Small wrong changes are the ones that ship, because nobody re-reviews a one-liner. Checking it is thirty seconds; it is not the slow part of anything. |
| "They said it confidently, so they must have checked." | Confidence in review feedback is a writing style, not evidence. The suggestion still names a claim you can test in one command. |
| "I'll apply it and let the tests catch it if it's wrong." | Only if a test covers it — and if one did, the reviewer's claim would already be settled. You are delegating the check to a mechanism you have not confirmed exists. |
| "Rejecting means I have to justify myself." | You have to say what you checked. That is one sentence, and it is the same sentence that makes the accepted suggestions credible. |

## Output

```markdown
### Review response: [task name]

**Applied** (N)
- [finding] — [what changed]

**Rejected** (N)
- [finding] — checked against [spec criterion / compass rule / command]: [what you found]

**Escalated** (N)
- [finding] — [the specific open question]

**Routed to specflow-bugs** (N)
- [suspected-correctness finding] — filed as a missing/wrong-test signal
```

## What this skill does NOT do

- **Does not accept by default.** Every suggestion is checked.
- **Does not argue about taste.** A non-load-bearing disagreement is recorded, not litigated.
- **Does not settle correctness by discussion.** That routes to a test, via `specflow-bugs`.
