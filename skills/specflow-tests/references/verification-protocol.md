# Test Verification Protocol

This document describes the mandatory verification process that runs after all tests are
generated and executed. Verification checks three things: no fake tests, complete coverage
(counted from executing tests only), and adversarial correctness (100% coverage, not
sampled).

## Principle

A test suite that reports PASS when tests don't actually run is worse than no test suite.
It creates false confidence. Every check in this protocol exists to prevent false
confidence.

## What Counts as a Fake Test

Any of the following in a test body = verification FAIL. No exceptions.

### Forbidden patterns

```javascript
// Pattern 1: Trivially true assertion
expect(true).toBe(true)
assert True
assertTrue(true)
expect(1).toBe(1)

// Pattern 2: Empty body
it('should do something', () => {})
it('should do something', () => { return; })
it('should do something', () => { pass })
def test_something(): pass

// Pattern 3: Skip markers counted as coverage
it.skip('should do something', ...)
xit('should do something', ...)
xtest('should do something', ...)
@pytest.mark.skip
test('should do something', { skip: true }, ...)

// Pattern 4: Deferred work
// TODO: implement this test
// FIXME: write assertions
// placeholder
// stub
// implement later
// pending implementation

// Pattern 5: Status-only assertions (insufficient)
expect(response.status).toBe(200)  // without body check
// This is only fake if it's the ONLY assertion. Status + body = fine.
```

### Why no exceptions

The previous verification report classified 42 `expect(true).toBe(true)` as "OK —
stylistic" because they had comments explaining why. Comments don't make fake tests
real. A well-documented stub is still a stub. If the test can't have real assertions
right now, the correct action is:

1. Don't write the test
2. Report the gap in the coverage section: "criterion X needs [capability] to test"
3. The coverage count shows the real number

This is honest. A stub that counts as coverage is dishonest.

### What about draft specs?

If a spec has `status: draft`, its tests may not be implementable yet (the code doesn't
exist). Options:

- **Don't write the test.** Report in coverage: "spec auth.login.lockout is draft —
  0/3 criteria testable." This is honest.
- **Write the test with real assertions against a mock.** If the spec's rules are clear
  enough to write tests even before the code exists, this is TDD and it's great. The
  tests will fail until the code is written — that's correct behavior.
- **DO NOT write a skip/stub test.** It counts as uncovered, and it occupies a filename
  that makes coverage look better than it is.

## Coverage Counting Rules

### What counts as "covered"

A criterion/spec/journey/scenario is covered if and only if:
1. A test file exists with the correct naming convention
2. The test actually executed (was not skipped)
3. The test has real assertions (not fake patterns above)
4. The test either passed or failed on assertion (not on infrastructure/execution)

### What does NOT count

- Skipped tests
- Tests that crash on import
- Tests that throw before reaching assertions
- Tests with only trivially-true assertions
- Tests that exist as files but were not included in the test run
- Tests that only assert HTTP status without checking response body or side effects

### Reporting format

Always report the honest numbers:

```
Atomic: 180/226 criteria covered
  - 180 criteria have executing tests with real assertions
  - 30 criteria in draft specs (code doesn't exist yet)
  - 16 criteria need Playwright (UI interaction required)
  - 0 fake tests, 0 stubs

NOT:
Atomic: 226/226 criteria covered (46 skipped with documented reason)
```

The first format is honest. The second hides 46 gaps behind "documented reasons."

## Adversarial Blind Reader Protocol

### Why 100%, not sampled

The previous verification sampled 18 tests out of 101 (18%). An agent can produce 83
correct tests and 18 wrong ones. An 18% sample might miss all 18. Check every test.

### Delegation for large suites

For suites with 50+ tests, spawn one blind reader agent per domain. Each agent receives
only the test files for its domain (no specs). The agent produces descriptions, then the
orchestrator compares against specs.

### Blind reader instructions (per layer)

**Atomic blind reader receives:**
- One test file
- Instruction: "Without seeing the spec, describe what this test verifies. For each
  test function: what state does it set up, what action does it perform, what does it
  assert?"

**Spec blind reader receives:**
- One test file
- Instruction: "Without seeing the spec, describe: what invariants does this test verify?
  What rules does it exercise? Does it test state accumulation or just run independent
  assertions? What entity writes does it check?"

**Journey blind reader receives:**
- One test file
- Instruction: "Without seeing the business spec, describe: what user journey does this
  test follow? What steps does it walk? Does it use real infrastructure or mocks? What
  outcomes does it verify at each step?"

**Scenario blind reader receives:**
- One test file
- Instruction: "Without seeing the scenario spec, describe: what business outcomes does
  each step exercise? Does each step verify the outcome or just touch an endpoint?"

### Comparator checks

After the blind reader produces descriptions, the comparator (which HAS access to specs)
checks alignment:

**Atomic comparator:**
- Does the described state match the criterion's Given?
- Does the described action match the When?
- Does the described assertion match the Then?
- Are concrete values correct (boundary values, thresholds, specific IDs)?

**Spec comparator:**
- Does the test exercise ALL numbered rules in the spec?
- Does it verify writes to ALL entities in the spec's WRITES section?
- Is it testing rule interactions or just replaying criteria sequentially?
- If the test looks like "criterion 1, then criterion 2, then criterion 3" in order
  with independent assertions — FLAG AS WRONG (criteria replay, not spec test)

**Journey comparator:**
- Does each test step map to a numbered journey step in the business spec?
- Is real infrastructure used (no jest.mock, no mockResolvedValue, no jest.fn)?
- Does each step verify the user-visible outcome (not just HTTP status)?

**Scenario comparator:**
- For each business spec in the scenario's `covers:` list: does a test step actually
  exercise and verify that outcome?
- A POST to /bookings without asserting a booking was created = false coverage claim

### Mismatch severity

| Type | Severity | Action |
|---|---|---|
| Wrong boundary value | High | Rewrite test with correct value |
| Missing assertion (Then clause not checked) | High | Add missing assertion |
| Criteria replay in spec test | High | Redesign as rule-interaction test |
| Mock in journey test | High | Replace with real infrastructure call |
| False coverage claim in scenario | High | Add outcome verification or remove covers: claim |
| Status-only assertion (no body check) | Medium | Add body/side-effect assertion |
| Extra assertions beyond spec | Low | Acceptable — test is more thorough |
