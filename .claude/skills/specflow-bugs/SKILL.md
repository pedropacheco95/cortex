---
name: specflow-bugs
description: 'Diagnose a bug to its root cause and file it. "X is broken", "why does X happen", test triage.'
---

# Specflow: Bug Diagnosis

## When to use

Diagnose bugs in a Specflow-managed project by walking the spec-model diagnostic tree to find
the root cause layer, classify the bug type, file it in the bug ledger (.cortex/compass/bugs/),
and produce a concrete change plan for the change-router to execute. Use this skill whenever
the user reports a bug, describes unexpected behavior, says something is broken or wrong, or
when a test failure needs triage. PROACTIVELY use this skill when you encounter: "X doesn't
work", "X returns wrong result", "X crashes", "this test is failing", "the behavior should be Y
but it's Z", "why does X happen", error messages, 500s, wrong data, missing responses, or any
report where implemented behavior diverges from expected behavior. Also trigger when test runs
produce failures that need classification — the skill handles both human-reported bugs and
automated test failure triage. If a .specflow/specs/ directory exists and the user reports
something broken, this skill runs first — it diagnoses before anyone touches code.

## The Iron Law

NO CLASSIFICATION WITHOUT ROOT CAUSE FIRST

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this bug does not need investigating, that construction is the violation.

A bug report is a symptom. The diagnostic tree below is sound, but it is only as good as what
you feed it — classify a symptom and you will get a confident type for the wrong layer.
Phase 1 exists to make the tree's input an observation instead of a story.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## Core Principle

In a spec-managed project, a bug is never just "wrong code." Every bug is a signal that
something upstream in the spec model is incomplete or incorrect. Code is a derived artifact —
if it's wrong, the specification that generated it was wrong or missing.

**This skill diagnoses. It does not fix.** The output is a classified bug file in the
ledger — `.cortex/compass/bugs/B-NNN-<slug>.md` — with a concrete change plan. The
change-router executes the plan.

**"Just fix the code" never happens.** Every fix starts at the spec layer, flows through
acceptance criteria, through tests, and only then touches code. The code change is always
the last step.

## When This Skill Activates

Two entry points:

1. **Human-reported bug.** The user says something is broken, wrong, or unexpected. The skill
   walks the diagnostic tree, classifies, documents, and produces the change plan.

2. **Test failure triage.** A test run produced failures. The skill reads the failure output,
   identifies which spec and criterion each failure maps to, classifies the root cause, and
   produces the change plan for each failure.

## Phase 1: Root-Cause Investigation

**This runs before the diagnostic tree, on every bug, from both entry points.** Four steps.
None of them is a formality.

**1. Read the actual error.** The full output — stack trace, failing assertion, the values on
both sides of it, the log lines immediately before. Not the user's paraphrase, not the first
line, not a summary someone else wrote. The paraphrase is where the wrong layer gets suggested
to you; the trace is where the truth is.

**2. Reproduce it.** Run the failing case yourself and see it fail. If you cannot reproduce it,
say so explicitly and record what you tried — that is a legitimate outcome, and it changes what
you are allowed to conclude (see the gate below).

**3. Check what changed recently.** `git log` and `git diff` around the affected surface. A
failure that appeared this week usually has a cause from this week. This step is cheap and
routinely collapses the search space to one commit.

**4. Instrument the component boundaries.** Find where the wrong value *first* appears. Log or
inspect the value on each side of each boundary it crosses — the API edge, the function
boundary, the serialisation step, the storage write. You are looking for the first place the
value is wrong, not the place it is most visibly wrong.

Reasoning about which component is *likely* at fault is not step 4. Step 4 is observing which
component *is* at fault. These feel similar from the inside and are not the same thing: the
first is a hypothesis, the second is the evidence that selects among hypotheses.

### HARD GATE

Do NOT name a bug type, and do NOT write a ledger file, until Phase 1 has produced evidence.

**"This one is too simple to need investigation."** That thought is this gate's most common
failure mode, and it is wrong in the same way every time: the bug looks simple because you have
already assumed a cause, and the assumption is exactly what Phase 1 is for. If the bug really is
simple, Phase 1 costs one command and confirms it. If it is not, you just avoided filing a
confident classification at the wrong layer — which is worse than no classification, because
the ledger is believed.

**If you could not reproduce it:** gather data, file what you observed, and mark the entry
unreproduced with the attempts recorded. Do **not** assign a confident type on the strength of
the report alone. An unreproduced report is a data-gathering task, not a diagnosis.

**The evidence travels with the classification.** The ledger entry records what you observed
and which observation selected the type. A reader six months from now must be able to tell your
diagnosis from a guess; without the evidence line, the two look identical.

### Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "The fix is obvious — I can see the bug in the code." | You can see *a* bug. Whether it is *this* bug is precisely what you have not checked. The obvious fix at the wrong layer is the most expensive outcome available here, because it also closes the ticket. |
| "The stack trace is just noise from the framework." | The noise is the framework's frames; the signal is which of *your* frames is deepest in it. You are skipping the one artefact that names a file and a line. |
| "This is clearly the same as the bug we fixed last week." | Then reproducing it takes thirty seconds and you will have proof. "Clearly the same" is a hypothesis with a strong feeling attached, and this ledger already has entries that were re-filed at a different layer after exactly this thought. |
| "Reproducing it is slow / needs a real environment." | Then say so in the entry and mark it unreproduced. Slowness is a reason to record a weaker conclusion, never a reason to record a strong one you did not earn. |
| "The user already told me what's wrong." | The user told you what they *saw*. They are reporting a symptom from outside the system, which is the one vantage point from which layer cannot be determined. Their report is the input to Phase 1, not a substitute for it. |
| "I'll investigate properly once I've narrowed it down with the tree." | The tree's first question is which spec governs the behaviour — you cannot answer it without knowing which component is actually misbehaving. Backwards order, and it terminates in a plausible answer either way. |

> **Noted for later, not built here.** This gate is a local instance of a general mechanism —
> *escalate on the way out*: when a chosen layer keeps failing to hold the fix, the response is
> to change altitude rather than retry at the same level. The 5-round review ladder in
> `specflow-develop` is another instance. Generalising the two is deferred
> (`plans_and_handoffs/plans/2026-08-03.md` §5); do not build it inside this skill.

## Phase 2: The Seven Bug Types

Every bug in a Specflow project traces to exactly one of these root causes:

| Type | Root Cause | What's Missing/Wrong |
|------|-----------|---------------------|
| 1 | Missing acceptance criterion | Spec and rule exist, but no Given/When/Then covers this case |
| 2 | Incomplete rule | Spec exists, but a rule is missing or underspecified |
| 3 | Wrong rule | Spec and rule exist, but the rule itself is incorrect |
| 4 | Missing dev spec | No dev spec covers this behavior at all |
| 5 | Missing business spec | No business-level outcome was ever articulated |
| 6 | Layer drift | Business spec says X, dev spec says Y, code implements Y faithfully |
| 7 | Correct spec, wrong/missing test | Spec is right, but the test misinterprets it or was never generated |

## The Diagnostic Tree

Walk this tree for every bug. The first "NO" you hit determines the type.

```
Bug reported
│
├─ 1. Can we find a dev spec that should govern this behavior?
│   │
│   ├─ NO → Is there a business spec for this outcome?
│   │        ├─ YES → Type 4 (missing dev spec)
│   │        └─ NO  → Type 5 (missing business spec)
│   │
│   └─ YES → 2. Does the spec have a rule covering this case?
│             │
│             ├─ NO → Type 2 (incomplete rule)
│             │
│             └─ YES → 3. Is the rule itself correct?
│                       │
│                       ├─ NO → Type 3 (wrong rule)
│                       │
│                       └─ YES → 4. Does the rule have an acceptance criterion?
│                                 │
│                                 ├─ NO → Type 1 (missing criterion)
│                                 │
│                                 └─ YES → 5. Does a test exist for this criterion?
│                                           │
│                                           ├─ NO → Type 7 (missing test)
│                                           │
│                                           └─ YES → 6. Does the test correctly
│                                                       encode the spec?
│                                                       │
│                                                       ├─ NO → Type 7 (wrong test)
│                                                       │
│                                                       └─ YES → Code bug — but
│                                                                also check Type 6
│                                                                (layer drift)
│
└─ At every node, also check:
   Does the business spec still match the dev spec? (Type 6 — drift)
```

### How to Walk the Tree

**Step 1: Identify the behavior.** What did the user expect? What happened instead? Be
concrete — "login returns 500 instead of 401 on wrong password" not "login is broken."

**Step 2: Search for the governing dev spec.** Grep the spec tree for entity names,
endpoint paths, or behavior keywords from the bug report:

```bash
grep -r "login\|password\|auth" .specflow/specs/ --include="*.spec.md"
```

If no spec covers this behavior → classify and stop (Type 4 or 5).

**Step 3: Read the spec's Rules section.** Does any rule address the case described in
the bug? A rule like "lock account after 5 failures" covers the lockout case. But if the
bug is about "what happens with correct password during lockout" and no rule addresses
that → Type 2.

**Step 4: Validate the rule.** Is the rule itself correct? Ask the human if needed.
"The spec says lockout after 5 attempts — is that still the right threshold?" If the rule
is wrong → Type 3.

**Step 5: Check acceptance criteria.** Read the spec's Acceptance Criteria section. Is
there a Given/When/Then that covers the exact scenario from the bug report? If not → Type 1.

**Step 6: Check tests.** Look for the test file:
```bash
find tests/ -name "*login*" -o -name "*auth*"
```
Does a test exist for this criterion? Is the test correctly encoding the spec? If the test
passes but the behavior is wrong, the test is buggy → Type 7.

**Step 7: Check for drift.** Read the business spec linked via `implements:`. Does the
business spec's outcome/journey still match what the dev spec describes? If they've
diverged → Type 6.

## Change Plan Templates

Each bug type has a specific change plan. The plan tells the change-router exactly what
to do.

### Type 1: Missing Acceptance Criterion

```markdown
### Change Plan

**Spec to modify:** .specflow/specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Change type:** Add acceptance criterion

**Add this criterion:**
### [Criterion Name]
- **Given** [precondition with concrete values]
- **When** [action that triggers the bug]
- **Then** [expected correct behavior]

**Then:**
1. Generate atomic test for this criterion
2. Generate/update spec test for this dev spec
3. Run the new test — it should fail (confirming the bug)
4. Fix the code to make the test pass
5. Run regression for this domain
```

### Type 2: Incomplete Rule

```markdown
### Change Plan

**Spec to modify:** .specflow/specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Change type:** Add rule + acceptance criterion(s)

**Add this rule:**
N. [Rule text — e.g., "Correct password attempts during lockout are still rejected"]

**Add these criteria:**
### [Criterion Name]
- **Given** [...]
- **When** [...]
- **Then** [...]

**Then:**
1. Run coherence check (new rule may conflict with existing rules)
2. Generate atomic test(s) for new criterion(s)
3. Update spec test
4. Fix code
5. Run regression
```

### Type 3: Wrong Rule

```markdown
### Change Plan

**Spec to modify:** .specflow/specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Change type:** Correct existing rule + update criteria

**Change rule N from:**
[current rule text]

**To:**
[corrected rule text]

**Update these criteria:**
[list affected criteria with old and new versions]

**Cross-layer check:**
- Business spec: [path] — does its business rule still match? [yes/no + action]

**Then:**
1. Update all affected criteria
2. Regenerate tests for changed criteria
3. Regenerate the slice
4. Run regression for this domain and all dependents
```

### Type 4: Missing Dev Spec

```markdown
### Change Plan

**New spec to create:** .specflow/specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Business spec it implements:** .specflow/specs-business/{domain}/{outcome}.business.md

**Draft spec:**
---
id: {domain}.{capability}.{leaf}
status: draft
depends_on: [...]
implements: [business spec path]
---

[Intent, Rules, Acceptance Criteria — drafted from the bug report and business context]

**Then:**
1. Present draft spec to human for review
2. Run coherence check
3. Add to build order
4. Generate tests
5. Implement the slice
6. Update the business spec's implemented_by: list
```

### Type 5: Missing Business Spec

```markdown
### Change Plan

**New business spec to create:** .specflow/specs-business/{domain}/{outcome}.business.md
**New dev spec(s) to create:** [list]

**Draft business spec:**
---
id: {domain}.{outcome}
status: draft
implemented_by: [to be filled after dev specs exist]
---

[Outcome, User Journey, Business Rules, Success Metrics]

**Then:**
1. Present business spec to human for review
2. Draft dev spec(s) from the business spec
3. Present dev specs for review
4. Wire implements:/implemented_by: links
5. Coherence check
6. Build order, tests, implement
```

### Type 6: Layer Drift

```markdown
### Change Plan

**Business spec:** .specflow/specs-business/{domain}/{outcome}.business.md
**Dev spec:** .specflow/specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Drift description:** [what the business spec says vs what the dev spec says]

**Resolution (choose one, confirm with human):**
- [ ] Business spec is correct → update dev spec and code to match
- [ ] Dev spec is correct → update business spec to match reality
- [ ] Both need updating → propose changes to both

**Then:**
1. Update the lagging spec to match the authoritative one
2. Update criteria if dev spec changed
3. Regenerate tests if criteria changed
4. Regenerate slice if dev spec changed
5. Run regression
```

### Type 7: Correct Spec, Wrong/Missing Test

```markdown
### Change Plan

**Spec:** .specflow/specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Criterion:** [criterion name]
**Test file:** tests/{layer}/{domain}/{capability}/{leaf}/{leaf}.test.{ext}

**Issue:** [test misinterprets the criterion / test was never generated / test has wrong assertion]

**Then:**
1. Fix or generate the test to correctly encode the criterion
2. Run the test — it should fail (confirming the code bug)
3. Fix the code
4. Run regression
```

## Bug Ledger Format (`.cortex/compass/bugs/`)

Every diagnosed bug is filed as its own file in the bug ledger —
`.cortex/compass/bugs/B-NNN-<slug>.md` — with frontmatter conforming to cortex-schema
§4.3. Never write a flat root `bugs.md`: the ledger is the unified store the daily
bug-triage loop reads.

```markdown
---
id: B-NNN
title: [Short description]
type: [seven-type slug — see table below]
severity: [critical | high | medium | low]
status: open
affects:
  - [spec ID, file path, or rule ID]
proposed_fix: [one-line summary of the change plan]
opened: [ISO datetime]
---

# B-NNN — [Short description]

**Source:** [human report / test failure in {test name}]

**What happens:** [concrete description of the wrong behavior]
**What should happen:** [concrete description of the correct behavior]

**Root cause:** [which spec/rule/criterion is missing or wrong]

**Affected specs:**
- Dev: [spec path(s)]
- Business: [spec path(s)]

### Change Plan

[One of the templates above, filled in with concrete details]

### Resolution

[Filled in after the change-router executes the plan]
- Spec changes: [list of spec files modified]
- Tests added/modified: [list]
- Code changes: [summary]
- Resolved: [date — also set `resolved:` and `status: resolved` in the frontmatter]
```

The `type:` value is the schema §4.3 slug for the diagnosed type:

| Diagnosed type | `type:` slug |
|---|---|
| 1 — missing acceptance criterion | `missing-criterion` |
| 2 — incomplete rule | `incomplete-rule` |
| 3 — wrong rule | `wrong-rule` |
| 4 — missing dev spec | `missing-dev-spec` |
| 5 — missing business spec | `missing-business-spec` |
| 6 — layer drift | `layer-drift` |
| 7 — wrong/missing test | `test-defect` |

`status:` follows the schema enum: `open` when filed, `triaged` once classified with a
change plan, `resolved` (with a `resolved:` timestamp) after the change-router executes
the plan.

### Bug numbering

Bug IDs are sequential: B-001, B-002, etc. List `.cortex/compass/bugs/` to find the
highest existing `B-NNN` and increment. If the ledger directory doesn't exist yet,
create it and start at B-001.

### Severity classification

| Severity | Criteria |
|----------|----------|
| `critical` / `high` | Data integrity at risk, security issue, core flow completely broken, users cannot accomplish primary outcome |
| `medium` | Feature doesn't work as specified, but workaround exists or impact is limited |
| `low` | Cosmetic, edge case with minimal user impact, inconsistency that doesn't affect outcomes |

## Test Failure Triage

When triaging test failures, the skill reads the test output and maps each failure back
through the diagnostic tree.

### Entry point

The user provides test output (copy-pasted, or points to a log file). For each failure:

1. **Extract the spec ID and criterion.** Test names follow the pattern
   `test_{spec_id}__{criterion_name}`. Parse the spec ID from the test name.

2. **Read the spec.** Load the spec file and find the criterion.

3. **Run Phase 1 on the failure, then classify.** Test output is an error, not a diagnosis:
   read the assertion and both its values, re-run the single failing test to confirm it fails
   the same way, and check what changed since it last passed. Only then walk the diagnostic
   tree starting at step 5 (the spec and criterion exist — that's why a test exists). The
   question is whether:
   - The test correctly encodes the spec and code is wrong (code bug → simplest case)
   - The test misinterprets the criterion (Type 7 — wrong test)
   - The criterion itself is wrong or incomplete (Type 1 or 3 — spec issue)
   - The failure reveals an unspecified interaction (Type 2 — incomplete rule)

4. **Document each failure** as its own ledger file in `.cortex/compass/bugs/`.

### Batch triage

When multiple tests fail, look for patterns:
- Multiple failures in the same spec → likely one root cause (a rule change or entity change)
- Failures across specs that share an entity → likely an entity schema issue
- Journey or scenario failures with passing atomics → integration issue, not unit issue

Group related failures into one bug entry when they share a root cause.

## Agent Instructions

When operating as the bug diagnosis agent:

- **Never classify before Phase 1.** The Iron Law is the first instruction in this skill for a
  reason: a type named from a symptom is a guess wearing a diagnosis's clothes.
- **Never skip the diagnostic tree.** Even if the fix seems obvious, walk the tree. The
  "obvious" fix is often at the wrong layer.
- **Never modify specs, tests, or code.** This skill diagnoses. The change-router executes.
- **Always check for drift.** At the end of every diagnosis, read the business spec linked
  via `implements:` and verify it still matches the dev spec.
- **Be concrete in change plans.** Don't say "update the spec." Say which spec, which rule,
  what the new text should be, and which criteria need adding or changing.
- **Ask the human when uncertain.** Type 3 (wrong rule) requires human judgment — the agent
  can't know whether the rule or the expectation is wrong. Present both possibilities.
- **Document everything in the bug ledger.** Even if the bug is trivial — file it as
  `.cortex/compass/bugs/B-NNN-<slug>.md`. The ledger is the project's memory of what
  went wrong and why.
- **Classify severity honestly.** Not everything is critical. A cosmetic issue is `low`
  even if the user is frustrated about it.
