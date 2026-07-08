# Folder Overview Template (`_overview.md`)

Every directory inside `.specflow/specs-business/` and `.specflow/specs/` must contain an `_overview.md`. The leading underscore makes it sort to the top of the folder so anyone — Claude, a client browsing the tree, the spec viewer — sees it before the individual specs.

`README.md` is acceptable only when a project already uses that convention; default to `_overview.md` for new projects.

## Why this exists

A folder of spec files is opaque on its own. The overview answers three questions in plain language so a reader can decide whether to dive in:

1. **What this group of specs IS** — the kind of thing collected here.
2. **What it COVERS** — the capabilities/outcomes inside, named explicitly.
3. **WHY it exists as a group** — the boundary that justifies grouping these specs together (and excluding others).

Keep it short. 3-6 short paragraphs. A reader should know within 30 seconds whether they're in the right folder.

## Where overviews go

For both `.specflow/specs-business/` and `.specflow/specs/`:

- The tree root (`.specflow/specs-business/_overview.md`, `.specflow/specs/_overview.md`) — explains the whole tree.
- Every domain folder (`.specflow/specs/auth/_overview.md`) — explains the domain.
- Every capability folder (`.specflow/specs/auth/registration/_overview.md`) — explains the capability and lists its leaves.
- Any other sub-folder — same rule.

## Template

```markdown
# [Folder Name] — Overview

## What this is

[1-2 sentences naming the group. "This folder collects all developer specs for the Auth domain — everything related to who can sign in, prove who they are, and recover access if they lose it." Use the same domain name the brief uses; don't invent synonyms.]

## What it covers

[Bullet list naming each child spec or sub-folder by ID, with one line each. For a domain folder, list capabilities. For a capability folder, list leaf specs.]

- `auth.registration` — How new users join (email signup, social signup).
- `auth.login` — How returning users prove identity (password, magic link, biometric).
- `auth.recovery` — How users get back in when locked out.

## Why it's grouped this way

[1-2 paragraphs. Explain the boundary — what makes these specs belong together, and what's deliberately *not* here. "Anything about the user's profile data lives under `user-profiles/`, not here. This folder is strictly about identity and access — once a user is authenticated, they leave this domain." This is the part that prevents drift over time.]

## Related groups

[Optional. Cross-link to sibling folders the reader might be looking for instead.]

- For profile fields and preferences: `../user-profiles/`
- For the business outcomes this domain delivers: `../../specs-business/auth/`
```

## Generation guidance

When the skill generates a new project, it has all the inputs needed to write each overview deterministically:

- The folder name → "what this is" sentence.
- The list of specs the skill placed in the folder → "what it covers" bullets.
- The brief's description of the domain and the explicit out-of-scope notes → "why it's grouped this way".
- The sibling folders in the same tree (and the parallel folder in the other tree) → "related groups".

Don't generate overview text that is more abstract than the underlying specs — if you can't describe the boundary concretely, the boundary may be wrong, and the right move is to revisit the domain split before writing the overview.

## Tone differences between trees

- **`.specflow/specs-business/.../_overview.md`** is for non-technical readers. No file paths in the prose body, no spec IDs in the bullets — use the human-readable spec titles. Cross-links can still point to file paths under the "Related groups" section.
- **`.specflow/specs/.../_overview.md`** is for developers. Spec IDs are fine; file paths and dependency hints are welcome.

## Examples

### `.specflow/specs/auth/_overview.md` (developer-tree domain folder)

```markdown
# Auth — Overview

## What this is

The Auth domain owns identity and access for the platform. Every spec here answers some form of "is this person allowed to do this?".

## What it covers

- `auth.registration` — Email signup, social signup, invite-based signup.
- `auth.login` — Password, magic link, refresh tokens.
- `auth.recovery` — Password reset, account recovery via secondary email.
- `auth.session` — Session lifetime, logout, device management.

## Why it's grouped this way

These specs share one concern: turning an anonymous request into an authenticated, authorised one. Once that's done, downstream domains take over.

User profile data, preferences, and roles within a workspace belong to `user-profiles/` and `workspaces/` — they assume Auth has already happened.

## Related groups

- Business outcomes for this domain: `../../specs-business/auth/`
- Profile data after sign-in: `../user-profiles/`
```

### `.specflow/specs-business/auth/_overview.md` (business-tree domain folder)

```markdown
# Auth — Overview

## What this is

This folder describes the experience of getting into the product and staying in: signing up, logging in, and recovering access when something goes wrong.

## What it covers

- **Secure account access** — A new user creates an account and signs in safely.
- **Account recovery** — A user who lost their password or device gets back in without losing their data.
- **Stay signed in** — A returning user doesn't have to re-prove identity every visit.

## Why it's grouped this way

Everything here is about *who you are* before you start using the product. Once the user is signed in, they leave this part of the experience and start interacting with the actual features.

What the user can *do* once signed in lives in the other folders — booking, scheduling, payments, and so on.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/auth/`
- What signed-in users can change about themselves: `../user-profiles/`
```
