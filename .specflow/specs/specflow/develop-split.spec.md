---
id: specflow.develop-split
status: implemented
depends_on:
  - specflow.plan-skill
  - specflow.tests-red-green
  - discipline.hardening-convention
implements: ../../specs-business/specflow/nothing-is-built-before-it-is-agreed.business.md
governed_by: []
governs:
  - "skills/specflow-develop/**"
---

# `specflow-develop` — slimmed to execution, plus the five-round review ladder

## Intent

Plan §3 item 3.3, the other half of the develop split. `specflow-develop` **keeps its name and
its directory** — no rename, no redirect stub. What changes is its span: the planning half
(Explore, and the Plan step's gap-analysis / research / implementation-plan sub-steps, and the
size check) moves to `specflow-plan` (`specflow.plan-skill`), and develop retains
execution + verification.

What it gains is the ending it did not have. Today develop implements, verifies by test, and
reports; if a defect is found afterwards, nothing bounds how long it is chased. This spec adds
the **five-round two-stage review ladder**: per task, a spec-compliance review then a quality
review; fix rounds 1–3 resume the implementer; round 4 or later starts a fresh implementer on a
stronger model; a load-bearing finding still unresolved after round 5 halts the work as
**BLOCKED** and reports to the human. It also adds **watch-it-fail-correctly** and
**delete-premature-code** at the implementation boundary.

## Entities

- **READS:** the plan artefact from `specflow-plan`; the specs and their tests; the existing
  code; the Cortex knowledge layer as before (`_index.md`, insight, compass rules incl.
  `check:` predicates, atlas decisions).
- **WRITES:** implementation code; the gap report at `.cortex/pulse/gaps.md` (design §8.5 —
  never a root `gaps.md`); the BLOCKED report to the human when the ladder terminates.
- **CREATES:** nothing new. The review ladder produces findings and rounds, not artefacts.

## Rules

1. **The four core principles are kept verbatim:** a passing test means the code is correct
   (parents verify children by running tests, not reading code); write the minimum code that
   passes; code ALL gaps and document them; the skill is self-similar across scopes.
2. **The Cortex-awareness grounding block is kept whole** — index-first, `cortex insight
   file|concept|element` with the trust caveat, compass rules including `check:` predicates,
   atlas decisions, `cortex validate` before finishing, and the `.cortex/pulse/gaps.md` home
   (`specflow.cortex-awareness` Rule 1, `specflow.insight-awareness`).
3. **Depth calibration is kept, for delegation.** The depth table still sets how far develop
   delegates and which test layer verifies each scope, and stays capped at Minimal/Light until
   build-order-v3 step 11 (standing authorities).
4. **Explore and Plan are removed**, migrated to `specflow-plan`. Develop executes the plan's
   tasks. At **Minimal** depth — one spec, ≤ 3 criteria, ≤ 1 file — develop may run from the
   spec and its test with no plan artefact; above Minimal a plan artefact is required.
5. **Fork 1 — two independent stop-rules that do not conflict.** The body states both, and
   states why they coexist: **(a) code all gaps, never block** fires *while implementing*, on
   an untested edge case the agent discovers — it writes a sensible fix, logs a one-line gap
   note, and continues. **(b) stop after 5 rounds** fires *after* implementation, on a known
   defect a reviewer found that resists fixing. Different triggers, so both hold at once
   (plan §0.4).
6. **The ladder is two-stage, per task.** Stage 1 is spec compliance — does the code satisfy
   the criterion it claims? Stage 2 is quality. Stage 1 gates stage 2: there is no point
   reviewing the craft of code that does not do what it must.
7. **The ladder escalates, then stops.** Rounds 1–3 return the finding to the implementer that
   wrote the code. At round 4 or later a **fresh** implementer on a stronger model takes it —
   the same context has now failed three times, and a fourth attempt from inside it repeats
   the same reasoning. If a **load-bearing** finding survives round 5, develop stops with
   **BLOCKED** and reports: the finding, what each round tried, and why it did not work.
8. **BLOCKED is a successful outcome.** The body states this explicitly. A blocked report is
   more useful than a sixth round or a green claim over a known defect.
9. **Load-bearing is defined, not left to taste.** A finding is load-bearing when it makes the
   code fail a spec criterion, break an existing behaviour, or violate a compass rule.
   Everything else is recorded and does not block.
10. **Watch it fail correctly, and delete premature code.** Before implementing a task, its
    test is observed failing for the reason it exists to produce (`specflow.tests-red-green`);
    code written before its test is deleted and rewritten, not adapted.
11. **Rationalization table.** A `| Thought/Excuse | Reality |` table answering the excuses
    that defeat the ladder: one more round will do it, the finding is not really load-bearing,
    the reviewer is being pedantic, blocking looks like failure, a fresh agent will just be
    slower.

## Acceptance Criteria

### A load-bearing finding surviving five rounds halts the work

- **Given** a review finding unresolved after 5 rounds
- **When** it is load-bearing
- **Then** develop STOPS with BLOCKED and reports the finding, the rounds attempted, and why
  each failed — and the body states that BLOCKED is a successful outcome

### An untested gap does not halt the work

- **Given** an untested edge case discovered while implementing
- **When** develop reaches it
- **Then** it codes the fix, documents the gap, and continues — and the body states the
  Fork-1 coexistence of the two stop-rules explicitly

### The ladder escalates at round four

- **Given** a finding unresolved after round 3
- **When** round 4 begins
- **Then** the body requires a fresh implementer on a stronger model, and says why continuing
  in the same context fails

### Review is two-stage, compliance before quality

- **Given** a completed task entering review
- **Then** the body requires spec-compliance review before quality review, and states that
  stage 1 gates stage 2

### Load-bearing is defined

- **Given** the shipped body
- **Then** it defines a load-bearing finding as one that fails a criterion, breaks existing
  behaviour, or violates a compass rule

### The planning half is gone and the execution half is intact

- **Given** the shipped `skills/specflow-develop/SKILL.md`
- **Then** the Explore step, the gap-analysis / research / implementation-plan sub-steps, and
  `references/planning-protocol.md` are absent from this bundle, while the four core
  principles, the Cortex-awareness block, the depth-calibration table, the execute steps, the
  verification cascade, and the `.cortex/pulse/gaps.md` home are all still present

### Minimal depth still runs without a plan artefact

- **Given** a one-spec, one-file change at Minimal depth
- **When** develop runs
- **Then** the body permits running from the spec and test with no plan artefact, and requires
  one above Minimal

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/specflow-develop/` is byte-identical to its
  `.claude/skills/` counterpart, with no stray `references/planning-protocol.md` left in
  either

## Notes

- The ladder is the second local instance of the deferred "escalate on the way out" mechanism
  (the first is the root-cause gate in `specflow.bugs-root-cause-gate`). Generalising the two
  is deferred per plan §5 — not built here.
- The review ladder's *findings* come from `specflow-request-review` /
  `specflow-receive-review` where those are invoked; the ladder itself — rounds, escalation,
  and the BLOCKED terminal state — belongs to develop, because develop owns the work being
  reviewed.
- Verification is atomic + spec tier (phrase-presence + packaging), per the standing
  convention in `specflow.cortex-awareness` Notes.
