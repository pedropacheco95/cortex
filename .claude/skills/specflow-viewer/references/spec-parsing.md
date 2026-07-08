# Spec Markdown parsing rules

This document captures the exact contract `build_viewer.py` uses to read Specflow spec files, plus the escape hatches when a file doesn't match perfectly. Refer to it when writing new specs, debugging a misrendered page, or extending the parser.

The script handles **two parallel trees** — `.specflow/specs/` (developer-facing) and `.specflow/specs-business/` (high-level, stakeholder-facing) — plus a **folder overview doc** (`_overview.md` preferred, `README.md` accepted) in any directory of either tree, plus an optional **`link-map.md`** at the project root that the `specflow-onboard-codebase` skill emits.

## File layout

### Developer tree (`.specflow/specs/`)

- `.specflow/specs/_index.md` — the **engineering manifest**. Title (`# ...`), first paragraph, and the first Markdown table appearing under a heading matching `/tooling manifest/i` are extracted. Everything else is kept as raw body and shown on the dashboard.
- `.specflow/specs/_overview.md` — OPTIONAL **prose overview** for the root of the developer tree. This is the document a non-developer would read to understand what the developer spec set is for. Distinct from `_index.md`: the index is the engineering map; the overview is the human-readable description. Both can coexist; the viewer renders them in separate places (dashboard vs root-folder pane) and never duplicates content.
- `.specflow/specs/{domain}/_overview.md` — folder overview for the domain. First sentence becomes the sidebar subtitle.
- `.specflow/specs/{domain}/_overview.md` — domain-level overview rendered as the folder's content pane.
- `.specflow/specs/{domain}/{capability}/_overview.md` — folder overview for the capability folder.
- `.specflow/specs/{domain}/{capability}/{leaf}.spec.md` — the **leaf spec**. Named after the leaf
  (e.g., `.specflow/specs/auth/login/email-signup.spec.md`). The parser matches any `*.spec.md` file
  inside a capability directory.

### Business tree (`.specflow/specs-business/`)

Same layout as the developer tree, with one addition:

- `.specflow/specs-business/{domain}/{outcome}.business.md` — business specs in domain subfolders.
  Filenames are persona-prefixed (e.g., `user-books-a-class.business.md`). The `.business.md`
  suffix marks the file as a leaf business spec. The parent folder is the business domain.

### Files NOT parsed as specs

- `_overview.md` and `README.md` — handled by the folder-overview pass, not the spec pass.
- Any other `*.md` not matching `*.spec.md`, `spec.md`, `_index.md`, or (under the business tree) `*.business.md` is ignored.

## Folder overviews (`_overview.md`)

Every directory under `.specflow/specs/` and `.specflow/specs-business/` is recorded as a folder node, whether or not it has an overview. If `_overview.md` exists it's used; if not, `README.md` is used; if neither exists, the folder is recorded with an empty body and the viewer renders a "no overview written for this group yet" placeholder so the gap is visible (the gap should be visible — that's how authors notice it needs writing).

`_overview.md` is preferred because the leading underscore sorts it to the top of most file listings (clients see it first when they open the folder) and it doesn't collide with a project's existing top-level `README.md`. `README.md` is accepted as a fallback for projects already using that convention.

The first prose sentence of the body (skipping headings, code fences, blockquotes, and lists) becomes the **sidebar subtitle** for the folder. Keep the opening sentence short and descriptive — one sentence answering "what is this group?". The full body is rendered in the right pane when the user clicks the folder node.

Folder overviews are also indexed for **search** — searching "authentication" matches a folder overview that says "this group covers authentication flows", not just spec titles.

## Frontmatter

```yaml
---
id: platform.auth-login                     # required; falls back to derived from path
status: draft | approved | implemented | deprecated
depends_on: [other.spec-id, ...]            # within-tree only
implements: biz.signup                      # ON DEV SPECS — the ONE business spec this serves
implemented_by: [platform.auth-login, ...]  # ON BUSINESS SPECS — dev spec IDs that fulfil it
---
```

Rules:

- **`id`** — if missing, derived from the path (`{domain}.{capability}` for nested layout, or filename stem for flat-layout `*.business.md`). Setting it explicitly is recommended for stability.
- **`status`** — lowercased. Unknown values downgrade to `draft` and produce a warning. Business specs use the same vocabulary (an outcome can be `draft`, `approved`, `implemented`, or `deprecated` exactly like a developer capability).
- **`depends_on`** — within-tree only: a dev spec depends on other dev specs; a business spec on other business specs. Cross-tree links use `implements`/`implemented_by`. Unknown refs produce a warning and render as "missing" chips.
- **`implements`** (dev-only) — a single business spec ID (or relative path; ID preferred) that this dev spec serves. One dev spec, one business parent. The viewer's "Implements" section on a dev spec page is built from this value.
- **`implemented_by`** (business-only) — list of dev spec IDs that fulfil this business spec. The viewer's "Implemented by" section on a business spec page is built from this list.

### Cross-link reconciliation

The build script auto-completes back-links so the two trees never silently disagree:

1. If a dev spec declares `implements: biz.x` but `biz.x`'s frontmatter doesn't list it under `implemented_by`, the script adds the back-link in memory and records a soft warning on `biz.x` — "back-link added: dev spec '...' declares 'implements: biz.x' but this business spec did not list it". The author should update the source.
2. Same logic in the reverse direction.
3. References to IDs that don't exist in the other tree drop the link and emit a warning.
4. **Unmapped flag**: any leaf dev spec with no `implements:` value — *but only when a business tree exists at all* — is recorded with an `unmapped: ...` warning. The viewer also surfaces this as a visible `Unmapped` badge in the sidebar and spec header. Without a business tree there's nothing to map to, so the flag stays silent.

## Body sections

Section boundaries are `##` or deeper headings (case-insensitive for section names). The
parser recognizes different sections depending on spec type (determined by file extension:
`.spec.md` = developer, `.business.md` = business).

### Developer spec sections (`.spec.md`)

- `Intent` — free-form Markdown prose. Rendered with a tiny inline Markdown converter
  (paragraphs, headings, bold/italic, inline code, fenced code, links, lists).
- `Entities` — READS/WRITES/CREATES references. Each top-level bullet starts with
  `**READS:**`, `**WRITES:**`, or `**CREATES:**` followed by entity names. Rendered as
  labeled data-flow chips (not a raw bullet list). Specs reference entities by name —
  they do NOT define schemas.
- `Rules` — ordered or unordered list. Rendered as a numbered list regardless of source
  ordering.
- `Acceptance Criteria` — the visual highlight of each leaf dev spec. One `### Title` per
  criterion, followed by bullets starting with `**Given**`, `**When**`, `**Then**`,
  `**And**`, `**And when**`, `**And then**`, `**And given**`, or `**But**`. Rendered as
  visually distinct Given/When/Then cards.
- `Notes` — bullet list. Any bullet starting with `OPEN:` is moved into a visually
  distinct "Open questions" panel.

### Business spec sections (`.business.md`)

- `Outcome` — prose paragraph. Rendered prominently as the lead section — this is what
  stakeholders read first. The viewer applies slightly larger font and extra spacing to
  make this the anchor of the page.
- `Who This Is For` — persona description. Rendered as a highlighted callout block with
  persona names in bold. Appears directly below Outcome so readers immediately see who
  this serves.
- `User Journey` — numbered steps. Rendered as a vertical step timeline with numbered
  step cards (not as a raw numbered list). Each step appears as a distinct card with its
  number and description. This is the visual centerpiece of the business view.
- `Business Rules` — numbered rules in domain language. Rendered as a numbered list (same
  style as developer Rules).
- `Success Metrics` — measurable outcomes. Rendered as a compact metrics panel (label +
  target value or description per row).
- `Out of Scope` — what this outcome does NOT cover. Rendered as a muted, collapsible
  section.
- `Notes` — same as developer specs: bullet list with `OPEN:` items highlighted.

### Cross-layer section rules

- The parser does NOT warn about missing `Acceptance Criteria` on business specs —
  business specs intentionally omit them.
- The parser does NOT warn about missing `User Journey` on developer specs — developer
  specs don't have journeys.
- Missing sections on either type are tolerated — the viewer omits them rather than
  showing empty headings.

## Section heading tolerance

These are all recognised as the same section:

```
## Acceptance Criteria
### Acceptance Criteria
**Acceptance Criteria**
```

The bold-only form is normalised to `## Acceptance Criteria` before section splitting.

## Acceptance criterion → test mapping

When a `test-results.json` is present, each leaf dev spec's acceptance criteria are joined to test results by key:

```
`${spec_id}::${criterion_title.toLowerCase().trim()}`
```

Test results that match a business spec ID are ignored (business specs have no acceptance criteria). Unmatched results are counted and surfaced in an "Orphan results" panel on the dashboard.

The test-results schema:

```json
{
  "generated_at": "2026-04-16T12:00:00Z",
  "runner": "jest",
  "results": [
    {
      "spec_id": "platform.auth-login",
      "criterion": "Successful bi-user login",
      "status": "pass",
      "file": "tests/foo/bar.test.ts",
      "duration_ms": 142,
      "message": "expected 200, got 500"
    }
  ]
}
```

## `link-map.md` (optional)

`specflow-onboard-codebase` emits a `link-map.md` at the project root after reverse-engineering an existing codebase. The viewer reads it if present — the path can be overridden with `--link-map`. The file represents the canonical business↔dev mapping derived from the most recent reconciliation pass.

The script applies link-map edges **additively**:

- If a mapping in `link-map.md` declares an edge that frontmatter doesn't already have, the script adds it to both sides and records a warning on each side ("link-map.md added edge: implements 'biz.x'") so the author knows where the edge came from.
- Frontmatter is never overridden — if frontmatter says edge X exists, edge X exists, even if the link map omits it.
- Unknown spec IDs in the link map are silently skipped (no warning — onboarding can have stale entries).

The script is lenient about format. It accepts either:

1. A fenced YAML block:
   ```yaml
   mappings:
     - business: outcomes.signup
       dev: [platform.auth-login, platform.auth-signup]
   ```
2. A Markdown table whose header includes both "Business" and "Dev":
   ```
   | Business           | Dev                                |
   |---|---|
   | outcomes.signup    | platform.auth-login, platform.auth-signup |
   ```

The full raw body of `link-map.md` is also passed through to the viewer so the dashboard's Mappings panel can render any prose narrative the onboard skill includes.

## Warnings

Non-fatal parse warnings end up in the `warnings` array of the injected payload and are surfaced in the viewer's "Spec health" panel. Current warning sources:

- Leaf dev spec without `Intent`.
- Leaf dev spec without any acceptance criteria.
- Acceptance criterion without a `Then` step.
- `depends_on` pointing at an unknown spec id (within-tree).
- `implements` pointing at an unknown business spec id.
- `implemented_by` pointing at an unknown dev spec id.
- Auto-completed back-link on the opposite side of an `implements`/`implemented_by` declaration.
- Edge added from `link-map.md` that frontmatter didn't declare.
- Unmapped leaf dev spec (no `implements:` set, while a business tree exists).
- Unknown `status` value.

Warnings never fail the build. The output HTML is always produced so the client-facing artefact never regresses.

## Extending the parser

If you need to support a new section, do the following:

1. Add a new `sections.get("<name>", "")` lookup in `build_viewer.load_spec`.
2. Add the parsed value to the `Spec` dataclass and `to_jsonable`.
3. Add a render block in `renderSpec(spec)` inside `assets/template.html` (order controls visual order).
4. Add CSS if the render needs styling beyond the existing prose / list / card primitives.
5. Add a warning rule to `load_spec` if the section is considered mandatory.

If you need to support a new file type (e.g. `*.outcome.md`), add it to the filename match in `load_all_specs` and adjust `load_spec`'s path-derivation block to compute `domain`, `capability`, and `kind` correctly.

The parser intentionally stays shallow — the viewer is one file and should stay a comfortable read. Anything that needs a heavy Markdown parser, a dependency graph algorithm, or a dedicated theme engine is a signal that a different tool is the right home for the feature.
