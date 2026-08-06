---
name: specflow-viewer
description: 'Generate the browsable spec site.'
---

# specflow-viewer

## When to use

**This skill is callable-only** — it carries no trigger surface in the skill listing and is not
routed into automatically. Run it when the developer invokes `/specflow-viewer`, or when
another skill's instructions name it. Regenerating a client-facing site is a deliberate act,
not something a resembling sentence should trip. What follows is its scope, not its triggers.

Generate a polished, self-contained HTML page (`specs.html`) for browsing a Specflow project's
two-layer spec tree — both the developer specs under `.specflow/specs/` and the high-level
business specs under `.specflow/specs-business/`, plus the per-folder `_overview.md` docs that
explain each group, all parsed and rendered as a client-facing site with a Business⇄Developer
toggle, sidebar tree (folders surface their first-sentence summary as a subtitle, click a
folder to read its overview), search across spec content AND folder overviews, cross-link
sections (Implements / Implemented by) between the two layers, an "Unmapped" badge on dev specs
missing an `implements:` link to a business spec, acceptance-criteria cards, dependency chips,
and an optional test-status overlay. Use this skill PROACTIVELY whenever the user wants to
show, present, export, publish, share, or hand off Specflow specs in a browsable format —
including phrasings like "generate the spec viewer", "build the spec page", "make the HTML
specs", "render the spec tree", "export specs as HTML", "spec browser", "spec dashboard", "show
the business specs", "show the stakeholder view", "client-facing specs", "show the folder
overviews", "where are the unmapped specs", "show the business/dev split", or any request to
surface the mapping between business outcomes and developer implementation. Also trigger
whenever the user mentions showing specs to a client, stakeholder, partner, PM, designer, or
other non-developer audience in a Specflow project, or when they want to render `_overview.md`
group descriptions in a browsable form. If the user mentions specs AND any of {show, present,
export, publish, share, render, browse, deliver, ship, hand off, business specs, stakeholder
view, folder overview, mapping, unmapped, coverage}, reach for this skill rather than writing
custom HTML by hand.

## What this skill produces

Generates **one self-contained HTML file** that presents a Specflow project's full two-layer spec tree (business + developer) as a polished, client-facing documentation site. CSS, JS, all spec data, all folder overviews, and the cross-tree mapping inline into a single file — no server, no build, no external assets. The user double-clicks it and it works.

> **Cortex awareness:** on a Cortex project, the viewer MAY read the Purpose lines of
> the insight per-file entries (`.cortex/insight/anatomy/<path>.md`) to enrich
> rendering (e.g. file summaries alongside the specs that govern them). No Cortex
> reads are required — the spec trees remain the only mandatory input.

## When to use

Trigger whenever the user wants a browsable, shareable view of a Specflow project's specs — at either layer, or both. Typical phrasings:

- "Generate the spec viewer" / "build the spec page" / "make the HTML specs"
- "Show the business specs to the stakeholder" / "render the business view" / "client-facing specs"
- "Show the folder overviews" / "render the group descriptions"
- "Where are the unmapped specs?" / "show me the business→dev mapping" / "coverage view"
- "Render the spec tree" / "export specs as HTML" / "publish the specs"
- "Spec browser" / "spec dashboard" / "spec viewer"
- Anything about handing off, delivering, or sharing Specflow specs with a non-developer audience

Do NOT use for:
- Editing or generating spec Markdown itself (use the Specflow methodology skills)
- Running tests from acceptance criteria (this skill only *displays* test status if results are dropped in)
- Authoring `_overview.md` content (other Specflow skills emit those; this one renders them)

## What it produces

A single file (default: `specs.html` at the project root). Opening it gives the user:

1. **Business⇄Developer toggle** — a prominent header chip / segmented control switches between the two trees. Defaults to **Business** when both are present (clients are the larger audience for the rendered HTML); falls back to Developer if only `.specflow/specs/` exists.

2. **Sidebar tree with folder nodes** — the entire directory hierarchy of the active tree is rendered as collapsible nodes:
   - Each **folder** (root, every domain, every capability, any sub-folder) is a clickable node. Clicking it loads that folder's `_overview.md` (preferred) or `README.md` in the right pane. Folders without an overview render a placeholder ("No overview written for this group yet — add `_overview.md`") so the gap is visible.
   - Each folder shows its **first-sentence summary as a subtitle** under the folder name in the sidebar — clients get a glanceable map of what each group is for without expanding every node.
   - Each **leaf spec** (capability) sits under its folder with a status dot and title.
   - Status pills: draft / approved / implemented / deprecated.

3. **Top search bar** — full-text across spec IDs, intents, rules, acceptance criteria, entities, AND every folder's `_overview.md` body. Searching "authentication" matches a folder overview that says "this group covers authentication flows", not just spec titles. `/` or `⌘K` to focus. Results filter the tree and highlight matches in the main pane.

4. **Cross-link sections (Implements / Implemented by)** — when viewing a business spec, an "**Implemented by**" section lists every developer spec that links back via `implements:` (clickable chips that auto-switch to the Developer view and navigate). When viewing a dev spec, an "**Implements**" section lists the business specs it serves. **Unmapped badge**: any leaf dev spec with no `implements:` entry (when a business tree exists) shows a visible `Unmapped` badge in both the sidebar and the spec header — a flag for the spec author to fix.

5. **Main content pane** — renders differently based on spec type:

   **For developer specs:** header (ID, status, breadcrumb, mapping badge), Intent, Entities
   as data-flow chips (READS/WRITES/CREATES), Rules (numbered), Acceptance Criteria as
   Given/When/Then cards (the visual highlight), clickable dependency chips, Notes with
   `OPEN:` items called out.

   **For business specs:** header (ID, status, breadcrumb), Outcome (prominent lead paragraph),
   Who This Is For (persona callout block), User Journey (vertical step timeline with numbered
   cards — the visual centerpiece), Business Rules (numbered), Success Metrics (compact metrics
   panel), Out of Scope (muted, collapsible), Notes with `OPEN:` items.

   **For folder nodes:** the rendered `_overview.md` body, then a list of child folders/specs.

6. **Tests panel** per leaf dev spec — maps each acceptance criterion to its test. Shows pass/fail/duration if a `test-results.json` is present; otherwise shows criteria as "expected, no run yet". If test results include layer information (atomic/spec/journey/scenario), the panel groups results by layer.

7. **Scenario coverage panel** on the business tree — for each business spec, shows which scenario tests include it in their `covers:` list. Business specs not covered by any scenario are flagged with a "No scenario coverage" warning badge. If `tests/scenarios/specs/` exists, the viewer reads scenario spec files to build the coverage map. This is the visual counterpart to the coverage constraint: every business spec must appear in at least one scenario.

8. **Dashboard / home page** — project name and description (from `_index.md`), tooling manifest table, status breakdown, domain cards. If `link-map.md` is present, also a "Mappings" panel showing the business→dev edge table. If scenario specs exist, a "Scenario Coverage" summary showing N/M business specs covered.

Design: light theme default with dark-mode toggle, Inter for UI, Source Serif 4 for prose, JetBrains Mono for IDs/code. Muted status colours — no traffic-light red/yellow/green.

## How to run it

The skill's Python script walks `.specflow/specs/` (and `.specflow/specs-business/` if present), parses every Markdown file, and emits the HTML. From the project root:

```bash
python3 <skill-path>/scripts/build_viewer.py
```

Common flags:

```
--specs-dir <path>       # developer specs (default: ./.specflow/specs)
--business-dir <path>    # business specs (default: ./.specflow/specs-business)
--out <path>             # default: ./specs.html
--test-results <path>    # default: ./test-results.json if present
--link-map <path>        # default: ./link-map.md if present
--scenarios <path>       # default: ./tests/scenarios/specs if present
--title "My Project"     # overrides title pulled from .specflow/specs/_index.md
```

After running, print a short summary covering: dev spec count + status breakdown, folder-overview coverage (`N/M written`), business spec count + status breakdown (or "not present"), unmapped dev-spec count, link-map status, test-results status, and warning count.

## Expected project layout

```
<project-root>/
├── .specflow/specs/                          # developer specs (always required)
│   ├── _index.md                   # project index, tooling manifest, domain tree
│   ├── _overview.md                # root-level prose overview (sibling to _index.md)
│   ├── <domain>/
│   │   ├── _overview.md            # what this domain is, what it covers, why
│   │   └── <capability>/
│   │       ├── _overview.md        # capability-level overview
│   │       └── <leaf>.spec.md      # leaf spec (frontmatter: implements: biz.x)
│   └── ...
├── .specflow/specs-business/                 # business specs (OPTIONAL — surfaces stakeholder view)
│   ├── _overview.md                # what the business spec tree is about
│   ├── <domain>/
│   │   ├── _overview.md
│   │   └── <outcome>.business.md   # persona-prefixed (user-books-a-class.business.md)
│   └── ...                         #   frontmatter: implemented_by: [dev.x, dev.y]
├── link-map.md                     # OPTIONAL — emitted by specflow-onboard-codebase
├── test-results.json               # OPTIONAL — see test-results schema in references/
└── tests/
    └── scenarios/
        └── specs/                  # OPTIONAL — scenario spec markdown files for coverage
```

`_index.md` and `_overview.md` are distinct at the tree root: `_index.md` is the engineering manifest (tooling, domain tree, status counts) and is parsed for project metadata; `_overview.md` is the human-readable prose explaining what the tree contains. Both can coexist; the viewer renders them in different places (dashboard vs root-folder pane). The viewer never double-renders the same content.

## Spec Markdown format

Frontmatter (YAML):

```yaml
---
id: <domain>.<capability>          # e.g. platform.auth-login
status: draft | approved | implemented | deprecated
depends_on: [<domain>.<cap>, ...]  # within-tree dependencies; may be empty
implements: <biz-id>               # ON DEV SPECS — the ONE business spec this serves
implemented_by: [<dev-id>, ...]    # ON BUSINESS SPECS — dev spec IDs that fulfil it
---
```

`implements` is a single value (one business parent per dev spec). `implemented_by` is a list. The build script auto-completes back-links: if a dev spec declares `implements: biz.x` but `biz.x`'s frontmatter doesn't list it under `implemented_by`, the script adds the back-link in memory and records a soft warning so the author knows to update the source. Same logic in the reverse direction.

Body sections — **developer specs** (all optional individually — the parser is defensive):

- `## Intent` — prose, Markdown-rendered
- `## Entities` — READS/WRITES/CREATES reference format. Rendered as a data-flow section
  showing which entities the spec touches and how (reads, writes, creates). Specs reference
  entities by name — they do NOT define schemas. The viewer renders these as labeled chips
  or a compact table, not a raw bullet list.
- `## Rules` — numbered list (the viewer preserves numbering for cross-referencing with tests)
- `## Acceptance Criteria` — `### Title` per criterion, then `**Given** … **When** … **Then** …`
  bullets (also `**And**`, `**And when**`, `**And then**`). Rendered as visually distinct cards —
  the highlight of the developer view.
- `## Notes` — bullet list; items prefixed `OPEN:` are highlighted as open questions

Body sections — **business specs** (distinct from dev specs — no schemas, no criteria):

- `## Outcome` — prose paragraph describing the change in the user's world when this is
  delivered. Rendered prominently as the lead section — this is what stakeholders read first.
- `## Who This Is For` — the persona(s) involved. Rendered as a highlighted callout block
  (persona names in bold) so readers immediately see who this outcome serves.
- `## User Journey` — numbered steps describing what the user does or experiences. Rendered
  as a vertical step timeline with step numbers, not as a raw numbered list. Each step shows
  as a distinct card. This is the visual centerpiece of the business view — it makes the
  journey tangible.
- `## Business Rules` — numbered rules in domain language. Rendered the same as developer
  Rules (numbered, cross-referenceable).
- `## Success Metrics` — measurable outcomes. Rendered as a compact metrics panel
  (label + target value).
- `## Out of Scope` — what this outcome does NOT cover. Rendered as a muted, collapsible
  section — important for clarity but not the focus.
- `## Notes` — same as developer specs: `OPEN:` items highlighted.

**The parser distinguishes dev specs from business specs by file extension:** `.spec.md`
= developer, `.business.md` = business. Each type renders its own set of sections. The
viewer does NOT warn about missing `## Acceptance Criteria` on business specs or missing
`## User Journey` on dev specs — these belong to different layers.

See `references/spec-parsing.md` for the exact parser contract and edge cases.

## Folder overview format

`_overview.md` (or `README.md`) in any directory under `.specflow/specs/` or `.specflow/specs-business/`:

```markdown
# Authentication

This group covers everything related to user identity — login, signup,
password reset, session management, and OAuth provider integrations.

It exists as a group because all auth flows share the same session
primitives and the same audit log emitter, so changes here often touch
multiple capabilities at once.

## Capabilities
- `auth-login` — email + password sign-in
- `auth-signup` — new account creation
- ...
```

The first paragraph's first sentence becomes the **sidebar subtitle** for the folder — keep it short (one sentence answering "what is this group?"). The rest of the body is rendered when the user clicks the folder node.

`_overview.md` is preferred over `README.md` for two reasons: the leading underscore sorts it to the top of most file browsers (clients see it first), and it doesn't collide with a project's existing top-level `README.md`. `README.md` is accepted as a fallback so projects already using that convention don't need to rename anything.

## Test-results format

Native JSON schema (primary):

```json
{
  "generated_at": "2026-04-16T12:00:00Z",
  "runner": "jest",
  "results": [
    {
      "spec_id": "platform.auth-login",
      "criterion": "Successful bi-user login",
      "status": "pass",
      "file": "tests/integration/platform/auth-login.test.ts",
      "duration_ms": 142,
      "message": ""
    }
  ]
}
```

Matching rule: `spec_id` + `criterion` (case- and whitespace-insensitive) joins to a leaf dev spec's id and an Acceptance Criteria `### Heading`. Test results are ignored on the business tree (business specs have no acceptance criteria). Unmatched results surface under an "Orphan results" section on the dashboard.

## link-map.md (optional)

When `specflow-onboard-codebase` reverse-engineers an existing codebase, it emits a `link-map.md` at the project root containing the canonical business↔dev mapping. The viewer reads it if present and folds its edges into the cross-link graph **additively** — frontmatter remains the source of truth for any edge it explicitly declares; the link map only adds edges. Edges added from the link map are recorded as soft warnings so authors see where the ground truth came from.

Format: a fenced YAML block with a `mappings:` array, OR a Markdown table with `| Business | Dev |` columns.

## Execution flow

When the user triggers this skill:

1. Confirm (or discover) the project root. Default: current working directory.
2. Sanity-check that `.specflow/specs/` exists. If not, tell the user and stop — don't invent specs.
3. Detect `.specflow/specs-business/`. If present, both trees are loaded and the viewer defaults to the Business toggle.
4. Detect `link-map.md`. If present, fold its edges into the cross-link graph.
5. Run the build script with sensible defaults; override only what the user asked for.
6. Report back the summary lines (dev specs, business specs, overview coverage, unmapped count, link-map status, test results, warnings).
7. Offer to open it (macOS `open`, Linux `xdg-open`).

## Parse warnings

The script emits non-fatal warnings when a spec is malformed — missing frontmatter, unknown status, `depends_on` pointing at a spec that doesn't exist, acceptance criterion missing a `Then`, `implements:` referencing an unknown business spec, an unmapped leaf dev spec when a business tree exists, or a back-link silently auto-completed by the script. These go to stderr and are also embedded into the HTML dashboard under a "Spec health" panel so the user (and the client) can see what needs cleaning up. Warnings never fail the build — the viewer should always produce output.

## Editing the skill

If the user asks to change the layout, add a new panel, or tweak styling, most changes live in `assets/template.html`. The Python script only touches the template at three named placeholders:

- `/*__SPEC_DATA__*/` — a JSON blob injected as a JS `const SPEC_DATA = {...}` (contains both trees, all overviews, and the link map)
- `/*__TEST_RESULTS__*/` — JSON blob for test results (empty object if none)
- `<!--__TITLE__-->` — project title for `<title>` and header

Keep the template valid HTML/CSS/JS so a dev can open it standalone during iteration (without spec data it'll just show an empty shell).

## Dependencies

- Python 3.9+
- `PyYAML` (for frontmatter)
- No other Python deps
- Plain HTML/CSS/JS in the output — no runtime framework, no graph library

## What NOT to do

- ❌ Don't produce multiple files — the whole point is one self-contained HTML.
- ❌ Don't add a runtime framework (React, Vue, Tailwind runtime). Plain HTML/CSS/JS only.
- ❌ Don't hard-code project names, domains, or capability lists — everything is driven by the parsed trees.
- ❌ Don't crash on missing optional fields (`implements`, `_overview.md`, business tree, link map). Render anyway; warn to stderr.
- ❌ Don't invent test results, mappings, or overview content. If something is missing, say so clearly in the UI.
- ❌ Don't introduce a heavy graph library to render dependencies or mappings. Indented lists + chips + tables are enough.
- ❌ Don't double-render `_index.md` and `_overview.md` at the tree root — they have distinct purposes (manifest vs prose).

## Quick examples

**Example 1** — User says: "Can you generate the spec viewer for this project?"
→ Run `python3 scripts/build_viewer.py` from the project root. Report the summary.

**Example 2** — User says: "I want to send the business specs to the partner before Friday."
→ Same flow. The viewer defaults to Business when `.specflow/specs-business/` exists, so the partner lands on the right view immediately. Note that the single file is what they send.

**Example 3** — User says: "Show me which dev specs aren't mapped to a business outcome yet."
→ Same flow. The viewer surfaces an `Unmapped` badge in the sidebar and spec header for every leaf dev spec without an `implements:` entry; the dashboard's Spec Health panel rolls them up.

**Example 4** — User says: "Can you regenerate with the latest test results?"
→ Check for `test-results.json`; if present the script picks it up automatically. Test status overlays only on the developer tree.

**Example 5** — User says: "Add an overview for the auth domain so the client can see what it covers."
→ This skill *renders* overviews, it doesn't author them. Hand off to the appropriate Specflow skill, then re-run the viewer.
