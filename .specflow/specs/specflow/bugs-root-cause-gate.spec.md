---
id: specflow.bugs-root-cause-gate
status: implemented
depends_on:
  - specflow.cortex-awareness
  - discipline.hardening-convention
implements: ../../specs-business/specflow/diagnoses-and-tests-mean-what-they-say.business.md
governed_by: []
governs:
  - "skills/specflow-bugs/**"
---

# `specflow-bugs` — root-cause investigation before classification

## Intent

Plan §3 item 2.1: `specflow-bugs` currently walks the seven-type diagnostic tree from the bug
*report*. The tree is sound, but its inputs are not: a report is a symptom, and classifying a
symptom produces a confident type for the wrong layer. This spec prepends a Phase-1 root-cause
investigation gate — read the actual error, reproduce it, check recent changes, instrument the
component boundaries — and forbids naming a type until that phase produces evidence.

The seven-type tree, the change-plan templates, the severity table, the ledger output path, and
the "diagnose, never fix" boundary are unchanged. This is a prepended gate, not a rewrite.

The Iron Law + rationalization-table mechanisms are grafted per
`skills/_conventions/hardening.md` (`discipline.hardening-convention`).

## Entities

- **READS:** the bug report or test-failure output; the error/stack trace itself (not a
  paraphrase of it); recent changes (`git log`, `git diff`) around the affected surface; the
  spec tree, as before.
- **WRITES:** `.cortex/compass/bugs/B-NNN-<slug>.md` — unchanged target, now additionally
  carrying the Phase-1 evidence that produced the classification.
- **CREATES:** nothing else. The skill still diagnoses and never fixes.

## Rules

1. **Iron Law.** The body opens with `NO CLASSIFICATION WITHOUT ROOT CAUSE FIRST`, followed by
   the letter-and-spirit clause.
2. **Phase 1 runs before the tree, and has four steps:** (a) read the actual error output in
   full, including the stack trace and the failing assertion — not a summary of it;
   (b) reproduce the failure, or record explicitly that it could not be reproduced and what was
   tried; (c) check what changed recently around the affected surface; (d) instrument the
   component boundaries — confirm by observation which side of each boundary the wrong value
   first appears on, rather than reasoning about which side is likelier.
3. **HARD-GATE before the seven-type tree.** No bug type may be named, and no ledger file
   written, until Phase 1 has produced evidence. The gate carries the "this one is too simple
   to need investigation" anti-pattern paragraph.
4. **Unreproduced means data-gathering, not classification.** When the symptom cannot be
   reproduced, the skill gathers data and says so; it does not classify on the strength of the
   report alone. An unreproducible report may still be filed, marked as such, with the
   reproduction attempts recorded — but without a confident type.
5. **The evidence travels with the classification.** The ledger entry records what was observed
   in Phase 1 and which observation selected the type, so a later reader can tell a diagnosis
   from a guess.
6. **Rationalization table.** A two-column `| Thought/Excuse | Reality |` table answering the
   excuses that defeat this gate: the fix is obvious, the stack trace is noise, it is clearly
   the same as the last one, reproducing is slow, the user already said what is wrong.
7. **Nothing else changes.** The seven types, the diagnostic tree, the change-plan templates,
   the severity table, the test-failure-triage entry point, the ledger path
   (`.cortex/compass/bugs/B-NNN-<slug>.md`, `specflow.cortex-awareness` Rule 1), and the
   never-fix boundary are preserved verbatim.
8. **"Escalate on the way out" is noted, not built.** The body carries a forward-looking note
   that this gate is a local instance of a general failure-count/altitude-change mechanism
   (plan §5, Pedro's flagged-for-later item). The general mechanism is explicitly out of scope
   here.

## Acceptance Criteria

### Root-cause evidence precedes the type

- **Given** a reported bug
- **When** the skill runs
- **Then** its body requires Phase-1 evidence to exist before any of the seven types is named,
  and states the gate as an explicit stop

### Symptoms with no reproduction are not classified

- **Given** a report whose symptom the skill cannot reproduce
- **When** Phase 1 completes without a reproduction
- **Then** the body directs the skill to gather data and record the attempts, and forbids
  assigning a confident type on the report alone

### The Iron Law and its clause are present

- **Given** the shipped `skills/specflow-bugs/SKILL.md`
- **Then** it contains `NO CLASSIFICATION WITHOUT ROOT CAUSE FIRST` on one line, followed by
  the letter-and-spirit clause

### The four Phase-1 steps are each named

- **Given** the shipped body
- **When** its Phase-1 section is checked
- **Then** it names all four Rule-2 steps, including instrumenting component boundaries

### The rationalization table answers the gate's excuses

- **Given** the shipped body
- **Then** it carries a `Thought/Excuse` → `Reality` table with at least the five Rule-6
  excuses answered

### The existing diagnostic machinery is preserved

- **Given** the shipped body
- **Then** the seven-type table, the diagnostic tree, the change-plan templates, the severity
  table, and the `.cortex/compass/bugs/B-NNN-<slug>.md` ledger path are all still present, and
  no instruction to fix code has been added

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/specflow-bugs/` is byte-identical to its `.claude/skills/`
  counterpart

## Notes

- Verification is atomic + spec tier (phrase-presence + packaging), consistent with
  `specflow.cortex-awareness` Notes: behavioural verification that an agent actually
  investigates before classifying is journey-tier, deferred post-v1.
- The `specflow.cortex-awareness` Rule 1 Light-tier contract for this skill (ledger path, no
  root `bugs.md`) is unaffected and still asserted by that spec's own tests.
- The "Package and local copies are identical" AC is asserted by the existing byte-identity test for all eleven `specflow-*` bundles (`tests/spec/specflow/awareness.test.ts`, `specflow.cortex-awareness` AC "Package and local copies are identical"); `skills/specflow-bugs/` is covered there rather than by a duplicate test.
