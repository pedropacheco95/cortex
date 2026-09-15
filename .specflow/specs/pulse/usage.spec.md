---
id: pulse.usage
status: implemented
depends_on:
  - loops.session-reading
  - core-cli.init
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
governs:
  - "src/pulse/usage.ts"
---

# `cortex usage` — is Cortex actually being consulted?

## Intent

Cortex has no way to answer "is any of this being used". The question was settled once, by hand,
by grepping session transcripts — and the answer was that `cortex insight` had been invoked twice
in 53 sessions while its `concept` and `element` verbs had never been invoked at all. That
measurement is the reason `scaffolding.coverage-map` and `scaffolding.rationalization-table`
exist, and there is currently no way to repeat it.

This spec makes it a command. It is **read-side**: the evidence already exists in Claude Code's
session transcripts, which `loops.session-reading` already reads, read-only, for this project
only. There is no logging hook, no counter, and no runtime cost — a write-side instrument would be
exactly the overhead this measurement is meant to avoid justifying.

Its first job is to record the *before* figure, so the claim that coverage changed behaviour is
falsifiable rather than asserted.

## Entities

- **READS:** this project's session transcripts via `loops.session-reading`'s tolerant JSONL
  parse (`src/sessions/read.ts` — strictly read-only, per that spec); `.cortex/cortex.config.json`
  (module roster, for which module buckets to report).
- **WRITES:** `.cortex/pulse/reports/usage.md` (`kind: pulse-usage`, with a `generated`
  iso-datetime, overwrite-per-run like the other pulse reports); with `--record` (Rule 12),
  additionally `.cortex/atlas/evidence/<today>-usage.md` (create only) — the payload, refusals and
  acceptance criteria are `atlas.evidence` Rule 5's.
- **CREATES:** `.cortex/pulse/reports/usage.md` on first run; `atlas/evidence/` and its
  `_index.md` on the first `--record` in a project without them.

## Rules

1. **Read-side only, zero runtime cost.** The command adds no hook, no logging, no counter, and
   no instrumentation of any kind. It derives every figure from transcripts that already exist
   whether or not this command is ever run. A future request for a metric that cannot be derived
   this way is a request to change this rule, and is refused rather than satisfied by adding a
   write-side probe.

2. **CLI invocations are counted only inside Bash command fields.** A count of `cortex insight`
   over raw transcript text returns roughly 100× the true figure, because this project's specs
   and design documents discuss those verbs constantly and every such discussion appears in a
   transcript. The counted population is tool-call command strings, never message prose, never
   file content. This rule exists because the naive count was actually made during the
   investigation that produced this spec, and reported 207 invocations of a verb that had run
   twice.

3. **Loop machinery is separated from orientation.** Reads under `pulse/state/` and
   `pulse/reports/` are loops reading their own worklists and outputs — they are not the
   assistant consulting project knowledge, and folding them in makes an unused knowledge layer
   look busy (137 total `.cortex/` reads, ~91 of them machinery). The report presents the two
   populations as separate figures and never as one total.

4. **Reported figures, per run.** At minimum: `cortex insight` invocations broken down by verb;
   reads under `.cortex/` bucketed by module with the Rule 3 split applied; searches (Grep tool
   calls and `grep` Bash invocations) whose target is under `.cortex/`; reads of `_index.md`
   files split by root versus module level; and the count of assistant turns that asked the
   developer a question without any `.cortex/` read earlier in that session. Each figure carries
   the number of sessions it was computed over, because a count without a denominator is not a
   measurement. Rules 8–11 add the search-by-target table, the `recall`/`why` invocation counts,
   the tracked-subdirectory read counts, and the pointer follow-through figure to this minimum.

5. **Deterministic Core, no judgment (R-001).** Counting, bucketing, and rendering only. The
   command does not interpret its own numbers, does not classify a session as good or bad, and
   emits no recommendation. What the figures mean is the reader's judgment, or a loop's — not
   this command's.

6. **Degrades to an honest empty report.** No transcript directory, no readable sessions, or a
   transcript format Claude Code has since changed all produce a report that names what could not
   be read and reports zero for what it could not count — never a crash, and never a zero
   presented as if it were an observation. `loops.session-reading` Rule 6 already establishes
   that the transcript format is unversioned and may change; a rising skipped-line count is the
   signal, and it is reported.

7. **Comparable across runs.** The report records the window it covers (session count and date
   range) so two runs can be compared. A run over 53 sessions and a run over 5 are not the same
   measurement, and the report never presents them as though they were.

8. **A search is a segment that searches a path, classified by its target.** A Bash command is
   split — after the Rule 2 quoted-span strip — into segments on `|`, `||`, `&&`, `;`, and
   newlines. A segment is a search only when its command word (the first token after any leading
   `NAME=value` assignments, and after `xargs` and its flags) is `grep`, `egrep`, `fgrep`, `rg`, or
   `find`, and the segment carries a path operand: a non-flag token containing `/`, equal to `.`,
   or ending in a file extension. A pipe filter (`| grep x`, no path) is never a search, and a
   segment counts at most once, by its first path operand. Grep tool calls carrying a `path`
   count in the same buckets. Buckets by target: **knowledge** — `.cortex/compass`,
   `.cortex/atlas`, `.cortex/insight`, `.cortex/archive`, and the `.cortex/` tree as a whole;
   **machinery** — `.cortex/pulse`, `.cortex/cortex.config.json`, `.cortex/constellation.json`,
   `.cortex/_index.md`; **document** — `cortex-schema.md`, anything under `.specflow/`,
   `RULES.md`, `CLAUDE.md`; **other** — every other path. The report renders the four buckets as
   a "Searches by target" table. The pre-existing "searches targeting `.cortex/`" figure is kept
   for continuity and is defined as knowledge + machinery. This rule exists because the first
   counting rule ("the command contains `grep` and `.cortex`") counted pipe filters, compound
   commands, and Cortex maintaining its own pulse machinery as knowledge lookups — the reported 76
   searches over 55 sessions were, on a manual re-count of the 41 transcripts still on disk,
   roughly 20 into knowledge, 19 into machinery, and 59 into documents.

9. **`cortex recall` and `cortex why` are counted the day they ship.** The Rule 2 invocation
   match covers `cortex (insight|recall|why)`. `insight` keeps its per-verb breakdown under the
   existing figure; `recall` and `why` are counted per command word under a separate
   `recall`/`why` figure, because their argument grammar is not yet specified and guessing a
   verb position would invent a breakdown nobody asked for. Both figures are reported even when
   zero, so that zero is an observation with a denominator rather than an absence.

10. **Tracked subdirectories.** Alongside the per-module read buckets, the report carries a fixed
    pair of subdirectory read counts — `atlas/decisions` and `pulse/threads` — reported every run,
    including at zero. These are the two locations the recall work will have to move: the manual
    re-count found zero reads of `atlas/decisions/` over 41 sessions, and `pulse/threads/` does not
    exist yet. A `pulse/threads/` read is an orientation read under Rule 3 (it is not
    `pulse/state/` or `pulse/reports/`), so it lands in both the module bucket and this figure.

11. **Pointer follow-through.** A pointer line is any text line beginning `Recall:` or `Decided:`
    found in hook-injected context — a `hook_additional_context` attachment entry's content, or a
    user entry's text — and its pointed path is the first token in that line containing `/`
    (trailing punctuation stripped). The report counts pointers `fired` and, of those, `followed`:
    a pointer is followed when, within the next 10 `tool_use` calls of the same session, a Read
    targets the pointed path, or a Rule 8 search targets the pointed path or a directory above it.
    The 10-call window is fixed and the matching is exact on normalised paths — no fuzziness, so
    two runs over the same transcripts agree. No hook emits these lines yet; the figure reports
    0 fired, 0 followed today, and exists so the number to beat is recorded before the hooks land.

12. **`--record` writes the figures as evidence (3.4).** `cortex usage --record` does everything
    `cortex usage` does, then writes one gated evidence file `atlas/evidence/<today>-usage.md`
    (schema §4.3) from the same `UsageCounts`: `instrument: pulse.usage`, the Rule 7 window as
    `window` with the session count as its denominator, the Rule 4/8/9/10/11 figures as typed
    `findings`, `bears_on: [schema:§5, pulse.usage]`, `supersedes` the previous `*-usage.md`
    when one exists, and the report body as narrative. It refuses (exit 1, nothing under
    `atlas/`) when nothing was measurable (Rule 6's honest empty is a report, not evidence) or
    when today's file exists. This is a human-invoked verb writing a gated file directly — the
    same standing as `pulse-accept` and `thread promote` — and it adds no instrumentation: Rule 1
    is intact. The payload, the exact `findings` order, and the acceptance criteria are owned by
    `atlas.evidence` Rule 5; this rule records only that the verb has the flag.

## Acceptance Criteria

### Invocations are counted from command fields, not prose

- **Given** a transcript fixture containing one Bash tool call whose command is
  `cortex insight file src/a.ts`, and an assistant message whose text mentions
  `cortex insight concept` three times
- **When** `cortex usage` runs
- **Then** the report shows 1 invocation of `file` and 0 of `concept`

### Loop machinery is reported separately from orientation reads

- **Given** a fixture with 4 Read calls on `.cortex/pulse/state/triage-worklist.json` and 2 Read
  calls on `.cortex/compass/rules/R-001-core-no-llm-calls.md`
- **When** `cortex usage` runs
- **Then** the report shows 2 orientation reads and 4 machinery reads as separate figures
- **And** shows no combined total of 6

### Index reads are split root versus module

- **Given** a fixture with 11 Read calls on `.cortex/_index.md` and 1 on `.cortex/compass/_index.md`
- **When** `cortex usage` runs
- **Then** the report distinguishes 11 root-level from 1 module-level index read

### Unanswered-question turns are counted with their denominator

- **Given** a fixture of 3 sessions, in one of which the assistant asked the developer a question
  with no prior `.cortex/` read in that session
- **When** `cortex usage` runs
- **Then** the report shows that figure as 1 of 3 sessions, not as a bare 1

### Missing transcripts produce an honest empty report

- **Given** a stubbed home directory containing no transcript directory for this project
- **When** `cortex usage` runs
- **Then** it exits 0 and writes a report naming that no sessions were readable
- **And** the report does not present its zeroes as observed behaviour

### A pipe filter is not a search

- **Given** a fixture with one Bash call whose command is `cat .cortex/compass/_index.md | grep rules`
- **When** `cortex usage` runs
- **Then** every "Searches by target" bucket is 0 and the searches-targeting-`.cortex/` figure is 0

### A compound command counts its one real search, once

- **Given** a fixture with one Bash call whose command is
  `grep -rn "hooks" .cortex/compass/ && cat notes.md | grep hooks`
- **When** `cortex usage` runs
- **Then** the knowledge bucket is 1, every other bucket is 0, and the `.cortex/` figure is 1

### A find into pulse is machinery

- **Given** a fixture with one Bash call whose command is `find .cortex/pulse -name "*.md"`
- **When** `cortex usage` runs
- **Then** the machinery bucket is 1 and the knowledge bucket is 0

### A grep into the schema is a document search

- **Given** a fixture with one Bash call whose command is `grep -n "kind:" cortex-schema.md` and
  one whose command is `rg pulse-usage .specflow/specs/`
- **When** `cortex usage` runs
- **Then** the document bucket is 2 and the `.cortex/` figure is 0

### Grep tool calls share the buckets

- **Given** a fixture with a Grep tool call whose `path` is `.cortex/atlas/decisions/` and one
  whose `path` is `src/`
- **When** `cortex usage` runs
- **Then** the knowledge bucket is 1 and the other bucket is 1

### The `.cortex/` figure is knowledge plus machinery

- **Given** any fixture
- **When** `cortex usage` runs
- **Then** the searches-targeting-`.cortex/` figure equals the knowledge bucket plus the machinery bucket

### `cortex recall` is counted under its own figure

- **Given** a fixture with Bash calls `cortex recall foo`, `cortex why bar`, and
  `cortex insight file src/a.ts`
- **When** `cortex usage` runs
- **Then** the report shows `recall` 1 and `why` 1 under the recall figure, and `file` 1 under
  the insight figure

### Tracked subdirectories are reported even at zero

- **Given** a fixture with one Read of `.cortex/atlas/decisions/D-001-x.md` and no read under
  `.cortex/pulse/threads/`
- **When** `cortex usage` runs
- **Then** the report shows `atlas/decisions` 1 and `pulse/threads` 0

### A followed pointer is counted within ten tool calls

- **Given** a fixture whose session carries a hook-injected line
  `Recall: .cortex/atlas/decisions/D-004-scanner.md — why the scanner is native`, followed by
  three unrelated tool calls and then a Read of `.cortex/atlas/decisions/D-004-scanner.md`
- **When** `cortex usage` runs
- **Then** the report shows 1 pointer fired and 1 followed

### A pointer past the window is fired but not followed

- **Given** a fixture whose session carries a `Decided:` line pointing at a path, followed by
  ten unrelated tool calls and then a Read of that path
- **When** `cortex usage` runs
- **Then** the report shows 1 pointer fired and 0 followed

### The report is a valid pulse report

- **Given** any successful run
- **When** `.cortex/pulse/reports/usage.md` is validated
- **Then** it carries `kind: pulse-usage` and a parseable `generated` iso-datetime
- **And** `cortex validate` reports no error for it

## Notes

- **Baseline recorded before the change lands.** The figures from the investigation that produced
  this spec — 53 sessions; `cortex insight` invoked twice, both `file`; `concept` 0; `element` 0;
  module `_index.md` reads 1; root `_index.md` reads 11; greps into `.cortex/` 2; 137 total
  `.cortex/` reads of which ~91 were pulse machinery — are the pre-change baseline. The first run
  of this command should reproduce them within counting-rule differences; a large divergence means
  this spec's counting rules disagree with the hand count and one of the two is wrong.
- **Second baseline, after Rule 8 (2026-09-15).** The first implementation reported 76 searches
  into `.cortex/` over 55 sessions under the "contains `grep` and `.cortex`" rule. The manual
  re-count that motivated Rule 8 found roughly 20 knowledge, 19 machinery, and 59 document
  searches over the 41 transcripts still on disk. The first run under Rule 8 is the figure to
  compare against that re-count; the search-by-target table is the number the recall work has to
  move, alongside the Rule 10 `atlas/decisions` reads (0) and Rule 11 follow-through (0/0).
- **Cross-domain `implements:`.** This spec lives in `pulse/` because it is a pulse report by
  construction, but it serves the scaffolding outcome — it measures whether Cortex is reached for,
  not whether the project is healthy. The link is deliberate, not a mis-wire.
- **Deliberately not done:** no dashboard, no trend storage, no per-session detail. One report,
  overwritten per run, in the same shape as every other pulse report. Trends can be recovered from
  git history of the report file if anyone ever wants them — and, since 3.4, from the
  `supersedes` chain of `atlas/evidence/*-usage.md` files `--record` writes (Rule 12), which is
  the durable form the 2026-08-05 decision should have cited.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
