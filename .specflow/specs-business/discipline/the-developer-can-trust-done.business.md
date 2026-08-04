---
id: discipline.the-developer-can-trust-done
status: implemented
implemented_by:
  - ../../specs/discipline/verification-skill.spec.md
  - ../../specs/discipline/hardening-convention.spec.md
---

# The developer can trust "done" without re-checking it

## Outcome

When this works, "the tests pass" means someone ran the tests this turn and can quote the
output. "It's fixed" means the failing case was re-run and now passes. The developer stops
paying the hidden tax of independently re-verifying every completion claim, because a claim
without evidence is not made in the first place.

The second half of the outcome is that this holds *under pressure*. Disciplines fail not
because an agent disagrees with them but because, three hours into a task with an obvious-
looking change in hand, it generates a plausible reason to skip one. The excuses are
predictable and finite, so they are written down and answered in advance.

## Who this is for

Developers running agentic build loops, where nobody watches each step and a false completion
claim is discovered days later. It applies whichever process profile the project chose.

## User Journey

1. An agent finishes a piece of work and is about to report it complete.
2. Before the claim leaves its mouth, it checks what kind of claim it is and what evidence
   that kind of claim requires — and if it does not hold that evidence from this turn, it goes
   and gets it.
3. Where the evidence cannot be obtained, the agent says what it did not verify instead of
   quietly widening the claim.
4. When the agent feels the pull to skip the step ("this change is trivial", "it passed
   earlier"), it meets the excuse already written down with its rebuttal.

## Business Rules

1. Fresh evidence means evidence from this turn. Evidence from before the last change is not
   evidence about the current state.
2. An unverifiable claim is narrowed or withdrawn, never asserted anyway.
3. The disciplines are stated as one inviolable line plus the list of excuses that defeat it —
   both are required; a rule with no answer to its excuses does not survive contact.
4. These promises hold under every process profile; none of them may depend on a spec tree
   existing.

## Success Metrics

- Zero completion claims that a re-run immediately contradicts.
- Every hardened discipline can name the excuses it expects and its answer to each.
- The disciplines are invoked by both process profiles, not re-implemented per profile.

## Out of Scope

- Deciding *what* to build or in what order — that is the process profile's business.
- Blocking the developer. These are agent-facing disciplines; the human is never gated by them.
- Judging craft or style. Correctness evidence is the subject here; review quality is separate.

## Notes

- Grafted from the Superpowers mechanisms during the 2026-08 absorption round
  (`plans_and_handoffs/plans/2026-08-03.md` §1 bucket 2). The mechanisms are transplanted; the
  upstream skills are not.
