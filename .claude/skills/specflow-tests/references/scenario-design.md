# Scenario Design

This document describes how to design scenario tests — the highest-scope layer in the Specflow testing framework. Scenarios test realistic multi-journey workflows that cross business-spec boundaries. They are the definitive proof that the product works as a whole.

## The Coverage Constraint

**Every business spec must appear in the `covers:` list of at least one scenario.**

This is the single most important rule in scenario design. It creates a forcing function:

- If you can't write a scenario that reaches a business spec, that spec may be dead weight — an outcome nobody actually experiences as part of a real workflow.
- If your scenarios don't collectively cover every business spec, the scenario set doesn't reflect reality — there are product outcomes that no end-to-end test exercises.
- If a business spec only appears in one scenario and that scenario is contrived, the spec's integration with the rest of the system is undertested.

The coverage checker enforces this mechanically. It reads every scenario spec's `covers:` frontmatter and diffs against the full business spec list. Uncovered business specs are reported as failures.

**Coverage quality matters too.** The goal is not to contrive scenarios that touch every business spec once. The goal is to design scenarios that a real user would actually walk through. If a scenario doesn't feel like something a user would do, it's testing an artificial path and won't catch real integration failures.

## Scenario Spec Format

Scenario specs live in `tests/scenarios/specs/` as markdown files. Each file describes one scenario.

```markdown
---
name: new-player-first-booking
covers:
  - business.auth.secure-account-access
  - business.booking.find-a-class
  - business.booking.reserve-and-pay
  - business.notifications.booking-confirmation
---

# New Player: First Booking

## Narrative

A brand-new player signs up for the platform, browses available classes at their
local club, books their first class, and receives a confirmation. This is the
core onboarding-to-first-value path — if this doesn't work smoothly, the product
fails at its primary job.

## Preconditions

What must exist in the system before the scenario starts. This feeds the seed
script generator.

- One coach user with an active account
- One venue ("Main Court")
- One published class: "Morning Padel", capacity 4, date 2025-01-15 10:00, 2 spots remaining
- Payment provider mock: configured to accept all charges
- Email mock: captures outbound messages

## Steps

### Step 1: Player signs up
- **Action:** POST /auth/register { email, password, name }
- **Covers:** business.auth.secure-account-access
- **Expected state after:**
  - User record exists with status `active`
  - JWT token returned
  - Welcome email queued (if applicable)

### Step 2: Player browses classes
- **Action:** GET /classes?date=2025-01-15
- **Covers:** business.booking.find-a-class
- **Expected state after:**
  - Response includes "Morning Padel" with available_spots = 2

### Step 3: Player books the class
- **Action:** POST /bookings { class_id }
- **Covers:** business.booking.reserve-and-pay
- **Expected state after:**
  - Booking record exists, status `confirmed`
  - Class available_spots decremented to 1
  - Payment intent created and captured

### Step 4: Player receives confirmation
- **Covers:** business.notifications.booking-confirmation
- **Expected state after:**
  - Notification record exists: type=booking_confirmation, user=player
  - Email mock captured a confirmation email to player's address

## Final Checkpoint

After all steps complete, verify overall system consistency:
- User has exactly 1 booking
- Class has 1 remaining spot (was 2, now 1)
- Notification count for this user: 1 (or 2 if welcome email is a separate notification)
- No orphaned records, no dangling references

## Notes

- This is the most critical scenario for the platform — it's the first-time user experience.
- If the payment mock is replaced with a real sandbox (Stripe test mode), mark the scenario
  for the real-payment CI variant.
```

### Frontmatter fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Kebab-case identifier. Becomes the test file name and directory name. |
| `covers` | Yes | List of business spec IDs this scenario exercises. Every ID must resolve to an existing business spec. |

### Body sections

| Section | Required | Description |
|---|---|---|
| Narrative | Yes | 1-3 sentences. Why this scenario matters. What real-world workflow it represents. |
| Preconditions | Yes | What must exist before step 1. Feeds the seed script generator. |
| Steps | Yes | Numbered steps. Each has: Action, Covers (business spec ID), Expected state after. |
| Final Checkpoint | Yes | Post-scenario consistency checks. Verifies the system is in a coherent state. |
| Notes | No | Context, variants, edge cases to explore in future scenarios. |

### Step anatomy

Each step has three parts:

**Action** — What the user does. Express as an API call (method + path + body) or a UI action ("clicks Book on the class card"). API calls are preferred for automation; UI actions are acceptable for browser-based scenario tests (Playwright/Cypress).

**Covers** — Which business spec this step exercises. A step covers exactly one business spec. If a step touches two business outcomes, split it into two steps.

**Expected state after** — The system state after the action completes. Express as concrete, verifiable assertions: "Booking record exists with status confirmed", "Class available_spots is 1", "Email mock captured 1 message." The test generator converts these into `assert` statements.

## How the Agent Designs Scenarios

The agent proposes scenarios by reading the business spec tree and finding natural multi-outcome paths through the product.

### Step 1: Map the business spec landscape

Read `.specflow/specs-business/` and list every business spec with its ID, domain, and the dev specs it's `implemented_by`. This is the universe of outcomes to cover.

### Step 2: Identify natural entry points

Find the business specs that represent "first contact" with the product — typically signup, onboarding, or the first action a user takes. These are the starting points for scenarios.

### Step 3: Walk forward from each entry point

From each entry point, ask: "What does a user do next?" Follow the natural flow of the product. A user who signs up will browse, then book, then maybe cancel, then rebook. Each action touches a different business spec. This sequence becomes a scenario.

### Step 4: Cover the edges

After walking the natural paths, check coverage. Which business specs are still uncovered? These are typically:
- Edge cases (cancellation, refund, error recovery)
- Admin or back-office workflows (coach creates a class, admin reviews reports)
- Periodic events (reminders, scheduled notifications)
- Rare but critical flows (account recovery, dispute resolution)

Design scenarios specifically for these. They may be shorter or less linear than the happy-path scenarios, but they still follow the principle: a realistic sequence that a real user or admin would actually perform.

### Step 5: Minimize scenario count

Aim for the fewest scenarios that achieve full coverage. Every scenario has a maintenance cost (seed data, test code, execution time). A medium project (10-20 business specs) should typically have 3-8 scenarios.

If you need more than ~15 scenarios for a project, you're either over-fragmenting or the product surface is genuinely large (in which case, group scenarios by persona or domain).

### Step 6: Verify coverage

Run the coverage checker: every business spec ID must appear in at least one scenario's `covers:` list. Report any gaps.

```
Scenario coverage check:
  14 business specs total
  3 scenarios designed
  14/14 covered ✓

  Coverage breakdown:
    new-player-first-booking: 4 business specs
    coach-creates-and-manages-class: 5 business specs
    booking-cancellation-and-refund: 5 business specs

  Overlap (covered by multiple scenarios):
    business.booking.reserve-and-pay: 2 scenarios (good — high-value outcome)
    business.notifications.booking-confirmation: 2 scenarios
```

### Step 7: Present for human review

Show the human:
- The list of scenarios with their narratives
- The coverage map (which business spec is covered where)
- Any business specs covered by only one scenario (potential under-testing)
- Any scenarios that feel contrived (the agent should flag its own uncertainty)

The human may:
- Approve the set
- Add a scenario the agent missed (a workflow they know users do but the specs don't make obvious)
- Remove a scenario that doesn't reflect reality
- Reorganize steps (the human knows the actual UX flow better than the agent)

## Seed Data Generation from Scenarios

Each scenario's Preconditions section describes what must exist before step 1. The agent converts this into a seed script specific to that scenario.

### Derivation process

1. **Read the Preconditions.** Extract every entity mentioned: "One coach user", "One venue", "One published class."
2. **Resolve to fixture factories.** Map each entity to its factory in `tests/fixtures/entities/`. If no factory exists, generate one (see `references/test-data-architecture.md`).
3. **Determine entity states.** The preconditions specify states: "capacity 4, 2 spots remaining" → class fixture with `capacity=4`, plus 2 booking fixtures to fill 2 spots.
4. **Walk the relationship graph.** Entities reference each other. A class needs a coach (user) and a venue. A booking needs a class and a player. Seed in dependency order: venue → users → class → bookings.
5. **Account for temporal state.** Some preconditions are time-relative: "class scheduled for tomorrow." Use a clock fixture or compute relative to test execution time.
6. **Generate the seed script.** One file per scenario in `tests/fixtures/seeds/`:

```python
# tests/fixtures/seeds/seed_new_player_first_booking.py

"""
Seed script for scenario: new-player-first-booking
Generated from scenario spec preconditions.

Seeds: 1 coach, 1 venue, 1 class (2/4 spots filled), 2 existing bookings.
Does NOT seed the player — the player registers during the scenario.
"""

from tests.fixtures.entities.users import make_user
from tests.fixtures.entities.venues import make_venue
from tests.fixtures.entities.classes import make_class
from tests.fixtures.entities.bookings import make_booking


def seed(session):
    """Idempotent seed for new-player-first-booking scenario."""
    # Venue
    venue = make_venue(id="ven-001", name="Main Court")
    session.add(venue)

    # Coach
    coach = make_user(
        id="usr-coach-001",
        email="coach@example.com",
        role="coach",
    )
    session.add(coach)

    # Class with 2 of 4 spots taken
    cls = make_class(
        id="cls-001",
        title="Morning Padel",
        coach_id="usr-coach-001",
        venue_id="ven-001",
        capacity=4,
        starts_at="2025-01-15T10:00:00Z",
    )
    session.add(cls)

    # Two existing bookings (fill 2 spots)
    existing_player_1 = make_user(id="usr-existing-1", email="p1@example.com")
    existing_player_2 = make_user(id="usr-existing-2", email="p2@example.com")
    session.add_all([existing_player_1, existing_player_2])

    booking_1 = make_booking(class_id="cls-001", player_id="usr-existing-1")
    booking_2 = make_booking(class_id="cls-001", player_id="usr-existing-2")
    session.add_all([booking_1, booking_2])

    session.commit()
```

### Temporal state within scenarios

Steps in a scenario create state that subsequent steps depend on. Unlike the seed (which sets up preconditions), temporal state is created *by the test itself* during execution.

The scenario spec captures this through the "Expected state after" field on each step. The test generator uses these to:
1. Assert state after each step (verification).
2. Capture references for use in subsequent steps (e.g., step 3 uses the `class_id` that step 2 found).

The test code must pass state forward between steps. In Python, this is typically done via instance attributes on the test class (`self.player_token`, `self.booking_id`). In JS/TS, via closure variables or test context.

The seed script only handles *preconditions*. Everything created during the scenario is the scenario's responsibility.

## Human-Authored Scenarios

Humans can write scenario specs directly. The format is the same markdown file in `tests/scenarios/specs/`. Human-authored scenarios are especially valuable for:

- **Workflows the agent can't infer** — real-world flows that users do but the spec tree doesn't make obvious. "A player books, then the coach cancels, then the player calls support" requires domain knowledge about how users actually behave.
- **Negative scenarios** — what happens when things go wrong in sequence. "Payment fails → retry → fails again → support intervention."
- **Persona-specific paths** — an admin's workflow through the product is different from a player's, and an admin might have scenarios the agent wouldn't generate.

Human-authored scenarios go through the same coverage checker and seed generation. The agent generates the test code and seed script from the human's scenario spec.

## Scenario Maintenance

Scenarios need updating when:

- **A business spec is added or removed.** Coverage may break. Re-run the coverage checker; add or adjust scenarios to maintain full coverage.
- **A business spec's User Journey changes.** Journey tests update first; affected scenarios may need step adjustments.
- **A new entity or API endpoint changes.** Scenario steps that use the changed endpoint need updating.
- **The product surface grows significantly.** New domains may need dedicated scenarios.

The agent should re-check scenario coverage whenever the business spec tree changes, and flag if any business spec becomes uncovered.

## Anti-Patterns

**Contrived coverage grabbing.** A scenario that exists only to hit an uncovered business spec, with a step sequence no user would ever follow. If the scenario doesn't feel real, redesign it or question the business spec.

**Too many scenarios.** Every scenario has maintenance cost. If you have 20 scenarios for a 15-business-spec project, you're over-fragmenting. Consolidate overlapping paths.

**Scenario tests that duplicate journey tests.** A scenario step that exactly replicates a journey test's sequence adds cost without catching new bugs. Scenario steps should be *lighter* — they verify the integration between journeys, not re-test each journey in full.

**Skipping the Final Checkpoint.** The checkpoint after all steps is where cross-journey state bugs surface. Skipping it means you've tested the steps but not the system's consistency after the workflow completes.

**Unstable step ordering.** Steps must be deterministic and ordered. If step 3 sometimes runs before step 2 due to async behavior, the scenario test is unreliable. Fix the test ordering, not the flakiness.
