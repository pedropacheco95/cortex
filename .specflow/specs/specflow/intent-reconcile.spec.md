---
id: specflow.intent-reconcile
status: implemented
depends_on:
  - archive.intent-register
  - specflow.tests-red-green
  - discipline.hardening-convention
implements: ../../specs-business/specflow/a-specific-ask-is-not-generalised-away.business.md
governed_by: []
governs:
  - "skills/specflow-intent-reconcile/**"
---

# `specflow-intent-reconcile` — pin the ask, then check the spec still requires it

## Intent

Plan §3 item 4.2, the Skill half of Fork 2. `archive.intent-register` owns the artefact and its
validation; this owns the judgment, because deciding whether a spec-derived test *subsumes* a
verbatim ask is semantic and Core makes no LLM calls (RULES 3).

Three moves: **(a)** when a user states a specific requirement, write a verbatim RED anchor test
and watch it fail correctly; **(b)** run the normal spec-first flow unchanged; **(c)**
reconcile — does a spec-derived test subsume the anchor? Yes → retire the anchor into the
register as `reconciled`. No → the spec generalised the ask away; file a missing-criterion bug
via `specflow-bugs` and mark the entry `flagged`.

It is a **tap on the existing flow, not a parallel process**. Where the intent lands — a spec
criterion or a compass rule — is itself a `specflow-entry` classification; the register
is fed by the router's decision, not bolted on beside it.

## Entities

- **READS:** the user's stated requirement, verbatim; the spec the ask landed in and its
  acceptance criteria; the spec-derived tests for that criterion;
  `.cortex/archive/intent-register.yaml`.
- **WRITES:** `.cortex/archive/intent-register.yaml` (append/update entries, per
  `archive.intent-register`); the anchor test file at step (a), and its deletion at retirement.
- **CREATES:** the register file when it does not yet exist; a bug via `specflow-bugs` on the
  flagged branch.

## Rules

1. **Iron Law.** The body opens with `NO ANCHOR RETIRED WITHOUT A SPEC TEST THAT WOULD FAIL
   WITHOUT IT`, followed by the letter-and-spirit clause.
2. **Verbatim, never paraphrased.** `stated_intent` records the user's own words. A paraphrase
   is already the generalisation this skill exists to catch, applied by the one party who was
   supposed to be guarding against it.
3. **The anchor is written RED and watched failing correctly.** It must fail for the reason it
   exists to check, not on an import error (`specflow.tests-red-green`). An anchor never
   observed failing pins nothing.
4. **The subsumption test is counterfactual, not lexical.** The question is *would the
   spec-derived test fail if the specific behaviour changed?* — not "does the spec mention it"
   and not "do the words overlap". The body states the operational check: change the behaviour
   the ask names, run the spec test, see it fail. If it passes, the anchor is not subsumed.
5. **Subsumed → retire.** Delete the anchor test from the suite and record the entry as
   `reconciled` with its `landing` and `covering_spec_test`. The live suite stays spec-derived;
   the register holds words, never copies of tests.
6. **Not subsumed → flag and file.** The spec generalised the ask away. Route to
   `specflow-bugs` (Type 1 — missing acceptance criterion, or Type 4 — missing dev spec) and
   record the entry as `flagged` with its `flagged_bug`. Do **not** keep the anchor running as a
   substitute for the missing criterion: that hides the gap behind a green suite, which is the
   failure being caught.
7. **A tap, not a process.** The skill runs inside the existing classify → spec → test flow.
   Where the intent lands is a `specflow-entry` classification (a spec criterion or a
   compass rule), and the register's `landing` records that decision rather than making a
   second one.
8. **Never a second suite.** At most one anchor per stated intent, alive only between (a) and
   (c). The register is not a test suite and the skill never maintains retired anchors.
9. **Rationalization table.** A `| Thought/Excuse | Reality |` table answering: the spec
   obviously covers it, keeping the anchor is safer, paraphrasing is tidier, the spec test
   mentions the same words, filing a bug for this is heavy.

## Acceptance Criteria

### A subsumed anchor is retired into the register

- **Given** a specific ask pinned by an anchor test
- **When** the spec-derived test covers it
- **Then** the anchor is retired — deleted from the suite — and the entry is recorded
  `reconciled` with its `landing` and `covering_spec_test`, and the body forbids leaving the
  anchor running

### An unsubsumed anchor files a bug and is flagged

- **Given** a specific ask whose spec-derived test does not require the specific behaviour
- **When** reconciliation runs
- **Then** a missing-criterion bug is filed via `specflow-bugs` and the entry is recorded
  `flagged` with its `flagged_bug`

### Subsumption is decided counterfactually

- **Given** a spec test that mentions the same words as the ask
- **When** subsumption is judged
- **Then** the body requires changing the named behaviour and observing the spec test fail,
  and states that lexical overlap is not subsumption

### The intent is recorded verbatim

- **Given** a stated requirement
- **When** the entry is written
- **Then** the body requires the user's own words and forbids paraphrase

### The anchor is watched failing correctly

- **Given** a newly written anchor test
- **Then** the body requires observing it fail for the right reason before the spec-first flow
  proceeds

### The skill is a tap on the existing flow

- **Given** the shipped body
- **Then** it routes the landing decision through `specflow-entry` and states that it
  is not a parallel process, and that the register is never a second test suite

### The Iron Law and rationalization table are present

- **Given** the shipped `skills/specflow-intent-reconcile/SKILL.md`
- **Then** it contains `NO ANCHOR RETIRED WITHOUT A SPEC TEST THAT WOULD FAIL WITHOUT IT` with
  the letter-and-spirit clause and a `Thought/Excuse` → `Reality` table

### Both branches are exercised by fixtures

- **Given** a register with one `reconciled` entry and one `flagged` entry
- **When** `cortex validate` runs
- **Then** both validate clean, each carrying its own required evidence — the subsumed branch a
  `covering_spec_test`, the flagged branch a resolving `flagged_bug`

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/specflow-intent-reconcile/` is byte-identical to its
  `.claude/skills/` counterpart, and a fresh `cortex init` installs the bundle

## Notes

- Whether this catches a genuinely distinct drift type deserving a name and a loop
  ("ask↔spec drift") is **deliberately unsettled** — plan §5/§6 require pressure-testing against
  2–3 real examples first. This spec therefore defines a signal inside the skill, not a third
  drift type and not a scheduled loop. Phase 6 remains open.
- Verification is atomic + spec tier: phrase-presence over the body, plus the fixture pair
  exercising both branches through the validator. That an agent genuinely performs the
  counterfactual check in a live session is journey-tier, deferred post-v1.
