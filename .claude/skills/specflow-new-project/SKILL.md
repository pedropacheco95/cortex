---
name: specflow-new-project
description: 'Spec out a new project from scratch — two linked spec trees, overviews, build order. "new project", "start a new", "I want to build", or any product idea described before any code exists.'
---

# Specflow: New Project

## When to use

Generate a complete two-layer spec tree (business specs for stakeholders + developer specs for
implementation), folder overview docs in every directory, tooling manifest, agents, skills,
rules, and build order from a project description. Use this skill whenever the user wants to
start a new project from scratch, describes a product idea, says things like "new project",
"build me an app", "I want to create", "start a new", "specflow new", "start from scratch",
"help me spec this out", "write specs for this", or presents any product concept that needs
structured planning before implementation. Even if the user just describes what they want to
build without explicitly asking for specs, this skill should trigger — the goal is to plan
before coding. The output contains both `.specflow/specs-business/` (stakeholder-facing
outcomes and journeys) and `.specflow/specs/` (developer-facing entity references, rules,
acceptance criteria), bidirectionally linked, with an `_overview.md` in every folder of both
trees.

## What this skill produces

Turn a product idea into a complete, buildable spec tree that Claude Code can implement autonomously. The output is a directory of markdown files — specs (business + developer), folder overviews, skills, agents, rules, and a build order — that serve as the single source of truth for the project.

## Why this matters

Without specs, Claude Code tends to make ad-hoc architectural decisions, skip edge cases, and produce inconsistent code. Specflow front-loads the thinking: every behavior is defined once in a spec, every spec has acceptance criteria, and Claude implements them one vertical slice at a time. The spec tree is the product — code is just an artifact of it.

## The two-layer spec model

Every Specflow project produces two parallel spec trees:

- **`.specflow/specs-business/`** — high-level specs for non-technical stakeholders (clients, PMs, executives). Each business spec describes an outcome, a user journey, business rules, and success metrics. **No schemas, no APIs, no test-shaped acceptance criteria.** This is the contract with the client: what the product does and why.
- **`.specflow/specs/`** — developer-facing specs (the existing layer). Schemas, APIs, dependency chains, Given/When/Then acceptance criteria. This is the contract with the implementer: how the product is built.

The two layers are **bidirectionally linked**:
- Every developer leaf spec has frontmatter `implements:` pointing to exactly **one** business spec — the outcome it primarily serves. If a dev spec serves a secondary outcome, note it in the Notes section but keep `implements:` singular.
- Every business spec has frontmatter `implemented_by:` listing all developer specs that realise it.
- One business spec typically maps to **many** developer specs. Don't auto-generate one business spec per dev spec — group by outcome or user journey.

## Folder overview docs

Every directory in `.specflow/specs-business/` and `.specflow/specs/` (root, every domain folder, every capability folder, and any sub-folders) **must contain an `_overview.md` file**. The leading underscore makes it sort to the top of the folder so readers see it first. Each overview answers three questions in 3-6 short paragraphs:

1. **What this group of specs IS** — the kind of thing collected here.
2. **What it COVERS** — the capabilities/outcomes inside, named explicitly.
3. **WHY it exists as a group** — the boundary that justifies grouping these specs together (and excluding others).

`README.md` is acceptable only if a project already uses that convention; default to `_overview.md` for new projects.

## Cortex awareness

When the project has a `.cortex/` directory:

- **Read `.cortex/compass/preferences.md` (when present) before proposing stack or
  convention defaults** in Phases 1-2. Recorded stack choices, formatting conventions,
  and tooling preferences seed the recommendation; never contradict a recorded
  preference without flagging it to the user.
- **Scaffold per the schema's tree conventions:** `.specflow/specs/` and `.specflow/specs-business/` live at
  the project root (cortex-schema §2), with `_overview.md` in every folder of both
  trees and `.specflow/specs/_index.md` as the engineering index — the layout the phases below
  produce.
- **`insight/` scaffolds empty.** The `insight/` module fills when an extraction
  runs (`cortex-extract-insight`) and stays current via the refresh loops — there is
  nothing to `cortex insight file/concept/element` on a blank project.
  Name it as a module that populates later; when it does, insight is
  **ungated/unreviewed** — confirm any hit against the gated layers
  (compass/atlas/`RULES.md`) before it drives a decision.

## The Six Phases

Work through these phases sequentially. Each phase produces a concrete artifact that the user approves before moving on. Don't rush — the quality of the specs determines the quality of everything built from them.

---

## Phase 1: Discovery Conversation

The goal is to extract enough understanding to write a project brief. Ask open-ended questions, listen carefully, and reflect back what you hear.

### What to uncover

1. **Product vision** — What does this thing do? Who is it for? (Aim for 1 clear paragraph)
2. **Core domains** — The 3-7 functional areas (e.g., Auth, Scheduling, Billing, Notifications). These become top-level spec directories in **both** trees.
3. **Key entities** — The nouns: User, Booking, Invoice, Court, etc. What data does the system manage?
4. **Key flows / outcomes** — The verbs and the why: "coach schedules a class so students can book it", "system sends a reminder so no-shows drop". Each flow is a candidate for a business spec.
5. **Success metrics** — How will the user know the product works? "80% of bookings filled within 24h", "<2% no-show rate". Business specs need these; developer specs don't.
6. **Constraints** — Hard requirements: "must be a PWA", "must use Stripe", "must support offline", "PostgreSQL only", etc.
7. **Stack preferences** — Does the user have opinions on framework, language, hosting? If not, recommend based on the project type.

### How to run the conversation

- Start broad: "Tell me about what you want to build." Let them talk.
- Then probe each domain: "You mentioned scheduling — walk me through what happens when a coach creates a class."
- Reflect back: "Here's what I'm hearing..." and let them correct.
- Do 2-3 rounds. The first round captures the shape; subsequent rounds fill gaps and resolve ambiguities.
- Pay attention to what they *don't* say — if they describe a multi-user app but never mention auth, ask about it.
- Probe for outcomes, not just features: "If this works, what's different about your users' lives?" That answer seeds the business specs.

### Recognizing project type

Not everything is a web app. Adjust your domain structure based on what the user describes:
- **Web app / PWA**: Auth, data models, API, frontend, notifications are typical domains
- **CLI tool**: Input parsing, processing pipeline, output formatting — no auth or frontend domains
- **Data pipeline**: Ingestion, transformation, storage, reporting
- **Mobile app**: Similar to web but with offline/sync considerations
- **Library/SDK**: Public API surface, internals, documentation, examples

### Output: project-brief.md

Write a `project-brief.md` that captures everything discovered. Structure it as:

```markdown
# [Project Name] — Project Brief

## Vision
[1 paragraph: what it does, who it's for]

## Domains
[List each domain with a 1-2 sentence description]

## Key Entities
[Entity list with brief descriptions and key fields]

## Key Flows / Outcomes
[Numbered list. Each one is a candidate business spec — a journey or outcome, not a feature.]

## Success Metrics
[How the user will know the product works — these populate the business specs.]

## Constraints
[Hard requirements, non-negotiables]

## Stack
[Chosen tech stack with rationale]

## Open Questions
[Anything unresolved — prefix each with OPEN:]
```

Present this to the user and get explicit approval before continuing. If they want changes, update and re-present.

---

## Phase 2: Tooling Selection

Based on the approved brief, determine what Claude Code infrastructure the project needs — skills, agents, and rules.

### Evaluate the project needs

1. **Tech stack** — What frameworks and tools does the project use? This drives which skills are relevant.
2. **Existing skills** — Check what skills are already installed (look in `.claude/skills/`). Which ones apply to this project?
3. **Skill gaps** — What domain knowledge does the project need that no existing skill covers? Flag these for creation.
4. **Project rules** — What coding conventions, architectural patterns, or hard constraints should be enforced? These go in RULES.md.
5. **Specialized agents** — Does the project benefit from delegating specific tasks to focused agents? Common patterns:
   - A **test-writer** agent that writes tests from specs
   - A **code-reviewer** agent that checks implementations against specs
   - A **migration** agent for database schema changes
   - Domain-specific agents (e.g., a **notification-engine** agent for complex notification logic)

### Define each agent

For each proposed agent, specify:

```yaml
---
name: agent-name
description: >
  When to invoke this agent. Be specific and include trigger words.
  PROACTIVELY use this agent when [specific conditions].
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
skills:
  - relevant-skill-name
---

You are a [role]. Your job is to [specific task].

[System prompt with domain expertise, decision-making guidance, and patterns to follow]
```

**Model selection guidance:**
- `haiku` — Fast, cheap. Good for mechanical tasks: formatting, simple transforms, boilerplate generation.
- `sonnet` — Balanced. Good for most implementation work: writing code, tests, reviews.
- `opus` — Most capable. Reserve for complex architectural decisions, ambiguous specs, or tasks requiring deep reasoning.

**Tool selection:** Give agents the minimum tools they need. A code-reviewer only needs Read, Glob, Grep. An implementer needs Write and Edit too. Only give Bash if the agent needs to run commands.

### Define each skill

For each proposed skill:

```yaml
---
name: skill-name
description: >
  What this skill provides and when to use it. Include trigger words.
---

# Skill Title

[Reference knowledge: patterns, conventions, code snippets, domain facts]
[The goal is to give Claude the context it needs to make good decisions in this domain]
```

Skills are reference knowledge, not workflows. They answer "how should I do X in this project?" — coding conventions, API patterns, database schema conventions, testing patterns, etc.

### Define rules (RULES.md)

Rules are hard constraints that apply project-wide. They go in RULES.md at the project root. Good rules are:
- Specific and actionable (not vague aspirations)
- Justified (explain *why* the rule exists)
- Few in number (10-20 max — too many rules get ignored)

### Output: .specflow/specs/_index.md

Write the tooling manifest as `.specflow/specs/_index.md` (this is distinct from `.specflow/specs/_overview.md` — the manifest is the engineering index, the overview is the prose explanation):

```markdown
# [Project Name] — Tooling Manifest

## Stack
[Tech stack summary]

## Skills
[List each skill with name and purpose]

## Agents
[List each agent with name, model, and purpose]

## Rules Summary
[Key rules with brief rationale]

## Dependency Graph
[Visual or textual representation of spec domain dependencies]
```

Present this to the user for approval before generating specs.

---

## Phase 3: Spec Generation

This is the core of the skill. Read the approved brief and generate **both** spec trees plus folder overviews.

### Generate the business tree first

The business tree is the contract with the client, so it comes first. For each item in the brief's "Key Flows / Outcomes" section, write one business spec — unless two flows are tightly coupled, in which case fold them. Aim for **far fewer business specs than developer specs**: typically 1 business spec per outcome covers 3-10 developer specs.

Read `references/business-spec-template.md` for the exact format. Business specs use:
- An **Outcome** (the change in the user's world)
- A **User Journey** (the experience, in plain language)
- **Business Rules** (in domain language, not engineering language)
- **Success Metrics** (measurable, but not necessarily technical)
- An `implemented_by:` frontmatter list — fill this in *after* you generate the developer specs

Domain folders inside `.specflow/specs-business/` should mirror the domain folders inside `.specflow/specs/` so a reader can move sideways between layers.

### Then generate the developer tree

Developer specs form a three-level tree:

1. **Domain specs** — Top-level boundaries (e.g., `auth/`, `scheduling/`, `billing/`). These define the scope of a functional area but are NOT directly implementable.
2. **Capability specs** — What the system can do within a domain (e.g., `auth/registration/`, `auth/login/`). These group related behaviors but are NOT directly implementable.
3. **Leaf specs** — Atomic, implementable units (e.g., `auth/registration/email-signup.spec.md`). Each leaf maps to exactly one vertical slice: data model + backend + frontend + test.

Read `references/spec-schema.md` for the developer-spec format, including the new `implements:` frontmatter field.

Key principles:
- **One behavior per leaf spec.** If you're writing "and also..." in a spec, split it.
- **Acceptance criteria are the definition of done.** Use Given/When/Then with concrete values, not abstractions.
- **Entities are defined once.** The first spec that introduces an entity defines its fields. Later specs reference it by name.
- **Dependencies are explicit.** If spec B needs spec A's entity or API, list A in `depends_on`.
- **Every developer leaf spec has `implements:`.** Point to the one business spec that explains *why* this exists. If you can't find one, the business tree is incomplete — go back and add it.
- **Flag uncertainty.** If something wasn't in the brief and you're making a judgment call, prefix it with `OPEN:` in the Notes section.
- **All statuses start as `draft`.** They move to `implementing` and then `implemented` during the build phase.

### Spec naming conventions

- Domain directories: lowercase, hyphenated (`user-management/`, `court-booking/`)
- Capability directories: lowercase, hyphenated (`email-auth/`, `schedule-management/`)
- Developer leaf spec files: lowercase, hyphenated, ending in `.spec.md` (`email-signup.spec.md`)
- Business spec files: lowercase, hyphenated, ending in `.business.md` (`secure-account-access.business.md`)
- IDs follow the path: `auth.registration.email-signup`

### Then write the folder overviews

Once both trees exist, walk every directory in `.specflow/specs-business/` and `.specflow/specs/` (root, domain, capability, any sub-folders) and write `_overview.md`. Read `references/folder-overview-template.md` for the format. Derive the content from the project brief and the actual specs you placed in that folder — the overview should name the specs by ID and explain the boundary.

### Then wire the bidirectional links

After both trees exist and overviews are written, do one pass to populate cross-links:

1. For each developer leaf spec, set `implements:` to the path of the one business spec it primarily serves (relative to the dev spec file). If a dev spec genuinely contributes to a secondary outcome, note it in the dev spec's Notes section — do not add a second `implements:` entry.
2. For each business spec, set `implemented_by:` to the list of every developer spec path (relative to the business spec file) whose `implements:` names it. This is mechanical — derive it from the dev specs, don't hand-author it.
3. Verify every link resolves to an actual file.

### Common domain patterns

Recognize these patterns and adapt them to the project:

**Web app with auth:**
- `auth/` — registration, login, password reset, session management
- `[core-domain]/` — the main business logic (varies by app)
- `notifications/` — email, push, in-app
- `settings/` — user preferences, account management

**CLI tool:**
- `input/` — argument parsing, file reading, validation
- `processing/` — the core transformation logic
- `output/` — formatting, file writing, display

**API service:**
- `api/` — endpoints, request/response schemas, middleware
- `data/` — models, migrations, repositories
- `integration/` — external service connections

---

## Phase 4: Coherence Check

Before presenting specs to the user, validate the entire two-tree structure:

1. **No circular dependencies** — If A depends on B and B depends on A, something is wrong. Restructure.
2. **No missing references** — Every ID in `depends_on` must exist as an actual spec.
3. **No orphan dev specs** — Every leaf spec should be reachable from the build order.
4. **No orphan business specs** — Every business spec must have at least one entry in `implemented_by:`. If nothing implements it, either it's premature (move to a future-work doc) or the dev tree is incomplete.
5. **No orphan dev leaves** — Every dev leaf spec must have an `implements:` value. If a dev spec serves no business outcome, ask why it exists.
6. **Bidirectional link symmetry** — If `dev-spec-X.implements` points to `business-spec-Y`, then `business-spec-Y.implemented_by` must include `dev-spec-X`. Run this check programmatically — it's mechanical.
7. **All links resolve** — Every path in `implements:` and `implemented_by:` must point to a real file.
8. **Every folder has an overview** — Walk both trees; flag any directory missing `_overview.md` (or `README.md` if the project uses that convention).
9. **No contradictory rules** — If spec A says "users must verify email" and spec B says "users can skip verification", resolve it.
10. **Every leaf has acceptance criteria** — No exceptions.
11. **No undefined entity references** — If a spec references `Booking`, some earlier spec must define it.
12. **Domain boundaries are clean** — Specs shouldn't reach deep into other domains.

Report any issues found. Present a summary:

```
Coherence Check Results:
- X business specs, Y developer leaf specs across Z domains
- W dependencies validated
- V bidirectional links validated
- All folders have overview docs
- Issues found: [list or "none"]
```

---

## Phase 5: Build Order

Topologically sort the leaf specs by their dependency graph to produce a build sequence. The build-order doc now reflects the two-layer model: business specs come first (the contract with the client), developer specs follow (the implementation contract).

### Sorting priorities (within the developer tree)

When multiple specs have no unresolved dependencies, prefer this order:
1. **Data model / entity specs** — These define the schema everything else depends on
2. **Backend / API specs** — Business logic and endpoints
3. **Frontend / UI specs** — Views and interactions (these consume the API)
4. **Integration specs** — External service connections
5. **Polish specs** — Notifications, settings, error handling

### Output: build-order.md

```markdown
# Build Order

## Step 0: Approve the business contract

Before any code is written, walk the client through `.specflow/specs-business/` (start with `.specflow/specs-business/_overview.md`, then each domain). Sign-off on outcomes and success metrics happens here. The developer tree below cannot be re-prioritised without a corresponding update to the business specs it implements.

## Step 1: Approve the developer contract

Read `.specflow/specs/_overview.md` and walk each domain. The dev specs below are the topologically sorted implementation order; any change to scope must propagate back up to the business spec via the `implements:` link.

## Phase 1: Foundation

1. `auth.models.user-entity` — User data model
   *implements:* `auth/secure-account-access.business.md`
2. `auth.registration.email-signup` — Basic registration flow
   *implements:* `auth/secure-account-access.business.md`
...

## Phase 2: Core Features

3. `scheduling.models.class-entity` — Class data model
   *implements:* `scheduling/coach-runs-classes.business.md`
...

[Group into logical phases for readability, but preserve the strict dependency order within each phase. Always show the implementing business spec next to each dev spec — it keeps the "why" visible during implementation.]
```

---

## Phase 6: File Output

Generate all files into the project directory. The complete structure:

```
project-root/
├── CLAUDE.md
├── RULES.md
├── project-brief.md
├── build-order.md
├── .claude/
│   ├── skills/{name}/SKILL.md
│   └── agents/{name}.md
├── .specflow/specs-business/
│   ├── _overview.md
│   ├── {domain}/
│   │   ├── _overview.md
│   │   └── {outcome}.business.md
│   └── ...
└── .specflow/specs/
    ├── _overview.md
    ├── _index.md
    ├── {domain}/
    │   ├── _overview.md
    │   ├── {capability}/
    │   │   ├── _overview.md
    │   │   └── {leaf}.spec.md
    │   └── ...
    └── ...
```

### CLAUDE.md template

Read `references/claude-md-template.md` for the full template. The CLAUDE.md must cover:
- What the project is (1 paragraph)
- How Specflow works (specs are source of truth, code is artifact, two-layer model)
- The build loop (the exact sequence Claude follows to implement each spec, including how to follow the `implements:` link back to the business spec)
- Key decisions already made (stack, architecture, conventions)
- What NOT to do (critical anti-patterns to avoid)

### Final checklist

Before presenting the output to the user:
- [ ] `project-brief.md` matches approved brief
- [ ] `.specflow/specs-business/` exists with at least one business spec per top-level outcome
- [ ] `.specflow/specs/` exists with all developer specs following the schema in `references/spec-schema.md`
- [ ] **Every directory in both trees contains `_overview.md`** (root, domain, capability, sub-folders)
- [ ] Every developer leaf spec has `implements:` populated with exactly one business spec path that resolves
- [ ] Every business spec has `implemented_by:` populated and all paths resolve
- [ ] Bidirectional links are symmetric (verified programmatically in coherence check)
- [ ] `build-order.md` respects all dependencies and shows the implementing business spec for each dev spec
- [ ] `CLAUDE.md` references the correct file paths and explains the two-layer model
- [ ] `RULES.md` has justified, actionable rules
- [ ] All agents have proper frontmatter (name, description, tools, model)
- [ ] All skills have proper frontmatter (name, description)
- [ ] `.specflow/specs/_index.md` lists all domains and their spec counts
- [ ] No OPEN: questions left unresolved (or user has acknowledged them)

---

## Tips for better specs

- **Start concrete, generalize later.** Write specs for the specific app, not for a generic version. "Coach can create a padel class for 4 players" is better than "Admin can create a configurable event".
- **Acceptance criteria drive tests.** Every Given/When/Then becomes a test case. If the criteria are vague, the tests will be vague.
- **Entities are references, not definitions.** Specs declare which entities they READ, WRITE, and CREATE. The model/migration is the source of truth for field definitions — do not duplicate schema details in specs.
- **Dependencies reveal architecture.** The dependency graph shows you the natural layering of the system. If everything depends on everything, the domains are wrong.
- **Fewer, better specs beat many shallow ones.** 30 well-defined leaf specs are more valuable than 100 vague ones.
- **Business specs stay business.** If you find yourself writing entity tables, status enums, or HTTP routes in a business spec, stop — that belongs in the developer tree. The business spec should be readable by a non-technical client without confusion.
- **One business spec, many dev specs.** A good business spec is an outcome that takes 3-10 dev specs to deliver. If you have 1:1 mapping, you've probably either over-fragmented business specs or under-fragmented dev specs.
