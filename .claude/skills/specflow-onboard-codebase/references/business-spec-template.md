# Business Spec Template (Onboarding)

Business specs live in `.specflow/specs-business/{domain}/{outcome}.business.md`, organized in
domain subfolders with `_overview.md` in each folder. They describe outcomes a user can
achieve and the journeys they walk to achieve them. They are the layer non-technical
stakeholders read.

A business spec is NOT a renamed developer spec. It groups several developer capabilities
into one user-visible outcome. Most business specs link to 2-10 developer specs via
`implemented_by:`.

## Naming convention

**Filenames are journey-oriented, starting with the persona doing the action:**

- `user-fills-dynamic-form.business.md` — not `form-submission.business.md`
- `coach-manages-schedule.business.md` — not `schedule-management.business.md`
- `admin-reviews-reports.business.md` — not `reporting.business.md`

This forces the author to think from the user's perspective. If you can't start the
filename with a persona, the outcome may be too abstract or too technical.

## Directory structure

```
.specflow/specs-business/
├── _overview.md
├── booking/
│   ├── _overview.md
│   ├── user-books-a-class.business.md
│   └── user-manages-booking.business.md
├── auth/
│   ├── _overview.md
│   └── user-accesses-account.business.md
└── notifications/
    ├── _overview.md
    └── user-receives-confirmation.business.md
```

Business specs are NOT flat at root — they are organized in domain subfolders so that
`_overview.md` files have context to describe.

## Frontmatter

```yaml
---
id: <domain>.<outcome-slug>
status: implemented | draft
implemented_by:
  - <dev-spec-id>
  - <dev-spec-id>
---
```

`implemented_by:` is a list of developer spec IDs whose behavior collectively delivers
this outcome.

## Body sections

### Outcome
1 paragraph: what changes in the user's world when this is delivered. Write as if
explaining to a stakeholder who has never seen the codebase.

### Who This Is For
The persona(s) involved. Keep it concrete: "A player looking to book their first class",
not "End users".

### User Journey
Numbered steps describing what the user does or experiences. This is the primary signal
for journey test design.

```markdown
## User Journey

1. The player opens the class schedule for their club.
2. She browses by date and sees which classes have open spots.
3. She picks a class and sees who else is playing.
4. She taps Book, confirms payment, and the slot is hers.
5. Within a minute, she gets a confirmation with the details.
```

### Business Rules
Rules in domain language, not engineering language. No mention of APIs, databases, or
status codes.

### Success Metrics
Measurable outcomes. Optional for onboarding (you may not know what the original team
was measuring), but include if the codebase has analytics, dashboards, or KPI references.

### Out of Scope
What this outcome does NOT cover. Helps prevent scope creep and clarifies boundaries
with adjacent business specs.

### Notes
Optional. Prefix open questions with `OPEN:`. Flag uncertain groupings.

## Linking discipline

- `implemented_by:` MUST list every dev spec whose behaviour contributes to this outcome.
- If a dev spec serves multiple outcomes, pick the dominant one as its `implements:` parent
  and mention the secondary in the dev spec's Notes — do not list it under multiple business
  specs' `implemented_by:`.
- If onboarding could not confidently link a dev spec to any business outcome, leave its
  `implements:` as `[]` and report it in the onboarding summary as unmapped. Do not invent
  a parent.

## Cross-linking

After writing both trees, fill in the bidirectional links:

1. Walk every developer leaf spec, read its `implements:` value, and append the dev spec's
   path to that business spec's `implemented_by:` list.
2. Verify symmetry: every dev spec's `implements:` target has a matching entry in the
   target's `implemented_by:`, and vice versa.
3. Verify resolution: every path on both sides points to a real file.
