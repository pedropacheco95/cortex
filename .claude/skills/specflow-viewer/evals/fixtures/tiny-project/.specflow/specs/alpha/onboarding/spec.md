---
id: alpha.onboarding
status: implemented
depends_on: []
---

# User Onboarding

## Intent

New users walk through a three-step wizard: account details, team selection, and preference setup. The wizard persists progress between steps so a tab close doesn't erase the work.

## Entities

- **`User`** — canonical account; attributes `email`, `display_name`, `created_at`, `onboarded_at`.
- **`OnboardingSession`** — transient record storing wizard state per user, TTL 24h.

## Rules

1. **Step order is fixed.** Users cannot skip ahead — the wizard only advances when the current step validates.
2. **Progress persists.** Every step completion writes to `OnboardingSession`; returning to the wizard resumes from the last finished step.
3. **Completion sets `onboarded_at`.** Only then is the main app accessible.

## Acceptance Criteria

### Wizard advances on valid step
- **Given** a signed-in user at step 1 with valid account details entered
- **When** they click "Next"
- **Then** the UI shows step 2 and `OnboardingSession.current_step` is updated to 2

### Wizard blocks ahead-skipping
- **Given** a user at step 1
- **When** they manually change the URL to `/onboarding/step-3`
- **Then** they are redirected back to step 1 with a toast "please complete the previous steps first"

### Completion unlocks the app
- **Given** a user at step 3 with valid preferences
- **When** they click "Finish"
- **Then** `User.onboarded_at` is set
- **And** the next page load takes them to `/dashboard`

## Notes

- Wizard component lives at `apps/web/onboarding/Wizard.tsx`.
- OPEN: should `onboarded_at` reset when a user is re-invited after deactivation?
