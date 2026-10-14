---
id: store.migrate
status: draft
depends_on:
  - store.layout
  - store.validate
  - store.map
  - store.managed-block
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/migrate/**/*.ts"
  - "src/cli/sync.ts"
  - "src/cli/init.ts"
---

# `cortex migrate`: 3.x → 4.0

## Intent

Existing 3.x stores must move to the 4.0 layout without losing knowledge (vision §6). The migration is deterministic. Where a call needs judgement, it takes a default and flags the entry `review`. An optional plan file, written by an agent or a person, overrides any default. Before anything is written, a coverage report shows where every 3.x entry goes. The old store stays until the user accepts.

## Entities

- **READS:** `.cortex/**` (including gitignored `pulse/` and `atlas/sources/`), and an optional plan file.
- **WRITES:** the report (stdout, or `--report <file>`); with `--apply`, `cortex/**` and the `.gitignore` line; with `--accept`, the managed blocks and `cortex/cortex.json` `migration.accepted`.
- **NEVER WRITES:** anything under `.cortex/`.

## Rules

1. **Entries.** The source is split into entries, per schema S9.3's coverage unit. Each entry has a stable ref: `<3.x path>` for single-subject files, `<3.x path>#<n>` (1-based) for list items and sections, `<path>#<id>` for intent entries, `S-NNN` and `G-NNN`.
2. **Dispositions.** Every entry gets exactly one disposition, per the S9.3 mapping table: `migrated → <path>`, `retired`, `dropped by decision`, or `pending decision`. Coverage = entries with a disposition / all entries. An entry no table row matches is listed `unmapped`, counts against coverage, and makes `--apply` refuse.
3. **Plan file.** `--plan <file>` is JSON `{ "<entry ref>": "<target path under cortex/>" | "retired" }`. A plan target overrides the default and clears its `review` flag. A plan ref that matches no entry is an error. A target that violates `store.validate` naming or layout is also an error.
4. **Content.** A migrated entry keeps its text verbatim in the body. Its 3.x id and any old filename stem go to `aliases`. Its frontmatter is mapped:
   - `about` from `title`, `term` or `name`;
   - `verified` from the 3.x date fields (`date`, `opened`, `updated`, `captured`), with method `told` for decisions, terms and rules and `observed` for bugs, evidence and observations;
   - `permanence` from its module (`world` and `code` → `changing`, `history` → `stable`, `now` → `volatile`);
   - `governs` globs → `match.paths`;
   - `affects` paths → `need`;
   - `origin` → `migrated:<entry ref>@<short sha of HEAD at apply>`, one value per entry merged into the file (Rule 5).
   The 3.x citation graph (`provenance:` / `derives_from:`) is carried into `origin` by Rule 13.
5. **Merging into one file.** Several entries that target the same file are appended as `##` sections in source order, the file's `origin` lists each entry's `migrated:` value in the same order, and the report lists each.
6. **Coverage report** (markdown, or `--json`): totals by disposition; a table of every entry (ref, disposition, target, flags, provenance refs resolved/total); the `review` list; the `pending decision` list with each proposal's first line; the `dropped by decision` section (Rule 12); the `unresolved provenance` section (Rule 13); the `unmapped` list; the retired 3.x config keys; the visibility findings on migrated text; and the command to remove `.cortex/` after acceptance.
7. **Dry run is the default.** Without `--apply`, nothing is written except the report file if `--report` is given.
8. **`--apply`** writes `cortex/` (refusing if `cortex/` exists with files not written by a previous apply of the same inputs), runs `cortex store map` (which leaves a 3.x block alone), and then runs `cortex store validate`, printing its result. It is re-runnable: the same inputs give a byte-identical tree.
9. **`--accept`** requires a previous `--apply`. It records `"migration": { "from": "<3.x version>", "accepted": "<date>" }` in `cortex/cortex.json` and rewrites the managed blocks to 4.0. It deletes nothing.
10. **Never dropped.** Pending proposals (`S-NNN` whose status is pending, `G-NNN`) go to `now/proposals.md`. Each is one item: a heading `## <id>: <first line>`, then `until: <apply date + 30 days>`, then `status: pending decision`, then its full text. They also appear in the report's `pending decision` list. What happens when they expire unreviewed is specified in `store.freshness` Rule 2.
11. **The 3.x commands leave a 4.0 block alone.** When `cortex/cortex.json` exists with a 4.0 `schemaVersion`, the 3.x `cortex sync` and `cortex init` never write the `CLAUDE.md` or `AGENTS.md` managed block. They print `managed block owned by the 4.0 store (cortex/); left untouched` and otherwise behave as before on `.cortex/`. This is the one change this spec makes to the 3.x code path. Acceptance therefore cannot be undone by a scheduled `sync`.
12. **Insight is dropped by decision** (2026-10-14; schema S9.3). The 3.x inferred code summaries are neither migrated nor kept: `insight/anatomy/**`, `insight/concepts/**` and the insight graph with its indexes (`insight/{graph,tags,clusters,reverse-index,ledger}.json`). Each file is one entry with disposition `dropped by decision`, so coverage still reaches 100%. The report shows them as one row per group (anatomy, concepts, graph) with a file count, not one row per file, and prints the removal command (`git rm -r -q .cortex/insight/anatomy .cortex/insight/concepts` plus the five graph files). `migrate` never runs it, with or without `--apply` or `--accept`. `insight/observations/*` is not dropped: each observation migrates under its own row of the mapping table.
13. **The citation graph becomes origin.** For every migrated entry, each 3.x provenance reference (each `derives_from:` under `provenance:`, and a top-level `derives_from:` if present) is resolved, and its origin value is appended to the new file's `origin` after the entry's own `migrated:` value, in source order, without duplicates:
   - a target that is (or migrates to) a `history/sources/` digest (`archive/documents/*`, `atlas/sources/*`) → `source:history/sources/<its digest>.md`;
   - a target that is another migrated 3.x entry (a decision, rule, bug, term, …) → `migrated:<that entry's ref>@<sha>`;
   - a `claude-sessions/<user>/<id>` reference → `session:<id>` (the user segment is dropped, RULES.md rule 20).
   A target that does not exist, or that is retired or dropped by decision, is **unresolved**: it adds nothing to `origin` and is listed in the report's `unresolved provenance` section as `<entry ref> → <old target path>`. Each reference is counted once per entry, so the report gives `provenance refs: <resolved>/<total>`, and the plan file does not override this rule. An unresolved reference does not lower entry coverage, because the entry itself has a disposition; it is shown so that a person can repair it.

## Acceptance Criteria

### Every entry is accounted for in a dry run

- **Given** a 3.x fixture store with one rule, one resolved bug, one open bug, a 3-item `preferences.md`, two decisions, one term, one evidence file, one intent entry, one pending `S-NNN`, one insight observation, and an insight anatomy tree, concepts folder and `graph.json`
- **When** `cortex migrate` runs
- **Then** the report lists every entry, coverage is 100%, and no file outside the report is written

### Defaults follow the mapping table

- **Given** the same fixture
- **When** `cortex migrate` runs
- **Then** the rule → `world/rules/<slug>.md` (flagged review); the resolved bug → `history/incidents/<opened>-<slug>.md`; the open bug → `code/<area>/<slug>.md`; the decision → `world/decisions/<slug>.md` plus `history/changes/<date>-<slug>.md`; the intent entry → `history/changes/` with `kind: change-request` and its status kept; the observation → `code/<area>/<slug>.md` (flagged review); the anatomy, concepts and graph files → `dropped by decision`

### Insight summaries are dropped by decision, counted, and left on disk

- **Given** the fixture, with 3 anatomy files, 2 concept files and `insight/graph.json`
- **When** `cortex migrate --apply` runs, and then `cortex migrate --accept`
- **Then** the report's `dropped by decision` section shows anatomy 3, concepts 2 and graph 1, prints the removal command, and coverage is 100%
- **And** no file under `cortex/` comes from them, every one of those 6 files still exists under `.cortex/insight/`, and the observation was migrated

### The 3.x citation graph is carried into origin

- **Given** the fixture's decision with `provenance: [{derives_from: archive/documents/brief.md}, {derives_from: atlas/decisions/2026-01-01-gone.md}]`, where `brief.md` migrates to `history/sources/2026-01-02-brief.md` and `2026-01-01-gone.md` does not exist; and the rule with `provenance: [{derives_from: <that decision's path>}]`
- **When** `cortex migrate --apply` runs
- **Then** the decision's `origin` is `[migrated:<its ref>@<sha>, source:history/sources/2026-01-02-brief.md]`, the rule's `origin` ends with `migrated:<the decision's ref>@<sha>`, and the report lists `<decision ref> → atlas/decisions/2026-01-01-gone.md` under `unresolved provenance` and shows `provenance refs: 2/3`

### Migrated files carry their 3.x origin

- **Given** the fixture, whose `HEAD` short sha is `<sha>`
- **When** `cortex migrate --apply` runs
- **Then** the migrated term has `origin: [migrated:atlas/domain/<term>.md@<sha>]`, and `world/agreements/working-preferences.md` has three `migrated:compass/preferences.md#1..#3@<sha>` values in source order

### Multi-entry files count per entry

- **Given** `preferences.md` with 3 bullets
- **When** `cortex migrate` runs
- **Then** the report has 3 entries `compass/preferences.md#1..#3`

### Unmapped entries block apply

- **Given** a file `.cortex/atlas/unknown-kind/x.md` that no row matches
- **When** `cortex migrate --apply` runs
- **Then** the report lists it as `unmapped`, coverage is below 100%, nothing is written, and the exit code is 1

### A plan file overrides a default

- **Given** a plan `{ "insight/observations/jev-evaluation.md": "world/systems/jev.md" }`
- **When** `cortex migrate --plan plan.json` runs
- **Then** that entry targets `world/systems/jev.md` with no review flag

### A bad plan is refused

- **Given** a plan naming the ref `compass/nope.md`, or targeting `world/misc/x.md`
- **When** `cortex migrate --plan plan.json` runs
- **Then** it exits 1 naming the bad ref or target

### Apply writes a valid store and keeps the old one

- **Given** the fixture
- **When** `cortex migrate --apply` runs
- **Then** `cortex/` exists, `cortex store validate` reports no errors, every migrated entry's text is present at its target, and `.cortex/` is byte-identical to before

### Apply is re-runnable

- **Given** `cortex migrate --apply` has run
- **When** it runs again with the same inputs
- **Then** the `cortex/` tree is byte-identical

### Pending proposals are carried over, not dropped

- **Given** a pending `S-021` in `pulse/suggestions.md`
- **When** `cortex migrate --apply` runs
- **Then** `now/proposals.md` contains its full text with an `until:` 30 days after the apply date, and the report lists it under `pending decision`

### 3.x sync and init leave the 4.0 block untouched

- **Given** an accepted migration (a v4.0 block in `CLAUDE.md`, and `cortex/cortex.json` at 4.0) and the 3.x store still present
- **When** the 3.x `cortex sync` runs, and then `cortex init` runs
- **Then** the `CLAUDE.md` and `AGENTS.md` blocks are byte-identical to before, and each command prints that the block is owned by the 4.0 store

### Accept switches the blocks and deletes nothing

- **Given** an applied migration and a `CLAUDE.md` with a v3.4 block
- **When** `cortex migrate --accept` runs
- **Then** `CLAUDE.md` holds the v4.0 block, `cortex/cortex.json` records the acceptance date, and `.cortex/` still exists
