# Verification Pass

This document describes how the agent re-reads the code against completed specs to catch
spec-writing errors before human review. This is Phase 4 of onboarding.

## Principle

The agent wrote specs in Phase 2 based on its understanding of the code. That understanding
may be wrong — the agent may have misread a field type, misunderstood a rule, written a
criterion that wouldn't actually pass, or listed wrong dependencies. The verification pass
catches these errors by going back to the source.

The human should receive specs that have been written, challenged (Phase 3), AND verified
(Phase 4) — not a first draft.

## Agent delegation

Spawn one verification agent per domain. Each agent receives:
1. That domain's completed specs (all leaf specs under `.specflow/specs/{domain}/`)
2. The source files those specs describe (from the atom graph's file paths)
3. Instructions to verify each spec point by point

The verification agent returns a structured feedback report (format below).

## Verification process

For each developer leaf spec, the verification agent performs six checks:

### Check 1: Entity verification

Compare the spec's Entities section against the actual model definition.

- Every field name matches (spelling, casing)
- Every field type matches (string vs text, int vs bigint, datetime vs timestamp)
- Every constraint matches (nullable vs NOT NULL, unique, foreign key, default values)
- No fields are missing from the spec that exist in the model
- No fields are in the spec that don't exist in the model

```
SPEC says:     locked_until: datetime (nullable)
MODEL says:    locked_until: timestamp NOT NULL DEFAULT '1970-01-01'
VERDICT:       Spec is wrong — field is NOT NULL with a default, not nullable
ACTION:        Correct the spec
```

### Check 2: Rule verification

For each numbered rule in the spec, find the code that implements it and verify the
rule's wording matches the code's behavior.

- Read the actual conditional logic, not just the function signature
- Check thresholds precisely ("after 5" vs "at 5" vs ">= 5")
- Check boundary behavior (does the rule include or exclude the boundary?)
- Check time units (minutes vs seconds vs hours)

```
SPEC says:     Rule 3: "Lock account after 5 failed attempts"
CODE says:     if failed_attempts >= 5: lock()
VERDICT:       Imprecise — code locks AT 5, not AFTER 5. The 5th attempt triggers lockout.
ACTION:        Change rule to "Lock account at 5 failed attempts"
```

### Check 3: Acceptance criteria verification

For each Given/When/Then, trace the code path mentally:

- Would the Given precondition be achievable? (Can the state described actually exist?)
- Would the When action trigger the expected code path?
- Would the Then assertion be true after the code runs?

If a criterion wouldn't pass against the current code, determine why:
- Spec is wrong (criterion doesn't match what the code does) → correct the spec
- Code has a bug (criterion matches intent but code doesn't implement it) → should have
  been caught in Phase 3. If it wasn't, run the adversarial investigation protocol now.

### Check 4: Dependency verification

Check that the spec's `depends_on` list matches reality:

- For each listed dependency: does the code actually import/call/reference that spec's
  functionality? If not, remove the dependency.
- For each import/call in the code: is the corresponding spec listed in `depends_on`?
  If not, add it.

### Check 5: implements: link verification

Re-read the linked business spec. Ask:

- Does this dev spec genuinely contribute to that business outcome?
- If removed, would the business outcome be incomplete?
- Is there a better-fitting business spec this should link to instead?

### Check 6: Completeness check

Is anything missing from the spec?

- Are there code paths the spec doesn't describe? (Hidden behaviors, error handlers,
  edge cases that have no rule or criterion)
- Are there entity fields the code uses that the spec doesn't mention?
- Are there integrations the code makes that the spec doesn't reference?

Missing items don't necessarily need to be added — they might be implementation details
that don't belong in a spec. But they should be noted so the human can decide.

## Feedback report format

Each verification agent returns:

```markdown
# Verification Feedback: {domain}

## Summary
- Specs verified: [N]
- Confirmed unchanged: [N]
- Corrected: [N]
- Escalated: [N]

## Corrections Applied

### {spec-id}
**Check:** [which check caught it]
**Issue:** [what was wrong]
**Before:** [old spec text]
**After:** [corrected spec text]

### {spec-id}
...

## Issues Escalated

### {spec-id}
**Check:** [which check flagged it]
**Issue:** [what's unclear]
**Evidence for:** [why it might be correct as-is]
**Evidence against:** [why it might be wrong]
**Flagged as:** OPEN: [question for the human]
```

## What verification does NOT do

- **Does not re-run the adversarial investigation.** Phase 3 already challenged potential
  bugs. Verification checks specs, not bugs. If verification discovers a potential bug
  that Phase 3 missed, it runs the adversarial protocol on that specific item before
  classifying.
- **Does not rewrite specs from scratch.** It checks and corrects. If a spec is so wrong
  it needs rewriting, the verification agent flags it for the orchestrator.
- **Does not modify business specs.** It only verifies and corrects developer specs.
  Business spec accuracy is the human's domain.
- **Does not skip "simple" specs.** Every spec gets verified. Simple CRUD endpoints can
  still have wrong field types or missing constraints.
