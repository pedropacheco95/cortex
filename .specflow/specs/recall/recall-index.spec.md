---
id: recall.recall-index
status: implemented
depends_on:
  - schema.bears-on
  - schema.schema-clauses
  - atlas.evidence
  - pulse.threads
  - constellation.compiler
  - insight.refresh-loops
  - core-cli.init
governs:
  - "src/recall/index.ts"
  - "src/schema/checks/recall-index.ts"
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
---

# The Recall Index — `.cortex/recall-index.json`

## Intent

`bears_on` (`schema.bears-on`) makes a decision, an evidence file, a thread or an observation say
what it is about. A session, though, starts from the other end: it is reading `R-001`, grepping
`src/pulse/usage.ts`, or opening `cortex-schema.md` §5, and the question is "what bears on
*this*?" Answering that by walking every conclusion's frontmatter inside a hook would spend, on
every search, the latency budget RULES 6 exists to protect — and would have to be written four
times, once per carrier. So the inversion is compiled once, deterministically, into one JSON file
next to `constellation.json` (schema §4.11): per subject, the current decisions, the evidence,
the open threads and the observation themes that bear on it, plus a title-and-keywords row per
entry so a consumer can render a one-line pointer without opening anything. The three entailment
rules — a superseded decision drops out, a closed thread drops out, evidence flows through the
decision that cites it — are computed here and nowhere else. Step 3's hooks read this file only.
Nothing read it when 3.4 shipped; the 3.4 second revision (step 3) adds the four read-only
consumers Rule 12 names.

## Entities

- **READS:** `.cortex/atlas/decisions/*.md`, `.cortex/atlas/evidence/*.md`,
  `.cortex/pulse/threads/T-*.md`, `.cortex/insight/observations/*.md` (each optional);
  **(3.4 fifth revision)** `.cortex/compass/rules/R-*.md`, `.cortex/compass/bugs/B-*.md`, and
  the four compass documents `environment.md`, `preferences.md`, `do-not-repeat.md`,
  `standing-authorities.md` (each optional; Rules 15–17);
  `.cortex/cortex.config.json` (`schemaVersion`); the project index and the clause index
  (`schema.bears-on`, `schema.schema-clauses`) for resolution; `cortex-schema.md` via the clause
  index.
- **WRITES:** `.cortex/recall-index.json` — nothing else, ever.
- **CREATES:** the index file (regenerable; gitignored per schema Decision 1's 3.4 amendment —
  `core-cli.init` Rule 2's fifth line).

## Rules

1. **Shape per schema §4.11, exactly.** `{ schemaVersion, generated, subjects, entries,
   counters }`; `subjects[<ref>] = { decided: string[], evidence: string[], threads: string[],
   observations: string[], rules: string[], bugs: string[] }` (the last two lists are the 3.4
   fifth revision's — Rules 15 and 17); `entries[<id>] = { kind, title, path, date, keywords }`
   with `kind` in `decision | evidence | thread | observation | rule | compass-doc | bug`;
   `counters = { subjects, entries, droppedRefs }`. `schemaVersion` is the config's, falling back to the package's
   `SUPPORTED_VERSION` when the config is absent. Emitted output MUST pass `check.recall-index`
   with zero errors.

2. **Subjects come from resolving refs only.** Each carrier's `bears_on` entries are classified
   and resolved with `schema.bears-on`'s `resolveRef` (concept, clause and path shapes included).
   A resolving ref becomes a subject key — the ref as written, except that a `path` ref is
   normalised (POSIX separators, leading `./` stripped) so two spellings of one file are one
   subject. A ref that does not resolve produces no subject and increments
   `counters.droppedRefs`; the compiler never fails on it and never reports it — complaining is
   `check.bears-on`'s (gated carriers) or nobody's (threads, observations: their stale ledger paths
   are expected).

3. **Entailment 1 — current decisions only.** A decision `D` contributes `D.id` to
   `subjects[X].decided` for each resolving `X ∈ D.bears_on` **iff** no other decision file's
   `supersedes` entry resolves (relative to that file) to `D`'s path. A superseded decision keeps
   its `entries` row and contributes to no subject. Supersession is one hop — `A supersedes B`
   removes `B`; it does not matter whether `A` is itself superseded (that removes `A`).

4. **Entailment 2 — open threads only.** A thread `T` contributes `T.id` to
   `subjects[X].threads` iff `T.status === 'open'`. Answered, dropped and expired threads keep
   their `entries` row and contribute to no subject, so the index never points a session at a
   question that was already answered.

5. **Entailment 3 — evidence is inherited through the decision that cites it, and directly.**
   For a decision `D` (superseded or not) and each `sources:` entry resolving (relative to `D`'s
   file) to a file under `.cortex/atlas/evidence/` with id `E`: `E` joins `subjects[X].evidence`
   for every resolving `X ∈ D.bears_on`. Independently, an evidence file `E` joins
   `subjects[X].evidence` for every resolving `X ∈ E.bears_on`. An evidence file that any other
   evidence file's `supersedes` resolves to is removed from every `evidence` list (its superseder
   stays); it keeps its `entries` row. Rule 5 does not require `D` to be current: a superseded
   decision's measurement is still a measurement, and the chain that retires a measurement is
   evidence `supersedes`, not decision `supersedes`.

6. **Observations.** An observation entry `O` (schema §4.10.11) with a `bears_on` list contributes
   its theme — the file stem, e.g. `working-style` — to `subjects[X].observations` for every
   resolving `X`. No currency condition. An observation without `bears_on` contributes only its
   `entries` row (id `observation.<theme>`).

7. **Transitive `depends_on` is out of scope, deliberately.** A decision bearing on spec `S`
   does not thereby bear on the specs that depend on `S`, nor on the files `S` governs. No step-3
   consumer asks that question (the hooks match the subject a session is actually reading or
   searching), and closing over the dependency graph would multiply every subject's lists by the
   graph's depth and bury the direct edges the hooks exist to surface. If a consumer appears that
   needs it, it is a later MINOR with its own rule here, not a flag on this one.

8. **Entries.** One row per scanned artefact whether or not it contributed a subject: `kind`;
   `title` — the frontmatter `title` for decisions and evidence, the thread's key text
   (`pulse.threads` Rule 7) cut to 80 characters, the observation's theme; `path` —
   project-relative POSIX; `date` — `date` (decision, evidence), `opened` (thread), `updated`
   (observation), as an iso string; `keywords` — the title's lowercase tokens of three or more
   characters split on non-alphanumerics, plus every `bears_on` ref verbatim (resolving or not),
   sorted and deduplicated. **Never body text**: the index carries names, identifiers and paths,
   not knowledge content — the same line schema §5's pointer grammar holds, so an injected pointer
   built from it can never leak a rule's text or a decision's reasoning. **(3.4 fifth revision)**
   For the compass kinds: a `rule` entry's id is `R-NNN`, its `title` the frontmatter `title`,
   its `date` the empty string (a rule has no date; an empty date sorts last wherever a
   consumer orders by date and is omitted from a pointer line); a `bug` entry's id is `B-NNN`,
   its `title` the frontmatter `title`, its `date` the `opened` value or the empty string; a
   `compass-doc` entry's id is `compass.<stem>` (`compass.environment`), its `title` the file's
   first H1 text or the stem, its `date` the empty string, and its `keywords` the lowercase
   tokens (three or more characters, stop-list removed) of its **headings and bold spans only**
   — the text of `#`-lines and `**…**` runs — capped at the first **40** distinct tokens in
   document order, never a token from body prose. The compass documents are the one carrier
   whose keywords are not title-derived; headings and bold terms are the names a document gives
   its own subjects, which is what a search matches, and the cap keeps a long preferences file
   from qualifying for everything.

9. **Determinism.** `subjects` keys and `entries` keys are emitted in sorted (code-point) order;
   every list is sorted and deduplicated; two compilations of identical input are byte-identical
   except the `generated` line. Serialised with two-space indentation and a trailing newline, like
   `constellation.json`.

10. **Tolerance.** Every input directory is optional; an absent one contributes nothing. A file
    whose frontmatter does not parse, or whose `bears_on` is not a list of strings, is skipped
    (and contributes no `entries` row). A project with none of the four directories compiles to
    `{ subjects: {}, entries: {}, counters: { subjects: 0, entries: 0, droppedRefs: 0 } }` — never
    an error, never a missing file.

11. **Builders — and only these.** Exposed as `compileRecallIndex(root): Promise<RecallIndex>`
    (pure assembly) and `writeRecallIndex(root)` (assemble + write) in `src/recall/index.ts`.
    Called by: `cortex scan`, after the constellation compile (`src/cli/cli.ts`; the summary line
    gains the subject and entry counts); `cortex init`, after its constellation compile
    (`src/cli/init.ts`); and `cortex insight-refresh-fast`, **before** its ledger gate, so a
    project with no insight extraction still gets a fresh index on every commit
    (`insight.refresh-loops` Rule 9; a failure is logged to `pulse/reports/hook-errors.md` and the
    tier still exits 0 — hook-safe). Nothing else writes the file. `cortex validate` never writes
    it (read-only).

12. **Read-only consumers — four, at the 3.4 second revision (step 3).** The file is the sole
    recall surface any consumer reads: `hooks.search-annotate` (the PreToolUse Grep/Bash pointer),
    `hooks.pre-read-writeback` Rule 6 (the PreRead marker), `recall.why` (`cortex why`, `cortex
    recall`) and `recall.index-blocks` (the generated blocks in the two atlas `_index.md` files,
    rendered from the in-process compile). All four go through one loader in `src/recall/query.ts`
    (`hooks.search-annotate` Rule 12); none writes the file, none reads frontmatter to answer what
    the index answers, and no loop reads it. `constellation.json` stays curated-only and unchanged
    in shape by this spec (`bears_on` edges there are `constellation.compiler` Rule 10).

13. **`check.recall-index` (schema Appendix A; `error`; only when the file exists).** Valid JSON
    object; the five top-level keys present; `schemaVersion` a `MAJOR.MINOR` string; every subject
    value carries the four lists, each an array of strings; every id in `decided`/`evidence`/
    `threads` is a key of `entries` (observation themes are checked against
    `observation.<theme>` keys); every entry's `kind` in enum and `path` a non-empty string.
    Absence is never a finding. **(3.4 fifth revision)** `rules` and `bugs` are checked when
    present — arrays of strings whose ids are keys of `entries` — and tolerated when absent
    (an index written before this revision is valid until the next `cortex scan` rewrites it;
    the compiler always writes all six); the `kind` enum gains `rule | compass-doc | bug`.

14. **Deterministic Core** (R-001): frontmatter reads, set operations and JSON serialisation. No
    LLM, no network, no subprocess.

15. **Rules are carriers (3.4 fifth revision; brief §1.2, §3.2).** Every `compass/rules/R-*.md`
    whose frontmatter parses and whose `status` is not `retired` contributes an `entries` row of
    kind `rule` and, for each subject it bears on, `R.id` to `subjects[X].rules`. A rule has no
    `bears_on`; its subjects are **derived**: (a) for each `governs` glob, the glob's literal
    directory prefix — the part before the first glob metacharacter, trailing `/` stripped —
    when that prefix names an existing directory (`src/db/**/*.ts` → `src/db`; a bare `**/*.ts`
    yields none), and (b) the files the glob matches on disk, sorted, the first **20** per rule
    across all its globs (`RULE_GOVERNS_SUBJECT_CAP`, exported), plus (c) every `related_specs`
    id that resolves in the project index. The derived refs are also the entry's `keywords`
    alongside the title tokens (Rule 8). A `retired` rule keeps no entry and no subject.
    Directory prefixes are what make a search *into* `src/db/` find the rule
    (`hooks.search-annotate` Rule 5b stops at the first segment for source paths, so a
    file-only subject would never match a directory grep).

16. **Compass documents are keyword-only carriers.** `compass/environment.md`,
    `preferences.md`, `do-not-repeat.md` and `standing-authorities.md`, each when present,
    contribute an `entries` row of kind `compass-doc` (Rule 8's id, title and keyword shape) and
    **no subject**: they bear on nothing in particular, and they are reached by keyword match
    only — the headline failure the brief records ("scheduled" was in `environment.md`'s
    headings and six sessions never opened it) is a keyword hit on this entry. No other compass
    file qualifies; `_index.md` files are scaffolding, not carriers.

17. **Entailment 4 — open and triaged bugs only.** A `compass/bugs/B-*.md` whose `status` is
    `open` or `triaged` contributes an `entries` row of kind `bug` and `B.id` to
    `subjects[X].bugs` for every `affects` entry `X` that resolves **by shape** (schema §6:
    `R-NNN` → the rule subject, a path → the normalised path subject, else a spec id; an
    unresolved entry increments `counters.droppedRefs` as any ref does). A `resolved` bug keeps
    its `entries` row — a consumer can still name it — and contributes to **no** subject: the
    `bugs` list is the "currently broken" surface (`compass.bug-currency` Rule 6), and a fixed
    bug on it would be the stale ticket the brief spent an evening on. Ordering inside the list
    is the usual sorted-and-deduplicated; consumers that want "newest first" sort by the entry's
    `date` (the bug's `opened`).

## Acceptance Criteria

### The emitted file passes its own check

- **Given** a project with two decisions, one evidence file, three threads and one observation,
  each with resolving `bears_on`
- **When** `writeRecallIndex(root)` runs
- **Then** `.cortex/recall-index.json` exists and `cortex validate` reports zero
  `check.recall-index` errors

### A superseded decision keeps its entry and loses its subjects

- **Given** `atlas/decisions/2026-07-01-a.md` with `bears_on: [R-001]` and
  `atlas/decisions/2026-08-01-b.md` with `bears_on: [R-001]` and `supersedes: [2026-07-01-a.md]`
- **When** the index is compiled
- **Then** `subjects["R-001"].decided` is exactly `["decision.2026-08-01-b"]`, and `entries`
  holds both `decision.2026-07-01-a` and `decision.2026-08-01-b`

### Only open threads reach a subject

- **Given** `T-001` (open), `T-002` (answered) and `T-003` (expired), each with
  `bears_on: [.specflow/specs/pulse/hygiene.spec.md]`
- **When** the index is compiled
- **Then** `subjects[".specflow/specs/pulse/hygiene.spec.md"].threads` is exactly `["T-001"]` and
  `entries` holds all three ids

### Evidence flows through the citing decision and directly

- **Given** `atlas/evidence/2026-09-15-usage.md` (`E`) with `bears_on: [pulse.usage]`, and a
  current decision `D` with `sources: [../evidence/2026-09-15-usage.md]` and
  `bears_on: [schema:§5, R-003]`
- **When** the index is compiled
- **Then** `subjects["schema:§5"].evidence`, `subjects["R-003"].evidence` and
  `subjects["pulse.usage"].evidence` each equal `["evidence.2026-09-15-usage"]`

### A superseded evidence file is dropped from every evidence list

- **Given** `2026-09-01-usage.md` and `2026-09-15-usage.md` both with
  `bears_on: [pulse.usage]`, the latter with `supersedes: [2026-09-01-usage.md]`, and a decision
  citing the *older* one
- **When** the index is compiled
- **Then** every `evidence` list that mentions usage contains only `evidence.2026-09-15-usage`,
  and `entries` still holds `evidence.2026-09-01-usage`

### An observation contributes its theme

- **Given** `insight/observations/working-style.md` with `bears_on: [R-001, concept:hook-safety]`
  where the concept exists
- **When** the index is compiled
- **Then** `subjects["R-001"].observations` and `subjects["concept:hook-safety"].observations`
  both equal `["working-style"]`, and `entries["observation.working-style"].kind` is `observation`

### Unresolved refs are dropped and counted, never fatal

- **Given** a thread with `bears_on: [src/gone.ts, R-999, .cortex/compass/rules/R-001-core-no-llm-calls.md]`
- **When** the index is compiled
- **Then** the only subject it contributes is
  `.cortex/compass/rules/R-001-core-no-llm-calls.md`, `counters.droppedRefs` is 2, and the
  compile succeeds

### Path spellings collapse to one subject

- **Given** a decision with `bears_on: [./src/pulse/usage.ts]` and a thread with
  `bears_on: [src/pulse/usage.ts]`
- **When** the index is compiled
- **Then** there is exactly one subject key `src/pulse/usage.ts`, carrying both

### Keywords are names, never bodies

- **Given** a decision titled `Insight's pull-only stance is widened to permit concept names at
  SessionStart` with `bears_on: [schema:§5]` and a 400-word body
- **When** the index is compiled
- **Then** its `keywords` are exactly `["concept", "insight", "names", "only", "permit", "pull",
  "schema:§5", "sessionstart", "stance", "widened"]` and no token from the body appears

### Dependencies are not closed over

- **Given** a decision with `bears_on: [pulse.hygiene]` and a spec `pulse.threads` whose
  `depends_on` includes `pulse.hygiene`
- **When** the index is compiled
- **Then** `subjects["pulse.threads"]` is undefined

### Deterministic modulo timestamp, and empty inputs compile

- **Given** any project, and separately a project with none of the four input directories
- **When** the index is compiled twice for the first and once for the second
- **Then** the first pair is byte-identical after removing the `generated` line; the second yields
  empty `subjects` and `entries` with zero counters and no error

### scan, init and the post-commit tier all build it; validate does not

- **Given** an initialised project with the constellation compiled
- **When** `cortex scan` runs, then `cortex init --force`, then `cortex insight-refresh-fast` in a
  project with no `insight/ledger.json`, then `cortex validate` after deleting the file
- **Then** after each of the first three `.cortex/recall-index.json` exists with a fresh
  `generated`, the fast tier exits 0, and after `validate` the file still does not exist

### A rule bears on its governs prefixes, its matched files and its related specs

- **Given** `compass/rules/R-014-x.md` with `governs: ["src/db/**/*.ts"]`,
  `related_specs: [core-cli.scan]`, a `src/db/` directory holding `schema.ts` and
  `migrate.ts`, and the spec `core-cli.scan` present
- **When** the index is compiled
- **Then** `subjects["src/db"].rules`, `subjects["src/db/schema.ts"].rules`,
  `subjects["src/db/migrate.ts"].rules` and `subjects["core-cli.scan"].rules` each equal
  `["R-014"]`, `entries["R-014"].kind` is `rule`, its `date` is `""`, and its `keywords` contain
  `src/db`, `src/db/schema.ts` and `core-cli.scan`

### A governs glob matching 30 files caps at 20 subjects, and a retired rule contributes nothing

- **Given** a rule whose one glob matches 30 files, and a second rule with `status: retired`
- **When** the index is compiled
- **Then** the first rule appears in exactly 20 file subjects' `rules` lists (the first 20 in
  sorted order) plus its directory prefix, and the second rule has neither an entry nor a subject

### A compass document is a keyword-only entry built from headings and bold spans

- **Given** `compass/environment.md` whose headings are `# Environment` and
  `## Scheduled QA jobs`, whose body contains the bold span `**registry path**` and the prose
  sentence `the nightly job runs against staging`
- **When** the index is compiled
- **Then** `entries["compass.environment"]` has `kind: compass-doc`, `title: Environment`,
  `keywords` containing `scheduled`, `jobs`, `registry`, `path` and `environment` but not
  `nightly` or `staging`, and no subject's list contains `compass.environment`

### Only open and triaged bugs reach a subject

- **Given** `B-019` (`open`, `affects: [schema.validator, src/schema/checks/xref.ts]`),
  `B-020` (`triaged`, `affects: [R-001]`) and `B-003` (`resolved`, `affects: [R-001]`)
- **When** the index is compiled
- **Then** `subjects["schema.validator"].bugs` and `subjects["src/schema/checks/xref.ts"].bugs`
  equal `["B-019"]`, `subjects["R-001"].bugs` equals `["B-020"]`, and `entries` holds all three
  ids with `kind: bug`

### A malformed index is an error, an absent one is nothing

- **Given** `.cortex/recall-index.json` whose `subjects["R-001"].decided` names an id absent from
  `entries`, then the file deleted
- **When** `cortex validate` runs twice
- **Then** the first run carries one `check.recall-index` error naming the id; the second carries
  no `check.recall-index` violation

## Notes

- **Home.** `.cortex/recall-index.json` — next to `constellation.json`, the other compiled,
  regenerable, gitignored file (schema Decision 1's quadrant). Not under `pulse/` (pulse is
  transient *loop* output with its own retention rules; this file is rebuilt from durable inputs
  and has no lifecycle of its own) and not under `insight/` (committed, machine-owned — a
  gitignored file there would be the one exception to "insight is committed in full").
- **Why the post-commit tier and not a new hook.** The recall index goes stale exactly when a
  decision, evidence file or thread changes; decisions and evidence change by commit, threads by
  session end. The commit half rides the fast tier that already runs on every commit; the
  session-end half is a step-3 decision (the SessionEnd hook could rebuild it, but until a
  consumer reads threads from the index there is nothing to keep fresh).
- **Why three rules and not a general graph.** Each rule answers a question a hook will ask;
  none is a generic traversal. Rule 7 records the one traversal that was considered and refused.
- **Why compass joined the carriers (3.4 fifth revision, 2026-09-17).** The index inverted
  conclusions (decisions, evidence, threads, observations) and left the "must" layer out — a
  session grepping `src/db/` learned what was decided about it but not which rule governs it,
  and a read of `src/schema/checks/xref.ts` said nothing about the open bug filed against it.
  The wave brief's headline failure was a compass document nobody opened. Rules, bugs and the
  four compass documents are now entries; rules and open bugs are subjects' fourth and fifth
  lists. Nothing about the first four carriers changed, and the no-body-text line holds: a
  rule's subjects are paths and ids, a document's keywords are its headings.
- **Why bugs use `affects` and rules derive from `governs`.** Neither has `bears_on`, and
  adding one would duplicate a field that already says what the artefact is about. Deriving
  subjects from the existing field means every bug already filed is a carrier the day this
  ships, with nothing to backfill.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
