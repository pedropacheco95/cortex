---
name: verification-before-completion
description: 'Evidence gate before claiming work done, fixed, or passing.'
---

# Verification Before Completion

## When to use

Run this before claiming any work is done, fixed, passing, building, or complete. It is the
evidence gate: name the claim, look up what evidence that kind of claim requires, and check
that you hold that evidence from the current turn — not from before your last edit. Use it when
you are about to say "tests pass", "the bug is fixed", "it builds", "the schema validates", "I
didn't touch that file", or any status report a human would act on. Works in any project, under
any build process — it requires no spec tree and no Cortex module. If you are about to write a
completion summary, you are in scope.

## The Iron Law

NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this does not apply to your case, that construction is the violation.

"Fresh" means: produced in the current turn, **after** your most recent change. Evidence from
before the last edit describes a state that no longer exists.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## The gate

Run this before the claim leaves your mouth — not after, not "at the end".

1. **Name the claim.** Write the sentence you are about to say. "All tests pass." "The bug is
   fixed." "Nothing else changed."
2. **Look it up** in the claim→evidence table below. If your claim is not listed, find the
   nearest row; the principle generalises.
3. **Check freshness.** Do you hold that evidence, from this turn, from after your last edit?
   Not "did I run it earlier" — *this turn, after the change*.
4. **If yes:** make the claim and cite the evidence — the command and the part of its output
   that supports the claim.
5. **If no:** obtain the evidence before speaking. Run the command. Then go to 3.
6. **If it cannot be obtained** (no such test exists, the environment is unavailable, the
   check needs credentials you do not have): **narrow the claim** to what you did verify and
   state plainly what you did not. Never make the unqualified claim anyway.

## Claim → required evidence

| Claim | Evidence that discharges it |
|---|---|
| "The tests pass" | The test command run this turn, after the last edit, with its output cited (pass counts, or the failing list being empty). Not a subset run when the claim is about the suite. |
| "The bug is fixed" | The specific failing case re-run this turn and now passing. A green suite that never contained the failing case is not evidence. |
| "It builds" / "it compiles" | The build command run this turn, exit status seen. |
| "The spec / schema is valid" | `cortex validate` run this turn, its output read, violations enumerated or absent. |
| "I didn't change X" | The diff inspected this turn (`git diff`, `git status`) and X absent from it. Memory of intent is not evidence of effect. |
| "It works" / "it's done" | Too vague to verify — decompose it into the claims above and discharge each. If it cannot be decomposed, it cannot be claimed. |
| "The file/config is correct" | The file read back this turn, in its final state, after the last write. |

For a claim not in the table, ask: *what observation would be different if this claim were
false?* Make that observation.

## What "citing evidence" means

Not "I ran the tests and they pass." Rather: the command you ran, and the result line.

> Ran `pnpm test`: 1195 passed, 9 skipped, 0 failed, 84 files.

The citation is what makes the claim checkable by the person reading it. A claim without one
asks them to trust you; a claim with one lets them verify in two seconds.

## Rationalization table

These are the thoughts that actually defeat this gate. When you notice one, you are at the
moment the gate exists for.

| Thought/Excuse | Reality |
|---|---|
| "This change is too trivial to re-verify." | Trivial changes are exactly where untested assumptions hide — a typo'd path, an inverted condition. The re-run costs seconds; the false claim costs the user's trust in every other claim you made. |
| "The tests passed earlier." | Earlier was before your edit. You hold evidence about a state that no longer exists. That is not weaker evidence; it is evidence about something else. |
| "It obviously works — I can see the code is right." | Reading your own code checks your intent, not the system's behaviour. Every shipped bug was obviously right to whoever wrote it. |
| "The user is waiting; I'll verify after I report." | Then you will report something you have not checked, and the verification becomes a formality performed on a claim already believed. Report a minute later and be right. |
| "I'll do one verification pass at the end." | The end is where verification gets cut for time or context. Verify at the boundary you are crossing now, while the evidence is cheap to get. |
| "The test command is slow / expensive." | Then run the narrow case and narrow the claim to match it. Cost is a reason to shrink the claim, never a reason to widen it past the evidence. |
| "It failed for an unrelated reason, so it basically passes." | "Basically passes" is a claim about a run you have not seen succeed. Either the failure is unrelated — prove it and say so explicitly — or it is yours. |

## Worked example

You have just fixed a null-guard in `src/schema/checks/devspec.ts` and are about to write:
*"Fixed — the validator no longer crashes on specs with no frontmatter, and the suite is green."*

Two claims, so two lookups.

- *"no longer crashes on specs with no frontmatter"* → row 2. Required: the failing case re-run.
  You have not run it since the edit; you inferred it from the code. **Go get it**: run the
  validator against the fixture with empty frontmatter, this turn.
- *"the suite is green"* → row 1. Required: the test command this turn. You ran `pnpm test`
  before making the fix. That is stale. **Re-run it.**

Now suppose the re-run shows 1194 passed and 1 failure in an unrelated file. The last
rationalization row applies: you do not get to say "green". You say what is true —

> Ran the empty-frontmatter fixture: passes (previously threw). Ran `pnpm test`: 1194 passed,
> 1 failed — `tests/spec/loops/test-runner.test.ts`, which was already failing on `main` and
> does not touch the validator.

That report is longer and it is correct, which is the whole trade.

## Scope

This skill is process-agnostic. It requires no spec tree, no `.specflow/`, and no Cortex
module — it works in a bare repository. Where a project *does* record its verification
commands (a Cortex project may name them in `.cortex/compass/`), read them and use the
project's own commands instead of guessing; that is enrichment, never a precondition.

Nothing here blocks the human. This is an agent-facing discipline: it constrains what you
assert, not what the user may do.
