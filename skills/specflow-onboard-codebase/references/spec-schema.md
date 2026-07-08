# Spec File Schema (Onboarding)

Onboarding produces two parallel trees:

- `.specflow/specs/` — developer specs (this file).
- `.specflow/specs-business/` — business specs (see `business-spec-template.md`).

Both trees use frontmatter to link to each other bidirectionally. Both trees have an
`_overview.md` in every folder (see `folder-overview-template.md`).

## Developer Leaf Spec Frontmatter

```yaml
---
id: <domain>.<capability>.<leaf>
status: implemented | draft | implementing
depends_on: <spec-id>, <spec-id>
implements: <business-spec-id>
---
```

The `implements:` field is mandatory. Every dev spec must either name its parent business
spec or be explicitly marked unmapped (`implements: []`) so the onboarding summary can
flag it. Exactly one value — not a list.

## File naming

`.specflow/specs/{domain}/{capability}/{leaf}.spec.md`

The leaf spec filename uses the leaf name, not generic `spec.md`.

## Body structure

### Intent
1-2 sentences on why this spec exists.

### Entities
Which entities this spec reads from and writes to. **Specs reference entities — they do
not define schemas.** The model/migration is the single source of truth for field
definitions.

```markdown
## Entities

- **READS:** User, Class
- **WRITES:** Booking, Class (decrements available_spots)
```

For the spec that *creates* an entity (its owner for dependency purposes), add a brief
description:

```markdown
## Entities

- **CREATES:** Booking — a reservation linking a User to a Class for a specific date
- **READS:** User, Class
```

Do NOT list field names, types, or constraints in the spec. That information lives in the
model/migration and in the onboarding scratch atoms.

### Rules
Numbered behavioural rules in plain language.

### Acceptance Criteria
Given/When/Then with concrete values, one named criterion per behaviour. These become
calibration tests in Phase 8.

### Notes
Optional. Prefix open questions with `OPEN:`. If the dev spec serves a secondary business
outcome beyond its `implements:` parent, mention it here.

## Onboarding-specific status rules
- Specs for working, human-approved code: `implemented`
- Specs for code with known bugs: `draft` (needs reimplementation)
- Specs where intent is unclear: `draft` with `OPEN:` note

## Bidirectional link discipline

- A dev spec has exactly one `implements:` value. If it serves multiple outcomes, pick the
  dominant one and note the secondary in Notes.
- The parent business spec's `implemented_by:` MUST include this dev spec's id.
- If you can't confidently link, leave `implements: []` AND surface the spec in the
  onboarding summary's "Unmapped Dev Specs" count. Do NOT invent a parent.

## Example leaf spec

```markdown
---
id: booking.reservation.hold-slot
status: implemented
depends_on: auth.registration.create-account
implements: user-books-a-class
---

# Hold Slot

## Intent

Reserve a class spot for a player, decrementing available capacity and creating a
booking record. This is the core transactional step in the booking flow.

## Entities

- **READS:** User, Class
- **WRITES:** Booking (creates), Class (decrements available_spots)

## Rules

1. A player cannot book a class that has zero available spots.
2. A player cannot book the same class twice.
3. A coach cannot book their own class.
4. Booking decrements available_spots atomically to prevent overselling.
5. If payment fails, the booking is rolled back and capacity is restored.

## Acceptance Criteria

### Successful booking
- **Given** a player with id 'usr-001' and a class 'cls-001' with 3 available spots
- **When** they POST to /api/bookings with { class_id: 'cls-001' }
- **Then** response status is 201
- **And** a Booking record exists for usr-001 + cls-001
- **And** class cls-001 available_spots is 2

### Full class rejected
- **Given** a class 'cls-002' with 0 available spots
- **When** a player POSTs to /api/bookings with { class_id: 'cls-002' }
- **Then** response status is 409
- **And** no Booking record is created

## Notes

- OPEN: Should there be a hold expiry (e.g., 15 min to complete payment)?
```
