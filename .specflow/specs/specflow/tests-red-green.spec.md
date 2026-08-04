---
id: specflow.tests-red-green
status: implemented
depends_on:
  - specflow.cortex-awareness
  - discipline.hardening-convention
implements: ../../specs-business/specflow/diagnoses-and-tests-mean-what-they-say.business.md
governed_by: []
governs:
  - "skills/specflow-tests/**"
---

# `specflow-tests` — watch it fail correctly, and delete premature code

## Intent

Plan §3 item 2.2: `specflow-tests` already holds the principle "a test that does not execute is
not a test", and Phase 3's fake-test scan catches assertion stubs after the fact. Both are
weaker than the mechanism they approximate. A test observed *passing* proves nothing about what
it checks: it may be right, may assert nothing, or may be exercising a different path than the
one it names. The only cheap moment to learn which is the moment before the code exists.

This spec strengthens the existing principle into a mechanism: a new test must be observed
failing, and the failure message must be *read* and confirmed to be the failure the test exists
to produce. A test that fails on an import error, a typo'd fixture, or a missing symbol is not
red — it is broken, and it will go green for the wrong reason.

It also adds the paired rule: code written before its test is deleted, not adapted. Code that
already exists shapes the test into agreeing with it, which is how a suite ends up green and
uninformative.

Grafted per `skills/_conventions/hardening.md` (`discipline.hardening-convention`).

## Entities

- **READS:** unchanged — specs, fixtures, harness config, the four-layer conventions.
- **WRITES:** unchanged — test files, and the verification report at
  `.cortex/pulse/reports/verification.md`.
- **CREATES:** nothing new. The addition is a required observation step and its record.

## Rules

1. **Iron Law.** The body opens with `NO TEST ENTERS THE SUITE UNTIL IT HAS BEEN WATCHED
   FAILING FOR THE RIGHT REASON`, followed by the letter-and-spirit clause.
2. **Watch it fail correctly.** A new test is run before its implementation exists. The
   generation agent reads the failure output and confirms the failure is the *expected* one —
   the assertion the test was written to make, failing on the value it was written to check.
3. **A wrong-reason failure is not red.** Import errors, missing fixtures, misspelled symbols,
   setup crashes, and "module not found" are broken tests, not red tests. The body enumerates
   these and requires the test be fixed and re-observed before it counts.
4. **Delete premature code.** Code written before its test is deleted and rewritten after the
   test is red — not kept, not adapted, not "reused as a starting point". The body states the
   reason: existing code biases the test toward describing what the code does.
5. **The observation is recorded.** The verification report records, per generated test, that
   it was observed failing for the right reason before it went green. A test that was only ever
   seen passing is reported as unverified rather than silently counted.
6. **Rationalization table.** A two-column `| Thought/Excuse | Reality |` table answering the
   excuses that defeat this mechanism: the code already exists so writing the test first is
   pointless, it failed so that is good enough, running it twice is slow, the assertion is
   obviously right, deleting working code is wasteful.
7. **`check:` predicates and the rest of the contract are preserved.** The existing Cortex
   Awareness block (compass `check:` predicates incorporated into generated tests, anatomy
   reads, the `.cortex/pulse/reports/verification.md` output path — `specflow.cortex-awareness`
   Rule 1), the five phases, the four layers, the fake-test scan, the adversarial quality
   check, and the writer/verifier split are unchanged.

## Acceptance Criteria

### A new test is observed failing before code exists

- **Given** a criterion with no implementation yet
- **When** the skill generates its test
- **Then** the body requires the test to be run and observed failing before implementation, and
  states that a test never seen failing does not count as verified

### The failure must be the right failure

- **Given** a newly generated test that fails with an import error
- **When** the generation agent checks the failure
- **Then** the body classifies that as broken rather than red, and requires the test be fixed
  and re-observed

### Premature code is deleted, not adapted

- **Given** implementation code that was written before its test
- **When** the skill reaches that code
- **Then** the body requires deleting it and rewriting after the test is red, and states why
  adapting it is worse than deleting it

### The Iron Law and its clause are present

- **Given** the shipped `skills/specflow-tests/SKILL.md`
- **Then** it contains `NO TEST ENTERS THE SUITE UNTIL IT HAS BEEN WATCHED FAILING FOR THE
  RIGHT REASON` on one line, followed by the letter-and-spirit clause

### The rationalization table answers the mechanism's excuses

- **Given** the shipped body
- **Then** it carries a `Thought/Excuse` → `Reality` table with at least the five Rule-6
  excuses answered

### The existing contract is preserved

- **Given** the shipped body
- **Then** the `check:`-predicate instruction, the four test layers, the five phases, the
  fake-test scan, and the `.cortex/pulse/reports/verification.md` output path are all still
  present

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/specflow-tests/` is byte-identical to its `.claude/skills/`
  counterpart

## Notes

- Rule 5's per-test record is a report-content requirement, not a new artefact: it lands in the
  existing verification report section, which already enumerates per-test results.
- Verification is atomic + spec tier (phrase-presence + packaging). That an agent genuinely
  watches the failure in a live session is journey-tier, deferred post-v1 — the same
  acknowledgement as `specflow.cortex-awareness` Notes.
- The "Package and local copies are identical" AC is asserted by the existing byte-identity test for all eleven `specflow-*` bundles (`tests/spec/specflow/awareness.test.ts`, `specflow.cortex-awareness` AC "Package and local copies are identical"); `skills/specflow-tests/` is covered there rather than by a duplicate test.
