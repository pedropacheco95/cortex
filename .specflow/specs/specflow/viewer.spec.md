---
id: specflow.viewer
status: draft
depends_on:
  - specflow.index
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "src/specflow/view/**/*.ts"
---

# `cortex specs view`: the static spec site

## Intent

People read specs in a browser. The specflow-viewer skill already builds its page with a script, so an agent adds nothing. It becomes a Core command: same page, no Python, no tokens, and it shows what the index knows, including which criteria are `unverified`.

## Entities

- **READS:** the `specflow.index` model, `specflow/**`, the `_overview.md` files.
- **WRITES:** one HTML file, default `specs.html` at the repository root.
- **CREATES:** nothing else.

## Rules

1. `cortex specs view [--out <file>] [--title <text>]` writes one self-contained HTML file and prints its path and counts of specs, criteria and `unverified`. The title defaults to the repository folder name. Exit 0 on success, 1 when `specflow/` does not exist, 2 on a usage error.
2. **Port.** The generator moves from `skills/specflow-viewer/scripts/build_viewer.py` to TypeScript in Core, and `assets/template.html` moves with it into Core's package assets. Python and PyYAML are not needed.
3. **Self-contained.** The file loads nothing from the network: no fonts, scripts or stylesheets by URL. The template's Google Fonts links are removed in favour of system fonts. The file opens from disk.
4. **What it shows,** carried from the skill: a Promises ⇄ Implementation toggle (the old Business ⇄ Developer one) defaulting to Promises; a collapsible sidebar tree with each folder's first sentence; a folder's overview on click; status pills, `retired` included; full-text search over specs and overviews; links between a spec and its promise, both ways; Given/When/Then cards; READS/WRITES/CREATES chips; dependency chips; a dashboard with a status breakdown and area cards; light and dark themes.
5. **What it adds.** Each criterion shows its id, an `unverified` badge when marked, and its tagged tests. The dashboard shows tagged and `unverified` counts, untagged tests, and the constants with their files.
6. **What it drops.** Test results (`--test-results`, `--discover-tests`), the link map and the scenario panel go: Core runs no tests, and the tagged tests in the index replace the discovered ones.
7. **Deterministic.** The same tree gives the same bytes: no timestamp in the output.
8. A file that cannot be parsed is shown with a warning badge, and a warning goes to stderr. It never stops the build.
9. `specs.html` is a build output. The command adds it to `.git/info/exclude` when `--out` is not given.

## Acceptance Criteria

### One file is written

- **Given** a ported tree with 2 specs and 3 criteria
- **When** `cortex specs view` runs
- **Then** it exits 0, `specs.html` exists, and stdout names it with `2 specs`, `3 criteria`

### The output path can be chosen

- **Given** the same tree
- **When** `cortex specs view --out /tmp/x/site.html --title Demo` runs
- **Then** that file exists and its `<title>` holds `Demo`

### No folder exits 1

- **Given** a repository with no `specflow/`
- **When** `cortex specs view` runs
- **Then** it exits 1 with `specflow: no specflow/ folder here`

### A bad flag is a usage error

- **Given** a ported tree
- **When** `cortex specs view --nope` runs
- **Then** it exits 2 and writes nothing

### Nothing loads from the network

- **Given** a built `specs.html`
- **When** its text is searched for `http://`, `https://` and `//fonts` inside `src=`, `href=` and `@import`
- **Then** none is found

### It runs with no Python

- **Given** a `PATH` holding no `python3`
- **When** `cortex specs view` runs
- **Then** it exits 0

### Criteria carry their id and mark

- **Given** `BILLING-REFUNDS-1` with a tagged test and `BILLING-REFUNDS-2` with none
- **When** the page data is read
- **Then** the first lists its test, and the second has `unverified: true`

### The dashboard counts match the index

- **Given** any tree
- **When** the page data and `cortex specs index --json` are compared
- **Then** the tagged, `unverified`, untagged and constants counts are equal

### Promises and specs link both ways

- **Given** a spec with `serves: [P-BILLING-1]`
- **When** the page data is read
- **Then** the spec links to the promise and the promise lists the spec

### A retired spec shows its status

- **Given** a spec with `status: retired`
- **When** the page data is read
- **Then** its status is `retired`

### The same tree gives the same bytes

- **Given** a tree
- **When** `cortex specs view` runs twice
- **Then** the two files are identical

### A broken file does not stop the build

- **Given** one spec with frontmatter that does not parse
- **When** `cortex specs view` runs
- **Then** it exits 0, stderr names the file, and the page lists it with a warning

### The output stays out of git

- **Given** a default run
- **When** `git status --porcelain` runs
- **Then** `specs.html` is not listed

## Notes

- 1,268 lines of Python and a 1,600-line template move; this is the largest single port in the Core batch by line count. The survey found no test pinning `build_viewer` or `specs.html`.
- Visual checks are by eye; the criteria read the embedded page data, not pixels.
