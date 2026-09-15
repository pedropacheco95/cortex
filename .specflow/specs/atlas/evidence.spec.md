---
id: atlas.evidence
status: implemented
depends_on:
  - core-cli.init
  - schema.bears-on
  - pulse.threads
  - pulse.usage
  - pulse.review-cli
governs:
  - "src/atlas/evidence.ts"
  - "src/schema/checks/evidence.ts"
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
---

# Evidence — `atlas/evidence/` and its three producers

## Intent

A measurement made once — "`cortex insight` was invoked twice in 55 sessions", "0 reads of
`atlas/decisions/` in 41" — is the reason two scaffolding specs and a schema revision exist, and
today it survives only as a number quoted inside a decision's prose, a line in a `pulse/` report
that the next run overwrites, or a transcript that gets pruned. The decision that reversed the
pull-only insight stance cites `../../pulse/reports/usage.md` in its `sources:` — a file whose
content has changed on every `cortex usage` since. Nothing gated holds the number, the window it
was taken over, or the instrument that produced it, so nothing can compare the next measurement
against it.

This spec adds the artefact kind that does (schema §4.3): `atlas/evidence/YYYY-MM-DD-<slug>.md`,
gated and committed like a decision, with typed `findings`, a `window` with its denominator, the
`instrument`, and a required `bears_on` (schema §6) naming what the number is about. Decisions
cite it through `sources:`; the recall index (`recall.recall-index`) carries it forward to every
subject the decision bears on. Three producers write it: two human verbs directly
(`cortex usage --record`, `cortex thread promote --to atlas/evidence`) and, for loops, only the
`evidence-candidate` pulse type — RULES 7 holds. This step ships the kind, its check, and the
producers; no hook reads evidence yet (step 3).

## Entities

- **READS:** `.cortex/atlas/evidence/*.md` (the check; the `supersedes` chain for
  `usage --record`); `pulse.usage`'s `UsageCounts` (in-process, for `--record`); the thread being
  promoted (`pulse.threads`); the project index and clause index (`schema.bears-on`, for the
  drafted `bears_on`).
- **WRITES:** `.cortex/atlas/evidence/<YYYY-MM-DD>-<slug>.md` (create only, never overwrite);
  `.cortex/atlas/evidence/_index.md` (create from the shipped template when absent — every
  producer, including `pulse-accept` for an `evidence-candidate`).
- **CREATES:** `atlas/evidence/` on demand in an existing project (`mkdir -p` + `_index.md`); on
  fresh projects `cortex init` scaffolds the empty directory with its `_index.md` like the other
  atlas subdirectories (schema §1).
- **Never touches:** anything outside `atlas/evidence/` (and, for `promote`, the thread's own
  status under `pulse/`; for `--record`, the usage report it already wrote).

## Rules

1. **Artefact (schema §4.3).** One file per measurement at
   `.cortex/atlas/evidence/<YYYY-MM-DD>-<slug>.md`. Frontmatter, **required**: `id`
   (`evidence.<YYYY-MM-DD>-<slug>`, equal to `evidence.` + the filename stem), `title`, `date`
   (iso-datetime), `kind` (enum `measurement | experiment | audit`), `instrument` (non-empty
   string — what produced the numbers: `pulse.usage`, `session`, `cortex validate`, a script
   name), `window` (map with `from` and `to` iso-dates or datetimes; optional `sessions`, a
   non-negative integer — the denominator), `findings` (non-empty list of
   `{ metric: string, value: number | string, unit?: string }`), `bears_on` (non-empty list of
   refs, `schema.bears-on`). **Optional:** `supersedes` (list of relative paths to earlier
   evidence files — the re-measurement chain), `provenance` (as decisions), `confidence`,
   `related_specs`, `sources`. Body: the narrative — how it was measured, what to compare it
   against; for `--record`, the usage report body verbatim.

2. **`check.evidence` (schema Appendix A; `error`).** Every `atlas/evidence/*.md` except
   `_index.md`: `id` shape and filename agreement; `date` iso; `kind` in enum; `instrument` a
   non-empty string; `window.from`/`window.to` iso; `window.sessions` a non-negative integer when
   present; `findings` a non-empty list whose every entry carries a string `metric` and a
   number-or-string `value`, and a string `unit` when present; `bears_on` a non-empty list of
   non-empty strings (resolution is `check.bears-on`'s); each `supersedes` entry resolves to a file
   under `atlas/evidence/`. The directory being absent is tolerated. The generic `check.atlas`
   pass (id present; `supersedes`/`sources` resolve) still runs over these files unchanged — this
   check adds the evidence-specific fields and never repeats those.

3. **Decisions cite evidence; citing a report is warned (schema §4.3, `check.atlas`).** A decision
   whose `sources:` entry resolves to a path under `.cortex/pulse/` gets a `warning` — "cites a
   transient report; record it as evidence" — at key `sources`. The remedy is a producer below and
   a re-pointed `sources:`. (The existing 2026-08-05 decision in this repo trips this by design;
   its re-pointing is a human act after `cortex usage --record` runs — see Notes.)

4. **Shared writer.** `src/atlas/evidence.ts` exports `EVIDENCE_KINDS`, `EVIDENCE_DIR`
   (`atlas/evidence`), `evidenceFilePayload(fields, now): { targetRel, payload }` (frontmatter in
   the Rule 1 field order, `title` JSON-quoted, `findings` as a YAML list of maps, body appended
   after a blank line), `ensureEvidenceDir(root)` (`mkdir -p` and write the shipped `_index.md`
   template when absent — `CORTEX_INDEXES['atlas/evidence']`, `core-cli.init`), and
   `latestEvidenceMatching(root, suffix)` (the lexicographically greatest `*-<suffix>.md` in the
   directory, or `undefined`). Every producer, including `pulse-accept`, goes through
   `ensureEvidenceDir` so the directory never exists without its index (RULES 9,
   `check.index-present`).

5. **Producer 1 — `cortex usage --record` (human verb; direct write).** `cortex usage` keeps its
   behaviour (`pulse.usage` Rules 1–11); with `--record` it additionally writes
   `atlas/evidence/<today>-usage.md` from the same `UsageCounts`:
   `id: evidence.<today>-usage`, `title: "Cortex usage over <sessions> sessions (<from> to <to>)"`,
   `kind: measurement`, `instrument: pulse.usage`, `window: { from: windowStart, to: windowEnd,
   sessions }`, `findings` in this fixed order — `searches.knowledge`, `searches.machinery`,
   `searches.document`, `searches.other`, one `insight.<verb>` per verb seen (sorted; `unit:
   invocations`), `recall.recall`, `recall.why`, `reads.atlas-decisions`, `reads.pulse-threads`,
   `pointers.fired`, `pointers.followed`, `questions.before-consult` (integers; `unit` omitted
   where the metric name says it) — `bears_on: [schema:§5, pulse.usage]`, and `supersedes:
   [<relative path of the previous *-usage.md>]` when `latestEvidenceMatching(root, 'usage')`
   finds one (else the key is omitted). Body: `renderUsageBody(counts)` verbatim. Refusals, exit
   1 and nothing written under `atlas/`: the counts are not `readable` ("nothing measurable —
   no evidence written": evidence of nothing is not evidence); the target exists (no clobber —
   one recording per day; delete it to re-record). The report under `pulse/reports/` is written
   first and regardless. A human-invoked verb writing atlas directly has the same standing as
   `pulse-accept` and `thread promote` (RULES 7 gates loops, not people).

6. **Producer 2 — `cortex thread promote T-NNN --to atlas/evidence` (human verb; `pulse.threads`
   Rule 12's third target).** Valid only for a thread of `kind: finding` whose body carries
   `**Kind:** measurement`; any other kind or thread → usage error, exit 2, nothing written.
   Flags: `--finding <metric>=<value>` (repeatable, **required**, at least one — the metric name
   and value are a human reading of the finding text that Core must not parse out of prose, the
   same stance as `--type` on a bug promote; `value` is stored as a number when the text parses
   as one, else as a string); `--bears-on <ref>` (repeatable; when given, replaces the thread's
   `bears_on`; when the resulting list is empty the verb refuses and names the flag). Draft:
   target `atlas/evidence/<today>-<slug>.md` (`decisionSlug` of the key text; no clobber, exit 1),
   `id`, `title` (key text, first 80 characters), `date` (now), `kind: measurement`,
   `instrument: session`, `window` from the trail — `from` the opener session record's `ended`
   when `pulse/sessions/<id>.json` exists, else the thread's `opened`; `to` likewise for the last
   session in `sessions:`, else `opened`; `sessions` = the trail length — `findings` from the
   flags in the order given, `bears_on`, `provenance:` with one `derives_from` per trail citation,
   body = the DRAFT line (`pulse.threads` Rule 12) then the thread body verbatim. On success the
   thread becomes `answered` with `resolved_by` = the new path, exactly as the other two targets.

7. **Producer 3 — `evidence-candidate` (loops; the gate).** Schema §4.5.1's seventh type: target
   root `.cortex/atlas/evidence/`, payload `**Proposed file:**` only (create; a re-measurement is a
   new file that `supersedes`, never an edit). `check.pulse` admits the type via the shared
   `SUGGESTION_TYPES` table (`src/pulse/types.ts`) and rejects any other root or payload shape for
   it; `pulse-accept` writes the payload verbatim after `ensureEvidenceDir`. **No loop emits it at
   3.4** — the type exists so the first loop that has a number worth keeping proposes a file
   instead of writing atlas. A proposed payload MUST be `check.evidence`-valid as written; accept
   does not repair it.

8. **Ids are dated slugs, not counters.** Like decisions (schema Decision 8), evidence has no
   `E-NNN` counter: the date plus a slug is the id, so two recordings on one day of the same
   instrument collide by design (Rule 5's no-clobber) and a different slug is a different
   measurement.

9. **Deterministic Core** (R-001). Every producer renders from counts, flags and thread fields
   already on disk — no LLM, no network, no subprocess. `--record` adds no instrumentation
   (`pulse.usage` Rule 1 is intact: it records what the read-side count already found).

10. **Nothing reads evidence in this step.** No hook injects it, no CLI verb queries it beyond
    `cortex validate`; the recall index (`recall.recall-index`) compiles it into `evidence` lists
    for step 3's consumers. `pulse.usage` Rule 10's tracked-subdirectory pair is not widened here
    (a third figure is a step-3 call once something is meant to read the directory).

## Acceptance Criteria

### An evidence file has the contract frontmatter

- **Given** `.cortex/atlas/evidence/2026-09-15-usage.md` with `id: evidence.2026-09-15-usage`,
  `title`, `date: 2026-09-15T15:58:00Z`, `kind: measurement`, `instrument: pulse.usage`,
  `window: { from: 2026-07-01, to: 2026-09-15, sessions: 41 }`,
  `findings: [{ metric: searches.knowledge, value: 54 }]`, `bears_on: [schema:§5, pulse.usage]`
- **When** `cortex validate` runs
- **Then** the report carries no `check.evidence`, `check.atlas` or `check.bears-on` violation
  for it

### Every required field is enforced, at error severity

- **Given** an evidence file missing `instrument`, with `kind: guess`, `findings: []`,
  `window: { from: yesterday }`, and `bears_on: []`
- **When** `cortex validate` runs
- **Then** the report carries five `check.evidence` errors at keys `instrument`, `kind`,
  `findings`, `window` and `bears_on`, and `conformant` is false

### Id and filename must agree; supersedes must point at evidence

- **Given** `2026-09-15-usage.md` carrying `id: evidence.2026-09-14-usage` and
  `supersedes: [../decisions/2026-07-07-scoped-extraction.md]`
- **When** `cortex validate` runs
- **Then** the report carries a `check.evidence` error at key `id` naming the filename and one at
  key `supersedes` naming the non-evidence target

### An absent directory is not a finding

- **Given** a project with no `.cortex/atlas/evidence/`
- **When** `cortex validate` runs
- **Then** no `check.evidence` or `check.layout` violation mentions evidence

### A decision citing a pulse report is warned

- **Given** `.cortex/atlas/decisions/2026-08-05-x.md` with
  `sources: [../../pulse/reports/usage.md]` (the file existing) and `bears_on: [schema:§5]`
- **When** `cortex validate` runs
- **Then** the report carries one `check.atlas` `warning` at key `sources` containing "record it
  as evidence", and no error for that file

### `usage --record` writes evidence from the same counts as the report

- **Given** a transcript fixture yielding 41 sessions from 2026-07-01 to 2026-09-15 with 54
  knowledge searches, 2 `cortex insight file` invocations and 0 `atlas/decisions` reads, and no
  `atlas/evidence/` directory, on 2026-09-15
- **When** `cortex usage --record` runs
- **Then** `.cortex/pulse/reports/usage.md` is written as before, and
  `.cortex/atlas/evidence/2026-09-15-usage.md` exists with `id: evidence.2026-09-15-usage`,
  `kind: measurement`, `instrument: pulse.usage`, `window.sessions: 41`, `findings` containing
  `{ metric: searches.knowledge, value: 54 }`, `{ metric: insight.file, value: 2, unit:
  invocations }` and `{ metric: reads.atlas-decisions, value: 0 }` in the Rule 5 order, no
  `supersedes` key, `bears_on: [schema:§5, pulse.usage]`, and a body equal to the report body;
  `atlas/evidence/_index.md` exists; `cortex validate` reports no error

### A second recording supersedes the first

- **Given** `atlas/evidence/2026-09-01-usage.md` exists
- **When** `cortex usage --record` runs on 2026-09-15
- **Then** the new file carries `supersedes: [2026-09-01-usage.md]`, and running it again the
  same day exits 1 naming the existing file, with `atlas/` unchanged

### Nothing measurable records nothing

- **Given** a stubbed home with no transcript directory
- **When** `cortex usage --record` runs
- **Then** the report is written naming the unreadable state, no file appears under
  `atlas/evidence/`, and the exit code is 1

### Promote to evidence drafts a schema-valid file from a measurement finding

- **Given** `T-007` open, kind `finding`, body `2 insight invocations over 55 sessions` with
  `**Kind:** measurement`, `bears_on: [pulse.usage, .specflow/specs/pulse/usage.spec.md]`,
  `sessions:` of two citations whose records carry `ended` values, on 2026-09-15
- **When** `cortex thread promote T-007 --to atlas/evidence --finding insight.invocations=2
  --finding sessions=55` runs
- **Then** `.cortex/atlas/evidence/2026-09-15-2-insight-invocations-over-55-sessions.md` exists
  with `id: evidence.2026-09-15-2-insight-invocations-over-55-sessions`, `kind: measurement`,
  `instrument: session`, `window` spanning the two records' `ended` with `sessions: 2`,
  `findings: [{ metric: insight.invocations, value: 2 }, { metric: sessions, value: 55 }]`,
  the thread's `bears_on`, two `provenance` entries, a body starting with the DRAFT line; `T-007`
  is `answered` with `resolved_by` equal to that path; and `cortex validate` reports no error

### Promote to evidence refuses the wrong kind and demands findings

- **Given** `T-008` open, kind `question`, and `T-009` open, kind `finding` with
  `**Kind:** conclusion`, and `T-010` open, kind `finding` with `**Kind:** measurement` and an
  empty `bears_on`
- **When** `cortex thread promote T-008 --to atlas/evidence --finding x=1` runs, then the same for
  `T-009`, then `cortex thread promote T-010 --to atlas/evidence` (no `--finding`), then
  `cortex thread promote T-010 --to atlas/evidence --finding x=1`
- **Then** all four exit 2 — the first two naming the kind, the third naming `--finding`, the
  fourth naming `--bears-on` — and after every refusal the threads and the filesystem are unchanged

### An evidence-candidate is gated like a decision-candidate

- **Given** `pulse/reports/x.md` with an `S-031` section `**Type:** evidence-candidate`,
  `**Target:** .cortex/atlas/evidence/2026-09-15-audit.md` and a `**Proposed file:**` payload
  that is `check.evidence`-valid, and no `atlas/evidence/` directory
- **When** `cortex validate` runs, then `cortex pulse-accept S-031`
- **Then** validate reports no `check.pulse` violation for the section; accept creates the file
  byte-exact, `atlas/evidence/_index.md` alongside it, and `cortex validate` then reports no error
- **And given** the same section with `**Target:** .cortex/atlas/decisions/y.md` or a
  `**Proposed addition:**` payload, **then** `check.pulse` reports an `error` for the section

### Only atlas/evidence is written by the producers

- **Given** any sequence of `cortex usage --record`, `cortex thread promote --to atlas/evidence`
  and `cortex pulse-accept` of an evidence-candidate
- **Then** every file created under `.cortex/atlas/` is beneath `.cortex/atlas/evidence/`, and
  the only other writes are the usage report, the promoted thread's status, and the suggestion
  status — nothing under `compass/`, `insight/`, or either spec tree

## Notes

- **Business parent.** This spec lives in `atlas/` because evidence is an atlas artefact, but it
  implements the scaffolding outcome (`assistant-reaches-for-cortex-instead-of-guessing`) — the
  same cross-domain link `pulse.usage` and `pulse.threads` carry — because its success metric,
  "the before-figure is recorded, not estimated", is exactly what an evidence file is. The atlas
  business outcome is about ingesting raw sources; a measurement is not a raw source.
- **The 2026-08-05 decision.** `decision.2026-08-05-insight-pull-only-stance-reversed` cites
  `../../pulse/reports/usage.md` and will carry the Rule 3 warning until a human runs
  `cortex usage --record` and re-points its `sources:` (the figures it quotes came from a report
  that has since been overwritten; the recording will be a *new* measurement, not a recovery of
  the old one — the narrative should say so). That is a close-out item in the plan, not an
  automatic rewrite.
- **`instrument: session` for promoted findings** is deliberate: the measurement was made by
  hand in a session, and the honest instrument name says so; `provenance:` carries the sessions.
- **Not done:** no `E-NNN` counter (Rule 8); no evidence line in the SessionStart coverage map or
  the `cortex usage` tracked-subdirectory pair (step 3, once something reads the directory); no
  `evidence-candidate` producer (Rule 7).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
