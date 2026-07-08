# Gap Documentation

When the develop agent sees something that should be handled but isn't covered by any
spec or test, it codes a solution AND documents it. The human reviews both the gap
description and the code that addresses it.

## Gap Code Rules

### Isolation requirement

Gap code must be structured so it can be cleanly removed without breaking any
spec-passing test. This means:

- Gap code in a separate function/block from spec code, not interleaved
- If a gap fix must be in the same function as spec code, wrap it in a clearly
  marked block:

```typescript
// --- GAP-003: negative cardinality rejection ---
if (cardinality < 0) {
  return res.status(400).json({ error: 'Cardinality must be >= 0' });
}
// --- end GAP-003 ---
```

- Removing the block should not break any existing test
- If isolation is impossible (the gap fix is structurally entangled with spec code),
  document this and explain why

### No silent gap code

Every line of gap code must trace to a documented gap entry. If the agent writes code
that isn't required by a test AND isn't documented as a gap, that code should not exist.

## Gap Severity

Severity is informational — it helps the human prioritize their review. The agent always
codes the gap and continues regardless of severity.

| Severity | Definition | Human review priority |
|---|---|---|
| CRITICAL | Would cause data loss, security breach, or crash on normal usage | Review first — decide keep/change/remove before release |
| NORMAL | A real scenario that should be handled. Won't crash normal usage but produces wrong results or confusing UX for some inputs. | Review before release |
| MINOR | Code hygiene, edge cases requiring deliberate misuse, cosmetic issues. | Review when convenient — can ship without reviewing |

## Gap Documentation Format

Each gap entry is written to `.cortex/pulse/gaps.md` (design §8.5 — never a root
`gaps.md`). The file accumulates gaps from all spec agents in the current scope.

```markdown
## GAP-001: Negative cardinality rejected

**Severity:** NORMAL
**Found during:** .specflow/specs/cardinality/update-cardinality.spec.md
**Spec level:** Spec (no criterion covers negative input)

**What I saw:** The cardinality input accepts any integer. No spec rule or acceptance
criterion addresses negative values. The atomic tests only cover positive integers and
zero.

**What I coded:** Added validation at the top of the handler rejecting values < 0
with a 400 response and error message "Cardinality must be >= 0".

**Files touched:**
- src/routes/cardinality.ts:45-48 (gap code block)

**Why this approach:** Consistent with how the adjacent portion-count validation works
(same pattern at line 72). Early return before any DB operations.

**If you want to keep this:**
- Add to spec `cardinality.update-cardinality`, Rule: "Cardinality must be >= 0.
  Negative values are rejected with 400."
- Add criterion:
  - **Given** cardinality input = -1
  - **When** POST to /cardinality/update
  - **Then** response status is 400
  - **And** no D_Case records are created or modified

**If you want a different approach:** [describe what alternatives exist]

**If you don't want this:** Remove lines 45-48 of src/routes/cardinality.ts. No
existing tests will break.
```

## Gap Levels

Gaps emerge at different levels of the cascade:

### Spec-level gaps (found by spec agents)

Individual behaviors not covered by criteria:
- Missing input validation
- Unhandled error cases
- Edge case behavior not specified
- Default values not documented

### Domain-level gaps (found by domain agents)

Cross-spec patterns that should exist but no spec mentions:
- Inconsistent error response shapes across specs in the domain
- Shared validation logic that should be extracted
- Entity state transitions that span multiple specs without coordination
- Missing data integrity constraints between related specs

```markdown
## GAP-012: Inconsistent error shapes across booking domain

**Severity:** NORMAL
**Found during:** Domain-level spec test integration
**Spec level:** Domain (crosses booking.reserve + booking.cancel + booking.payment)

**What I saw:** booking.reserve returns `{ error: "message" }`, booking.cancel returns
`{ message: "error text", code: "CANCEL_FAILED" }`, booking.payment returns
`{ errors: ["message"] }`. No spec mandates a consistent shape.

**What I coded:** Standardized all three to `{ error: { message: string, code: string } }`
matching the pattern established in the auth domain.

**Files touched:**
- src/routes/booking/reserve.ts:89 (error response)
- src/routes/booking/cancel.ts:45 (error response)
- src/routes/booking/payment.ts:112 (error response)

**If you want to keep this:** Add a project-wide rule to RULES.md:
"All error responses use `{ error: { message: string, code: string } }` shape."
```

### Slice-level gaps (found by slice agents)

Cross-domain flows that no spec covers:
- What happens between the end of one domain's operation and the start of another's
- Missing event propagation (booking created but notification not triggered)
- Data consistency between domains that share entities

```markdown
## GAP-018: No notification after booking creation

**Severity:** NORMAL
**Found during:** Slice-level journey test for user-books-a-class
**Spec level:** Slice (crosses booking domain + notifications domain)

**What I saw:** The journey test walks: search → select → book → (expected: receive
confirmation). The booking spec creates the booking. The notification spec sends
confirmations. But nothing connects them — no event, no call, no queue message.

**What I coded:** Added a call to `notificationService.sendBookingConfirmation(booking)`
at the end of the booking handler, after the D_Case is committed.

**Files touched:**
- src/routes/booking/reserve.ts:95 (added notification call)
- src/services/notifications.ts:12 (imported in booking route)

**If you want to keep this:** Create a new spec `booking.notifications.booking-created`
that describes the event/call between booking and notification domains.
```

## Gap Report Summary

At the end of the develop flow, the top-level agent produces a summary:

```markdown
# Gap Report

## Summary
- Total gaps documented: 18
- Critical (blocking): 1
- Normal: 12
- Minor: 5

## By level
- Spec-level: 14 (individual spec edge cases)
- Domain-level: 3 (cross-spec consistency)
- Slice-level: 1 (cross-domain integration)

## Critical gaps (required human decision)
- GAP-007: [title] — [one-line description]

## Normal gaps (recommended for review)
- GAP-001: Negative cardinality rejected
- GAP-003: Missing auth check on public endpoint
- ...

## Minor gaps (backlog)
- GAP-015: Console.log left in error handler
- ...
```

## What Happens After the Human Reviews

For each gap the human reviews:

| Decision | What happens |
|---|---|
| **Keep as-is** | Gap code stays. Human (or agent) adds the gap to the relevant spec as a new rule + criterion, generates the test (which should pass immediately since the code exists). |
| **Keep with changes** | Human writes the spec with the desired approach. Agent generates the test. Agent replaces the gap code with code that passes the new test. |
| **Remove** | Gap code is deleted. The gap markers are removed. No spec change needed. Existing tests must still pass after removal. |
| **Defer** | Gap code stays for now. Gap entry moves to a backlog file. Reviewed periodically. |
