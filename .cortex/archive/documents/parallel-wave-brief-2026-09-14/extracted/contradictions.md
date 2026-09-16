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
