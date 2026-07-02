# Test Data Architecture

This document describes how to generate structured test data from spec entities and rules.
Test data is not an afterthought — it is a deliberate engineering artifact that determines
whether tests actually catch bugs or just confirm the happy path.

## Principle

Test data must exercise the behaviors described in the specs, not just populate tables.
Every fixture exists because a spec rule or acceptance criterion needs it. If a fixture
cannot be traced back to a spec, it should not exist.

## The Data Design Process

The agent reads the spec tree and builds test data in four passes. The first three produce
static fixtures (factories and seed scripts). The fourth handles temporal state created during journey and scenario test execution.

### Pass 1: Entity Inventory (from code, not specs)

Specs reference entities by name (READS/WRITES/CREATES) but do NOT define schemas. The
field-level information lives in the codebase — models, migrations, schema files.

**Step 1: Identify which entities to inventory.** Read all dev specs and collect every
entity name from their READS/WRITES/CREATES sections. This is the list of entities that
need fixtures.

**Step 2: Find the schema source.** Locate the model/migration/schema files for each
entity. The location depends on the stack:

```
SQLAlchemy:    models/*.py — class definitions with Column()
Django:        models.py — class definitions with models.Field()
Prisma:        schema.prisma — model blocks
TypeORM:       entities/*.ts — @Entity() + @Column() decorators
Drizzle:       schema/*.ts — pgTable() / sqliteTable() definitions
Sequelize:     models/*.js — sequelize.define() or class extends Model
Mongoose:      models/*.js — new Schema()
Raw SQL:       migrations/*.sql — CREATE TABLE statements
Strapi:        content-types/*/schema.json or config helpers
```

**Step 3: Extract the entity map.** For each entity, read the actual model definition:

```
Entity: User
  Source file: src/models/user.ts (or migration 001_create_users.sql)
  Fields:
    - id: uuid (PK)
    - email: string (unique, NOT NULL)
    - password_hash: string (NOT NULL)
    - failed_attempts: int (default 0)
    - locked_until: timestamp (nullable)
    - role: enum [player, coach, admin]
    - created_at: timestamp (NOT NULL, default now())
  Relationships:
    - bookings: has_many Booking (FK: booking.player_id)
  Referenced by specs:
    - CREATES: auth.registration.email-signup
    - READS: auth.login.email-signup, booking.reservation.hold-slot
    - WRITES: auth.login.email-signup (failed_attempts, locked_until)
```

**Agent delegation:** For large projects (10+ entities), spawn one agent per entity cluster
(e.g., all entities in the auth domain) to read the model files and return structured
entity maps. Each agent receives the file paths to read and returns the field inventory.

This inventory surfaces: missing models (spec references an entity that has no model),
field-level details needed for fixtures (types, defaults, constraints), and relationships
(foreign keys that determine fixture creation order).

### Pass 2: State Catalog

For each entity, read the spec rules and acceptance criteria to identify every meaningful
state the entity can be in. These are not random variations — they are the specific states
that specs describe.

**Example for User entity (from auth.login.email-signup spec):**

| State name | Description | Source |
|-----------|-------------|--------|
| `registered_active` | Normal user, no lockout | Criterion: "Successful login" — the Given |
| `failed_attempts_4` | 4 prior failures, one more triggers lockout | Criterion: "Account lockout" — boundary |
| `locked_out` | locked_until is in the future | Criterion: "Account lockout" — the Then |
| `lock_expired` | locked_until is in the past | Criterion: "Account lockout" — the And (recovery) |
| `no_account` | Email not in database | Criterion: "Login with unregistered email" |

Each state maps directly to a Given clause or a boundary condition implied by a Rule.
The agent does not invent states that are not grounded in the specs.

### Pass 3: Relationship Graph

Entities reference each other. The agent builds a dependency graph of fixtures:

```
Booking depends on: User (player), Class, User (coach)
Class depends on: User (coach), Venue
Venue depends on: (nothing)
```

This determines the order fixtures must be created (Venue → User → Class → Booking)
and ensures referential integrity in the seed data.

### Pass 4: Temporal State Map

Journey and scenario tests create state *during execution* — a user registers, a booking
is placed, a notification fires. This state is not seeded; it is produced by the test steps
themselves. But the test still needs to know what that state looks like so it can assert
against it.

The agent reads each journey test's step sequence (from the business spec's User Journey)
and each scenario spec's Steps section, and maps the expected state transitions:

```
Scenario: new-player-first-booking

  Step 1 (signup):
    Creates: User { email: "new-player@example.com", role: "player" }
    Captures: player_token (JWT)

  Step 2 (browse):
    Creates: nothing
    Reads: Class list (seeded)
    Captures: target_class_id

  Step 3 (book):
    Creates: Booking { class_id: captured, player_id: from token }
    Mutates: Class.available_spots -= 1
    Captures: booking_id

  Step 4 (confirmation):
    Creates: Notification { type: "booking_confirmation", user: player, booking: captured }
    Captures: nothing

  Final state:
    Users: seeded coach + 2 existing players + 1 new player
    Bookings: 2 seeded + 1 created
    Classes: 1 (available_spots went from 2 → 1)
    Notifications: 1 new
```

This map serves three purposes:
1. **Seed script scope** — only seed what the scenario *doesn't* create itself. The player is
   not seeded because step 1 registers them.
2. **Step assertions** — each step's "Expected state after" comes from this map.
3. **Final checkpoint** — the system state at the end of the scenario is the sum of the seed
   plus all step mutations.

## Fixture Types

### Entity factories

Functions that produce entity instances in specific states. Factories are the primary
building block. Each factory produces one entity in one state.

```python
# tests/fixtures/entities/users.py

from datetime import datetime, timedelta
from uuid import uuid4

def make_user(**overrides):
    """Base user factory. All other user states build on this."""
    defaults = {
        "id": uuid4(),
        "email": f"user-{uuid4().hex[:8]}@example.com",
        "password_hash": hash_password("correct-password"),
        "failed_attempts": 0,
        "locked_until": None,
        "role": "player",
        "created_at": datetime.utcnow(),
    }
    return {**defaults, **overrides}


def make_user_near_lockout(**overrides):
    """User with 4 failed attempts — one more triggers lockout.
    Source: auth.login.email-signup, Rule 3 (lockout after 5 failures)
    """
    return make_user(failed_attempts=4, **overrides)


def make_user_locked(**overrides):
    """User currently locked out.
    Source: auth.login.email-signup, Criterion 'Account lockout after repeated failures'
    """
    return make_user(
        failed_attempts=5,
        locked_until=datetime.utcnow() + timedelta(minutes=30),
        **overrides,
    )


def make_user_lock_expired(**overrides):
    """User whose lockout has expired.
    Source: auth.login.email-signup, Criterion 'Account lockout' — And clause
    """
    return make_user(
        failed_attempts=5,
        locked_until=datetime.utcnow() - timedelta(minutes=1),
        **overrides,
    )
```

The same pattern in TypeScript:

```typescript
// tests/fixtures/entities/users.ts

import { randomUUID } from 'crypto';

interface UserFixture {
  id: string;
  email: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  role: 'player' | 'coach' | 'admin';
  createdAt: Date;
}

/** Base user factory. All other user states build on this. */
export function makeUser(overrides: Partial<UserFixture> = {}): UserFixture {
  return {
    id: randomUUID(),
    email: `user-${randomUUID().slice(0, 8)}@example.com`,
    passwordHash: hashPassword('correct-password'),
    failedAttempts: 0,
    lockedUntil: null,
    role: 'player',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * User with 4 failed attempts — one more triggers lockout.
 * Source: auth.login.email-signup, Rule 3 (lockout after 5 failures)
 */
export function makeUserNearLockout(
  overrides: Partial<UserFixture> = {},
): UserFixture {
  return makeUser({ failedAttempts: 4, ...overrides });
}
```

Every factory function includes a docstring citing the spec and criterion that requires
this state to exist. This traceability is mandatory.

The agent adapts to the project's language. The principles — one factory per state,
override-friendly base factory, spec citation in every docstring — stay the same.

### Seed scripts

Seed scripts populate the test database with fixtures. In the four-layer model, there are
**two kinds** of seed scripts:

#### Layer seed (shared)

A base seed that covers all entity states needed by atomic, spec, and journey tests. This
is the "universal" seed that the environment provisioning scripts run.

```python
# tests/fixtures/seeds/seed_base.py

def seed_database(session):
    """Base seed covering all spec-derived entity states.
    Used by: atomic (in-memory), spec (in-memory), journey (real DB).
    Idempotent — clears and reseeds.
    """
    session.execute("TRUNCATE bookings, classes, venues, users CASCADE")

    # Seed in dependency order
    venue = make_venue(name="Test Court")
    session.add(venue)

    coach = make_user(role="coach", email="coach@example.com")
    player_active = make_user(role="player", email="player@example.com")
    player_near_lockout = make_user_near_lockout(email="near-lockout@example.com")
    player_locked = make_user_locked(email="locked@example.com")
    session.add_all([coach, player_active, player_near_lockout, player_locked])

    test_class = make_class(coach_id=coach["id"], venue_id=venue["id"])
    session.add(test_class)

    session.commit()
```

#### Scenario seed (per-scenario)

Each scenario spec generates its own seed script containing only the preconditions for that
scenario. Scenario seeds live in `tests/fixtures/seeds/` and are named after the scenario:

```python
# tests/fixtures/seeds/seed_new_player_first_booking.py

def seed(session):
    """Seed for scenario: new-player-first-booking.
    Seeds ONLY what the scenario doesn't create itself.
    The player is NOT seeded — step 1 registers them.
    """
    venue = make_venue(id="ven-001", name="Main Court")
    coach = make_user(id="usr-coach-001", email="coach@example.com", role="coach")
    cls = make_class(
        id="cls-001", title="Morning Padel",
        coach_id="usr-coach-001", venue_id="ven-001",
        capacity=4, starts_at="2025-01-15T10:00:00Z",
    )
    # Two existing bookings to fill 2 of 4 spots
    p1 = make_user(id="usr-p1", email="p1@example.com")
    p2 = make_user(id="usr-p2", email="p2@example.com")
    b1 = make_booking(class_id="cls-001", player_id="usr-p1")
    b2 = make_booking(class_id="cls-001", player_id="usr-p2")

    session.add_all([venue, coach, cls, p1, p2, b1, b2])
    session.commit()
```

The key difference: the base seed covers *all entity states* for completeness. A scenario
seed is *minimal* — only what the scenario needs, excluding anything the scenario creates
during execution.

### Binary fixtures

Some specs require non-data fixtures: test images, video files, document templates.
These are committed in `tests/fixtures/media/` and referenced by test functions.

Binary fixtures follow the same traceability rule: each file exists because a spec
criterion needs it, and the filename or a README in the directory documents which spec.

```
tests/fixtures/media/
├── README.md                        # Maps each file to its spec
├── sample-serve-2s.mp4              # cv.pose_detection, cv.ball_tracking
├── sample-frame-backswing.png       # cv.stage_classification
└── malformed-upload.bin             # upload.validation — error handling
```

## Data Design Patterns

### Boundary values

When a spec rule includes a numeric threshold, create fixtures at the boundary:

| Rule | Fixtures needed |
|------|----------------|
| "Lockout after 5 failures" | 0 failures, 4 failures (boundary-1), 5 failures (at boundary) |
| "Class capacity is 12" | 11 bookings (space available), 12 bookings (full), 0 bookings (empty) |
| "Reminder 2 hours before" | Class in 3h (not yet), 2h (exactly), 1h (past threshold) |

The boundary-minus-one fixture is the most important — it tests the transition point.

### Conflicting states

Some specs describe what happens when entities are in conflicting states. Create fixtures
for these explicitly:

- A booking for a class that has been cancelled
- A coach who is also a player trying to book their own class
- Two users trying to book the last slot (concurrent access)

These often surface from reading multiple specs together rather than any single spec.

### Time-dependent states

For specs with time-based rules, fixtures must control time. The agent should:

1. Use a clock abstraction in the application (injectable time source)
2. Create fixtures with explicit timestamps relative to "now"
3. Document the time assumptions in the fixture docstring

```python
def make_class_starting_soon(**overrides):
    """Class starting in 90 minutes — inside the 2-hour reminder window.
    Source: notifications.reminders.class, Rule 1
    Assumes: test runs with clock set to 2024-01-15T10:00:00Z
    """
    return make_class(
        starts_at=datetime(2024, 1, 15, 11, 30, 0),
        **overrides,
    )
```

### Realistic but deterministic

Fixture data should look realistic (proper names, valid emails, plausible dates) but
be fully deterministic. No `random.choice()`, no `faker` with random seeds. Every test
run produces the same data.

If randomized data is needed for load/fuzz testing, that is a separate concern and
belongs in a dedicated fuzz testing setup, not in the four-layer framework.

## Fixture Usage by Layer

Each layer uses fixtures differently:

| Layer | Fixture usage |
|---|---|
| **Atomic** | Factories called in-memory per test. No database. Data lives only in test function scope. Each test creates exactly the fixture(s) its Given clause requires. |
| **Spec** | Factories called in-memory with shared state across the test class. Tests run sequentially; earlier steps produce state that later steps depend on. |
| **Journey** | Base seed runs once before the journey suite. Tests interact with a real database through the API. Tests that write use the system's actual write paths — no direct DB manipulation during the test. |
| **Scenario** | Scenario-specific seed runs before each scenario. The scenario creates additional state during execution (registrations, bookings, etc.). Seed is re-run between independent scenarios. |

Atomic tests must never depend on database state. Spec tests share in-process state but
not database state. Journey tests read from the seeded database and may write through the
API. Scenario tests start from a scenario-specific seed and build state through the full
application stack.

## Seed Script Generation from Scenario Specs

The agent generates scenario seeds automatically from scenario spec Preconditions sections.
The process is described in detail in `references/scenario-design.md` under "Seed Data
Generation from Scenarios." The key steps:

1. Parse the Preconditions section for entity mentions and states.
2. Map each entity to its factory.
3. Walk the relationship graph to determine creation order.
4. Subtract entities the scenario creates during execution (don't seed what the test builds).
5. Generate the seed function with deterministic IDs for entity cross-referencing.

## Coverage Analysis

After generating fixtures, the agent checks coverage by walking the spec tree:

```
For each leaf spec:
  For each acceptance criterion:
    For each Given clause:
      ✓ Does a fixture factory exist for this entity state?
      ✓ Is the state included in the base seed? (for journey tests)
    For each When clause:
      ✓ Is the action testable with the available fixtures?
    For each Then clause:
      ✓ Can the assertion be verified against the fixture state?

For each scenario spec:
  For each precondition:
    ✓ Does a fixture factory exist for this entity?
    ✓ Is the entity included in the scenario seed?
  For each step's "Expected state after":
    ✓ Are the assertions concrete and verifiable?
```

Gaps in this coverage mean either:
- A fixture is missing (create it)
- An entity state is missing from the factory (add it)
- A seed script doesn't include a needed combination (add it)
- The spec criterion is not concrete enough (flag to Specflow for refinement)

The agent reports coverage as a checklist per spec, not as a percentage.

## When to Regenerate Fixtures

Fixtures need updating when:

- A spec's entities change (fields added, types changed)
- New acceptance criteria add new Given states
- Rules change thresholds or boundaries
- New specs introduce new entities
- A scenario spec's preconditions change
- A business spec's User Journey changes (affecting journey test data needs)

The agent compares the fixture entity map against the current spec tree and identifies
stale fixtures. Stale fixtures are not silently updated — the agent reports what changed
and why, then updates.
