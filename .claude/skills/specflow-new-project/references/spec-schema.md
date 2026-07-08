# Developer Spec File Schema

Every developer-spec node is a markdown file under `.specflow/specs/`. The schema varies slightly
by level (domain, capability, leaf), but all share the same structure. Only leaf specs
are directly implementable.

For business-facing specs (under `.specflow/specs-business/`), see `business-spec-template.md`.
For folder overview docs (`_overview.md` in every directory), see `folder-overview-template.md`.

## Frontmatter (all developer specs)

Every developer spec carries YAML frontmatter at the top:

```yaml
---
id: [domain].[capability].[leaf]
status: draft
depends_on: [list of spec IDs, or empty]
implements: [single relative path to the business spec this leaf serves]
---
```

- `implements:` is **required** on every leaf spec and takes exactly **one** value — the
  path to the business spec whose outcome this leaf primarily serves.
- `implements:` is optional on domain and capability specs.
- If a leaf genuinely contributes to a secondary business outcome, note it in the Notes
  section but keep `implements:` to one value. Pick the dominant parent.

## Leaf Spec Template

This is the most important template — leaf specs are what Claude actually implements.

```markdown
---
id: [domain].[capability].[leaf]
status: draft
depends_on:
  - [spec-id-1]
  - [spec-id-2]
implements: ../../../specs-business/[domain]/[outcome].business.md
---

# [Spec Title]

## Intent

[1-2 sentences: why this spec exists, what user need it serves. The "why" should echo
the business spec listed in implements: — if it doesn't, the link is wrong.]

## Entities

[Which entities this spec reads from and writes to. Specs reference entities — they do
NOT define schemas. The model/migration is the single source of truth for field
definitions.]

- **READS:** [Entity1], [Entity2]
- **WRITES:** [Entity3] ([what it does — e.g., "creates a booking record"])
- **CREATES:** [Entity4] — [brief description of what this entity represents, only if
  this spec introduces a brand-new entity for the first time]

Do NOT list field names, types, or constraints here. That information belongs in the
model/migration code, not in specs. The Entities section exists to anchor the
relationship graph and clarify data flow.

## Rules

[Numbered behavioral rules that govern this spec. These are the business logic
constraints — engineering-precise, but should not contradict the domain rules in the
linked business spec.]

1. [Rule in plain language — e.g., "A class cannot have more participants than its capacity"]
2. [Another rule — e.g., "Only the coach who created a class can delete it"]

## Acceptance Criteria

[Given/When/Then format. Use concrete values. Each criterion gets a descriptive name.]

### [Criterion Name — e.g., "Successful class creation"]

- **Given** [precondition with concrete values]
- **When** [action]
- **Then** [expected outcome]
- **And** [additional outcomes if needed]

## Notes

[Optional section. Use for context, implementation hints, or open questions.]

- OPEN: [Any decision not covered in the brief that needs user input]
- Also supports: [secondary business spec path, if applicable]
```

## Domain Spec Template

Domain specs define boundaries. They're short — just enough to explain what the domain
covers.

```markdown
---
id: [domain]
status: draft
---

# [Domain Name]

## Scope

[2-3 sentences: what this domain covers and what it does NOT cover]

## Capabilities

[List the capability specs within this domain]

- `[domain].[capability]` — [one-line description]
```

## Capability Spec Template

Capability specs group related leaf specs. They provide context but are not implementable.

```markdown
---
id: [domain].[capability]
status: draft
depends_on:
  - [spec-id-1]
---

# [Capability Name]

## Intent

[1-2 sentences: what this capability enables]

## Leaf Specs

[List the leaf specs within this capability]

- `[domain].[capability].[leaf]` — [one-line description]
```

## Schema Rules

1. **IDs follow the directory path.** `auth/registration/email-signup.spec.md` has ID
   `auth.registration.email-signup`.
2. **`depends_on` lists spec IDs, not file paths.** Use the dot-notation ID.
3. **`implements` is a single relative file path to one business spec.** One dev spec,
   one business parent.
4. **Specs reference entities, they don't define schemas.** Use READS/WRITES/CREATES
   to declare which entities are touched. The model/migration is the source of truth
   for field definitions.
5. **Status values:** `draft` → `implementing` → `implemented`. All specs start as `draft`.
6. **Acceptance criteria use concrete values.** Not "a valid email" but
   "email 'alice@example.com'".
7. **One behavior per leaf spec.** If a spec has acceptance criteria testing fundamentally
   different behaviors, split it.
8. **Rules are numbered.** This makes them easy to reference in code comments and tests.
9. **Every leaf has `implements:` set.** A leaf with no business-spec parent is a smell.
10. **File naming:** `.specflow/specs/{domain}/{capability}/{leaf}.spec.md` — no subfolder per leaf.
