# Business Spec Template

Business specs live under `.specflow/specs-business/` in domain subfolders. They describe
**outcomes and user journeys** in language a non-technical stakeholder (client, PM,
executive) can read without confusion. They are the *contract with the client*.

## What business specs are NOT

- **No schemas.** No entity tables, no field types, no database columns.
- **No APIs.** No HTTP routes, no request/response shapes, no controller names.
- **No test-shaped acceptance criteria.** No Given/When/Then with concrete fixture
  values. Use plain-language journey steps instead.
- **No engineering jargon.** No "soft-delete", "JWT", "WebSocket", "migration".
  Translate to domain language.

If the spec drifts into any of those, the content belongs in a developer spec under
`.specflow/specs/`, not here.

## Naming convention

**Filenames are journey-oriented, starting with the persona doing the action:**

- `user-books-a-class.business.md` — not `class-booking.business.md`
- `coach-publishes-schedule.business.md` — not `schedule-publishing.business.md`
- `player-recovers-account.business.md` — not `account-recovery.business.md`

This forces the author to think from the user's perspective. If you cannot start the
filename with a persona, the outcome may be too abstract or too technical.

## Folder layout

`.specflow/specs-business/` organizes business specs in domain subfolders with `_overview.md` in
every folder:

```
.specflow/specs-business/
├── _overview.md
├── auth/
│   ├── _overview.md
│   ├── user-accesses-account.business.md
│   └── player-recovers-account.business.md
├── booking/
│   ├── _overview.md
│   └── user-books-a-class.business.md
└── ...
```

One business spec per **outcome** or **user journey** — typically 3-10 developer specs
implement each business spec. Do not auto-generate a 1:1 business-spec-per-dev-spec.

## Frontmatter

```yaml
---
id: [domain].[outcome-slug]
status: draft
implemented_by:
  - ../../specs/[domain]/[capability]/[leaf].spec.md
  - ../../specs/[domain]/[capability]/[other-leaf].spec.md
---
```

- `implemented_by:` lists every developer spec that realises this outcome.
- Populate this list *after* the developer specs exist — derive it from each dev spec's
  `implements:` field.

## Template

```markdown
---
id: [domain].[outcome-slug]
status: draft
implemented_by:
  - ../../specs/[domain]/[capability]/[leaf].spec.md
---

# [Outcome Title — written as a user-visible promise]

## Outcome

[1 paragraph. Describe the change in the user's world when this outcome is delivered.
"When this works, a coach can fill an empty class slot in under a minute, and the players
involved find out instantly." Avoid "the system shall..." — use "the user can..." or
"the user knows...".]

## Who this is for

[The persona(s) involved. Name them as the project does. "Coaches who manage at least
one court", "Players signed up for a club".]

## User Journey

[Numbered, plain-language steps. Each step is what a user does or experiences — not what
code does.]

1. [Step 1 — e.g., "The coach opens the calendar and taps an empty slot."]
2. [Step 2 — e.g., "She picks a class type and hits 'Publish'."]
3. [Step 3 — e.g., "Players who follow the court get a notification within a minute."]
4. [Step 4 — e.g., "The first four to tap 'Join' fill the slot."]

## Business Rules

[Rules in domain language, not engineering language.]

1. [Rule — e.g., "A class cannot have more players than the court allows."]
2. [Rule — e.g., "Only the coach who created a class can cancel it."]

## Success Metrics

[Measurable outcomes. How the client will know it's working.]

- [Metric — e.g., "75% of empty slots posted before 9am are filled by 6pm same day."]

## Out of Scope

[What this outcome does NOT cover. Points the reader at adjacent business specs.]

- [Thing — e.g., "Recurring weekly classes are a separate outcome."]

## Notes

[Optional. Open questions for the client.]

- OPEN: [Question for the client.]
```

## Sizing guidance

- **Aim for 1 business spec per outcome the user would name in a sentence.** "I want to
  book a court", "I want to get notified when a spot opens" — each is one business spec.
- A business spec that takes more than ~250 words of body text is probably two outcomes.
- A business spec that maps to only one developer spec is probably too granular.

## Cross-linking

After writing both trees, fill in the bidirectional links:

1. Walk every developer leaf spec, read its `implements:` value, and append the dev spec's
   relative path to that business spec's `implemented_by:` list.
2. Verify symmetry: every dev spec's `implements:` target has a matching entry in the
   target's `implemented_by:`, and vice versa.
3. Verify resolution: every path on both sides points to a real file.
