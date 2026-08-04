---
id: specflow.craft-review-never-substitutes-for-a-test
status: implemented
implemented_by:
  - ../../specs/specflow/review-pair.spec.md
---

# Code the next person can work with, without review becoming a second gate

## Outcome

When this works, two things that usually get confused stay separate.

Whether the code is *correct* is settled by tests. That question has an authority, it is
mechanical, and it blocks — a failing test stops the work. Whether the code is *good to live
with* is a different question with a different answer: naming, structure, duplication, whether
it looks like the code around it. That one produces advice, and advice does not block a change
whose tests pass.

Keeping them apart removes both familiar failures: the review that holds up a working change
over a variable name, and the green suite that ships something nobody can maintain because
craft was never anyone's job.

The second half of the outcome is that feedback gets checked rather than obeyed. A suggestion
from a reviewer is a claim, and claims are verified before they are applied. An agent that
agrees with everything is not being cooperative; it is being useless in a way that is hard to
notice, because the transcript looks polite.

## Who this is for

Developers whose implementation is done by agents, where nobody reads every diff, and where a
review loop between agents is the only craft feedback the code will get before it lands.

## User Journey

1. A task is implemented and its tests pass.
2. A reviewer looks at *what changed* — against the plan it was supposed to implement and the
   promise that plan cites. Not the whole codebase; the diff.
3. It reports specific, actionable findings: this file, this line, this instead. Vague
   dissatisfaction is not a finding.
4. If the reviewer thinks the code is actually wrong, that is not a review finding — it means a
   test is missing, and it goes to the bug flow where missing tests belong.
5. The implementer checks each suggestion against the spec, the recorded rules, and the code as
   it is — then applies the ones that hold and says why it is rejecting the rest.

## Business Rules

1. Tests decide correctness. Review never overrides a passing test or substitutes for a missing
   one.
2. Craft findings do not block. The single exception is a violation of a recorded project rule,
   which is treated as a real defect.
3. A finding names a place and a fix, or it is not a finding.
4. A suggestion is verified before it is applied, and a wrong one is rejected with a reason.
5. Disagreements are settled by the spec, the rule, or a command someone can run — never by who
   sounded more certain.

## Success Metrics

- No change with a passing suite is blocked by a craft finding.
- Every applied suggestion can be traced to the spec, rule, or observation that justified it.
- Suspected-correctness findings arrive in the bug ledger as missing-test signals rather than
  being argued about in review.

## Out of Scope

- The human's approval. This is agent-to-agent feedback inside a run; humans review specs.
- Deciding what to build, and planning how — upstream of this entirely.
- Fixing correctness bugs. Those route to the bug flow.

## Notes

- Fork 3 of the 2026-08 absorption round (`plans_and_handoffs/plans/2026-08-03.md` §0.6):
  verify-by-test AND code-review, orthogonal. "Technical rigor over performative agreement" is
  carried over from the Superpowers receive-review mechanism.
