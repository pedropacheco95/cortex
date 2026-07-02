---
id: alpha.billing
status: approved
depends_on: [alpha.onboarding]
---

# Billing

## Intent

Handles seat-based billing for teams. Plans are priced per seat per month. An admin can add or remove seats at any time; proration handles mid-cycle changes.

## Rules

1. **Seat count ≥ 1.** A team must always have at least one seat.
2. **Proration is daily.** Mid-cycle seat changes are prorated to the day.
3. **Payment failure freezes writes.** After a failed charge, the workspace becomes read-only until a successful payment retries.

## Acceptance Criteria

### Add a seat mid-cycle
- **Given** a team with 3 seats on the Pro plan, 10 days into a 30-day cycle
- **When** the admin adds 1 seat
- **Then** a prorated charge for 20/30 of one seat is issued immediately

### Failed payment freezes writes
- **Given** a team whose most recent invoice just failed
- **When** any member attempts a write (create, update, delete)
- **Then** the API returns `402 Payment Required` with `code: WORKSPACE_READONLY`

## Notes

- Stripe is the only supported provider today.
- OPEN: do we block reads too, or only writes?
