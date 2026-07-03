---
name: specflow-bugs
description: >
  Diagnose bugs in a Specflow-managed project by walking the spec-model diagnostic tree to find
  the root cause layer, classify the bug type, file it in the bug ledger
  (.cortex/cerebrum/bugs/), and produce a concrete
  change plan for the change-router to execute. Use this skill whenever the user reports a bug,
  describes unexpected behavior, says something is broken or wrong, or when a test failure needs
  triage. PROACTIVELY use this skill when you encounter: "X doesn't work", "X returns wrong
  result", "X crashes", "this test is failing", "the behavior should be Y but it's Z", "why
  does X happen", error messages, 500s, wrong data, missing responses, or any report where
  implemented behavior diverges from expected behavior. Also trigger when test runs produce
  failures that need classification — the skill handles both human-reported bugs and automated
  test failure triage. If a specs/ directory exists and the user reports something broken, this
  skill runs first — it diagnoses before anyone touches code.
---

# Specflow: Bug Diagnosis

## Core Principle

In a spec-managed project, a bug is never just "wrong code." Every bug is a signal that
something upstream in the spec model is incomplete or incorrect. Code is a derived artifact —
if it's wrong, the specification that generated it was wrong or missing.

**This skill diagnoses. It does not fix.** The output is a classified bug file in the
ledger — `.cortex/cerebrum/bugs/B-NNN-<slug>.md` — with a concrete change plan. The
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

## The Seven Bug Types

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
grep -r "login\|password\|auth" specs/ --include="*.spec.md"
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

**Spec to modify:** specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
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

**Spec to modify:** specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
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

**Spec to modify:** specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
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

**New spec to create:** specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Business spec it implements:** specs-business/{domain}/{outcome}.business.md

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

**New business spec to create:** specs-business/{domain}/{outcome}.business.md
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

**Business spec:** specs-business/{domain}/{outcome}.business.md
**Dev spec:** specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
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

**Spec:** specs/{domain}/{capability}/{leaf}/{leaf}.spec.md
**Criterion:** [criterion name]
**Test file:** tests/{layer}/{domain}/{capability}/{leaf}/{leaf}.test.{ext}

**Issue:** [test misinterprets the criterion / test was never generated / test has wrong assertion]

**Then:**
1. Fix or generate the test to correctly encode the criterion
2. Run the test — it should fail (confirming the code bug)
3. Fix the code
4. Run regression
```

## Bug Ledger Format (`.cortex/cerebrum/bugs/`)

Every diagnosed bug is filed as its own file in the bug ledger —
`.cortex/cerebrum/bugs/B-NNN-<slug>.md` — with frontmatter conforming to cortex-schema
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

Bug IDs are sequential: B-001, B-002, etc. List `.cortex/cerebrum/bugs/` to find the
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

3. **Classify the failure.** Walk the diagnostic tree starting at step 5 (the spec and
   criterion exist — that's why a test exists). The question is whether:
   - The test correctly encodes the spec and code is wrong (code bug → simplest case)
   - The test misinterprets the criterion (Type 7 — wrong test)
   - The criterion itself is wrong or incomplete (Type 1 or 3 — spec issue)
   - The failure reveals an unspecified interaction (Type 2 — incomplete rule)

4. **Document each failure** as its own ledger file in `.cortex/cerebrum/bugs/`.

### Batch triage

When multiple tests fail, look for patterns:
- Multiple failures in the same spec → likely one root cause (a rule change or entity change)
- Failures across specs that share an entity → likely an entity schema issue
- Journey or scenario failures with passing atomics → integration issue, not unit issue

Group related failures into one bug entry when they share a root cause.

## Agent Instructions

When operating as the bug diagnosis agent:

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
  `.cortex/cerebrum/bugs/B-NNN-<slug>.md`. The ledger is the project's memory of what
  went wrong and why.
- **Classify severity honestly.** Not everything is critical. A cosmetic issue is `low`
  even if the user is frustrated about it.
