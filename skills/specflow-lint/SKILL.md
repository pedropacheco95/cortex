---
name: specflow-lint
description: 'Check and fix spec-tree structure. "lint specs", "validate the spec tree".'
---

# Specflow: Spec Linter

## When to use

Verify and correct the structural integrity of both spec trees (.specflow/specs/ and
.specflow/specs-business/). Checks that every spec follows the correct format, naming
conventions, frontmatter schema, entity reference style, folder structure, and bidirectional
linking rules. Fixes violations automatically where possible, flags ambiguous issues for human
review. Use this skill whenever the user says "check specs", "lint specs", "verify spec
structure", "are my specs correct", "fix spec formatting", "validate the spec tree", or after
any bulk spec operation (onboarding, ingest, batch editing) to ensure consistency. Also trigger
proactively after specflow-spec-editor completes a batch of changes, or when the
specflow-viewer reports parsing warnings.

## What this skill does

Verify and correct the structural integrity of both spec trees. This skill ensures every
spec file follows the conventions exactly — format, naming, frontmatter, entity references,
folder structure, overviews, and bidirectional links. It fixes what it can and flags what
it cannot.

> **Cortex awareness:** on a Cortex project, `cortex validate` is the mechanical backbone
> this linter layers judgment on. Run it first: it already enforces frontmatter schema,
> ID/path agreement, link resolution and `implements:`/`implemented_by:` symmetry, and
> dependency cycles — do not reimplement those checks here. This skill adds the judgment
> layer the validator cannot: naming conventions, entity-reference style, overview
> quality, engineering-jargon leakage, and the auto-fixes.

## When to Run

- After onboarding (specflow-onboard-codebase or deep-onboard agent)
- After bulk spec changes (specflow-ingest manifest applied, batch spec-editor operations)
- After manual spec edits
- When the spec-viewer reports warnings
- On demand: "lint the specs", "check my spec tree", "verify spec structure"

## What It Checks

The linter runs checks in order. Each check produces: PASS, AUTO-FIXED, or NEEDS REVIEW.

### 1. File Structure

**1a. Directory layout**
- `.specflow/specs/` exists at project root
- `.specflow/specs-business/` exists at project root
- `.specflow/specs/` contains `_index.md` at root
- Both trees are organized in domain subfolders (not flat)
- Dev spec path matches: `.specflow/specs/{domain}/{capability}/{leaf}.spec.md`
- Business spec path matches: `.specflow/specs-business/{domain}/{outcome}.business.md`
- No `spec.md` generic filenames (must be `{leaf}.spec.md`)
- No subfolder per leaf spec (file lives directly in capability folder)

**1b. Folder overviews**
- Every directory in both trees has `_overview.md` (or `README.md` if that's the project
  convention — but not both)
- `_overview.md` is not empty
- `_overview.md` answers the three questions: what IS it, what does it COVER, WHY grouped

**Auto-fix:** Create empty `_overview.md` stubs for missing directories (with TODO markers).

### 2. Developer Spec Format

For every `.spec.md` file:

**2a. Frontmatter**
- Has `id:` field
- `id:` matches the file path (e.g., `auth.registration.email-signup` for
  `.specflow/specs/auth/registration/email-signup.spec.md`)
- Has `status:` field with valid value (`draft`, `implementing`, `implemented`, `deprecated`)
- Has `depends_on:` field (can be empty list)
- Has `implements:` field
- `implements:` is a single value, NOT a list
- `implements:` path resolves to an actual file (or is `[]` for unmapped specs)

**2b. Body sections**
- Has `## Intent` section (not empty)
- Has `## Entities` section with READS/WRITES/CREATES format
- Entities section does NOT contain field tables (`| Field | Type | Description |`)
- Entities section does NOT define schemas
- Has `## Rules` section with numbered rules
- Rules are actually numbered (1, 2, 3...) not bulleted
- Has `## Acceptance Criteria` section (for leaf specs)
- Each criterion has a `### Name` heading
- Each criterion has `**Given**`, `**When**`, `**Then**` lines
- Criteria use concrete values, not abstractions

**2c. Entity reference format**
- Entities section uses `**READS:**`, `**WRITES:**`, and/or `**CREATES:**` markers
- No `### EntityName` subsections with field tables
- No `| Field | Type |` anywhere in the spec

**Auto-fix:**
- Renumber rules if gaps exist (1, 3, 4 → 1, 2, 3)
- Fix `implements:` from list with one item to scalar value
- Flag field tables for manual conversion to READS/WRITES/CREATES

### 3. Business Spec Format

For every `.business.md` file:

**3a. Frontmatter**
- Has `id:` field
- Has `status:` field
- Has `implemented_by:` field (list)
- Every path in `implemented_by:` resolves to an actual `.spec.md` file

**3b. Naming convention**
- Filename starts with a persona/role prefix that indicates who does the action
  (e.g., `user-`, `coach-`, `admin-`, `player-`)
- If no persona prefix found: NEEDS REVIEW with suggestion

**3c. Body sections**
- Has `## Outcome` section
- Has `## Who this is for` section
- Has `## User Journey` section with numbered steps
- Has `## Business Rules` section
- Does NOT contain schemas, entity tables, API routes, Given/When/Then criteria,
  or engineering jargon (`JWT`, `endpoint`, `migration`, `soft-delete`, `WebSocket`)

**3d. No engineering leakage**
- Scan for engineering terms: `API`, `endpoint`, `route`, `schema`, `migration`,
  `database`, `query`, `JWT`, `token`, `HTTP`, `status code`, `soft-delete`, `webhook`,
  `WebSocket`, `SQL`, `ORM`, `middleware`
- If found: NEEDS REVIEW with the offending line and a suggestion to rewrite in domain
  language

**Auto-fix:**
- Suggest persona-prefixed filename if missing

### 4. Bidirectional Link Integrity

**4a. Forward links (dev → business)**
- Every dev leaf spec's `implements:` value points to an existing business spec
- No dev leaf spec has `implements:` pointing to a nonexistent file

**4b. Reverse links (business → dev)**
- Every business spec's `implemented_by:` list contains only paths to existing dev specs
- No business spec lists a dev spec that doesn't exist

**4c. Symmetry**
- If dev-spec-X.implements points to biz-spec-Y, then biz-spec-Y.implemented_by includes
  dev-spec-X
- If biz-spec-Y.implemented_by includes dev-spec-X, then dev-spec-X.implements points to
  biz-spec-Y
- Flag any asymmetry

**4d. Orphans**
- Dev leaf specs with `implements: []` are listed as unmapped (not an error, but flagged)
- Business specs with empty `implemented_by:` are flagged (a business spec with no dev
  specs implementing it is suspicious)

**Auto-fix:**
- Add missing reverse links (if dev-spec-X.implements → biz-spec-Y but biz-spec-Y doesn't
  list dev-spec-X in implemented_by, add it)
- Remove broken links (paths that don't resolve to real files)

### 5. ID Consistency

- Every `id:` matches its file path
- No duplicate IDs across the entire spec tree
- `depends_on:` references resolve to actual spec IDs
- No circular dependencies in `depends_on:` chains

**Auto-fix:**
- Correct `id:` to match file path if they diverge

### 6. Overview Quality

For every `_overview.md`:

- Not a stub (more than just a heading)
- Mentions at least one child spec or subfolder by name
- Answers the three questions (what IS, what COVERS, WHY grouped) — check for at least
  3 paragraphs or sections

**Auto-fix:** None — overview content requires understanding. Flag thin overviews for
human review.

## Output: Lint Report

```markdown
# Spec Lint Report

**Run:** [date]
**Trees scanned:** .specflow/specs/ ([N] files), .specflow/specs-business/ ([N] files)

## Summary

| Check | Pass | Auto-fixed | Needs Review |
|---|---|---|---|
| File structure | [N] | [N] | [N] |
| Dev spec format | [N] | [N] | [N] |
| Business spec format | [N] | [N] | [N] |
| Bidirectional links | [N] | [N] | [N] |
| ID consistency | [N] | [N] | [N] |
| Overview quality | [N] | [N] | [N] |

## Auto-fixes Applied

- `.specflow/specs/auth/login/email-signup.spec.md`: Converted `implements:` from list to scalar
- `.specflow/specs-business/booking/_overview.md`: Created stub (TODO: fill in content)
- `.specflow/specs/booking/reservation/hold-slot.spec.md`: Renumbered rules (1,3,4 → 1,2,3)
- Added `hold-slot.spec.md` to `user-books-a-class.business.md` implemented_by list

## Needs Review

### LINT-001: Field table in entity section
**File:** `.specflow/specs/billing/invoice/generate.spec.md`
**Issue:** Entities section contains a `| Field | Type | Description |` table
**Expected:** READS/WRITES/CREATES references only — no schema definitions in specs
**Suggestion:** Replace the field table with:
  `- **WRITES:** Invoice (creates invoice record)`

### LINT-002: Business spec missing persona prefix
**File:** `.specflow/specs-business/notifications/booking-confirmation.business.md`
**Issue:** Filename does not start with a persona
**Suggestion:** Rename to `user-receives-booking-confirmation.business.md`

### LINT-003: Engineering jargon in business spec
**File:** `.specflow/specs-business/auth/user-accesses-account.business.md`
**Line 24:** "The system returns a JWT token valid for 24 hours"
**Suggestion:** Rewrite as "The user stays logged in for 24 hours"

### LINT-004: Thin overview
**File:** `.specflow/specs/billing/_overview.md`
**Issue:** Overview is only 2 lines and doesn't mention any child specs
**Suggestion:** Expand to cover what the billing domain contains and why it's grouped
```

## Agent Instructions

- **Fix what you can, flag what you can't.** Auto-fixes are for mechanical issues (wrong
  list format, missing reverse links, rule renumbering). Content issues (thin overviews,
  engineering jargon, wrong groupings) need human judgment.
- **Never change spec content.** The linter fixes structure and formatting. It does not
  rewrite rules, modify acceptance criteria, or change entity references beyond format
  corrections.
- **Run all checks, not just the first failure.** The report should show the full state,
  not stop at the first error.
- **Apply auto-fixes before reporting.** The "Auto-fixes Applied" section shows what was
  already corrected. The "Needs Review" section shows what remains.
- **Be specific in suggestions.** Don't say "fix the entity section." Show the exact
  current text and the exact suggested replacement.
- **Run the coherence check after auto-fixes.** The spec-editor's coherence check is a
  superset of this linter's structural checks — run it to catch anything the linter
  doesn't cover.
