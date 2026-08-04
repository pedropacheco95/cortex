# Planning Protocol

How to plan implementation at each scope level before writing any code. Planning adapts
to scope — a slice plan is strategic, a spec plan is tactical.

## Why Plan First

The plan serves two purposes:
1. **Consistency** — child agents follow the parent's decisions about patterns, file
   layout, and data access. Without a plan, 5 spec agents produce 5 different approaches.
2. **Efficiency** — shared utilities are identified once, not reinvented per spec.

## Exploration Phase (all scopes)

Before planning, explore the relevant codebase. Spawn exploration agents in parallel:

- **Architecture and structure:** Directory layout, framework, build system. Where should
  new code live?
- **Related existing code:** Modules and files the specs depend on or interact with.
  Read them — don't assume.
- **Established patterns:** Naming, error handling, validation, state management, API
  response shapes already in the codebase.
- **Tech stack and dependencies:** Libraries, frameworks, tools. Available utilities to
  leverage.

Produce a brief exploration summary:

```markdown
### Exploration Summary
- **Relevant existing code:** [files/modules with brief purpose]
- **Established patterns:** [conventions the implementation must follow]
- **Tech stack:** [libraries/tools relevant to this scope]
```

At slice scope: produce an ASCII component diagram showing where the feature fits —
which modules it touches, how data flows, where new components go.

## Gap Analysis (all scopes)

Compare what the specs require against what already exists:

```markdown
### Gap Analysis
**Can reuse:** [existing code/patterns that directly support the implementation]
**Must create:** [new files, modules, functions needed]
**Must modify:** [existing files that need changes, and why]
**Open questions:** [ambiguities — state assumptions explicitly, proceed]
```

This is NOT the same as spec gaps — this is an implementation gap analysis. "The spec
needs a booking handler. Does one exist? No → must create. Does a similar handler exist
in another domain? Yes → can reuse the pattern."

## Research Phase (slice and domain scope only)

Use web search to ground implementation decisions in the project's stack:

- Best practices for this type of feature in [framework]
- Library comparisons if new dependencies might be needed
- Known pitfalls with the libraries involved
- Ecosystem patterns — how similar projects solve this problem

```markdown
### Research Findings
- **Best practices:** [key recommendations]
- **Known pitfalls:** [common mistakes to avoid]
- **Relevant patterns:** [exemplary implementations to follow]
```

Skip this at spec scope — the parent's plan already incorporates research findings.

## Slice-Level Plan

Strategic decisions that apply to all domains in the slice.

```markdown
## Slice Plan

### Implementation order
[Domains in dependency order. Foundational domains first.]

1. [domain] — foundational: defines User, Session entities
2. [domain] — depends on domain 1: references User
3. [domain] — depends on domains 1 and 2

### Shared patterns (mandatory for all child agents)
- Data access: [repository pattern / direct ORM / service layer]
- Error response shape: [{ error: { message, code } } / other]
- Validation approach: [Zod schemas / class-validator / manual]
- Auth/middleware: [how auth is checked, where middleware applies]

### Cross-domain utilities to create
- [Shared function/module needed by multiple domains]

### File layout
- Routes: src/routes/{domain}/{verb}.ts
- Services: src/services/{domain}.ts
- Types: src/types/{domain}.ts
```

Child agents (domain agents) MUST follow these decisions. A domain agent that wants to
use a different data access pattern than the slice plan specifies is wrong — it should
flag the disagreement as a note, not override the plan.

## Domain-Level Plan

Tactical decisions for implementing specs within one domain.

```markdown
## Domain Plan: [domain name]

### Specs in this domain (implementation order)
1. [spec-id] — creates the core entity, no dependencies
2. [spec-id] — depends on spec 1's entity
3. [spec-id] — depends on specs 1 and 2

### Shared within this domain
- [Common validation functions]
- [Shared type definitions]
- [Helper functions used by multiple specs]

### Per-spec file plan
- [spec-id]: create src/routes/{domain}/{verb}.ts, modify src/services/{domain}.ts
- [spec-id]: create src/routes/{domain}/{verb}.ts
```

## Spec-Level Plan

Concrete implementation decisions for one spec.

```markdown
## Spec Plan: [spec-id]

### What this spec does
[1-2 sentences — the Intent section of the spec]

### Entities
- READS: [from spec]
- WRITES: [from spec]

### Files to create or modify
| File | Action | What |
|---|---|---|
| src/routes/booking/reserve.ts | Create | POST handler for reservation |
| src/services/booking.ts | Modify | Add reserveSlot() function |

### Rules → code mapping
- Rule 1 "can't book full class" → capacity check before insert
- Rule 2 "can't book same class twice" → unique constraint check
- Rule 3 "coach can't book own class" → creator_id !== user_id check

### Data flow
1. Request comes in with { class_id }
2. Read Class entity → check capacity (Rule 1)
3. Read Booking → check no duplicate (Rule 2)
4. Read Class.creator_id → check not coach (Rule 3)
5. Write Booking → insert record
6. Write Class → decrement available_spots
7. Return 201 with booking
```

## Plan Constraints

1. **Plans flow downward.** A child agent's plan must not contradict its parent's plan.
   If the slice plan says "repository pattern," the domain plan uses repository pattern.

2. **Plans are brief.** A slice plan is ~20 lines. A domain plan is ~15 lines. A spec
   plan is ~20 lines. These are not design documents — they're decision records that
   prevent child agents from diverging.

3. **Plans reference real files.** File paths in plans must reference actual existing
   files (for modifications) or follow the project's directory conventions (for new files).

4. **Plans don't over-specify.** The plan says "use repository pattern" but doesn't
   dictate the exact method signatures — the spec agent figures that out from the tests
   and the existing code patterns.

5. **Plans are passed to children, not published.** The plan is an internal artifact
   passed via the Agent tool prompt. It's not written to disk (the code and tests are
   the deliverables, not the plan).
