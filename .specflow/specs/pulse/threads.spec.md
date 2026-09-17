---
id: pulse.threads
status: implemented
depends_on:
  - core-cli.init
  - pulse.hygiene
governs:
  - "src/pulse/threads.ts"
  - "src/pulse/thread-cli.ts"
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
---

# Threads Ledger — `pulse/threads/` and `cortex thread`

## Intent

A thread is a thing a session left unresolved: a question it asked and nobody answered, an offer
nobody took up, an approval that was stated but never reached a gated file, a measurement or
conclusion that was made and would otherwise be re-derived, or a scratchpad artefact that would
otherwise be lost with the temp directory. Today these live only in transcripts, which get pruned.
The ledger gives each one an id, a lifecycle (`open → answered | dropped | expired`), and a place
under `pulse/` where a later step can reach for it instead of guessing. The `hooks.session-end`
hook opens and answers threads deterministically; a human drives the rest through `cortex thread`.
Nothing here injects anything anywhere — this step is the ledger, not the recall.

## Entities

- **READS:** `.cortex/pulse/threads/*.md` (the ledger); `.cortex/pulse/state/thread-counter`;
  `.cortex/pulse/sessions/*.json` (the newest prior record, Rule 10c); `.cortex/pulse/state/reads/<session-id>`
  (the `bears_on` seed, Rule 4); the session record assembled by `hooks.session-end` (in-process);
  `.cortex/atlas/decisions/` and `.cortex/compass/bugs/` (existing ids and filenames, for
  `promote` — Rule 12).
- **WRITES:** `.cortex/pulse/threads/T-NNN-<slug>.md` (create, edit in place — never delete);
  `.cortex/pulse/state/thread-counter`; **on `promote` only**, one new file under
  `.cortex/atlas/decisions/` or `.cortex/compass/bugs/` (Rule 12 — a human-invoked verb, the same
  standing as `pulse-accept`).
- **CREATES:** `pulse/threads/` on first thread (`mkdir -p`; `cortex init` does not scaffold it).
- **DELETES:** nothing. Expiry (`pulse.hygiene` Rule 8) is an in-place status edit.

## Rules

1. **Artefact.** One file per thread at `.cortex/pulse/threads/T-NNN-<slug>.md` — ungated,
   machine-owned, gitignored with the rest of `pulse/` (schema §4.5.3). Frontmatter, all required
   unless marked: `id` (`T-NNN`, matching the filename prefix); `kind` (enum
   `question | offer | approval | finding | artefact`); `status` (enum
   `open | answered | dropped | expired`); `opened` (iso-datetime); `session` (the
   `claude-sessions/<user>/<session-id>` citation of the opening session, schema §6); `sessions`
   (list of the same citation form — the trail of every session that raised the same thread, the
   opener first; Rule 7); `bears_on` (list of project-relative paths and bare ids — Rule 4; may be
   empty); `expires` (iso-datetime — `opened` + `THREAD_TTL_DAYS`, 30); optional `answered`
   (iso-datetime) and `resolved_by` (a project-relative path or a `claude-sessions/…` citation),
   both present iff `status` is `answered`. Body: the verbatim text (Rule 6). **Validated by**
   `check.threads` (schema Appendix A): id shape and filename agreement, enums, iso timestamps,
   `answered`/`resolved_by` presence iff answered — `warning` severity, like the rest of pulse.

2. **Ids.** `T-NNN` ids are allocated from `pulse/state/thread-counter` — a plain integer holding
   the last id ever allocated, missing file = 0 — by `allocateThreadIds(root, n)`, which mirrors
   `allocateSuggestionIds` in `src/pulse/suggestion-ids.ts` line for line (read, advance, persist
   before handing out; zero-padded to three digits, growing past 999 unpadded). Ids are monotonic
   and never reused, including after `dropped` or `expired`. The `T-` namespace is its own: it
   never collides with `S-NNN` because it never reads or writes `suggestion-counter`.

3. **Kinds are fixed by the record.** `hooks.session-end` Rule 9 maps the session record to threads
   one-for-one: `open_question` → one `question` or `offer` thread (its `kind` from the record);
   each `approvals[]` entry → one `approval` thread (`open` means "stated, not yet reflected in a
   gated artefact"); each `findings[]` entry → one `finding` thread; each `artefacts[]` entry with
   `copied: true` → one `artefact` thread. Uncopied artefacts open nothing. **Scheduled sessions**
   (`session_kind: scheduled`) open `finding` and `artefact` threads only — their questions,
   offers and approvals are addressed to nobody and are left in the record without a thread. No
   other producer opens threads in this step.

4. **`bears_on` seed.** Every thread opened from a session record carries, in order: (a) for a
   `finding` from a tag, the tag's own `bears_on` entries; then (b) every line of that session's
   read ledger `pulse/state/reads/<session-id>` (one project-relative path per line) that starts
   with `.cortex/` or `.specflow/`, in ledger order; deduplicated, **capped at 12** entries total.
   Absent ledger → only (a). Entries are recorded as written, never resolved or validated here —
   `bears_on` is the schema §6 forward edge (formalised at 3.4, `schema.bears-on`); on threads it
   stays shape-checked only (`check.threads`), because the ledger is ungated and its seeds are
   ledger paths that may since have moved. The recall index (`recall.recall-index`) resolves
   them and drops what no longer resolves.

5. **Slug.** `<slug>` is derived from the thread's key text (Rule 7) exactly as `decisionSlug` in
   `src/insight/session-observe.ts` derives a decision filename slug — lowercased, non-alphanumerics
   collapsed to `-`, trimmed, at most 60 characters — with fallback `thread`. The slug is
   cosmetic: the id is the handle, and two threads may share a slug.

6. **Body per kind.** `question`/`offer`: the recorded paragraph. `approval`: two lines,
   `**Approved:** <approved text>` and `**By:** <approval text>`. `finding`: the finding text,
   followed on its own line by `**Kind:** measurement|conclusion` and `**Source:** tag|lexicon`.
   `artefact`: `**Path:** <original path>`, `**Heading:** <first_heading or ->`, and
   `**Copy:** .cortex/pulse/scratch/<session-id>/<basename>`. Texts are stored verbatim (already
   capped by the record).

7. **Dedupe by normalised key (B-010 key).** Each thread has a **key**: `normaliseText` (from
   `src/pulse/distil.ts` — lowercase, whitespace collapsed, trimmed) of the paragraph
   (question/offer), of the *approved* text (approval), of the finding text (finding), or of the
   original path (artefact). Before opening a thread the hook compares the key against every
   existing thread whose `status` is `open`: on a match **no new thread is opened**; instead this
   session's citation is appended to the matched thread's `sessions:` trail (if not already
   present) and the matched id is what the record's `threads_opened` reports. Threads that are
   `answered`, `dropped` or `expired` never block a new thread — a question that comes back after
   being answered is a new thread.

8. **Creation order.** Within one record, threads are opened in the order of Rule 3 (question/offer,
   approvals, findings, artefacts) with consecutive ids, and `threads_opened` lists them in that
   order (deduped ids included, at the position they would have taken).

9. **Answered detection is deterministic and runs once per session end**, over the threads that
   were `open` **before** this run (threads opened by this same run are never answered by it). An
   open thread `T` becomes answered by session `S` when any of (over `S`'s assistant messages and
   **human** user messages — `hooks.session-end` Rule 7 excludes harness-injected user entries):
   (a) **id mention** — the text of any user or assistant message of `S` contains `T`'s id as a whole word (`/\bT-\d{3,}\b/`); (b) **key
   mention** — `normaliseText` of `S`'s concatenated message texts contains `T`'s key, provided the
   key is at least 20 characters (shorter keys are too easy to hit by accident — engineering call);
   (c) **reply** (kinds `question` and `offer` only) — the newest session record in
   `pulse/sessions/` other than `S` (greatest `ended`) lists `T` in its `threads_opened`, `S` is
   `interactive`, and `S`'s first user message exists and is non-empty. Answered threads get
   `status: answered`, `answered: <S's ended>`, `resolved_by: claude-sessions/<user>/<S>`; the file is
   edited in place, body untouched. Exactly these three tests, nothing fuzzier: two runs over the
   same inputs agree.

10. **Status transitions.** `open → answered` (Rule 9, `thread close`, `thread promote`),
    `open → dropped` (`thread drop`), `open → expired` (`pulse.hygiene` Rule 8, past `expires`).
    The three terminal states never revert and are never re-evaluated: a verb applied to a
    non-open thread prints the current status and exits 1 without writing. No thread is ever
    deleted by any Cortex code path.

11. **Human verbs (`cortex thread …`, in `src/cli/cli.ts`, dispatching into `src/pulse/thread-cli.ts`, which builds on the ledger primitives in `src/pulse/threads.ts`).**
    - `cortex thread list [--status open|answered|dropped|expired] [--touching <path-or-id>]` —
      prints one line per thread, oldest first: `id  kind  opened(YYYY-MM-DD)  <first 80 chars of
      the key text>`; default `--status open`; `--touching X` keeps threads with a `bears_on` entry
      that **starts with** `X` (prefix match on the entry string — so `--touching .cortex/compass`
      matches every compass path and `--touching pulse.usage` matches that id). Exit 0, even when
      nothing matches (prints `No threads.`).
    - `cortex thread drop T-NNN` — `open → dropped`. Exit 0; unknown id or non-open → message, exit 1.
    - `cortex thread close T-NNN --by <path>` — `open → answered` with `resolved_by: <path>` (any
      project-relative path, stored as given, not resolved) and `answered: now`. `--by` required.
    - `cortex thread promote T-NNN --to atlas/decisions | compass/bugs [--type <bug type>]
      [--affects <path-or-id>]…` — Rule 12.
    Every verb is a human act at the CLI: it runs under the `PULSE_LOOP_COMMANDS` migration
    chokepoint like the other pulse verbs, and it is the only way a thread changes status outside
    Rule 9 and hygiene.

12. **Promote drafts a gated file; the human still reviews it.** `promote` is the thread
    counterpart of `pulse-accept`: a user-invoked verb writing a **draft** gated artefact whose
    frontmatter conforms to the schema for its kind, then marking the thread
    `status: answered`, `resolved_by: <the new file's project-relative path>`, `answered: now`.
    - `--to atlas/decisions`: target `.cortex/atlas/decisions/<YYYY-MM-DD>-<slug>.md` (today's
      date; `decisionSlug`; refuses if the target exists — no clobber). Frontmatter per schema
      §4.3: `id: decision.<YYYY-MM-DD>-<slug>`, `title` (the key text, first 80 characters, JSON
      quoted), `date` (now, iso), `confidence: INFERRED`, `provenance:` with one
      `derives_from: <citation>` per entry of the thread's `sessions:` trail. Body: the line
      `> DRAFT — promoted from T-NNN by \`cortex thread promote\`; review before relying on it.`,
      a blank line, then the thread body verbatim. The drafting reuses the
      `decisionFilePayload` shape in `src/insight/session-observe.ts` (same fields, same
      target grammar) rather than re-deriving it. **(3.4)** The draft carries the thread's
      `bears_on` verbatim as the decision's `bears_on` (schema §4.3, §6 rule 6 — Core seeds the
      forward edge wherever it drafts), passed through `decisionFilePayload`'s optional `bearsOn`
      argument; an empty list emits no key (the drafted decision then carries `check.atlas`'s
      "bears on nothing" warning until a human adds one).
    - `--to compass/bugs`: target `.cortex/compass/bugs/B-NNN-<slug>.md` where `B-NNN` is
      allocated through the id registry — `allocateId(root, 'bug', slug)`, `schema.id-registry`
      Rule 2 (3.4 fifth revision; it was "next after the highest `B-\d+` filename on disk",
      which two branches compute identically) — no clobber, id never reused. Frontmatter per
      schema §4.2: `id`, `title` (as above), `type` from `--type`
      (**required** — one of the seven-type enum; the classification is a human judgment Core must
      not guess, R-001), `severity: medium`, `status: open`, `opened` (now),
      `found_at_commit: <readHeadCommit(root)>` when the helper returns a sha and no key when it
      returns `null` (`compass.bug-currency` Rules 4–5), `affects:` — the
      `--affects` values if given, else the thread's `bears_on` entries that resolve on disk as
      project-relative paths (ids are kept only when `--affects` names them explicitly); when the
      resulting list is empty the verb refuses and asks for `--affects`, because `check.bug`
      requires resolvable entries. Body: the same DRAFT line, then the thread body.
    - `--to atlas/evidence` (3.4): a `finding` thread of kind measurement drafts an evidence
      file — `atlas.evidence` Rule 6 owns the grammar (`--finding <metric>=<value>` required,
      `--bears-on` optional), the payload, and its acceptance criteria; any other kind is a usage
      error. Any other `--to` is a usage error (exit 2, nothing written).
    - A promoted file must pass `cortex validate` (`check.atlas` / `check.bug` / `check.evidence`,
      `check.provenance`, `check.bears-on`) as written — that is the test that pins this rule.

13. **Deterministic Core, pulse-confined.** No LLM, no network, no subprocess (R-001). Everything
    except `promote` writes only under `.cortex/pulse/`; `promote` writes exactly one gated file and
    only when a human runs it (RULES.md rule 7's human gate, the same standing as `pulse-accept`).

14. **Nothing is injected in this step.** No hook reads the ledger; no SessionStart or PreRead line
    names a thread. `pulse.usage` Rule 10 already reports reads of `pulse/threads/` so the
    before-figure is on record. Consumers arrive in step 3 of the recall work. **(Step 4 note,
    2026-09-16.)** The ledger now has one direct, read-only consumer: `hooks.prompt-route` lists
    `pulse/threads/` on `UserPromptSubmit` and surfaces open `question | offer | approval` threads
    as `Open:` pointer lines; it never changes a thread's status. Step 3's index consumers reach
    open threads through `recall-index.json`, not through this directory.

## Acceptance Criteria

### A thread file has the contract frontmatter and body

- **Given** a session record for session `s1` with `open_question` `{ kind: "question", text:
  "Do you want the counter in state/ or at the pulse root?" }` and a read ledger listing
  `src/pulse/hygiene.ts`, `.cortex/compass/rules/R-001-core-no-llm-calls.md`,
  `.specflow/specs/pulse/hygiene.spec.md`
- **When** threads are opened from it at `2026-09-15T10:00:00Z`
- **Then** `.cortex/pulse/threads/T-001-do-you-want-the-counter-in-state-or-at-the-pulse-root.md`
  exists with `id: T-001`, `kind: question`, `status: open`, `opened: 2026-09-15T10:00:00.000Z`,
  `expires: 2026-10-15T10:00:00.000Z`, `session: claude-sessions/<user>/s1`, `sessions:` of that
  one citation, `bears_on:` of exactly the two `.cortex/`/`.specflow/` ledger lines in order, and a
  body equal to the question text
- **And** `cortex validate` reports no `check.threads` violation for it

### Ids come from their own counter and never collide with S-ids

- **Given** `pulse/state/suggestion-counter` reads `41` and no `thread-counter` exists
- **When** three threads are allocated
- **Then** they are `T-001`, `T-002`, `T-003`, `thread-counter` reads `3`, and
  `suggestion-counter` still reads `41`

### One thread per record item, in creation order

- **Given** a record with an `offer`, two approvals, one finding and one copied artefact plus one
  uncopied artefact
- **When** threads are opened
- **Then** five files exist with kinds `offer, approval, approval, finding, artefact` at
  `T-001`–`T-005` in that order, and no thread was opened for the uncopied artefact

### A scheduled record opens finding and artefact threads only

- **Given** a record with `session_kind: scheduled`, an `offer`, one approval, one finding and one
  copied artefact
- **When** threads are opened
- **Then** exactly two files exist, kinds `finding` and `artefact`, and `threads_opened` lists
  those two ids

### A finding's tag targets lead its `bears_on`, capped at 12

- **Given** a finding with `bears_on: ["pulse.usage", "src/pulse/usage.ts"]` and a read ledger of
  15 `.cortex/` paths
- **When** its thread is opened
- **Then** `bears_on` has 12 entries, the first two are `pulse.usage` and `src/pulse/usage.ts`, and
  the remaining ten are the first ten ledger paths

### Same question twice opens one thread with a two-session trail

- **Given** `T-001` open with key text `do you want the counter in state/ or at the pulse root?`
  from session `s1`
- **When** session `s2`'s record carries the same question with different whitespace and case
- **Then** no new file is created, `T-001`'s `sessions:` lists `s1`'s then `s2`'s citation, and
  `s2`'s record reports `threads_opened: ["T-001"]`

### An answered thread does not block a new one

- **Given** `T-001` with `status: answered` and the same key
- **When** a later session raises the same question
- **Then** `T-002` is opened and `T-001` is untouched

### Mentioning a thread id answers it

- **Given** `T-003` open, and a transcript for session `s9` whose user message reads
  `T-003 is settled, we keep the counter in state/`
- **When** the hook runs answered detection for `s9`
- **Then** `T-003` has `status: answered`, `answered` equal to the record's `ended`, and
  `resolved_by: claude-sessions/<user>/s9`; its body is byte-identical

### Restating a thread's text answers it, short keys excepted

- **Given** `T-004` open with a 45-character key and `T-005` open with the 12-character key
  `ship the cli`, and a transcript whose assistant text contains both, verbatim
- **When** answered detection runs
- **Then** `T-004` is `answered` and `T-005` is still `open`

### The next interactive session's first message answers a hanging question

- **Given** `pulse/sessions/s1.json` with `ended: 2026-09-15T10:00:00Z` and
  `threads_opened: ["T-006"]` where `T-006` is an open `question`, an older record `s0`, and a new
  interactive session `s2` whose first user message is `state/ please` and mentions neither the id
  nor the key
- **When** the hook fires for `s2`
- **Then** `T-006` is `answered` with `resolved_by: claude-sessions/<user>/s2` and `s2`'s record
  has `threads_answered: ["T-006"]`

### A scheduled session or an approval thread is not answered by reply

- **Given** the same setup but (a) `s2` is `scheduled`, or (b) `T-006` is an `approval` thread
- **When** the hook fires for `s2`
- **Then** `T-006` stays `open` in both cases

### Threads opened this run are never answered by this run

- **Given** a transcript whose last assistant message asks a question and also, earlier, contains
  that same question verbatim
- **When** the hook fires
- **Then** the new thread is `open`

### `thread list` filters by status and by `bears_on` prefix

- **Given** `T-001` (open, `bears_on: [".cortex/compass/rules/R-001-core-no-llm-calls.md"]`),
  `T-002` (dropped), `T-003` (open, `bears_on: ["pulse.usage"]`)
- **When** `cortex thread list` runs, then `cortex thread list --status dropped`, then
  `cortex thread list --touching .cortex/compass`
- **Then** the outputs list exactly `T-001, T-003`; `T-002`; and `T-001` — each line carrying id,
  kind, `YYYY-MM-DD`, and the first 80 characters of the key text

### `drop` and `close` change status once

- **Given** `T-001` open
- **When** `cortex thread drop T-001` runs, then `cortex thread close T-001 --by .cortex/atlas/decisions/x.md`
- **Then** after the first command `status: dropped`; the second prints the current status,
  exits 1, and the file is unchanged

### `close` requires `--by` and records it verbatim

- **Given** `T-002` open
- **When** `cortex thread close T-002` runs, then `cortex thread close T-002 --by .specflow/specs/pulse/threads.spec.md`
- **Then** the first exits 2 with a usage message and writes nothing; the second sets
  `status: answered`, `resolved_by: .specflow/specs/pulse/threads.spec.md`, and an `answered` iso-datetime

### Promote to a decision drafts a schema-valid file

- **Given** `T-007` open, kind `finding`, key text `2 insight invocations over 55 sessions`,
  `sessions:` of two citations, `bears_on: [pulse.usage, src/pulse/usage.ts]`, on 2026-09-15
- **When** `cortex thread promote T-007 --to atlas/decisions` runs
- **Then** `.cortex/atlas/decisions/2026-09-15-2-insight-invocations-over-55-sessions.md` exists
  with `id: decision.2026-09-15-2-insight-invocations-over-55-sessions`, a `title`, `date`,
  `confidence: INFERRED`, two `provenance` entries, `bears_on: [pulse.usage, src/pulse/usage.ts]`
  (3.4), a body starting with the DRAFT line followed by the thread body; `T-007` is `answered`
  with `resolved_by` equal to that path; and `cortex validate` reports no `check.atlas`,
  `check.provenance` or `check.bears-on` error

### Promote to a bug requires a type and resolvable `affects`

- **Given** `T-008` open with `bears_on: ["src/pulse/hygiene.ts", "pulse.usage", "src/gone.ts"]`
  and `.cortex/compass/bugs/` holding `B-017-x.md`
- **When** `cortex thread promote T-008 --to compass/bugs` runs, then the same with
  `--type missing-criterion`
- **Then** the first exits 2 naming `--type` and writes nothing; the second creates
  `.cortex/compass/bugs/B-018-<slug>.md` with `id: B-018`, `type: missing-criterion`,
  `severity: medium`, `status: open`, `affects: ["src/pulse/hygiene.ts"]` (the one entry that
  resolves as a path), and `cortex validate` reports no `check.bug` error

### Promote refuses unknown targets, and never clobbers

- **Given** `T-009` open, kind `question`
- **When** `cortex thread promote T-009 --to compass/rules` runs, then `--to atlas/evidence` (a
  `question` thread — `atlas.evidence` Rule 6), then `--to atlas/decisions` twice
- **Then** the first two exit 2 (the second naming the thread's kind), the third succeeds, and the
  fourth exits 1 because the target exists — after every refusal the thread and the filesystem
  are unchanged

### Malformed thread files are warned, never fatal

- **Given** `pulse/threads/T-010-x.md` with `status: maybe` and no `expires`
- **When** `cortex validate` runs
- **Then** the report carries `check.threads` warnings for the enum and the missing field, and
  the validator's exit code is unaffected by them

### Only pulse is written outside `promote`

- **Given** any sequence of hook runs, `list`, `drop`, and `close`
- **Then** every file created or modified under the project is beneath `.cortex/pulse/`

## Notes

- **Dependency direction.** This spec depends on `pulse.hygiene` (its expiry and retention rule
  rides in that implemented sweep), not the reverse: an implemented spec must not acquire a
  dependency on a draft, and the ledger needs the sweep to exist for `expired` to ever occur. The
  edge is acyclic — nothing in hygiene's chain reaches back here.
- **Why threads are not suggestions.** `S-NNN` proposals ask a human to change a gated file;
  `T-NNN` threads ask to be *remembered until resolved*. Merging the namespaces would force every
  open question through the accept/reject gate, which is the wrong verb for "someone should answer
  this".
- **`bears_on` naming.** Chosen at step 1, ahead of the 3.4 MINOR that added it to §6, so that
  no thread written under step 1 needed migrating; formalised by `schema.bears-on` (3.4), still
  shape-checked only on threads.
- **`atlas/evidence`** became a live promote target at 3.4 (`atlas.evidence` Rule 6); the verb's
  grammar did not change, as intended.
- **Retention.** `pulse.hygiene` Rule 8 expires open threads past `expires` in place and deletes
  session records and scratch copies older than 30 days; no thread file is ever deleted.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
