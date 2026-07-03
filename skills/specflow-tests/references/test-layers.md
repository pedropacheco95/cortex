# Test Layers

This document defines the four layers of testing in a Specflow project. Each layer maps to a level of the spec model. Together they answer progressively bigger questions — from "does this one behavior work?" up to "does this real-world workflow hold together?"

Infrastructure requirements (mocked vs. real) are a *property* of each layer, not a separate classification axis.

## The Four Layers

### Layer 1: Atomic

**What it validates:** One acceptance criterion from one developer leaf spec.

**Maps to:** A single Given/When/Then block.

**Question it answers:** "Does this one behavior work?"

There is exactly one atomic test per acceptance criterion. This is the tightest possible scope — one behavior, one test. If the criterion says "Given X, When Y, Then Z", the atomic test sets up X, performs Y, and asserts Z. Nothing more.

**Infrastructure:** Mocked by default. All external dependencies (database, APIs, queues, file storage) are mocked or stubbed. Atomic tests run in-process, no containers needed. A single atomic test should complete in under 1 second.

**When to run:** Every commit. The full atomic suite should complete in under 2 minutes. If an atomic test fails, the commit does not merge.

**What belongs here:**
- Pure function tests (validation, calculation, transformation)
- Request/response shape tests with mocked handlers
- Input validation tests (malformed input, missing fields, wrong types)
- Business rule tests with in-memory data
- Frontend component rendering tests with mocked API
- Any test that exercises exactly one acceptance criterion in isolation

**What does NOT belong here:**
- Tests that exercise multiple criteria in sequence (→ spec tests)
- Tests that need real infrastructure to be meaningful (→ journey tests)
- Tests that cross dev-spec boundaries (→ journey or scenario tests)

**Naming convention:**

```
test_{spec_id_underscored}__{criterion_name_snake_case}
```

Double underscore separates spec ID from criterion name. This makes it possible to trace any failure back to its spec and criterion without ambiguity.

**Structure (Python):**

```python
# tests/atomic/auth/login/email-signup/test_email_signup.py

"""
Atomic tests for spec: auth.login.email-signup
All dependencies mocked. One test per acceptance criterion.
"""

class TestAuthLoginEmailSignup:
    """Atomic tests derived from auth.login.email-signup acceptance criteria."""

    def test_auth_login_email_signup__successful_login(self):
        """Returns a JWT when email and password are correct.

        Criterion: Successful login with valid credentials
        Given a registered user with email 'player@example.com'
        When they submit correct email and password
        Then response status is 200 with a valid JWT token
        """
        mock_db = MagicMock()
        mock_db.get_user_by_email.return_value = make_user(
            email="player@example.com"
        )
        result = handle_login(mock_db, {
            "email": "player@example.com",
            "password": "correct-password",
        })
        assert result.status == 200
        assert "token" in result.body
```

**Structure (TypeScript):**

```typescript
// tests/atomic/auth/login/email-signup/email-signup.test.ts

/**
 * Atomic tests for spec: auth.login.email-signup
 * All dependencies mocked. One test per acceptance criterion.
 */

describe('auth.login.email-signup — Atomic', () => {
  it('test_auth_login_email_signup__successful_login', async () => {
    // Returns a JWT when email and password are correct.
    /**
     * Criterion: Successful login with valid credentials
     * Given a registered user with email 'player@example.com'
     * When they submit correct email and password
     * Then response status is 200 with a valid JWT token
     */
    const mockDb = {
      getUserByEmail: jest.fn().mockResolvedValue(
        makeUser({ email: 'player@example.com' })
      ),
    };
    const result = await handleLogin(mockDb, {
      email: 'player@example.com',
      password: 'correct-password',
    });
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty('token');
  });
});
```

### Layer 2: Spec

**What it validates:** All acceptance criteria for one developer leaf spec pass together, in sequence, with shared state.

**Maps to:** One leaf developer spec (the full set of its criteria).

**Question it answers:** "Does this whole capability work as a coherent unit?"

A spec test runs all of a dev spec's criteria in sequence within a shared context. The point is to catch interactions *between* criteria that atomic tests miss: criterion A passes alone, criterion B passes alone, but A followed by B breaks because they share state, or A's side effect conflicts with B's precondition.

**Infrastructure:** Mocked by default for speed. However, spec tests may optionally run against real infrastructure when the interaction being tested is fundamentally about persistence or side effects (e.g., "does writing a booking actually decrement class capacity for the next read?"). Tag these with an infrastructure marker so CI knows to run them in the appropriate stage.

**When to run:** Every commit (mocked version). Optionally on merge to main for real-infrastructure variants.

**What belongs here:**
- Ordered execution of all criteria for one dev spec, sharing state
- State-transition tests within a single capability (e.g., lockout lifecycle: login → fail × 5 → locked → wait → recovered)
- Tests that verify side effects of one criterion are visible to subsequent criteria
- Tests that verify entity state consistency after all criteria have run

**What does NOT belong here:**
- Individual criterion tests in isolation (→ atomic)
- Tests that need a second dev spec's behavior to set up state (→ journey)
- Tests that simulate a user moving between capabilities (→ journey or scenario)

**Key distinction from atomic:** Atomic tests are independent and parallelizable — each one sets up its own state from scratch. Spec tests are sequential and stateful — step N depends on the state produced by step N-1. An atomic test failing tells you which criterion is broken. A spec test failing tells you which *transition* between criteria is broken.

**Naming convention:**

```
test_{spec_id_underscored}__spec__{step_number}_{criterion_name_snake_case}
```

The `__spec__` infix distinguishes spec tests from atomic tests for the same criterion.

**Structure (Python):**

```python
# tests/spec/auth/login/email-signup/test_email_signup.py

"""
Spec test for: auth.login.email-signup
Runs all criteria in sequence with shared state.
Tests interactions between criteria within this capability.
"""

import pytest

class TestAuthLoginEmailSignupSpec:
    """Spec-level test: all criteria for auth.login.email-signup in sequence."""

    @pytest.fixture(autouse=True)
    def setup(self, mock_db):
        """Shared state across all criteria in this spec."""
        self.db = mock_db
        self.user = make_user(email="player@example.com")
        self.db.add(self.user)

    def test_auth_login_email_signup__spec__01_successful_login(self):
        """Step 1: User can log in with correct credentials.
        State after: user has an active session, failed_attempts stays 0.
        """
        result = handle_login(self.db, {
            "email": "player@example.com",
            "password": "correct-password",
        })
        assert result.status == 200
        assert self.user.failed_attempts == 0

    def test_auth_login_email_signup__spec__02_failed_attempts_increment(self):
        """Step 2: After a bad password, the failure counter increments.
        State after: user.failed_attempts == 1.
        """
        result = handle_login(self.db, {
            "email": "player@example.com",
            "password": "wrong-password",
        })
        assert result.status == 401
        assert self.user.failed_attempts == 1

    def test_auth_login_email_signup__spec__03_lockout_after_threshold(self):
        """Step 3: After reaching 5 failures, account locks.
        Depends on: step 2 left failed_attempts at 1, we add 4 more.
        State after: user is locked, locked_until is set.
        """
        for _ in range(4):
            handle_login(self.db, {
                "email": "player@example.com",
                "password": "wrong-password",
            })
        assert self.user.failed_attempts == 5
        assert self.user.locked_until is not None

    def test_auth_login_email_signup__spec__04_correct_password_while_locked(self):
        """Step 4: Even the right password is rejected during lockout.
        Depends on: step 3 locked the account.
        """
        result = handle_login(self.db, {
            "email": "player@example.com",
            "password": "correct-password",
        })
        assert result.status == 429
```

### Layer 3: Journey

**What it validates:** A business spec's user journey is delivered end-to-end.

**Maps to:** One business spec — specifically, its User Journey section.

**Question it answers:** "Does this outcome actually get delivered to the user?"

A journey test follows the user journey described in a business spec. Each step in the journey typically touches a different dev spec's slice. The test sequences real operations — through the API or UI — in the order a user would perform them, and verifies the outcome described in the business spec's Outcome section.

**Infrastructure:** Real infrastructure required. Journey tests need a running application with real database, real queues, real cache — the full stack in containers. External third-party APIs remain mocked (payment providers, LLM APIs, email delivery), but everything the team owns runs for real.

**When to run:** On merge to main, nightly, or on-demand. Journey tests are slower (minutes, not seconds) because they exercise real infrastructure and multi-step flows.

**What belongs here:**
- Multi-step flows that cross dev-spec boundaries within one business outcome
- Tests that verify the business spec's User Journey section step by step
- Tests that check the business spec's Success Metrics where they are testable
- State consistency checks across multiple capabilities after a journey completes

**What does NOT belong here:**
- Tests of a single capability in isolation (→ atomic or spec)
- Tests that cross multiple business specs (→ scenario)
- Performance or load tests (separate concern)

**Key distinction from spec tests:** Spec tests stay within one dev spec's boundaries and share in-process state. Journey tests cross dev spec boundaries and interact with the system through its public interface (API, UI). A spec test might mock the database; a journey test uses a real one.

**Derivation from business specs:** Each business spec has a User Journey section with numbered steps. The journey test maps those steps to API calls (or UI actions) and verifies the expected state after each step. The business spec's `implemented_by:` frontmatter tells you which dev specs are involved — the journey test exercises all of them in the order the user journey describes.

**Naming convention:**

```
test_journey__{business_spec_id_underscored}
```

Inside the test, steps are ordered and named after the journey steps.

**Structure (Python):**

```python
# tests/journey/booking/test_reserve_and_pay.py

"""
Journey test for business spec: booking.reserve-and-pay
Follows the User Journey section end-to-end with real infrastructure.

Business spec outcome: "A player can find an available class, book it,
pay, and receive confirmation — all in under a minute."

Implemented by dev specs:
  - booking.search.class-search
  - booking.reservation.hold-slot
  - booking.payment.process-payment
  - notifications.email.booking-confirmation
"""

import pytest
from tests.helpers.api_client import SandboxClient


class TestJourneyBookingReserveAndPay:
    """Journey test: booking.reserve-and-pay"""

    @pytest.fixture(autouse=True)
    def setup(self, sandbox: SandboxClient, seeded_db):
        """
        Seed requirements (derived from journey steps):
        - One coach with a published class, capacity 4, 2 spots remaining
        - One registered player (not yet booked)
        - Payment mock configured to accept
        """
        self.client = sandbox
        self.player_token = sandbox.login("player@example.com", "password")

    def test_journey__booking_reserve_and_pay__step_1_browse(self):
        """Journey step 1: Player opens the schedule and sees available classes.
        Business spec step: 'The player opens the class schedule for their club.'
        """
        r = self.client.get("/classes?date=2025-01-15",
                            token=self.player_token)
        assert r.status_code == 200
        classes = r.json()
        assert any(c["available_spots"] > 0 for c in classes)

    def test_journey__booking_reserve_and_pay__step_2_select(self):
        """Journey step 2: Player taps a class and sees details.
        Business spec step: 'She picks a class and sees who else is playing.'
        """
        r = self.client.get("/classes/cls-001", token=self.player_token)
        assert r.status_code == 200
        assert "participants" in r.json()
        assert r.json()["available_spots"] == 2

    def test_journey__booking_reserve_and_pay__step_3_book(self):
        """Journey step 3: Player books the slot and pays.
        Business spec step: 'She taps Book, confirms payment, and the slot is hers.'
        """
        r = self.client.post("/bookings", json={
            "class_id": "cls-001",
        }, token=self.player_token)
        assert r.status_code == 201
        booking_id = r.json()["id"]

        # Verify side effects
        cls = self.client.get("/classes/cls-001",
                              token=self.player_token).json()
        assert cls["available_spots"] == 1  # decremented

    def test_journey__booking_reserve_and_pay__step_4_confirmation(self):
        """Journey step 4: Player receives booking confirmation.
        Business spec step: 'Within a minute, she gets a confirmation with the details.'
        """
        # Check notification was created (real DB)
        notifications = self.client.get("/notifications",
                                        token=self.player_token).json()
        assert any(
            n["type"] == "booking_confirmation"
            for n in notifications
        )
```

### Layer 4: Scenario

**What it validates:** A realistic workflow that crosses multiple business specs.

**Maps to:** Multiple business specs — a designed end-to-end path through the product.

**Question it answers:** "Does this real-world workflow hold together across the whole system?"

Scenario tests are the highest-scope tests. They simulate a realistic user workflow that spans multiple business outcomes — things like "new user signs up, books their first class, class gets cancelled, they get refunded, they rebook." No single business spec covers this path, but a real user lives it.

**The coverage constraint:** Every business spec must appear in the `covers:` list of at least one scenario. If a business spec cannot be reached by any designed scenario, it is either dead weight or the scenario set is incomplete. This is enforced by the coverage checker (see `references/scenario-design.md`).

**Infrastructure:** Full sandbox — the complete application running with all services. Scenario tests exercise the system exactly as a user would, through the API or browser. External mocks are the only non-real components.

**When to run:** Before release, after major spec changes, or on-demand. Scenario tests are the slowest layer — thoroughness over speed.

**What belongs here:**
- Multi-journey workflows that cross business-spec boundaries
- Sequences where the outcome of one journey becomes the precondition for another
- Edge cases that only emerge when multiple journeys interact (cancellation after booking after signup)
- State consistency checks after a complete real-world workflow

**What does NOT belong here:**
- Single-journey tests (→ journey)
- Tests of individual capabilities (→ atomic or spec)
- Tests that don't cross at least two business specs
- Performance or load tests

**Scenario spec location:** `tests/scenarios/` — see `references/scenario-design.md` for the full format.

**Naming convention:**

```
test_scenario__{scenario_name_snake_case}
```

Inside the test, steps reference the business spec they touch.

**Structure (Python):**

```python
# tests/scenario/test_new_player_first_booking.py

"""
Scenario: new-player-first-booking
Covers:
  - business.auth.secure-account-access
  - business.booking.find-a-class
  - business.booking.reserve-and-pay
  - business.notifications.booking-confirmation

Narrative: A brand-new player signs up, browses classes, books one,
and receives confirmation. Tests the complete onboarding-to-first-action path.
"""

import pytest
from tests.helpers.api_client import SandboxClient


class TestScenarioNewPlayerFirstBooking:
    """Scenario: new-player-first-booking"""

    @pytest.fixture(autouse=True)
    def setup(self, sandbox: SandboxClient, scenario_seed):
        """
        Scenario seed (auto-generated from scenario spec):
        - One coach with one published class, capacity 4
        - Payment mock configured to accept
        - No player account yet (player registers during the scenario)
        """
        self.client = sandbox

    def test_scenario__new_player_first_booking__01_signup(self):
        """Player creates an account.
        Covers: business.auth.secure-account-access
        Expected state: user exists, JWT returned.
        """
        r = self.client.post("/auth/register", json={
            "email": "new-player@example.com",
            "password": "SecurePass1!",
            "name": "Test Player",
        })
        assert r.status_code == 201
        self.player_token = r.json()["token"]

    def test_scenario__new_player_first_booking__02_browse(self):
        """Player finds available classes.
        Covers: business.booking.find-a-class
        Expected state: response includes classes with open spots.
        """
        r = self.client.get("/classes?date=2025-01-15",
                            token=self.player_token)
        assert r.status_code == 200
        available = [c for c in r.json() if c["available_spots"] > 0]
        assert len(available) > 0
        self.target_class = available[0]["id"]

    def test_scenario__new_player_first_booking__03_book_and_pay(self):
        """Player books a class and payment is processed.
        Covers: business.booking.reserve-and-pay
        Expected state: booking exists, capacity decremented, payment captured.
        """
        r = self.client.post("/bookings", json={
            "class_id": self.target_class,
        }, token=self.player_token)
        assert r.status_code == 201
        self.booking_id = r.json()["id"]

    def test_scenario__new_player_first_booking__04_confirmation(self):
        """Player receives booking confirmation.
        Covers: business.notifications.booking-confirmation
        Expected state: notification exists for player with booking details.
        """
        r = self.client.get("/notifications", token=self.player_token)
        confirmations = [
            n for n in r.json()
            if n["type"] == "booking_confirmation"
            and n["booking_id"] == self.booking_id
        ]
        assert len(confirmations) == 1

    def test_scenario__new_player_first_booking__final_state(self):
        """Checkpoint: verify system state after complete scenario.
        All entities are in expected states, no orphaned records.
        """
        # User exists and is active
        user = self.client.get("/me", token=self.player_token).json()
        assert user["email"] == "new-player@example.com"

        # Booking is confirmed
        booking = self.client.get(
            f"/bookings/{self.booking_id}", token=self.player_token
        ).json()
        assert booking["status"] == "confirmed"

        # Class capacity was decremented
        cls = self.client.get(
            f"/classes/{self.target_class}", token=self.player_token
        ).json()
        assert cls["available_spots"] == 3  # was 4, now 3
```

## Directory Structure

The four layers are the top-level directories:

```
tests/
├── setup.{py,ts,js}               # Shared fixtures, DB connection, app client
├── fixtures/                       # Committed test data files
│   ├── entities/                   # Per-entity fixture factories
│   ├── seeds/                      # Seed scripts (per-layer and per-scenario)
│   └── media/                      # Binary fixtures (images, videos, documents)
├── atomic/                         # Layer 1: one test per criterion
│   └── {domain}/{capability}/{leaf}/
│       └── {leaf}.test.{ext}
├── spec/                           # Layer 2: all criteria in sequence per spec
│   └── {domain}/{capability}/{leaf}/
│       └── {leaf}.test.{ext}
├── journey/                        # Layer 3: one test per business spec journey
│   └── {business-domain}/
│       └── {outcome}.test.{ext}
├── scenario/                       # Layer 4: cross-journey workflows
│   ├── specs/                      # Scenario spec files (markdown)
│   │   ├── new-player-first-booking.md
│   │   ├── class-cancellation-refund.md
│   │   └── ...
│   └── {scenario-name}.test.{ext}  # Generated test files
└── docker-compose.test.yml         # Test infrastructure definition
```

Within `atomic/` and `spec/`, the directory structure mirrors the developer spec tree. Within `journey/`, the structure mirrors the business spec tree. Within `scenario/`, files are named after the scenario.

## Infrastructure Mapping

Each layer has a default infrastructure requirement. Infrastructure emerges from scope, not from a separate classification.

| Layer | Default infra | Why | CI stage |
|---|---|---|---|
| Atomic | Mocked | Tests one criterion in isolation — real infra adds nothing | Every commit |
| Spec | Mocked | Tests criterion interaction within one capability — usually in-process is sufficient | Every commit |
| Journey | Real (containers) | Tests cross-capability flows — mocks would test the mocks, not the system | Merge to main / nightly |
| Scenario | Full sandbox | Tests the complete application as a user would use it | Before release / on-demand |

**Exception tagging:** Occasionally an atomic or spec test genuinely needs real infrastructure to be meaningful (e.g., a constraint that only the real database enforces). Tag these with `@needs_infra` (Python) or `// @needs-infra` (TS) and run them alongside journey tests in CI rather than in the fast commit stage.

```python
@pytest.mark.needs_infra
def test_auth_login_email_signup__unique_email_constraint(self):
    """Real DB enforces uniqueness that mocks can't verify."""
    ...
```

## CI Pipeline Configuration

```yaml
# .github/workflows/test.yml

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  fast:
    # Runs on every push and PR — must be fast
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/test-run.sh atomic
      - run: ./scripts/test-run.sh spec

  integration:
    # Runs on merge to main — real infrastructure
    runs-on: ubuntu-latest
    needs: fast
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/test-run.sh journey

  release:
    # Runs manually or with [release] in commit message
    runs-on: ubuntu-latest
    needs: integration
    if: >
      github.event_name == 'workflow_dispatch' ||
      contains(github.event.head_commit.message, '[release]')
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/test-run.sh scenario
```

## Test Generation Flow

When the agent generates tests from specs, it follows this sequence:

### For each developer leaf spec:

1. **Read the spec.** Extract ID, entities, rules, acceptance criteria, dependencies, `implements:` link.
2. **Generate atomic tests.** One test per acceptance criterion. Mocked dependencies. Each test cites its criterion in the docstring.
3. **Generate the spec test.** One test class that runs all criteria in sequence with shared state. Design the step order to expose state interactions.
4. **Check fixtures.** For each Given clause, verify a fixture factory exists. For each boundary implied by a Rule, verify a boundary fixture exists. Generate missing fixtures.

### For each business spec:

5. **Generate the journey test.** Read the User Journey section. Map each step to an API call or UI action (using the `implemented_by:` dev specs to identify the endpoints). Generate the test with real-infrastructure markers.

### For scenario coverage:

6. **Read or generate scenario specs.** See `references/scenario-design.md`. Verify every business spec appears in at least one scenario's `covers:` list. Generate scenario test files from scenario specs.

### Criterion exhaustiveness check:

For every numbered rule in a dev spec, the agent checks:
- Is there a criterion that tests the rule's positive case?
- Is there a criterion that tests what happens when the rule is violated?
- If the rule has a numeric threshold, is there a criterion at the boundary?
- If the rule references time, is there a criterion for the edge of the time window?

Gaps are reported to Specflow for spec addition — the testing skill does not modify specs.

## Report Format

Test results are reported per-layer, mapping back to the spec model:

```
╔══════════════════════════════════════════════════════════════╗
║  SPECFLOW TEST REPORT                                        ║
║  Run: 2025-03-15T14:22:00Z                                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ATOMIC (47 tests, 34s)                              PASS ✓ ║
║                                                              ║
║  auth.login.email-signup                       5/5 PASS ✓   ║
║    ✓ successful_login                                        ║
║    ✓ invalid_password_returns_401                            ║
║    ✓ unregistered_email_returns_404                          ║
║    ✓ account_lockout_after_repeated_failures                 ║
║    ✓ lockout_recovery_after_timeout                          ║
║                                                              ║
║  scheduling.booking.create                     3/4 FAIL ✗   ║
║    ✓ successful_booking                                      ║
║    ✓ booking_full_class_returns_409                           ║
║    ✗ concurrent_booking_last_slot              FAILED        ║
║      AssertionError: Expected 409, got 200                   ║
║      Spec rule violated: Rule 4 (capacity enforcement)       ║
║    ✓ booking_own_class_rejected                              ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  SPEC (12 specs, 1m 12s)                             PASS ✓ ║
║                                                              ║
║  auth.login.email-signup                       4/4 PASS ✓   ║
║    ✓ 01_successful_login                                     ║
║    ✓ 02_failed_attempts_increment                            ║
║    ✓ 03_lockout_after_threshold                              ║
║    ✓ 04_correct_password_while_locked                        ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  JOURNEY (8 journeys, 4m 33s)                        PASS ✓ ║
║                                                              ║
║  booking.reserve-and-pay                       4/4 PASS ✓   ║
║    ✓ step_1_browse                                           ║
║    ✓ step_2_select                                           ║
║    ✓ step_3_book                                             ║
║    ✓ step_4_confirmation                                     ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  SCENARIO (3 scenarios, 8m 15s)                      PASS ✓ ║
║                                                              ║
║  new-player-first-booking                      5/5 PASS ✓   ║
║    ✓ 01_signup              (auth.secure-account-access)     ║
║    ✓ 02_browse              (booking.find-a-class)           ║
║    ✓ 03_book_and_pay        (booking.reserve-and-pay)        ║
║    ✓ 04_confirmation        (notifications.booking-confirm)  ║
║    ✓ final_state                                             ║
║                                                              ║
║  COVERAGE: 14/14 business specs covered by scenarios  ✓     ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  TOTAL: 70/71 passed  1 failed  0 skipped                   ║
║  Failed specs: scheduling.booking.create (atomic)            ║
╚══════════════════════════════════════════════════════════════╝
```

The report shows coverage at the scenario level — how many business specs are covered by at least one scenario. This is the forcing function that ensures the scenario set reflects reality.

## Failure Triage

When tests fail, the agent classifies the failure:

| Failure type | Signal | Action |
|---|---|---|
| Code bug | Test correctly encodes the spec, code doesn't match | Fix the code |
| Test bug | Test doesn't correctly encode the spec | Fix the test |
| Spec gap | Test reveals an unspecified scenario | Report to Specflow for spec addition |
| Environment issue | Fails due to infrastructure (port conflict, timeout, OOM) | Fix environment provisioning |
| Flaky test | Passes sometimes, fails sometimes | Fix non-determinism (time, concurrency, ordering) |
| State leak | Spec/journey/scenario test fails because prior step left unexpected state | Fix test isolation or step ordering |

The agent never silently retries a failing test. Flaky tests are bugs.

## Relationship to the Specflow Build Loop

During the Specflow build loop, slices are validated one at a time. The build loop uses **atomic tests** — fast, mocked, one per criterion. When a slice is complete and its atomics pass, the spec test for that dev spec also runs to verify criterion interactions.

Journey and scenario tests run *after* a set of slices is complete, not per-slice. They are integration checkpoints, not build-loop gates.
