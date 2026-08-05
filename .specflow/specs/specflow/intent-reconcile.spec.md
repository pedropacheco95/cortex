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
2. **Operational asks are out of scope (Phase-6 finding).** Before pinning, the skill separates
   **behavioural** asks — something that must stay true, which get anchored — from
   **operational** asks — something to do once, which do not. The discriminator is stated as a
   question: *would you want a test that fails if this stopped being true?* An operational ask
   gets no anchor, no register entry, and no bug; forcing one through files a missing-criterion
   bug against a spec that should not exist. The body also states the reverse failure mode (a
   behavioural ask waved through as operational) and the tie-break: when unsure, treat it as
   behavioural.
3. **Verbatim, never paraphrased.** `stated_intent` records the user's own words. A paraphrase
   is already the generalisation this skill exists to catch, applied by the one party who was
   supposed to be guarding against it.
4. **The anchor is written RED and watched failing correctly.** It must fail for the reason it
   exists to check, not on an import error (`specflow.tests-red-green`). An anchor never
   observed failing pins nothing.
5. **The subsumption test is counterfactual, not lexical.** The question is *would the
   spec-derived test fail if the specific behaviour changed?* — not "does the spec mention it"
   and not "do the words overlap". The body states the operational check: change the behaviour
   the ask names, run the spec test, see it fail. If it passes, the anchor is not subsumed.
6. **Subsumed → retire.** Delete the anchor test from the suite and record the entry as
   `reconciled` with its `landing` and `covering_spec_test`. The live suite stays spec-derived;
   the register holds words, never copies of tests.
7. **Not subsumed → flag and file.** The spec generalised the ask away. Route to
   `specflow-bugs` (Type 1 — missing acceptance criterion, or Type 4 — missing dev spec) and
   record the entry as `flagged` with its `flagged_bug`. Do **not** keep the anchor running as a
   substitute for the missing criterion: that hides the gap behind a green suite, which is the
   failure being caught.
8. **A tap, not a process.** The skill runs inside the existing classify → spec → test flow.
   Where the intent lands is a `specflow-entry` classification (a spec criterion or a
   compass rule), and the register's `landing` records that decision rather than making a
   second one.
9. **Never a second suite.** At most one anchor per stated intent, alive only between (a) and
   (c). The register is not a test suite and the skill never maintains retired anchors.
10. **Rationalization table.** A `| Thought/Excuse | Reality |` table answering: the spec
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

### An operational ask is not pinned at all

- **Given** a one-off request with nothing that could later stop being true
- **When** the skill runs
- **Then** the body directs completing it without an anchor, a register entry, or a bug, and
  states the discriminating question

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

- **Phase 6 finding (2026-08-05): ask↔spec drift is NOT named a third drift type.** Plan §6
  required pressure-testing the reconciliation check against real examples before minting a
  name and a loop. Three were run as live counterfactual probes against this repository:

  1. *"lets add the skill.md presence filter"* — probe: strip the `SKILL.md` predicate from
     `listSkillBundles`. **Four spec tests fail.** Subsumed; recorded `IR-001`.
  2. *"specflow-entry, that care of all dependencies"* — probe: leave a live reference to the
     old name in `onboarding.md`. **One test fails** — so the ask is pinned. But a second probe
     added that file to the test's own `HISTORICAL_FILES` exclusion list and the suite went
     green again with the ask still violated. Subsumed today, erodible tomorrow; recorded
     `IR-002` with that caveat.
  3. *"Please remove all mentions to it [sentinel]"* — probe: no spec, no criterion, no test
     anywhere pins it. Not subsumed.

  **Verdict: leave it as a signal inside this skill.** Example 3 — the one the register caught
  that nothing else would — is expressible as an existing type (Type 4, missing dev spec), so
  the register is a *detector feeding the existing taxonomy*, not evidence of a new kind of
  divergence. Example 2's erosion pathway is the only candidate for ongoing drift, and it is
  better read as Type 7 (the test no longer faithfully encodes the criterion) than as a third
  drift axis. Naming a drift type and scheduling a loop on one arguable case would buy a
  vocabulary entry and a daily report for a phenomenon already covered.

  **What would change the answer:** a corpus of register entries in which `reconciled` entries
  later fail re-reconciliation *because the spec changed under them* — divergence appearing
  after the gate, which is what "drift" means and what a loop is for. That needs a register
  with history; this one is a day old. Re-run this validation once it has entries older than
  the specs they point at.

- **Phase 6 finding (2026-08-05): operational asks were a real gap.** Example 3 also exposed a
  defect in this skill's own contract: it assumed every specific ask should land in a spec or a
  rule, so a one-off request ("remove the sentinel hooks") would have been forced down the
  flagged branch and filed a missing-criterion bug against a spec that should never exist.
  Rule 2 and step (a0) were added in response — the behavioural/operational split, with its
  discriminating question and its tie-break toward behavioural.
- Verification is atomic + spec tier: phrase-presence over the body, plus the fixture pair
  exercising both branches through the validator. That an agent genuinely performs the
  counterfactual check in a live session is journey-tier, deferred post-v1.
