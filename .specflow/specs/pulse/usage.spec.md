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
  iso-datetime, overwrite-per-run like the other pulse reports).
- **CREATES:** `.cortex/pulse/reports/usage.md` on first run.

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
   measurement.

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
- **Cross-domain `implements:`.** This spec lives in `pulse/` because it is a pulse report by
  construction, but it serves the scaffolding outcome — it measures whether Cortex is reached for,
  not whether the project is healthy. The link is deliberate, not a mis-wire.
- **Deliberately not done:** no dashboard, no trend storage, no per-session detail. One report,
  overwritten per run, in the same shape as every other pulse report. Trends can be recovered from
  git history of the report file if anyone ever wants them.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
