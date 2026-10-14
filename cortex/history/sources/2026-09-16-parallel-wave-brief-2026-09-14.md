---
about: parallel-wave-brief-2026-09-14
permanence: stable
verified: "2026-09-16 (observed)"
origin:
  - migrated:archive/documents/parallel-wave-brief-2026-09-14@d7ed910
  - "external:external project coordinator (unnamed) — coordinator of a six-session, 16-hour parallel wave on a Flask + React + Expo …"
aliases:
  - archive.parallel-wave-brief-2026-09-14
captured: "2026-09-16"
raw: history/sources/raw/2026-09-16-parallel-wave-brief-2026-09-14.md
---

## summary

# Parallel-wave improvement brief — summary

Source: `../source.md` (verbatim; gitignored). Kind `brief` (`../../../types/brief.yaml`).
Author: the coordinator of six parallel Claude Code sessions on an external production
project (Flask + React + Expo monorepo, ~850 tracked Cortex files, schema **3.3**, modules
compass / atlas / archive / insight / pulse). Written 2026-09-14 after one continuous 16-hour
session (2026-09-13/14) that shipped an eight-PR release, filed 17 tickets and wrote 7 compass
rules. Shared with Pedro 2026-09-16; ingested the same day against Cortex schema **3.4** at
commit `6014b09`.

## The brief's thesis

Cortex's bottleneck in a long-lived multi-session workload is **retrieval, integrity and
freshness**, not coverage. The headline failure: six sessions spent hours treating two
scheduled QA jobs as a black box while `compass/environment.md` already named the ten tasks,
the registry path and the editing procedure. "The content was there. Retrieval failed."
Every ask is aimed at getting existing knowledge to the moment of need, checking the graph
the design promises, or stamping inferred knowledge with "as of when".

## Headline table — each item against Cortex at 3.4 (2026-09-16)

| § | Item | Status | Where it stands today |
|---|---|---|---|
| 0 / 1.1 | Non-implementer (coordinator, reviewer, planner) read protocol | **new** | CLAUDE.md protocol addresses "before working a task"; no role-aware wording anywhere. |
| 1.2 | Surface `environment.md` at session start / first tool use | **new** | Reachable only via `compass/_index.md`; 2026-09-16 retired the session-start coverage map, so nothing is loaded at start. |
| 1.3 | Instrument whether `insight/` is used | **already-addressed** | `pulse.usage` counts `cortex insight` invocations; `atlas/evidence/2026-09-15-usage.md` and `2026-09-16-usage.md` record the numbers; the 2026-08-05 decision reversed pull-only insight on that basis. |
| 2.1 | Duplicate rule id within a module not caught | **verified-defect** | `checkXrefUnique` (`src/schema/checks/xref.ts`) scans only the two spec globs; two `compass/rules/R-026-*.md` files sharing `id: R-026` pass `cortex validate` (orchestrator, 2026-09-16). Violates schema §6 global rule 1. Filed as B-019 the same day. |
| 2.1 | Rule number must agree across filename / `id:` / H1 | **partially-addressed** | `check.rule` errors when `id` disagrees with the filename prefix; the H1 heading is not compared (orchestrator, 2026-09-16). |
| 2.1 | Index completeness (entries vs rules) as a warning | **new** | `check.index-shape` checks the prompt shape, not coverage. |
| 2.1 | Validate that the citation graph resolves | **does not hold at 3.4** | A dangling `source:` IS an error (§6 rule 4, `check.xref`; orchestrator, 2026-09-16). Likely true at the author's 3.3 or a symptom of their 16 other errors — see `contradictions.md`. |
| 2.2 | Id scheme for parallel authorship (slug identity or append-only registry) | **new** | Rules and bugs stay sequential; only `S-`/`T-` ids have a counter file. |
| 3.1 | Commit stamp on inferred knowledge | **partially-addressed** | Per-file insight entries already carry `built_at_commit` and `source_sha256` (§4.10.2); `cortex insight file` output does not print them (verified 2026-09-16). The ask is surfacing, not storing. |
| 3.1 | Commit stamp on bug-ledger entries | **new** | §4.2 has `opened`/`resolved` datetimes, no commit. |
| 3.2 | A "currently true" surface (known-broken, owner, fix in flight) | **partially-addressed** | Open threads (`pulse.threads`) plus `hooks.prompt-route` / `hooks.search-annotate` pointers cover "still open"; bug `status:` covers "known-broken"; nothing carries owner or in-flight fix. |
| 4.1 | Capture ritual for recurring traps | **partially-addressed** | `hooks.session-end` captures findings, approvals, questions deterministically; `<cortex:finding>` tag; `cortex thread promote --to compass/bugs`. No end-of-task "did you lose time?" prompt; our own `do-not-repeat.md` also has one free-text entry and no rule. |
| 4.2 | Lightweight decision capture, promotable later | **partially-addressed** | Approval threads + `cortex thread promote --to atlas/decisions` draft a decision from one paragraph; `decision-candidate` via session-observe. No explicit one-line "what / why / rejected" form. |
| 5 | Placement guidance generated at adoption | **new** | `cortex init` writes the CLAUDE.md Cortex section; it does not state where prose vs knowledge lives relative to the ignore rules. |
| 6 | Module `visibility:` declaration / operational-specifics warning | **new** | RULES.md rule 12 (pointers, never secrets) is adjacent but does not cover aggregate reconnaissance in a public repo. |
| 7 | Keep: rules/ as durable home, rule format, citation frontmatter, compass/atlas/insight split | no action | Confirms the design; recorded in `evidence.md`. |

## Files in this extraction

- `claims.md` — the brief's factual claims, numbered, with the section they come from.
- `asks.md` — every suggestion, in the author's priority order, with our status and the
  route (pulse proposal / spec change / no action).
- `evidence.md` — the cost figures and incidents the author attaches to each claim, plus what
  the author says worked.
- `contradictions.md` — where the brief's description of Cortex disagrees with schema 3.4 or
  with the recall work shipped 2026-09-15/16.

## claims

# Claims

Factual statements the brief makes, numbered for citation. "Author" is the external
coordinator; all figures are theirs (see `evidence.md`). Cortex context: their project ran
schema 3.3 with ~850 tracked `.cortex/` files.

## Retrieval (brief §0–§1)

- **C-01** (§0) The most expensive unknown of the night — where two scheduled QA jobs were
  defined — was already answered in `compass/environment.md` (ten named tasks, registry path,
  editing procedure). Six sessions filed a ticket calling them "outside the repo".
- **C-02** (§1.1) The CLAUDE.md protocol ("before working a task, read the relevant
  `_index.md`") was followed by every working session and by no coordinating session. The
  coordinator never opened `compass/` in sixteen hours because its brief said "do not read
  source", which it generalised to the knowledge layer.
- **C-03** (§1.2) `environment.md` (fourteen lines) answered most environment friction of the
  night and is discoverable only by opening `compass/_index.md` and choosing to follow it.
- **C-04** (§1.3) `cortex insight` was not mentioned once in sixteen hours of reports across six
  sessions, while sessions read source constantly. The author does not claim nobody ran it.

## Integrity (brief §2)

- **C-05** (§2.1) Two rules carried `id: R-026` under different filenames. `cortex validate`
  reported 16 errors and none was this. Four sessions independently rediscovered it.
- **C-06** (§2.1) Neither R-026 appeared in the compass `_index.md`, which listed 2 of 26 rules.
- **C-07** (§2.1) A session wrote a test in the project's own pytest suite to check: no id
  issued twice; filename, `id:` and H1 agree; the index links only rules that exist.
- **C-08** (§2.1) `cortex validate` "validates layout and frontmatter shape but not whether
  references point at anything". **Does not hold at 3.4** — see `contradictions.md` X-01.
- **C-09** (§2.2) Rule and bug ids are sequential, and parallel sessions on separate branches
  all reach for "the next one"; ledger id collisions were already a known recurring trap. The
  project solved the same problem for DB migrations with random revision ids.

## Freshness (brief §3)

- **C-10** (§3.1) Nothing in an insight entry says which commit it was true at. **Partially
  wrong at 3.4** — entries store `built_at_commit` / `source_sha256`; the CLI does not print
  them. See `contradictions.md` X-02.
- **C-11** (§3.1) The night's single most expensive failure was a scheduled job filing a
  detailed ticket against a six-day-old checkout whose recommended fix had shipped twice; a
  session spent an evening disproving it. One line — "ran against `<commit>`" — would have
  been the tell.
- **C-12** (§3.1) Principle the wave arrived at: a report that does not say what it ran against
  is not evidence. A knowledge layer is a report.
- **C-13** (§3.2) Nothing answers "what is known-broken right now, who owns it, is a fix in
  flight" — the gap that let four sessions rediscover one defect and re-derive workarounds for
  things fixed an hour earlier on unmerged branches.

## Capture (brief §4)

- **C-14** (§4.1) `compass/do-not-repeat.md` is empty while ~45 operational traps live in the
  coordinator's per-user memory file and do not travel between machines.
- **C-15** (§4.1) The missing thing is a ritual, not a file: capture must be part of finishing a
  task, and writing must be cheaper than rediscovering.
- **C-16** (§4.2) ~25 decisions were made in one night; `atlas/decisions/` holds ten narrative
  records; all 25 went to an untracked local plan file because a narrative record is too
  expensive mid-wave.

## Placement and visibility (brief §5–§6)

- **C-17** (§5) CLAUDE.md called the untracked prose directory "the one home for prose" while
  the ignore rule two lines above said "Cortex knowledge lives in `.cortex/` instead". Three
  sessions and the coordinator read the first and not the second, and a ticket recommended
  tracking the prose directory — which would have published internal notes to a public repo.
- **C-18** (§6) `compass/environment.md` accumulated, by reasonable increments, a production
  map (VM address, project/zone, SSH command, container ports, identity accounts, the fact that
  a lower-attention environment holds unanonymised production data). No secrets, but the
  aggregate is reconnaissance, and the repository is public.

## What worked (brief §7)

- **C-19** `compass/rules/` as the durable home was right: seven overnight rules survived;
  everything written to the untracked prose directory did not.
- **C-20** The rule format carries reasoning well — one rule shipped with its own correction in
  the body.
- **C-21** Citation frontmatter did its job wherever used; several times a claim was traced
  back to its bug and found overstated.
- **C-22** The compass (must) / atlas (why) / insight (is) separation held under pressure; every
  placement argument resolved against those definitions.

## asks

# Asks

Every suggestion in the brief, in the author's own priority order ("Suggested order of
work"), with the claim it rests on (`claims.md`), our status at schema 3.4 on 2026-09-16, and
the route. Routes: **pulse** = a `promotion` proposal in
`.cortex/pulse/reports/archive-ingestion.md` awaiting `cortex pulse-accept`; **spec** = a
spec-shaped change for `specflow-ingest` / `specflow-spec-editor`, outside the pulse gate
(`.specflow/` is not a permitted pulse target, schema §4.5.1); **none** = no action.

| # | Ask (brief §) | Rests on | Status | Route |
|---|---|---|---|---|
| A-01 | `cortex validate` fails on a duplicate id within a module (§2.1) | C-05, C-07 | **verified-defect** — `checkXrefUnique` scans `.specflow/` only; §6 global rule 1 names `compass/rules/` and `compass/bugs/` too | filed as **B-019** on 2026-09-16 (its change plan adds `schema.validator` Rule 12 + three ACs); pulse S-029 appends this brief as its external evidence |
| A-02 | Fail when a rule's number disagrees across filename / `id:` / H1 (§2.1) | C-05, C-07 | **partially-addressed** — filename ↔ `id` is checked (`check.rule`); H1 is not | spec: extend `check.rule` (and `check.bug`) to compare the H1 prefix |
| A-03 | Report index completeness — entries vs rules — even as a warning (§2.1) | C-06 | **new** | spec: `check.index-shape` or a new `check.index-coverage` warning |
| A-04 | Validate that the citation graph resolves (§2.1) | C-08 | **does not hold at 3.4** — dangling `source:` is already an error (X-01) | none; note back to the author |
| A-05 | `generated_at_commit` on insight entries, surfaced in `cortex insight` output (§3.1) | C-10, C-11 | **partially-addressed** — stored as `built_at_commit` / `source_sha256` (§4.10.2); not printed | spec: print the stamp in the `cortex insight file` header line |
| A-06 | The same commit stamp on bug-ledger entries (§3.1) | C-11 | **new** — §4.2 carries `opened`/`resolved` only | spec: schema §4.2 optional `observed_at_commit` (or similar); needs Pedro's approval (contract) |
| A-07 | A capture ritual at task end: "did you lose time to something the next person will too?" → one line (§4.1) | C-14, C-15 | **partially-addressed** — `hooks.session-end` records findings/approvals/questions; `<cortex:finding>`; `cortex thread promote --to compass/bugs`. No prompt asks the question | spec: a `Stop`/`SessionEnd`-side nudge or a `finding kind="trap"` route into `do-not-repeat.md` |
| A-08 | Name non-implementer roles in Cortex's own guidance; the read-the-index protocol applies to them more (§1.1) | C-01, C-02 | **new** | pulse S-030 (preferences, repo practice) + spec: generated CLAUDE.md Cortex section / `_index.md` wording |
| A-09 | Treat `environment.md` as load-at-start, or surface it on first tool use (§1.2) | C-01, C-03 | **new** — the session-start coverage map was retired 2026-09-16; a pointer-grammar line at first tool use would fit `hooks.search-annotate` / `hooks.prompt-route` precedent | spec: `hooks.session-start` or `hooks.prompt-route` first-prompt pointer, under RULES 11 budgets |
| A-10 | Instrument `insight/` discovery before extending it (§1.3) | C-04 | **already-addressed** — `pulse.usage`, `atlas/evidence/2026-09-15-usage.md`, `2026-09-16-usage.md`; the 2026-08-05 pull-only reversal was made on that measurement | none |
| A-11 | Id scheme for parallel authorship: slug-as-identity or an append-only registry with loud merge conflicts (§2.2) | C-09 | **new** — only `S-`/`T-` ids have a counter; `R-`/`B-` are "next after highest on disk" | spec + decision; contract change (schema §4.1/§4.2 filenames), Pedro's call |
| A-12 | A "currently true" surface: known-broken, owner, fix in flight; transient, read before starting in a familiar area (§3.2) | C-13 | **partially-addressed** — open threads + `hooks.prompt-route` / `hooks.search-annotate` pointers; bug `status:`; no owner / in-flight field | spec: possibly a `bears_on`-carrying view over open bugs + threads in the recall index (`recall.recall-index`) |
| A-13 | Lightweight decision form (what / why / rejected), promotable later (§4.2) | C-16 | **partially-addressed** — approval threads → `cortex thread promote --to atlas/decisions` drafts a decision; `decision-candidate` from session-observe | spec: a `finding kind="decision"`-style tag, or document the existing promote path as the form |
| A-14 | Generate placement guidance as one authoritative statement at adoption (§5) | C-17 | **new** | spec: `cortex init` CLAUDE.md section + `.gitignore` comment written together |
| A-15 | A `visibility:` declaration per module, or a validator warning on operational specifics (hostnames, IPs, ports, account ids) in tracked files (§6) | C-18 | **new** — RULES 12 covers secrets, not aggregate specifics | spec + RULES.md rule 12 amendment; contract change |
| A-16 | Do not change: `rules/` as durable home, the rule format, citation frontmatter, the compass/atlas/insight split (§7) | C-19–C-22 | confirmation | none |

## Genuinely new at 3.4 (nothing shipped 2026-09-15/16 touches them)

A-03 index completeness, A-06 commit stamp on bugs, A-08 non-implementer read protocol,
A-09 `environment.md` surfacing, A-11 id scheme for parallel authorship, A-14 placement
guidance at adoption, A-15 module visibility declaration. A-12 ("currently true") is new in
its owner / fix-in-flight half.

## Partly addressed by the recall work (specs shipped 2026-09-15/16)

- `hooks.session-end` + `pulse.threads` (2026-09-15, commit `3b8a0c7`): A-07 capture, A-13
  decision capture, A-12 "still open".
- `schema.bears-on` + `atlas.evidence` + `recall.recall-index` (2026-09-15, `6e76d4d`): A-10
  instrumentation record, A-12 the forward edge a "currently true" view would be compiled from.
- `hooks.search-annotate` + `hooks.pre-read-writeback` Rule 6 (2026-09-15, `312a00b`): the
  pointer grammar and token budget an `environment.md` surfacing (A-09) would reuse.
- `hooks.prompt-route` + `hooks.pre-read-writeback` Rule 7 (2026-09-16, `7dec509`): first-prompt
  resumption is the closest existing hook to A-09's "first tool use".

## evidence

# Evidence

The costs, counts and incidents the brief attaches to its claims (`claims.md`). All figures
are the author's, from one project and one 16-hour window (2026-09-13/14); none has been
re-measured here. Where Cortex holds its own measurement of the same thing it is noted.

## The wave

| Figure | Value | Brief § |
|---|---|---|
| Parallel sessions | 6 | header |
| Duration | 16 hours, one continuous session | header |
| Shipped | one release of 8 PRs | header |
| Tickets filed | 17 | header |
| Compass rules written | 7 (all survived; untracked prose did not) | header, §7 |
| Tracked `.cortex/` files | ~850 | header |
| Schema | 3.3 | header |
| Decisions made by the coordinator | ~25, none reached Cortex | §4.2 |
| Narrative decision records already in `atlas/decisions/` | 10 | §4.2 |
| Operational traps in the coordinator's per-user memory | ~45, none in `do-not-repeat.md` | §4.1 |

## Incidents with a cost attached

- **E-01 The environment black box** (§0, C-01). Hours across six sessions; one ticket filed
  as "definitions live outside the repo"; recommendations recorded as "unenforceable";
  escalated to the owner. Answer was in `compass/environment.md` the whole time.
- **E-02 The R-026 collision** (§2.1, C-05). Discovered four separate times by four sessions in
  one evening from four directions (fresh number, reconciling, adding a rule, surveying
  frontmatter); three discoveries bought nothing. `cortex validate` reported 16 unrelated
  errors. Index listed 2 of 26 rules, so nothing in the tree revealed it. A project-side
  pytest test was written to cover what the validator did not.
- **E-03 The stale scheduled ticket** (§3.1, C-11). A scheduled job filed a confident, detailed
  ticket against a six-day-old checkout; its fix had already shipped twice; a session spent an
  evening disproving it. Named as the single most expensive failure of the night.
- **E-04 The placement ticket** (§5, C-17). Three sessions plus the coordinator misread the
  prose-directory guidance; a ticket recommended tracking the directory, which would have
  published internal notes to a public repository.
- **E-05 `insight/` silence** (§1.3, C-04). Zero mentions of `cortex insight` in six sessions'
  reports over 16 hours. Cortex's own instrument for the same question: `pulse.usage` and
  `atlas/evidence/2026-09-15-usage.md` / `2026-09-16-usage.md` (this repo, not theirs).
- **E-06 Aggregate reconnaissance** (§6, C-18). `environment.md` grew to a fourteen-line
  production map in a public repo — no secrets, but hostnames, ports, accounts, and the location
  of unanonymised production data.

## Verifications made at ingestion (this repo, schema 3.4, 2026-09-16, commit `6014b09`)

- **V-01** A dangling `source:` citation is caught by `cortex validate` as an error (schema §6
  global rule 4). The brief's §2.1 fourth bullet does not hold for 3.4.
- **V-02** Two `compass/rules/` files sharing `id: R-026` are **not** caught. `checkXrefUnique`
  in `src/schema/checks/xref.ts` builds its duplicate map from the dev and business spec globs
  only, although schema §6 global rule 1 names `compass/rules/`, `compass/bugs/` and atlas as
  well. `check.rule` does compare `id` with the filename prefix, so the collision requires two
  files both named `R-026-*.md`; an H1 heading disagreeing with `id` is not checked.
- **V-03** Insight per-file entries already carry `built_at_commit` and `source_sha256` in
  frontmatter (schema §4.10.2; e.g. `insight/anatomy/src/archive/formats.ts.md` has
  `built_at_commit: "c667a9a"`). `cortex insight file <path>` prints the level, centrality and
  line count but neither stamp. §3.1's ask is surfacing, not storing.
- **V-04** Cortex's own `compass/do-not-repeat.md` holds one free-text entry (iCloud resurrecting
  deleted files) and no rule pointer — the same shape as the author's C-14.

## What the author says worked (keep)

Seven rules written into `compass/rules/` overnight survived; a rule shipped with its own
correction in the body; citation frontmatter let sessions trace claims to bugs and find them
overstated; the compass / atlas / insight split resolved every placement argument. The brief
asks for none of these to change.

## contradictions

# Contradictions with our specs and schema

Where the brief's description of Cortex disagrees with schema 3.4 (`cortex-schema.md`), the
validator as implemented, or the recall work shipped 2026-09-15/16. The author wrote against
schema 3.3 on 2026-09-14; some gaps closed in the two days between. None of these weakens the
brief's thesis — they narrow which asks remain open (`asks.md`).

- **X-01 "validate does not check whether references point at anything"** (brief §2.1, C-08).
  Schema §6 global rule 4 makes an unresolved path or id an `error`, and a dangling `source:`
  on a rule is reported by `cortex validate` at 3.4 (verified 2026-09-16, `evidence.md` V-01).
  `check.provenance` likewise errors on a dangling `derives_from`. What is *not* checked is
  id uniqueness outside `.specflow/` (X-02) and H1 agreement — so the author's list of three
  wanted checks is one-third already true, one-third partially true, one-third a real gap.

- **X-02 Global rule 1 promises what the validator does not deliver.** Schema §6 global rule 1:
  "every `id` across `.specflow/specs/`, `.specflow/specs-business/`, `compass/rules/`,
  `compass/bugs/`, and atlas is unique within its kind … Duplicate → `error`."
  `checkXrefUnique` (`src/schema/checks/xref.ts`) reads only the two spec globs. This is not a
  contradiction *with* the brief — it confirms C-05 — but it is a contradiction between our
  schema and our implementation. Filed on ingestion day as **B-019**
  (`compass/bugs/B-019-duplicate-rule-and-bug-ids-pass-validate.md`, type `incomplete-rule`:
  `schema.validator` never imported §6 rule 1, so the check had no sentence to be wrong
  against). Pulse proposal S-029 appends this brief as B-019's external evidence.

- **X-03 "Nothing in an entry says which commit it was true at"** (brief §3.1, C-10). Schema
  §4.10.2 requires `built_at_commit` and `source_sha256` on per-file insight entries and they
  are present on disk (`evidence.md` V-03). The `cortex insight file` renderer omits them. The
  brief's remedy (a new field) is the wrong shape for 3.4; the right one is a one-line change
  to the CLI output.

- **X-04 "Nothing answers what is still open"** (brief §3.2, C-13). Since 2026-09-15 the threads
  ledger (`pulse.threads`) holds open questions, offers, approvals and findings with a
  lifecycle; `hooks.prompt-route` surfaces the previous session's open question on a session's
  first prompt and any mentioned open thread; `hooks.search-annotate` and the PreRead marker
  (`hooks.pre-read-writeback` Rule 6) point at open threads when a search or read touches
  their subject. What remains missing from the author's list is *owner* and *fix in flight*,
  and any view over open bugs by area.

- **X-05 "There is no cheap decision path"** (brief §4.2, C-16). `cortex thread promote T-NNN
  --to atlas/decisions` (since 2026-09-15) writes a DRAFT decision from an approval or finding
  thread with `provenance` from the session trail and `bears_on` carried over — a one-paragraph
  capture promotable later, which is the form the author asks for. It is not *documented* as
  that form anywhere a coordinator would read, which is the retrieval failure the brief is
  about.

- **X-06 "The knowledge layer is a report and nothing stamps it"** (brief §3.1, C-12). Atlas
  evidence files (`atlas.evidence`, 3.4) carry `instrument`, `window` and a denominator
  precisely so a number says what it was measured against, and pulse reports carry
  `generated`. The principle is already load-bearing in 3.4 for evidence and pulse; the gap is
  bugs (A-06) and the insight CLI surface (A-05).

- **X-07 "Insight was never cited" as a discovery problem to be studied** (brief §1.3, C-04).
  Cortex measured this on itself before the brief arrived (`atlas/evidence/2026-09-15-usage.md`)
  and acted on it (the 2026-08-05 decision `insight-pull-only-stance-reversed`; the 2026-09-16
  decision retiring the session-start coverage map). The author's project has no such
  instrument at 3.3; ours exists. The ask is answered for Cortex, unanswered for adopters
  until they upgrade.

## Not contradictions — confirmations worth naming

- The brief's §7 (rules as durable home, rule format, citation frontmatter, the
  compass/atlas/insight split) matches RULES.md rules 7, 8 and 15 and the five-module decision
  (`atlas/decisions/2026-07-07-five-module-architecture.md`).
- The brief's principle "propose, don't mutate" is nowhere stated by the author but every ask
  is compatible with RULES.md rule 7: none asks a loop to write compass or atlas directly.

<!-- 3.x fields of archive/documents/parallel-wave-brief-2026-09-14, carried verbatim by cortex migrate -->
```yaml
kind: brief
version: "2026-09-14"
status: active
source_filename: 2026-09-14-parallel-wave-improvement-brief.md
origin: "external project coordinator (unnamed) — coordinator of a six-session, 16-hour parallel wave on a Flask + React + Expo monorepo running Cortex schema 3.3; shared with Pedro on 2026-09-16"
```
