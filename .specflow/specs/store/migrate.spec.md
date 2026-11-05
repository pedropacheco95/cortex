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
  - "src/cli/scaffold.ts"
---

# `cortex migrate`: 3.x → 4.0

## Intent

Existing 3.x stores must move to the 4.0 layout without losing knowledge (vision §6). The migration is deterministic. Where a call needs judgement, it takes a default and flags the entry `review`. An optional plan file, written by an agent or a person, overrides any default. Before anything is written, a coverage report shows where every 3.x entry goes. The old store stays until the user accepts.

Amendment 2026-10-19 (foreign stores): dry runs on three real 3.x stores reached 16–18% coverage, and they showed that `--apply` would corrupt binary raws and silently lose others. Pedro's rule for this amendment is "we cannot abide losing information" (Rules 15–19). The judgement stays out of Core: the `cortex-migrate` skill (`store.migrate-skill`) writes the plan.

Amendment 2026-11-04 (Specflow; owner decision: migration also fixes a project's own skills): a project's other skills still name retired skills and old paths, and would send an agent to something that is gone. Core lists them; the skill makes the edits. The retired skills go at a different time from acceptance: one project accepted long ago, and a client accepts before the replacement skills exist and before its port. So the list and the later skills do not depend on `--accept`: `cortex sync` is the update route on an accepted store (`core-cli.sync` Rules 16–26), and it uses this spec's list and scan. `--accept` stays safe to re-run.

## Entities

- **READS:** `.cortex/**` (including gitignored `pulse/` and `atlas/sources/`), `git ls-files .cortex`, an optional plan file and the digest files it names, an optional redact file; with `--accept`, `.claude/settings.json`, `.claude/settings.local.json`, `.claude/skills/*`, `<package>/skills/*`, and `<home>/.claude/scheduled-tasks/*/SKILL.md` (`<home>` is the user's home directory and `<package>` the package root; tests pass their own of each, as `tasks-register` does for `<home>`: `retireLegacySystem` takes both).
- **WRITES:** the report (stdout, or `--report <file>`); with `--apply`, `cortex/**` and the `.gitignore` line; with `--accept`, the managed blocks, `cortex/cortex.json` `migration.accepted`, the hook entries in `.claude/settings.json` and `.claude/settings.local.json` (removal only), and the 4.0 bundles under `.claude/skills/` (Rule 18 step 2's list, `FINAL_BUNDLES`, new installs and their markers only).
- **NEVER WRITES:** anything under `.cortex/`, any scheduled-task payload, or a 3.x skill bundle.
- **NEVER DELETES:** any file.

## Rules

1. **Entries.** The source is split into entries, per schema S9.3's coverage unit. Each entry has a stable ref: `<3.x path>` for single-subject files, `<3.x path>#<n>` (1-based) for list items and sections, `<path>#<id>` for intent entries, `S-NNN` and `G-NNN`.
   - An atlas source is the stem of `atlas/sources/<stem>.<ext>` for any extension, where the stem ends at the file name's first `.`. Its raw files are every non-`.meta.md` file with that stem, and its digest comes from `<stem>.meta.md` when there is one.
   - An archive document is one folder `archive/documents/<doc>/`. Its raw files are every file of the folder except `metadata.yaml` and the `.md` files under `extracted/` (which form the digest). A non-markdown file under `extracted/` is therefore raw.
   - An empty folder (for example a Finder duplicate `rules 2/`) contributes no entry.
2. **Dispositions.** Every entry gets exactly one disposition, per the S9.3 mapping table: `migrated → <path>`, `retired`, `dropped by decision`, or `pending decision`. Coverage = entries with a disposition / all entries. An entry no table row matches is listed `unmapped`, counts against coverage, and makes `--apply` refuse.
   - A retired entry carries one reason: `machinery or regenerable`, `unpromoted work`, `not a store file`, `not a store folder`, `id registry`, or `retired by the plan file`.
   - **The regenerable list is exact.** It holds `_index.md` (any), `recall-index.json`, `constellation.json`, `archive/register.md`, `archive/types/**`, `insight/scope-registry.yaml`, `pulse/state/**`, `pulse/extraction/**`, `pulse/sessions/**`, `pulse/scratch/**`, and a `pulse/dismissed.md` that holds no entries (no list item and no `##` section beyond its title). Each of these is rebuilt by a 3.x command from kept files, or is per-run state with no knowledge in it.
   - **Everything else under `pulse/` is `unpromoted work`.** That covers reports, onboarding output, proposal notes, threads, `archive-ingestion.md`, and a `dismissed.md` with entries. A report can be the only copy of a pending proposal, onboarding output is not cheaply regenerable, and a dismissal reason is a "why we didn't" that nothing regenerates. When in doubt, `unpromoted work`.
   - `archive/<folder>/**`, where the folder is not `documents/` or `types/`, is `not a store folder`. It is treated as `unpromoted work` and flagged review.
   - `.DS_Store`, `._*` and `Thumbs.db` are `not a store file`, and are regenerable.
   - **Bugs.** A bug whose status is `resolved` or `fixed-verified` goes to `history/incidents/`. Any other status goes to `code/<area>/` with `status: open`. A status outside `open`, `triaged` and `resolved` is flagged review `3.x status <s>`. The original status stays in the carried 3.x fields. The area comes from the first `affects` entry, else the first `specs`/`related_specs` entry, else `repo`.
3. **Plan file.** `--plan <file>` is JSON. Each key is an entry ref, or a folder key ending in `/**`. Each value is one of:
   - `"<target path under cortex/>"`: a verbatim rescue;
   - `"history/sources/raw/<path>"`: a raw rescue (Rule 15), copied byte for byte with no frontmatter;
   - `"retired"`;
   - `{ "target": "<path>", "file": "<path>" }`: a digest. The file's content is the body written at the target, in place of the 3.x body. The file must exist inside the working directory and carry no frontmatter. Its `verified` method is `inferred`.

   A plan entry may name any ref, whatever its default (retired, unpromoted work, dropped by decision). A plan target overrides the default and clears its `review` flag, except that a raw rescue is flagged review. A folder key decides every entry whose ref starts with its prefix, and an exact ref always wins over a folder key. The report counts the entries each folder key decided.

   Each of these is an error:
   - a plan ref, or a folder key, that matches no entry;
   - a target that violates `store.validate` naming or layout;
   - a `.md` target for an entry whose 3.x file is not markdown;
   - a digest file that is missing, outside the working directory, or carries frontmatter.

   A digest whose target is `now/proposals.md` is rendered as Rule 10 items. Each `## <id>: <title>` heading in the digest file becomes one item, with `origin` `migrated:<ref>@<sha>`, and each item is listed under `pending decision`. The id is the 3.x id where the proposal had one (`S-NNN`, `G-NNN`), else `P-<report stem>-<n>`. An id used twice in `now/proposals.md`, or one that is already an alias of another file, is an error. The file's `aliases` list each item id once.
   - **Where the plan comes from.** The dry-run report ends with the path of the packaged `cortex-migrate` skill (`<package>/skills/cortex-migrate/SKILL.md`), so a session in any project can read and follow it before anything is applied. Nothing is installed for this.
4. **Content.** A migrated entry keeps its text verbatim in the body. Its 3.x id and any old filename stem go to `aliases`. Its frontmatter is mapped:
   - `about` from `title`, `term` or `name`;
   - `verified` from the 3.x date fields (`date`, `opened`, `updated`, `captured`, `ingested_at`, `discovered`, then the file's last git commit date, then the apply date; target paths use the same chain and are never dated `0000-00-00`), with method `told` for decisions, terms and rules and `observed` for bugs, evidence and observations;
   - `permanence` from its module (`world` and `code` → `changing`, `history` → `stable`, `now` → `volatile`);
   - `governs` globs → `match.paths`;
   - `affects` paths → `need`;
   - `origin` → `migrated:<entry ref>@<short sha of HEAD at apply>`, one value per entry merged into the file (Rule 5).
   The 3.x citation graph (`provenance:` / `derives_from:`) is carried into `origin` by Rule 13.
   - **Carried origin text (amended 2026-10-19).** In a carried 3.x `origin:` text, a claude.ai session URL or the words "Claude Code session <id>" become `session:<id>`; every other URL is removed, and the remaining description becomes `external:<text ≤ 120 chars>`; the entry is flagged review `origin URL stripped`.
   - **Stem aliases (amended 2026-10-19).** A stem alias is added only when no other migrated file would carry the same alias; a shared stem is dropped for all of them, the `migrated:` origin keeps the old path, and the report lists dropped stem aliases.
5. **Merging into one file.** Several entries that target the same file are appended as `##` sections in source order, the file's `origin` lists each entry's `migrated:` value in the same order, and the report lists each.
6. **Coverage report** (markdown, or `--json`): the no-loss lines (Rule 16) and the visibility line (Rule 17) in its header; totals by disposition; a table of every entry (ref, disposition, target, flags, provenance refs resolved/total); the `review` list; the `pending decision` list with each proposal's first line; the `dropped by decision` section (Rule 12); the `unresolved provenance` section (Rule 13); the `redactions` section (Rule 14, refs and counts only, never the original text); the retired threads by id and status; the `unmapped` list; the retired 3.x config keys; the visibility findings on migrated text; the `undecided` list by folder, with counts (Rule 16); the `digested` list (ref → target → digest file); the plan's folder keys with the count each decided; the `concept definitions` (each concept file's ref and first definition line); the `files` line and the `gitignored only` list (Rule 15); and the command to remove `.cortex/` after acceptance. Every printed removal command is `git rm -r -q --ignore-unmatch <paths> && rm -rf <paths>`, because 3.x insight and pulse files are often untracked.
7. **Dry run is the default.** Without `--apply`, nothing is written except the report file if `--report` is given.
8. **`--apply`** refuses (exit 1, nothing written) while any entry is unmapped, while any file is undecided (Rule 16), or while any file a migrated entry accounts for would not be written (Rule 15). Otherwise it writes `cortex/` (refusing if `cortex/` exists with files not written by a previous apply of the same inputs; a `cortex/cortex.json` holding only the `schemaVersion` and `visibility` of `cortex store init` does not count, and the apply replaces it), runs `cortex store map` (which leaves a 3.x block alone), and then runs `cortex store validate`, printing its result. It is re-runnable: the same inputs give a byte-identical tree.
9. **`--accept`** requires a previous `--apply`. It retires the 3.x system around the store (Rule 18), then records `"migration": { "from": "<3.x version>", "accepted": "<date>" }` in `cortex/cortex.json`, and then rewrites the managed blocks to 4.0, last, so that the blocks see the bundles just installed (`store.managed-block` Rule 9). If the retirement stops, it exits 1 with the reason and records no date. It deletes nothing. It is re-runnable, also after `.cortex/` is gone: a re-run keeps a recorded `YYYY-MM-DD` date, replaces any other value with today's, runs Rule 18 again, and rewrites the blocks.
10. **Never dropped.** Pending proposals (`S-NNN` whose status is pending, `G-NNN`) go to `now/proposals.md`. Each is one item: a heading `## <id>: <first line>`, then `until: <apply date + 30 days>`, then `status: pending decision`, then its full text. They also appear in the report's `pending decision` list. What happens when they expire unreviewed is specified in `store.freshness` Rule 2.
11. **Init and sync on a 4.0 store.** When `cortex/cortex.json` exists with a 4.0 `schemaVersion`, neither command has a 3.x path (amendment 2026-11-04). `core-cli.init` Rule 20 and `core-cli.sync` Rule 16 decide what each does in each state. Before acceptance (`migration.accepted` is `null`) both refuse and write nothing, so neither touches the `CLAUDE.md` or `AGENTS.md` managed block.

   A sync can protect a foreign project only once the installed `cortex` binary carries this rule: no foreign project is accepted before that.
12. **Insight is dropped by decision** (2026-10-14; schema S9.3). The 3.x inferred code summaries are neither migrated nor kept: `insight/anatomy/**`, `insight/concepts/**`, the insight graph with its indexes (`insight/{graph,tags,clusters,reverse-index,ledger}.json`), and the scoped layout's `insight/scopes/**`. Each file is one entry with disposition `dropped by decision`, so coverage still reaches 100%.
   - The report shows them as one row per group, with a file count, not one row per file. A scoped file's group is the first folder inside its scope, with a trailing ` <n>` stripped: `anatomy`, `concepts`, `graph` (for `graph.json` or `graph/`), else `other`. The report also shows the number of scopes.
   - The report prints the removal command, covering `.cortex/insight/anatomy`, `.cortex/insight/concepts`, `.cortex/insight/scopes` and the five graph files. `migrate` never runs it, with or without `--apply` or `--accept`.
   - A plan entry may still rescue a dropped file (Rule 3), and the `concept definitions` list exists for that purpose. `insight/observations/*` is not dropped: each observation migrates under its own row of the mapping table.
13. **The citation graph becomes origin.** For every migrated entry, each 3.x provenance reference is resolved: each `derives_from:` under `provenance:`, a top-level `derives_from:`, every value of `sessions:` and `session:` (observations, threads), and every value of an atlas file's `sources:` (a path relative to that file, or a session ref). These fields are not also carried as 3.x fields. Each reference is and its origin value is appended to the new file's `origin` after the entry's own `migrated:` value, in source order, without duplicates:
   - a target that is (or migrates to) a `history/sources/` digest (`archive/documents/*`, `atlas/sources/*`) → `source:history/sources/<its digest>.md`;
   - a target that is another migrated 3.x entry (a decision, rule, bug, term, …) → `migrated:<that entry's ref>@<sha>`;
   - a `claude-sessions/<user>/<id>` reference → `session:<id>` (the user segment is dropped, RULES.md rule 20).
   A target that does not exist, or that is retired or dropped by decision, is **unresolved**: it adds nothing to `origin` and is listed in the report's `unresolved provenance` section as `<entry ref> → <old target path>`. Each reference is counted once per entry, so the report gives `provenance refs: <resolved>/<total>`, and the plan file does not override this rule. An unresolved reference does not lower entry coverage, because the entry itself has a disposition; it is shown so that a person can repair it.
14. **Redactions and edits** (amended 2026-10-19: an entry a plan rescues, or an edit names, is read with its 3.x text before redaction, and `replace` also reaches digest bodies) (`--redact <file>`, JSON `{ "replace": { "<text>": "<label>" }, "edits": { "<entry ref>": [["<from>", "<to>"], …] } }`). `replace` substitutes every whole-word occurrence of each text with its label in the migrated text of every entry (body, title, carried fields); `edits` substitutes literal text in one entry only. Both apply to what `cortex/` receives; `.cortex/` is never touched. The file holds the original text, so it lives outside the repository or under a gitignored folder. The report lists each redacted or edited entry with its count of substitutions and the labels used. An edit whose `from` text is not in its entry is an error.
15. **Raw files: every one, byte for byte, never colliding.**
    - Raw originals are copied as bytes, never as text.
    - A source with exactly one raw file writes it to `history/sources/raw/<digest-stem><ext>`, where `<ext>` is everything after `source` in an archive document (`source.a.tar.gz` gives `.a.tar.gz`) or everything after the stem in an atlas source. This output is unchanged for single-raw sources.
    - A source with several raw files writes them under `history/sources/raw/<digest-stem>/`, at their paths inside the 3.x folder, and its `raw:` field names that folder with a trailing `/`.
    - The report prints `files: <written>/<accounted>, not written: <n>` for migrated entries, and `--apply` refuses when `not written` is above 0.
    - The `gitignored only` section lists every file whose content lands only under `history/sources/raw/`, marking those tracked in git. They leave version control once `.cortex/` is removed.
16. **No loss.** Every `.cortex/` file is classed by the disposition of the entry that accounts for it:
    - **landed:** its text reaches `cortex/` verbatim, as body or raw;
    - **decided:** a plan entry or folder key, or `dropped by decision`, chose its fate;
    - **regenerable:** retired `machinery or regenerable`, or `not a store file`, or `id registry`, or the config file;
    - **undecided:** anything else, which means retired `unpromoted work` or `not a store folder` with no plan decision.

    A multi-entry file is landed only when all of its entries are; otherwise it takes the weakest class among them. Tracked means listed by `git ls-files`. The report header carries `tracked: <landed>/<total> landed, decided: <n>, regenerable: <n>, undecided: <n>` and the same line for `untracked`. `--apply` refuses while either line has `undecided` above 0.
17. **Visibility.**
    - When the 3.x config has no `visibility.repo`, or has `unknown`, the report header says `repo: unknown (checked as public)` and runs the public-repo checks.
    - `--visibility public|private` overrides the 3.x value, for the report and for the `cortex/cortex.json` that `--apply` writes. Without it, `--apply` writes the 3.x value, or `unknown`.
    - When `--apply` runs with visibility findings on a public or unknown repo and no `--redact`, it prints `<n> visibility findings would be committed to a public (or unknown-visibility) repository; review them, or rerun with --redact <file>`. It does not block.
18. **Accept retires the 3.x system around the store.** Before Rule 9's block switch, `--accept`:
    1. **Hooks.** It removes from `.claude/settings.json` and `.claude/settings.local.json` every hook entry whose command starts with `cortex hook `, and drops any matcher group or event left empty. Every other key and entry stays. A changed file is written as 2-space JSON with a trailing newline, and the output says the file's formatting may have changed. A file with no such entry is not written.
    2. **4.0 bundles.** It installs the bundles a migrated project needs day to day (`cortex-migrate` is read from the package, Rule 3): `cortex-remember`, `cortex-learn`, `cortex-fresh`, `cortex-quality`, `cortex-register-tasks`, `verification-before-completion`, `specflow-spec`, `specflow-review`, `specflow-onboard`. Each goes into `.claude/skills/<name>/` with a `.cortex-installed.json` marker, whole, as `core-cli.sync` Rule 19 says. When `.claude` or `.claude/skills` is a symbolic link the step is skipped, as `core-cli.sync` Rule 17 says. A bundle of that name that already exists with different content, or a plain file at that name, is left alone, on every run, so a re-run never overwrites a project's edit; the output line is `skills: .claude/skills/<name> exists with different content; left alone`. A bundle the package does not hold yet is skipped, with the line `skills: <name> is missing from the package; not installed`.
    3. **Superseded bundles.** It lists, and never deletes, the 3.x bundles that 4.0 supersedes in `.claude/skills/`: every name on the retired list of step 5, as a bundle of that name. Each is labelled `unmodified` (its marker's hash matches its content) or `modified or unmarked: check before removing`, and the output ends with one removal command.
    4. **Scheduled tasks.** It lists, and never touches, the payload folders under `<home>/.claude/scheduled-tasks/` whose `SKILL.md` carries `<!-- cortex-project-root: <this project's absolute path> -->`. They are selected by that marker, never by name. The output says to disable each in the Claude Code Desktop app before deleting its folder.
    5. **Project skills that name what is gone.** It scans every other bundle under `.claude/skills/` and lists each one holding a term below.
       - **The retired list** (`RETIRED_SKILL_NAMES`, exported from `src/store/migrate/system.ts`; the two patterns are the literal entries `cortex-loop-*` and `cortex-pulse-*`): `_conventions`, `cortex-archive-ingest`, `cortex-extract-insight`, `cortex-ingest`, `cortex-loop`, every `cortex-loop-*`, every `cortex-pulse-*`, and the 17 skills `specflow-brainstorm`, `specflow-bugs`, `specflow-change-router`, `specflow-deep-onboard`, `specflow-develop`, `specflow-entry`, `specflow-ingest`, `specflow-intent-reconcile`, `specflow-lint`, `specflow-new-project`, `specflow-onboard-codebase`, `specflow-plan`, `specflow-receive-review`, `specflow-request-review`, `specflow-spec-editor`, `specflow-tests`, `specflow-viewer`.
       - **Matching.** A retired name matches as a whole token: the characters on either side are not letters, digits, `-` or `_`. So `specflow-spec` and `specflow-onboard` match nothing, and `specflow-spec-editor` matches only itself. The two path terms, `.cortex/` and `.specflow/`, match as plain substrings, so `specflow/` and `.cortex-migrate/` do not match.
       - **The port does not change the scan.** Before and after `cortex specs port`, the term is `.specflow/`, which covers `.specflow/specs/` and `.specflow/specs-business/`. A scan after the port still lists a skill that kept the old path; what differs is what the skill may do about it (`store.migrate-skill` Rule 11).
       - **Files.** It reads `SKILL.md` and every other file under the bundle that holds no NUL byte in its first 8,000 bytes, except the marker. A symbolic link, as a bundle or inside one, is not followed. It gets the line `- <path under .claude/skills/>: symlink, not read`, and does not count in n. A file that cannot be read gets `- <path>: not read`, and does not count either.
       - **Left out of the scan:** retired bundles (step 3), `cortex-migrate`, and any bundle of step 2 that is identical to the package's copy, has a marker matching its content, or is an unedited shipped copy (`core-cli.sync` Rule 27), because sync replaces those. Any other step 2 bundle is scanned.
       - **Output.** `project skills to adjust: <n>`, then one line per file, sorted: `- <bundle>/<file>: <term>, <term>`, with the terms in the order of the retired list, then `.cortex/`, then `.specflow/`. n counts files. When n is above 0, it ends with `Adjust them with the skill-adjust step of <packaged path of cortex-migrate's SKILL.md>`. This is listing only: Core never edits a project skill.
19. **Unknown archive folders, tests, and other non-knowledge files.** The default for `archive/<other>/**` is the review flag "move it out of `.cortex/` before removing `.cortex/`". A non-markdown file can be rescued only as raw or as a digest (Rule 3), so code and tests never land verbatim in `world/` or `code/`.

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

### Session and source references become origins

- **Given** an observation with `sessions: [claude-sessions/someone/abc12345]` and a term with `sources: [../sources/brief.md]`, where `atlas/sources/brief.md` migrates to `history/sources/<date>-brief.md`
- **When** `cortex migrate --apply` runs
- **Then** the observation's `origin` contains `session:abc12345`, the term's `origin` contains `source:history/sources/<date>-brief.md`, and neither file carries a `sessions` or `sources` field or the text `someone`

### Redactions and edits reach the migrated text only

- **Given** a redact file `{ "replace": { "acme": "client-A" }, "edits": { "compass/environment.md#1": [["(private)", "(public)"]] } }`, a bug whose body names `acme`, and an environment entry ending `(private)`
- **When** `cortex migrate --redact r.json --apply` runs
- **Then** the migrated bug says `client-A` and never `acme`, the systems file says `(public)`, `.cortex/` is byte-identical, the report's `redactions` section lists both entries with their counts and not the word `acme`, and an edit whose `from` text is absent exits 1

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

### Init before acceptance leaves the 4.0 block untouched

- **Given** an applied migration that is not yet accepted (`cortex/cortex.json` at 4.0 with `migration.accepted: null`, and a hand-written v4.0 block in `CLAUDE.md`) and the 3.x store still present
- **When** `cortex init` runs
- **Then** it refuses as `core-cli.init` Rule 20 step 5 says, and the `CLAUDE.md` and `AGENTS.md` blocks are byte-identical to before

### Apply takes over a bare store-init config

- **Given** a 3.x project where `cortex store init` wrote `cortex/cortex.json` and its empty folders, and separately the same file with a `specflow` key added
- **When** `cortex migrate --apply` runs
- **Then** the first exits 0 with the migrated `cortex/cortex.json`, and the second refuses, naming that file, with nothing written

### Accept replaces an accepted value that is not a date

- **Given** an applied migration whose `migration.accepted` is `soon`
- **When** `cortex migrate --accept` runs
- **Then** `migration.accepted` is today's date, and a second run keeps that date

### Accept switches the blocks and deletes nothing

- **Given** an applied migration and a `CLAUDE.md` with a v3.4 block
- **When** `cortex migrate --accept` runs
- **Then** `CLAUDE.md` holds the v4.0 block, `cortex/cortex.json` records the acceptance date, and `.cortex/` still exists

## Acceptance Criteria: foreign stores (amendment 2026-10-19)

All of these use the foreign fixture (`writeForeignStore`). It holds a 3.3 config without `visibility`; a scoped insight layer with two scopes and an `anatomy 2/` folder holding one file; `scope-registry.yaml`; a `.DS_Store` and a `._x`; an empty `compass/rules 2/`; an atlas source `brochure.dc.html` with no `.meta.md`; an archive document `contract/` with `source.pdf` (bytes `00 ff`), `source.scan.pdf`, `source/log.txt` and `source-email.md`; a document `policy/` with no metadata and no date; a committed `archive/tooling/probe/{README.md,probe.ts}`; bugs with the statuses `fixed-verified` (dated only by `discovered:`, with `specs:` and no `affects`), `fixed-pending-deploy` and `open-worked-around`; untracked `pulse/reports/loop.md`, `pulse/onboarding-scratch/x/{RULES.md,notes.md,tests/t.py}`, `pulse/state/s.json`, `pulse/extraction/e.json`, a `pulse/dismissed.md` with one entry; and `.claude/` with five `cortex hook` entries, one foreign hook, and four 3.x bundles.

### Scoped insight is dropped by decision

- **Given** the foreign fixture
- **When** `cortex migrate` runs
- **Then** every `insight/scopes/**` file is `dropped by decision` in the anatomy, concepts or graph group, the report shows `scopes: 2`, `scope-registry.yaml` is retired `machinery or regenerable`, and the removal command includes `.cortex/insight/scopes` and `--ignore-unmatch`

### Junk files are retired and empty folders produce nothing

- **Given** the foreign fixture
- **When** `cortex migrate` runs
- **Then** `.DS_Store` and `compass/._x` are retired `not a store file`, and no entry's ref starts with `compass/rules 2`

### A non-markdown atlas source migrates with its raw

- **Given** `atlas/sources/brochure.dc.html` with no `.meta.md`
- **When** `cortex migrate --apply` runs (with a plan deciding the unpromoted entries)
- **Then** `history/sources/<date>-brochure.md` exists, flagged review, and `history/sources/raw/<date>-brochure.dc.html` is byte-identical to the original

### Every raw file is copied byte for byte, without collisions

- **Given** the document `contract/`
- **When** `cortex migrate --apply` runs
- **Then** `history/sources/raw/<stem>/` holds `source.pdf`, `source.scan.pdf`, `source/log.txt` and `source-email.md`, each byte-identical; the digest's `raw:` names that folder; and the report shows `not written: 0`

### A re-apply with binary raws is byte-identical

- **Given** `cortex migrate --apply` has run on the foreign fixture with a deciding plan
- **When** it runs again with the same inputs
- **Then** it exits 0 and the `cortex/` tree, binary raws included, is byte-identical

### The dry run points at the skill

- **Given** the foreign fixture
- **When** `cortex migrate` runs
- **Then** the report's last section names the packaged `skills/cortex-migrate/SKILL.md` path, and the file exists

### Single-raw sources keep today's path

- **Given** the base fixture (`archive/documents/brief/source.md`)
- **When** `cortex migrate --apply` runs
- **Then** the raw is at `history/sources/raw/2026-01-02-brief.md`, as before

### Bug statuses beyond the 3.x enum

- **Given** the three foreign bugs
- **When** `cortex migrate` runs
- **Then** the `fixed-verified` bug goes to `history/incidents/<its discovered date>-<slug>.md`, the `fixed-pending-deploy` bug goes to `code/<area of its affects>/…` with review `3.x status fixed-pending-deploy`, and the `open-worked-around` bug goes to `code/repo/…` with review `3.x status open-worked-around`

### No path is dated 0000

- **Given** the document `policy/` with no date field
- **When** `cortex migrate` runs
- **Then** its target is dated by the last git commit date of its files

### Unknown archive folders are decided, not copied

- **Given** the committed `archive/tooling/probe/`
- **When** `cortex migrate` runs
- **Then** both files are retired `not a store folder`, flagged review, counted as undecided until a plan decides them, and nothing from them is written under `cortex/`

### Unpromoted work blocks apply until decided; regenerable never does

- **Given** the foreign fixture and no plan
- **When** `cortex migrate --apply` runs
- **Then** it exits 1, lists `pulse/reports/loop.md`, the `pulse/onboarding-scratch/x/` files, `pulse/dismissed.md` and the tooling files as undecided, does not list `pulse/state/s.json` or `pulse/extraction/e.json`, and writes nothing

### The no-loss lines

- **Given** the foreign fixture and no plan
- **When** `cortex migrate` runs
- **Then** the header shows a `tracked:` line with `undecided: 2` (the two tooling files) and an `untracked:` line whose `undecided` counts the unpromoted pulse files, and `regenerable` counts the state and extraction files

### A plan decides folders, rescues, digests and raws

- **Given** a plan with `"pulse/onboarding-scratch/**": "retired"`, `"pulse/onboarding-scratch/x/RULES.md": "world/rules/x-service.md"`, `"pulse/onboarding-scratch/x/tests/t.py": "history/sources/raw/onboarding/t.py"`, a digest `{ "target": "now/proposals.md", "file": "d.md" }` for `pulse/reports/loop.md` (where `d.md` has the headings `## S-901: one` and `## S-902: two`), `"pulse/dismissed.md": "world/decisions/dismissed-proposals.md"`, `"archive/tooling/**": "retired"`, and `"insight/concepts/fare.md": "world/terms/fare.md"`
- **When** `cortex migrate --plan plan.json --apply` runs
- **Then**
  - it exits 0, and both no-loss lines show `undecided: 0`;
  - `RULES.md` is migrated while its siblings are retired;
  - the report shows that the folder key `pulse/onboarding-scratch/**` decided 1 entry;
  - `t.py` is byte-identical under raw and listed under `gitignored only`;
  - `now/proposals.md` holds `S-901` and `S-902` as pending-decision items whose origin is `migrated:pulse/reports/loop.md@<sha>`, and both are listed under `digested` and `pending decision`;
  - the term file has `origin: [migrated:insight/concepts/fare.md@<sha>]`.

### Redactions reach rescued and digested text

- **Given** a redact file `{ "replace": { "acme": "client-A" }, "edits": { "pulse/onboarding-scratch/x/RULES.md": [["(private)", "(tenant)"]] } }`, where the rescued `RULES.md` and the digest file for `pulse/reports/loop.md` both name `acme`
- **When** `cortex migrate --plan plan.json --redact r.json --apply` runs
- **Then** `world/rules/x-service.md` says `client-A` and `(tenant)`, `now/proposals.md` says `client-A`, neither says `acme`, and the `redactions` section lists both refs

### A proposal id that is already an alias is refused

- **Given** a proposals digest with the heading `## B-101: …`, where `B-101` is a migrated bug's id
- **When** `cortex migrate --plan plan.json` runs
- **Then** it exits 1 naming `B-101`

### A URL in a carried origin is converted, not kept

- **Given** a document whose 3.x `origin:` is `Claude Code session session_0198AbC (https://claude.ai/code/session_0198AbC) that ran the plan; mirror at https://example.org/a/b.exp (archived)`
- **When** `cortex migrate --apply` runs
- **Then** the digest's `origin` holds `session:session_0198AbC` and `external:that ran the plan; mirror at (archived)`, no origin contains `://`, the entry is flagged review `origin URL stripped`, and validate reports no error

### A shared stem alias is dropped

- **Given** two rescued files both named `notes.md`, targeted at `code/repo/x-notes.md` and `code/repo/y-notes.md`
- **When** `cortex migrate --apply` runs
- **Then** neither file carries the alias `notes`, the report's `dropped stem aliases` section lists it with both files, and `check.aliases` reports nothing

### Bad plans are refused

- **Given** a plan with `"pulse/onboarding-scratch/x/tests/t.py": "code/repo/t.md"`, or a folder key `"nope/**": "retired"`, or a digest whose file has frontmatter or does not exist
- **When** `cortex migrate --plan plan.json` runs
- **Then** it exits 1 naming the entry, the key or the file

### Concept definitions are listed

- **Given** two concept files
- **When** `cortex migrate` runs
- **Then** the `concept definitions (2)` section lists each one's ref and first definition line

### Dismissed memory

- **Given** a `pulse/dismissed.md` with one entry, and in another repo one that holds only its title
- **When** `cortex migrate` runs
- **Then** the first is `unpromoted work` and the second is `machinery or regenerable`

### Unknown visibility is checked as public

- **Given** a config with no `visibility` and an environment entry ending `(private)`
- **When** `cortex migrate` runs, and then `cortex migrate --visibility public --apply` (with a deciding plan)
- **Then** the first report says `repo: unknown (checked as public)` and lists the `(private)` line; after the second, `cortex/cortex.json` has `repo: public` and the output carries the visibility warning line; both exit 0

### Accept retires the 3.x system and deletes nothing

- **Given** an applied foreign fixture, and a home folder whose `.claude/scheduled-tasks/` holds two payloads marked with this root, one marked with another root, and one unmarked payload
- **When** `cortex migrate --accept` runs
- **Then**
  - only the foreign hook remains in `.claude/settings.json`;
  - `.claude/skills/cortex-remember/` exists with a marker;
  - the output lists `cortex-loop` as `unmodified`, `cortex-archive-ingest` and `cortex-loop-hygiene` as `modified or unmarked`, both payloads for this root and no other, and `project skills to adjust: 1`;
  - no file under `.claude/skills/`, the tasks folder or `.cortex/` was deleted.

## Acceptance Criteria: project skills (amendment 2026-11-04)

These use an accepted store with fixture bundles under `.claude/skills/`.

### A re-run of accept changes nothing it should keep

- **Given** an accepted migration dated 2026-10-19, with `.cortex/` removed
- **When** `cortex migrate --accept` runs with `--today 2026-11-20`
- **Then** it exits 0, `migration.accepted` is still 2026-10-19, and running it a second time leaves `.claude/`, `CLAUDE.md`, `AGENTS.md` and `cortex/` byte-identical

### Accept installs the day-to-day bundles

- **Given** an applied migration and a test package root holding all nine bundles of Rule 18 step 2
- **When** `cortex migrate --accept` runs
- **Then** each is under `.claude/skills/` with a marker, and `cortex-migrate` is not

### A re-run never overwrites a project's edit

- **Given** an accepted project whose `.claude/skills/specflow-review/SKILL.md` differs from the package's
- **When** `cortex migrate --accept` runs
- **Then** the file is byte-identical, and the output has `skills: .claude/skills/specflow-review exists with different content; left alone`

### A bundle the package lacks is skipped

- **Given** a package with no `specflow-spec`
- **When** `cortex migrate --accept` runs
- **Then** it exits 0 and the output has `skills: specflow-spec is missing from the package; not installed`

### The retired specflow bundles are listed, not deleted

- **Given** `.claude/skills/` holds `specflow-develop` with a matching marker and `specflow-plan` without one
- **When** `cortex migrate --accept` runs
- **Then** they are listed `unmodified` and `modified or unmarked: check before removing`, the removal command names both, and both still exist

### A retired name is found, and only as a whole token

- **Given** a project bundle `release` whose `SKILL.md` says `run specflow-develop`, and a bundle `docs` whose `SKILL.md` says `run specflow-spec and specflow-onboard`
- **When** `cortex migrate --accept` runs
- **Then** the output has `project skills to adjust: 1` and `- release/SKILL.md: specflow-develop`, and does not name `docs`

### Patterned names are found

- **Given** a project bundle whose `references/notes.md` names `cortex-loop-hygiene` and `cortex-pulse-distil`
- **When** `cortex migrate --accept` runs
- **Then** that file's line lists both terms

### Both path terms are found, in any text file

- **Given** a project bundle whose `scripts/run.sh` names `.specflow/specs-business/x` and whose `SKILL.md` names `.cortex/compass`
- **When** `cortex migrate --accept` runs
- **Then** each file has its own line, with `.specflow/` and `.cortex/` respectively

### The new paths do not match

- **Given** a project bundle whose `SKILL.md` names `specflow/impl/` and `.cortex-migrate/`
- **When** `cortex migrate --accept` runs
- **Then** the bundle is not listed

### The port does not change what is listed

- **Given** a project bundle naming `.specflow/specs/a.spec.md`, with `.specflow/` present, and then the same project with `specflow/` in its place
- **When** `cortex migrate --accept` runs in each state
- **Then** the bundle's line is the same in both

### Packaged bundles are left out unless changed

- **Given** an installed `cortex-remember` identical to the package's, naming `.cortex/`, and an installed `verification-before-completion` that differs from the package's and names `specflow-plan`
- **When** `cortex migrate --accept` runs
- **Then** `cortex-remember` is not listed, and `verification-before-completion` is

### A binary file and a symlink do not break the scan

- **Given** a project bundle holding a PNG, and a `.claude/skills/linked` that is a symbolic link
- **When** `cortex migrate --accept` runs
- **Then** it exits 0, the PNG is not read as a match, and the output has `- linked: symlink, not read`

### Core edits no project skill

- **Given** listed project bundles
- **When** `cortex migrate --accept` runs
- **Then** every listed file is byte-identical, and the output ends the section by naming the packaged `cortex-migrate` skill path

### Accept ends at the right block stage

- **Given** an applied migration with a `specflow/` folder, and a package holding `specflow-spec`
- **When** `cortex migrate --accept` runs once
- **Then** `.claude/skills/specflow-spec/SKILL.md` exists, and the `CLAUDE.md` block holds the two stage 2 lines of `store.managed-block` Rule 11

### Retired bundles and cortex-migrate are left out of the scan

- **Given** a `specflow-develop` bundle naming `.cortex/`, a `cortex-migrate` bundle naming `.cortex/`, and a marker file holding the text `.cortex/` in a project bundle with no other mention
- **When** `cortex migrate --accept` runs
- **Then** the output has `project skills to adjust: 0` and no `Adjust them` line

### A step 2 bundle the package lacks is scanned

- **Given** a package with no `specflow-review`, and an installed `specflow-review` naming `specflow-plan`
- **When** `cortex migrate --accept` runs
- **Then** that bundle's file is listed

### Lines and terms are ordered

- **Given** bundles `b` and `a`, and `a/SKILL.md` naming `.specflow/x`, `.cortex/y` and `specflow-plan`
- **When** `cortex migrate --accept` runs
- **Then** `a`'s line comes first and reads `- a/SKILL.md: specflow-plan, .cortex/, .specflow/`

### A symlink inside a bundle is listed, not counted

- **Given** a bundle whose `refs` is a symbolic link, and no other mention
- **When** `cortex migrate --accept` runs
- **Then** the output has `project skills to adjust: 0` and a `symlink, not read` line for that path

### An unedited older copy of a final bundle is not listed

- **Given** `.claude/skills/verification-before-completion/` holding that bundle as of an earlier commit of `main`, with no marker, naming `.cortex/`
- **When** `cortex migrate --accept` runs
- **Then** no line of the `project skills to adjust` section names that bundle

### The final set is the nine of Rule 18 step 2, without cortex-migrate

- **Given** `FINAL_BUNDLES`
- **When** it is read
- **Then** it holds the nine names of Rule 18 step 2 and not `cortex-migrate`

### The retired list holds the spec names and no final bundle

- **Given** `RETIRED_SKILL_NAMES` and `isRetiredName`
- **When** they are compared with Rule 18 step 5
- **Then** the list equals the spec's, no final bundle and not `cortex-migrate` is retired, and the two patterns match `cortex-loop-hygiene` and `cortex-pulse-distil` and not `my-cortex-loop`

### A store is accepted only by a date

- **Given** a `migration.accepted` of `soon`, and separately a date
- **When** `migrationAccepted` reads each
- **Then** the first is not accepted and the second is

### A plain file or a folder marker at a bundle name does not crash accept

- **Given** a plain file at `.claude/skills/cortex-remember`, and a copy of `specflow-spec` identical to the package's with a folder at its marker path
- **When** `cortex migrate --accept` runs
- **Then** it exits 0, the file is byte-identical with its `left alone` line, and the copy has `skills: specflow-spec: marker not written; left alone` and no `installed` line

### An accept that cannot finish reports it and records no date

- **Given** a plain file at `.claude/skills/.cortex-tmp-cortex-learn`
- **When** `cortex migrate --accept` runs, and runs again with the file gone
- **Then** the first exits 1 with the `is in the way` line and `migration.accepted` is still `null`, and the second exits 0 and records the date

### Accept leaves a settings file without cortex hooks unwritten

- **Given** a `.claude/settings.json` holding no `cortex hook` entry
- **When** `cortex migrate --accept` runs
- **Then** the file is byte-identical
