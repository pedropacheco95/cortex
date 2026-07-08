# Folder Overview Template (`_overview.md`)

Every directory under `.specflow/specs/` and `.specflow/specs-business/` must contain an `_overview.md` (preferred filename — sorts to top of folder listings). Use `README.md` only if the host project already standardises on README. Pick one and stick with it across both trees.

The overview answers three questions in plain language:

1. **What** is this group of specs?
2. **What does it cover?** (immediate children, with one-line summaries)
3. **Why** does it exist as a group?

Keep it short — 10–25 lines is the target. The spec-viewer renders it as the landing page for the folder.

## Template

```markdown
# <Folder name in title case>

## What this is
1–2 sentences. The shortest possible explanation of what these specs collectively describe.
Use the vocabulary a stakeholder would use, not implementation jargon.

## What it covers
- **<child-1>** — one-line summary of what this child is about
- **<child-2>** — one-line summary
- **<child-3>** — one-line summary
(List every immediate child folder or leaf spec — domains for the root, capabilities for a domain
folder, leaf specs for a capability folder. The point is to orient someone who just opened the
folder.)

## Why it's grouped this way
1 paragraph. What evidence in the codebase / user journeys / product told you these belong
together? E.g., "All capabilities here sit under the 'Bookings' menu item in the frontend and
share the booking lifecycle data model" or "These business specs all describe outcomes a
new user achieves during onboarding, before they have any saved data."
```

## Variants

The overview's content shifts based on where in the tree it sits:

| Folder | What | Covers | Why |
|---|---|---|---|
| `.specflow/specs/_overview.md` | Root of the developer tree. | Lists every domain. | Why these domains divide the system the way they do. |
| `.specflow/specs/<domain>/_overview.md` | One technical domain. | Lists every capability under it. | What the domain owns, what it doesn't. |
| `.specflow/specs/<domain>/<capability>/_overview.md` | One capability. | Lists every leaf spec. | What the capability accomplishes end-to-end. |
| `.specflow/specs-business/_overview.md` | Root of the business tree. | Lists every business domain. | The product's high-level value-prop areas. |
| `.specflow/specs-business/<biz-domain>/_overview.md` | One business domain. | Lists every business capability. | The user-visible problem area this domain serves. |
| `.specflow/specs-business/<biz-domain>/<biz-capability>/_overview.md` | One business outcome. | Lists the leaf spec(s). Usually one. | The journey/outcome and which dev specs realise it. |

## What NOT to put in an overview

- Schemas, endpoints, code snippets — those belong in the spec files themselves.
- A copy of the spec content — overviews are *navigation*, not duplication.
- Links to every file in the tree — link only immediate children.
- Aspirational future plans — overviews describe what *is*, not what *should be*.

## During onboarding

If you can't write a confident "why" paragraph, that's a signal the grouping might be wrong. Either re-group or write the overview honestly: `OPEN: Grouping inferred from <evidence>; weak confidence — flag for human review.`
