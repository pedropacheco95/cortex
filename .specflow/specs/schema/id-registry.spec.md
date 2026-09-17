---
id: schema.id-registry
status: implemented
depends_on:
  - schema.validator
  - core-cli.sync
  - pulse.threads
  - pulse.review-cli
governs:
  - "src/compass/registry.ts"
  - "src/schema/checks/registry.ts"
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by:
  - R-001
provenance:
  - derives_from: archive/documents/parallel-wave-brief-2026-09-14/extracted/asks.md
---

# The Id Registry — `.cortex/compass/registry.md` and `cortex id next`

## Intent

Rule and bug ids are sequential, and every writer today allocates "the next number after the
highest on disk" (`pulse.threads` Rule 12, `insight.session-observe` Rule 5, the specflow-bugs
skill). On one branch that is fine. On six parallel branches every session reaches for the same
next number, the collision is invisible until the branches meet, and — because two files with one
id pass `cortex validate` (B-019) — it stays invisible after they meet. The external wave brief
(§2.2, ask A-11) offered two schemes: slug-as-identity, or an append-only registry whose merge
conflict is the alarm. This spec takes the registry, the least invasive of the two: ids stay
sequential and human-readable, filenames and frontmatter do not change, and one small committed
file — one line per issued id — makes a double allocation a merge conflict by construction. Every
Core writer allocates through it; the validator errors when a file's id is not in it; `cortex sync`
creates it once from the files that already exist. Schema 3.4, fifth revision in place (§4.1,
§4.2, §10.4, Appendix A `check.id-registry`).

## Entities

- **READS:** `.cortex/compass/registry.md`; `.cortex/compass/rules/R-*.md` and
  `.cortex/compass/bugs/B-*.md` filenames and `id` frontmatter (the check and the migration).
- **WRITES:** `.cortex/compass/registry.md` — append one line per allocation (`cortex id next`,
  `cortex thread promote --to compass/bugs`, `cortex pulse-accept` landing a new rule file);
  create it once (`cortex sync`, `cortex init`).
- **CREATES:** the registry file.

## Rules

1. **The file.** `.cortex/compass/registry.md` is committed (RULES.md rule 15: compass is durable
   knowledge) and has this exact shape — a fixed header, a blank line, then one line per issued
   id in the form `<id> <slug>`, rules first then bugs, each kind in ascending numeric order:
   ```markdown
   # Id registry — append-only

   One line per issued rule or bug id: `<id> <slug>`. Allocate by appending the next number
   at the end of its kind's block; never renumber, reorder or delete a line. A merge conflict
   in this file is the point — two branches issued the same id.

   R-001 core-no-llm-calls
   R-002 bugs-seven-type-taxonomy
   B-001 prewrite-path-match-noise
   ```
   `<id>` is `R-NNN` or `B-NNN` (`\d{3,}`); `<slug>` is `[a-z0-9-]+`, informational, or the
   literal `reserved` when the id was issued before its file was named. Blank lines and lines
   starting `#` are ignored. Header text is `REGISTRY_HEADER` in `src/compass/registry.ts`,
   exported so the migration and the tests share it.

2. **Allocation is an append.** `allocateId(root, kind: 'rule' | 'bug', slug?: string): string`
   reads the registry, takes the highest number of that kind **across the registry and the
   files on disk** (a file that predates the registry still counts), appends `<next> <slug or
   reserved>` at the end of that kind's block (after the last `R-` line for a rule, at the end
   of the file for a bug), writes the file back, and returns the id. Numbers are zero-padded to
   three digits and never reused: a deleted file does not free its id, and a registry line
   outlives its file. When the registry is absent, `allocateId` **creates it** with the header
   and every id already on disk (Rule 6's migration, inline), then allocates — so a writer on a
   pre-registry project never silently falls back to the old scheme.

3. **`cortex id next rule|bug [--slug <slug>]`.** The human verb over Rule 2: allocates and
   prints the id alone on stdout (`R-004`), so a skill or a shell can capture it. Without
   `--slug` the line is written `reserved`. A missing or unknown kind, or an unknown flag,
   prints a one-line usage to stderr and exits **2**, nothing written. No `.cortex/` → exit 1
   naming `cortex init`. The verb joins `USAGE_TABLE` (`src/cli/cli.ts`; `core-cli.init` Rule 18
   keeps the docblock mirror in step).

4. **Every Core writer allocates through Rule 2.** `cortex thread promote --to compass/bugs`
   (`pulse.threads` Rule 12) replaces its `nextBugId` with `allocateId(root, 'bug', slug)`.
   `cortex pulse-accept` landing a `rule-candidate` whose target is a **new**
   `.cortex/compass/rules/R-NNN-<slug>.md` file (`pulse.review-cli` Rule 4) appends the file's
   id to the registry in the same run — a human act writing compass, the same standing as the
   accept itself; if that id is **already registered** under a different slug, accept refuses
   (exit 1) naming the registered line and `cortex id next rule`, and nothing lands. Loops never
   touch the registry (RULES.md rule 7): `insight.session-observe` Rule 5's drafted rule target
   reads it (its "next unused" becomes "next after the highest of registry and disk") but the
   line is written only when the proposal is accepted. Decisions and evidence are date-slugged
   and threads and suggestions have machine-owned counters (`pulse/state/thread-counter`,
   `pulse/state/suggestion-counter`); none of them registers here.

5. **`check.id-registry` (schema Appendix A; fifth revision).** Runs over `compass/rules/` and
   `compass/bugs/` with the registry:
   - registry **absent** while at least one rule or bug file exists → one `warning` naming
     `cortex sync` (the migration); a project with neither files nor registry is silent;
   - a line that is neither blank, a `#` comment, nor `<id> <slug>` in Rule 1's grammar →
     `error` with the line number;
   - the same id on two lines → `error` naming both line numbers;
   - a rule or bug file whose `id` is **not** on any line → `error` naming the file and
     `cortex id next <kind>` (a file that skipped allocation is exactly the collision this
     spec exists to catch);
   - a line whose id has **no file** → `warning` (the file may be on another branch, or the id
     was reserved and not yet used) — never an error;
   - a line out of ascending order within its kind, or a bug line above a rule line → `warning`
     (the file was hand-edited; nothing is wrong yet).
   Read-only, like every check.

6. **Migration on `cortex sync` and scaffolding on `cortex init` (schema §10.4).** `cortex sync`
   gains one step (`core-cli.sync` Rule 15): when `.cortex/compass/registry.md` is absent it is
   created from the `R-*.md` and `B-*.md` files present, in Rule 1's order, and the summary
   names it; when present it is left untouched — never regenerated, never re-sorted. `cortex
   init` writes the header-only registry on a fresh project (`core-cli.init` Rule 3's skeleton).
   Neither ever removes a line.

7. **Skills allocate the same way.** `specflow-bugs` and `specflow-spec-editor` (when it creates
   a compass rule) run `cortex id next bug|rule --slug <slug>` instead of listing the directory
   for the highest number; the skill text says so in one sentence each. A skill that cannot run
   the CLI appends the line by hand in Rule 1's shape — the check catches the omission either
   way.

8. **Deterministic Core** (R-001): file reads, a numeric max, one append. No LLM, no network,
   no subprocess — in particular no `git`; the merge conflict is git's, not ours.

## Acceptance Criteria

### Allocation appends the next id in its kind's block

- **Given** a registry listing `R-001`–`R-003` and `B-001`–`B-019`, and no higher-numbered file
  on disk
- **When** `allocateId(root, 'rule', 'no-secrets-in-compass')` then `allocateId(root, 'bug')` run
- **Then** the returns are `R-004` and `B-020`, the file's rule block ends
  `R-004 no-secrets-in-compass` immediately before `B-001`, its last line is `B-020 reserved`,
  and every pre-existing line is byte-identical

### A file that predates the registry still raises the floor

- **Given** a registry whose highest bug line is `B-019` and a file
  `compass/bugs/B-021-orphan.md` not listed in it
- **When** `allocateId(root, 'bug', 'x')` runs
- **Then** the return is `B-022`, not `B-020`

### An absent registry is created on first allocation

- **Given** a project with three rule files and nineteen bug files and no registry
- **When** `allocateId(root, 'bug', 'new')` runs
- **Then** `.cortex/compass/registry.md` exists, begins with `REGISTRY_HEADER`, lists the three
  rules then the nineteen bugs by their filenames' slugs, and ends `B-020 new`

### `cortex id next` prints the id and reserves it

- **Given** an initialised project
- **When** `cortex id next rule` runs, then `cortex id next bug --slug flaky-tier`
- **Then** stdout is `R-004` and then `B-020`, exit 0 each, and the registry's new lines read
  `R-004 reserved` and `B-020 flaky-tier`

### Bad grammar is exit 2 and writes nothing

- **Given** any project
- **When** `cortex id next`, `cortex id next thread` and `cortex id next rule --force` run
- **Then** each exits 2 with a usage line on stderr and the registry is byte-identical

### A file missing from the registry is an error naming the remedy

- **Given** a registry without `B-019` and a file `compass/bugs/B-019-x.md` with `id: B-019`
- **When** `cortex validate` runs
- **Then** the report carries one `check.id-registry` error naming the file and
  `cortex id next bug`

### A registered id without a file is a warning, not an error

- **Given** a registry line `R-009 reserved` and no `R-009` file
- **When** `cortex validate` runs
- **Then** the report carries one `check.id-registry` warning naming `R-009` and zero errors from
  that check

### Duplicate and malformed lines are errors

- **Given** a registry with `B-004 a` on two lines and a line `R-05 short`
- **When** `cortex validate` runs
- **Then** the report carries two `check.id-registry` errors, one naming both line numbers of
  `B-004` and one naming the malformed line

### An absent registry warns only when there is something to register

- **Given** in turn: a project with rule files and no registry, and a fresh project with no
  rules, no bugs and no registry
- **When** `cortex validate` runs against each
- **Then** the first report carries one `check.id-registry` warning naming `cortex sync`; the
  second carries no `check.id-registry` violation

### Promote allocates through the registry

- **Given** a registry ending `B-019 x` and an open thread `T-008`
- **When** `cortex thread promote T-008 --to compass/bugs --type test-defect --affects src/a.ts`
  runs
- **Then** the drafted file is `compass/bugs/B-020-<slug>.md`, the registry's last line is
  `B-020 <slug>`, and `cortex validate` reports no `check.id-registry` violation

### Accept registers a new rule file, and refuses a taken id

- **Given** a pending `rule-candidate` `S-031` proposing a new file
  `.cortex/compass/rules/R-004-x.md` with `id: R-004`, and a registry ending `R-003 …`
- **When** `cortex pulse-accept S-031` runs
- **Then** the file lands and the registry gains `R-004 x`; and given instead a registry already
  carrying `R-004 other`, the accept exits 1 naming that line and `cortex id next rule`, the
  proposal stays pending, and no file is written

### Sync creates the registry once and never rewrites it

- **Given** an existing project with three rules, nineteen bugs and no registry
- **When** `cortex sync` runs twice
- **Then** after the first run the registry lists all twenty-two ids in Rule 1's order and the
  summary names it; after the second run the file is byte-identical and the summary reports it
  already present

## Notes

- **Why a registry and not slug identity.** Slug-as-identity (`R-<slug>`) would change every
  filename, every `id:`, every `source:`/`affects:`/`governed_by:` reference and the
  constellation's content-keyed node prefixes — a MAJOR by §10.2 — to solve a problem that one
  committed text file solves at zero migration cost. The brief's author reached for random
  revision ids in their own migrations for the same reason; here the sequential id is worth
  keeping because humans say "B-019" out loud.
- **Why the merge conflict is the feature.** Two branches that each append `R-027` at the end of
  the rule block conflict on the same lines; git refuses the merge until a human renumbers one.
  That is the loudest signal available without a server, and it fires at the moment the branches
  meet rather than a week later in a validator nobody ran.
- **The machine counters have the same exposure.** `pulse/state/thread-counter` and
  `pulse/state/suggestion-counter` are per-worktree files under a gitignored directory: two
  worktrees of one project allocate `T-012` and `S-031` independently and nothing conflicts
  because nothing is merged. Threads and suggestions are transient and machine-owned, so a
  collision costs a mis-pointed `Open:` line, not a mis-cited rule — deliberately not solved
  here; recorded so the next person does not rediscover it (OPEN).
- **Slug is informational.** The check never compares a line's slug to the file's slug: renaming
  a file is a human edit that should not trip validation, and the id is the identity.
- **Layout.** The registry is one more committed compass file; schema §1's layout tree should
  gain the line (not edited in this pass — flagged for the schema owner).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
