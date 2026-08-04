---
id: specflow.review-pair
status: implemented
depends_on:
  - specflow.plan-skill
  - specflow.develop-split
  - discipline.hardening-convention
implements: ../../specs-business/specflow/craft-review-never-substitutes-for-a-test.business.md
governed_by: []
governs:
  - "skills/specflow-request-review/**"
  - "skills/specflow-receive-review/**"
---

# `specflow-request-review` / `specflow-receive-review` — craft review, anchored and orthogonal

## Intent

Plan §3 item 3.4 and Fork 3 (§0.6): verification-by-test and code review are **orthogonal**.
Tests are the correctness authority and a mandatory gate; review is a craft lens that is
additive and non-blocking on function. Merging them produces the two familiar failures — a
review that blocks a shipping change over naming, and a green suite that ships code nobody
could maintain.

Two skills because the two halves fail differently. **Requesting** a review fails by being
unanchored: "review this code" invites an open-ended sweep that finds everything and prioritises
nothing. It is anchored to the **diff versus the plan and spec** instead. **Receiving** a review
fails by performative agreement: an agent thanks the reviewer and applies a suggestion that is
wrong, because agreeing is cheaper than checking.

This is consistent with "humans review specs, not code" — this review is agent-to-agent craft
feedback inside a run, not the human's approval gate.

## Entities

- **READS:** the diff for the task under review; the plan task it implements and the spec
  criterion that task cites; the compass rules in `.cortex/compass/rules/` whose `governs`
  globs match the touched files; the surrounding code for pattern comparison.
- **WRITES:** nothing directly. `request-review` returns findings; `receive-review` returns
  a verified accept/reject decision per finding, and the applying agent makes the edits.
- **CREATES:** nothing.

## Rules

1. **Anchored to the diff, not the tree.** `request-review` reviews the change against the plan
   task and the spec criterion it cites. Pre-existing code outside the diff is out of scope: it
   was not changed here, and reviewing it turns every task into a refactor.
2. **Craft, not correctness.** Correctness is the test suite's job. A reviewer who thinks the
   code is wrong reports a **missing-test signal** (route to `specflow-bugs`, likely Type 1 or
   7), not a correctness verdict — because if it were verifiable, a test would already be
   failing.
3. **Non-blocking on function.** No review finding blocks a change whose tests pass, with one
   exception: a finding that the code violates a **compass rule** is load-bearing and feeds the
   `specflow-develop` review ladder (`specflow.develop-split` Rule 9).
4. **Findings are specific and actionable.** Each names the file and line, what is wrong, and
   what to do instead. "This could be cleaner" is not a finding.
5. **Technical rigor over performative agreement.** `receive-review` **verifies each suggestion
   before applying it** — against the spec, the compass rules, and the code as it actually is.
   A suggestion that is wrong is rejected with the reason. Agreement is not politeness; applying
   a wrong suggestion because a reviewer said it is how correct code gets broken by review.
6. **Disagreement is resolved by evidence, not seniority.** When the reviewer and the
   implementer disagree, the tiebreaker is the spec, the compass rule, or a command either can
   run — never who said it or how confident they sounded.
7. **The pair carries no insight instruction.** They read a diff against a plan; the inferred
   understanding layer adds nothing they need, and `specflow.insight-awareness`'s excluded set
   is extended to include them.
8. **Cortex awareness.** `request-review` is Moderate tier — read the compass rules governing
   the touched files so craft feedback cites recorded conventions rather than taste.
   `receive-review` is Light tier — one note: verify a suggestion against the gated layers
   before applying it (`specflow.cortex-awareness` Rule 1).
9. **Both carry Iron Laws and rationalization tables** per `skills/_conventions/hardening.md`.

## Acceptance Criteria

### Review checks craft against the plan, not correctness

- **Given** a completed task
- **When** `specflow-request-review` runs
- **Then** it checks the diff against the plan task and its spec criterion for craft, states
  that correctness is the test suite's authority, and scopes out code the diff did not touch

### A suspected correctness problem becomes a missing-test signal

- **Given** a reviewer who believes the code is functionally wrong
- **When** the finding is written
- **Then** the body routes it to `specflow-bugs` as a probable missing or wrong test rather
  than recording a correctness verdict

### Findings do not block a passing change, except on a compass-rule violation

- **Given** a change whose tests pass and a craft finding against it
- **Then** the body states the finding is non-blocking, and that a compass-rule violation is
  the one load-bearing exception, feeding the develop review ladder

### A questionable suggestion is verified before it is applied

- **Given** a review suggestion that is wrong
- **When** `specflow-receive-review` processes it
- **Then** the body requires verifying it against the spec, the compass rules, and the code
  before applying, and requires rejecting it with a stated reason when it does not hold

### Disagreement is settled by evidence

- **Given** a disagreement between reviewer and implementer
- **Then** the body names the spec, the compass rule, or a runnable command as the tiebreaker,
  and rejects seniority and confidence as tiebreakers

### Both bodies carry their Iron Law and rationalization table

- **Given** the shipped bodies
- **Then** `specflow-request-review` contains `NO FINDING WITHOUT A FILE, A LINE, AND A FIX`
  and `specflow-receive-review` contains `NO SUGGESTION APPLIED WITHOUT VERIFYING IT FIRST`,
  each with the letter-and-spirit clause and a `Thought/Excuse` → `Reality` table

### Neither carries an insight instruction

- **Given** the shipped bodies
- **Then** neither contains a `cortex insight` instruction

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under both bundles is byte-identical to its `.claude/skills/` counterpart,
  and a fresh `cortex init` installs both

## Notes

- One spec governs both skills because they are one behaviour seen from two ends — a review
  loop — and splitting them would put the two halves of "verify before applying" in different
  files. RULES 13 asks for one behaviour per leaf spec; the behaviour here is the loop.
- Verification is atomic + spec tier (phrase-presence + packaging), per the standing
  convention in `specflow.cortex-awareness` Notes.
