---
name: specflow-spec-editor
description: 'Write spec files — create, edit, link. "update the spec", "add this criterion".'
---

# Specflow: Spec Editor

## When to use

Execute spec changes against the spec tree — create new specs, edit existing specs, manage
bidirectional links, update folder overviews, and run coherence checks. This is the skill that
actually modifies spec files. Use this skill whenever a change plan needs to be executed
against specs — whether that plan comes from the change-router, from specflow-bugs, from
specflow-ingest, or from a direct human instruction. PROACTIVELY trigger when: the
change-router has classified a request and the next step is editing specs; a bug diagnosis
produces a change plan that requires spec modification; an ingest manifest has approved changes
to apply; the user says "update the spec", "add this criterion", "create a new spec", "change
the rule", "add a business spec", "link these specs", "update the overview", "wire implements",
"deprecate this spec", "move this spec", or any instruction that means modifying files in
.specflow/specs/ or .specflow/specs-business/. If someone says "edit" or "change" and the
target is a spec file, this skill applies. Always run the coherence check after modifications.

## Purpose

This skill executes spec changes. Every other Specflow skill either diagnoses, proposes, or
routes — this one actually opens spec files, modifies them, and ensures the spec tree stays
coherent afterward.

**The editor is the only skill that writes to `.specflow/specs/` and `.specflow/specs-business/`.** Other skills
read the spec tree; this one modifies it. This single point of mutation makes it possible to
enforce consistency rules (coherence check, link integrity, overview freshness) in one place.

## When to Use

This skill activates after a change has been classified and approved. It receives instructions
from one of these sources:

| Source | What it provides | Editor's job |
|--------|-----------------|-------------|
| **Change-router** | Classified request (Category 3-5) with affected specs identified | Execute the spec modification |
| **specflow-bugs** | Change plan with specific rule/criterion edits | Apply the plan to the spec files |
| **specflow-ingest** | Change manifest with drafted specs and modifications | Create/edit specs per the manifest |
| **Human directly** | "Add a rule to this spec", "create a new spec for X" | Interpret and execute |

## Cortex Awareness

When the project has a `.cortex/` directory:

- **Check `governed_by:` before editing.** When a dev spec carries `governed_by:`
  (compass rule IDs, design §8.4 bridge 1), read the referenced
  `.cortex/compass/rules/R-*.md` files before modifying the spec — an edit must not
  contradict a governing rule without flagging it, and every rule reference must still
  resolve after the edit.
- **Run `cortex validate` after modifications.** The validator is the mechanical
  backbone: frontmatter schema, `implements:`/`implemented_by:` resolution and
  symmetry, ID/path agreement, dependency cycles. Run it after every modification
  batch and fix what it names. The coherence check below remains this skill's judgment
  layer on top (contradictory rules, entity semantics, overview freshness) — don't
  hand-roll checks the validator already enforces mechanically.

## Operations

### 1. Create a New Dev Spec

**When:** A new feature needs a leaf spec that doesn't exist yet.

**Steps:**

1. **Determine the file path.** Follow the naming convention:
   `.specflow/specs/{domain}/{capability}/{leaf}/{leaf}.spec.md`
   Create directories as needed.

2. **Write the spec file.** Use the leaf spec template:

   ```markdown
   ---
   id: {domain}.{capability}.{leaf}
   status: draft
   depends_on:
     - {dependency-spec-id}
   implements: {relative-path-to-business-spec}
   ---

   # {Spec Title}

   ## Intent

   {1-2 sentences: why this spec exists, what user need it serves.}

   ## Entities

   [Which entities this spec reads from and writes to. Specs reference entities — they
   do NOT define schemas.]

   - **READS:** {Entity1}, {Entity2}
   - **WRITES:** {Entity3} ({what it does})
   - **CREATES:** {Entity4} — {brief description, only if this spec introduces a new entity}

   ## Rules

   1. {First behavioral rule}
   2. {Second behavioral rule}

   ## Acceptance Criteria

   ### {Criterion Name}

   - **Given** {precondition with concrete values}
   - **When** {action}
   - **Then** {expected outcome}

   ## Notes

   - {Any context, implementation hints, or open questions}
   - OPEN: {Anything unresolved}
   ```

3. **Set the `implements:` link.** Use a relative path from the spec file's location to
   the business spec it serves. Exactly one value — not a list.

4. **Update the business spec's `implemented_by:`.** Open the linked business spec and
   append this dev spec's path to its `implemented_by:` list.

5. **Update `_overview.md`.** If this spec adds a new capability to a domain, update the
   domain's `_overview.md` to mention it. If it creates a new domain, create both the
   domain `_overview.md` and update the root `_overview.md`.

6. **Update `.specflow/specs/_index.md`.** Add the new spec to the domain listing and dependency graph.

7. **Run coherence check.**

### 2. Create a New Business Spec

**When:** A new outcome or journey needs articulating.

**Steps:**

1. **Determine the file path.**
   `.specflow/specs-business/{domain}/{outcome}.business.md`

2. **Write the spec file.** Use the business spec template:

   ```markdown
   ---
   id: {domain}.{outcome}
   status: draft
   implemented_by:
     - {relative-path-to-dev-spec-1}
     - {relative-path-to-dev-spec-2}
   ---

   # {Outcome Title}

   ## Outcome

   {1 paragraph: what changes in the user's world when this is delivered.}

   ## Who This Is For

   {The persona(s) involved.}

   ## User Journey

   1. {Step 1 — what the user does or experiences}
   2. {Step 2}
   3. {Step 3}

   ## Business Rules

   1. {Rule in domain language, not engineering language}

   ## Success Metrics

   - {Measurable outcome}

   ## Out of Scope

   - {What this outcome does NOT cover}

   ## Notes

   - OPEN: {Questions for the client}
   ```

3. **Wire `implemented_by:`.** If dev specs already exist for this outcome, list their
   relative paths. If dev specs don't exist yet, leave the list empty and flag that dev
   specs need creating.

4. **Update each linked dev spec's `implements:`.** Open every dev spec listed in
   `implemented_by:` and set its `implements:` to point back to this business spec.

5. **Update `_overview.md`.** Update or create the business domain's overview.

6. **Run coherence check.**

### 3. Edit an Existing Spec — Modify Rules

**When:** A rule needs changing, adding, or removing.

**Steps:**

1. **Read the current spec.** Load the file, parse the Rules section.

2. **Apply the modification.**
   - To add a rule: append to the numbered list, renumber if needed.
   - To change a rule: replace the text, preserve the number.
   - To remove a rule: delete the line, renumber remaining rules. Check that no acceptance
     criterion references the removed rule by number.

3. **Check criteria.** Does every rule still have at least one acceptance criterion that
   tests it? If the new/changed rule has no criterion, draft one and add it.

4. **Cross-layer check.** Read the business spec via `implements:`. Does the business
   spec's business rules section still align with the dev spec's rules? If not, flag
   drift and propose a business spec update.

5. **Run coherence check.**

### 4. Edit an Existing Spec — Add/Modify Acceptance Criteria

**When:** A criterion needs adding, changing, or removing.

**Steps:**

1. **Read the current spec.** Load the file, parse the Acceptance Criteria section.

2. **Apply the modification.**
   - To add: append a new `### Criterion Name` block with Given/When/Then.
   - To change: replace the Given, When, or Then lines as needed.
   - To remove: delete the entire `### Criterion Name` block.

3. **Validate the criterion.**
   - Uses concrete values, not abstractions ("email 'alice@example.com'", not "a valid email").
   - Each criterion tests exactly one behavior.
   - Given/When/Then structure is complete (every criterion must have all three).

4. **Run coherence check.**

### 5. Edit an Existing Spec — Modify Entity References

**When:** An entity is being added to, removed from, or renamed in the codebase, and specs
need to reflect the change. Or when a spec's READS/WRITES/CREATES list is wrong.

**Steps:**

1. **Find every spec that references this entity.** Grep across the spec tree:
   ```bash
   grep -r "{EntityName}" .specflow/specs/ --include="*.spec.md"
   ```

2. **Update entity references.** If an entity is renamed, update every READS/WRITES/CREATES
   reference. If a spec gains or loses a relationship to an entity, update its Entities
   section.

3. **Check rules and criteria.** For every spec whose entity references changed, verify
   its rules and acceptance criteria still make sense. A rule that says "booking requires
   a class with available capacity" must still reference the correct entity names.

4. **Cross-layer check.** Entity changes often affect multiple business outcomes. Check
   all linked business specs.

5. **Run coherence check.**

Note: specs reference entities by name (READS/WRITES/CREATES) but do not define schemas.
Field-level changes (adding a column, changing a type) happen in the model/migration code,
not in specs. Specs only need updating if the entity reference itself changes or if a
behavioral rule is affected.

### 6. Manage Bidirectional Links

**When:** Links need creating, updating, or repairing.

**Steps for linking a dev spec to a business spec:**

1. Open the dev spec. Set `implements:` to the relative path of the business spec.
   Remember: exactly one value, not a list.

2. Open the business spec. Append the dev spec's relative path to `implemented_by:`.

3. Verify both paths resolve to real files.

**Steps for unlinking:**

1. Open the dev spec. Clear `implements:` (set to empty or remove the field).
   The dev spec is now unmapped — note this.

2. Open the business spec. Remove the dev spec's path from `implemented_by:`.

**Steps for relinking (moving a dev spec to a different business parent):**

1. Unlink from the old business spec (remove from its `implemented_by:`).
2. Link to the new business spec (add to its `implemented_by:`).
3. Update the dev spec's `implements:` to point to the new business spec.

### 7. Update Folder Overviews

**When:** The structure of a domain or capability has changed — specs added, removed,
renamed, or regrouped.

**What to update:**

- **If a spec was added to an existing capability folder:** Update the capability's
  `_overview.md` to mention the new spec in its "What it covers" section.

- **If a new capability folder was created:** Create `_overview.md` in the new folder
  AND update the parent domain's `_overview.md` to mention the new capability.

- **If a new domain was created:** Create `_overview.md` in the new domain folder AND
  update the root `_overview.md` of the affected tree (`.specflow/specs/` or `.specflow/specs-business/`).

- **If a spec was removed or deprecated:** Update the containing folder's `_overview.md`
  to remove or note the deprecation.

**Overview template (3 questions):**

```markdown
# {Folder Name} — Overview

## What this is

{1-2 sentences naming the group.}

## What it covers

- `{spec-id}` — {one-line description}
- `{spec-id}` — {one-line description}

## Why it's grouped this way

{1-2 paragraphs explaining the boundary.}

## Related groups

- {Cross-link to sibling or related folders}
```

**Tone:** Business-tree overviews use plain language, no spec IDs in prose. Developer-tree
overviews can use spec IDs and technical terms.

### 8. Deprecate a Spec

**When:** A spec is being removed or replaced.

**Steps:**

1. Set `status: deprecated` in the spec's frontmatter.

2. **Unlink.** Remove the spec from its business spec's `implemented_by:` list (or from
   its dev specs' `implements:` if deprecating a business spec).

3. **Check dependents.** Find all specs with `depends_on:` referencing this spec. Flag
   them as having a broken dependency — the human must resolve these (remove the dependency,
   rewire it, or deprecate the dependent too).

4. **Update `_overview.md`.** Remove or note the deprecation in the containing folder's
   overview.

5. **Do NOT delete the file.** Deprecated specs stay in the tree as a record. They are
   excluded from the build order and the viewer marks them with a deprecated badge.

6. **Run coherence check.**

### 9. Batch Apply from a Change Manifest

**When:** specflow-ingest or specflow-bugs produced a manifest with multiple changes.

**Steps:**

1. **Read the manifest.** Parse each numbered CHANGE entry.

2. **Sort by dependency.** If CHANGE-03 creates a spec that CHANGE-05 depends on,
   execute 03 first.

3. **Execute each change** using the appropriate operation above (create, edit, link, etc.).

4. **After all changes:** run the coherence check once (not per-change — that would be
   wasteful for a batch).

5. **Report results.** For each CHANGE entry, report: applied / skipped (conflict) /
   needs human input.

## The Coherence Check

Run this after every modification. It validates the entire two-tree structure:

1. **No circular dependencies** — `depends_on` chains don't loop.
2. **No missing dependency references** — every ID in `depends_on` exists as a real spec.
3. **No orphan dev leaves** — every dev leaf spec has `implements:` set (not empty).
4. **No orphan business specs** — every business spec has at least one `implemented_by:` entry.
5. **Bidirectional link symmetry** — if dev-spec-X.implements points to biz-spec-Y, then
   biz-spec-Y.implemented_by includes dev-spec-X, and vice versa.
6. **All links resolve** — every path in `implements:` and `implemented_by:` points to a
   real file.
7. **Every folder has an overview** — walk both trees, flag any directory missing `_overview.md`.
8. **No contradictory rules** — scan for rules across specs in the same domain that conflict.
9. **Every leaf has acceptance criteria** — no exceptions.
10. **No undefined entity references** — if a spec references an entity, some spec must define it.
11. **`implements:` is singular** — no dev spec has a list in `implements:`.
12. **Status consistency** — a spec with `status: implemented` should have all criteria
    covered by tests. A spec with `status: deprecated` should not be in any `depends_on` list.

**Output format:**

```
Coherence Check Results:
- X business specs, Y developer leaf specs across Z domains
- W dependencies validated
- V bidirectional links validated
- All folders have overview docs: YES / NO (list missing)
- Issues found: [list or "none"]
```

If issues are found, present them to the human and do not proceed until resolved.

## Safety Rules

1. **Never edit a spec without the human seeing the change.** Show the before/after diff
   for every modification. The human is the spec reviewer — that's the whole point.

2. **Never break a link silently.** If an operation would orphan a spec (remove its only
   `implements:` link, or remove it from the last `implemented_by:` list), warn explicitly.

3. **Never delete a spec file.** Deprecate instead. The file stays as a record.

4. **Never skip the coherence check.** Even for trivial changes. The check is fast; the
   bugs it catches are not.

5. **Never modify code.** This skill modifies specs. Code changes are downstream — handled
   by the build loop after specs are updated.

6. **Preserve existing formatting.** When editing a spec, don't reformat sections that
   aren't being changed. Minimize the diff.

## Agent Instructions

When operating as the spec editor:

- **Read the full spec before editing.** Understand the context — Intent, Rules, Criteria,
  Notes — before modifying any section. A rule change might invalidate a criterion you
  didn't read.

- **Show the diff.** Before writing any file, show the human what's changing. Use a clear
  before/after format.

- **Update links immediately.** When creating or modifying a spec, update `implements:` /
  `implemented_by:` in the same operation. Don't leave links for "later."

- **Check overviews.** After structural changes (new spec, new folder, deprecation), check
  whether any `_overview.md` needs updating. Do it in the same operation.

- **Run coherence check last.** After all edits in a batch are complete, run the check once.
  Report the results to the human.

- **Be precise about paths.** `implements:` uses relative paths from the dev spec to the
  business spec. `implemented_by:` uses relative paths from the business spec to the dev
  spec. Get these right — wrong paths break the viewer and confuse the coherence check.

- **Flag what you can't do.** If a change plan asks you to modify something that needs
  human judgment (e.g., "choose whether the business spec or dev spec is correct"), flag
  it and ask rather than guessing.
