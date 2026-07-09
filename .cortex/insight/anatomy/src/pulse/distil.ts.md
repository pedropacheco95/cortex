---
path: src/pulse/distil.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 3
size_lines: 782
size_tokens: 7446
centrality: high
built_at_commit: "8248c76"
source_sha256: "f6bb44459aad355c6c71bfd20eaf866ff7d5d27581958f11872e1ceef0b3f5e0"
---

# src/pulse/distil.ts

## Purpose

Implements `cortex pulse-distil`, the weekly session-distillation loop (spec `pulse.distil`, design §10.3): it mines the project's Claude Code session transcripts for recurring user-stated patterns (corrections, preferences, environment facts) and proposes them as compass additions in `.cortex/pulse/suggestions.md`, without ever mutating compass/atlas/cerebrum directly (propose-don't-mutate). The file is built as two deterministic halves — `collectCorpus` (extract messages since last run into a JSON corpus) and `proposeFromCandidates` (validate, filter, dedupe, and write proposal sections) — around an agentic middle that the shipped skill runs in-session; a bare/degraded fallback path spawns the `claude` CLI headlessly only when nothing else is available, keeping Core itself LLM-free per the two-layer architecture rule.

## Main players

- `collectCorpus` (lines 210–244) — deterministic first half: reads `.distil-last-run` (or defaults to a 30-day first-run window), lists/reads session files via `sessions/read.ts`, and writes `.cortex/pulse/.session-corpus.json`. [critical]
- `validateDistilCandidate` (lines 269–283) — Rule 2 shape gate for judgment output; enforces `proposedTarget` starts with `.cortex/compass/` and rejects `..` path traversal. [critical]
- `readCompassNormalised` (lines 286–310) — walks `.cortex/compass/` recursively and normalises all `.md` text for the "already covered by compass" filter. [supporting]
- `readInsightProse` / `insightFileCovering` (lines 328–384) — reads both the legacy v2 `insight/map/*.md` prose and the v3 per-file `insight/anatomy/**` (and `insight/scopes/<s>/anatomy/**`) entries to detect when a candidate is already captured in insight, redirecting it to a `promotion` proposal instead of a fresh rule-candidate. [critical]
- `proposeFromCandidates` (lines 478–583) — the orchestrating second half: applies the ordered filter chain (malformed → below-threshold → covered-by-compass → dismissed), computes promotions vs. fresh candidates, carries forward still-pending prior sections by matched normalised pattern text (no id churn), allocates fresh S-ids, always-writes the report, and advances `.distil-last-run` on success. [critical]
- `readUnexpiredDismissals` / `isDismissed` (lines 131–158) — rejection-memory: parses `dismissed.md` and suppresses re-proposal of matching (unexpired) patterns. [supporting]
- `parseSuggestionSections` / `readPendingSections` (lines 68–118) — fence-aware §4.5 report parser shared by carry-forward and dismissal logic; heading/field-looking lines inside a fenced payload are never treated as structural. [critical]
- `writeDegradedReport` (lines 592–603) — degraded-mode report writer: re-emits still-pending prior sections verbatim when the judgment pass could not run, and deliberately does NOT advance `.distil-last-run` so the window stays open for a later scheduled run. [supporting]
- `runClaudeJudgment` (lines 615–643) — the Rule 6 subprocess boundary: spawns the `claude` CLI headless via `execFile`, classifying the outcome into `ok`/`no-binary`/`timeout`/`auth`/`error` using `AUTH_FAILURE_PATTERN` from `claude-auth.ts`. [supporting]
- `parseCandidatesFromOutput` (lines 646–656) — extracts the first JSON array embedded anywhere in the subprocess stdout (tolerant of surrounding prose). [supporting]
- `runDistil` (lines 685–781) — top-level entry dispatching the three modes (`--collect`, `--propose <file>`, bare) and the degrade-and-report fallback logic for each subprocess failure kind. [critical]

## Insights

- **Ordered filter chain matters for counts**: malformed → below-threshold → covered-by-compass → dismissed is a strict pipeline (lines 505–527) — a candidate covered by compass is never separately counted as dismissed even if it would also match a dismissal, because `continue` short-circuits per stage.
- **Promotion vs. fresh candidate is a graduation path, not just dedup**: if a candidate's `proposedText` already appears in insight prose (not compass), the code doesn't drop it as "covered" — it re-labels it a `promotion` referencing the insight file (`distilSectionText`, lines 404–429), which is a different accept path in `review.ts`/`promote.ts`. This is the "capture once in session-observe, detect repetition later in distil" boundary mentioned in the comments.
- **Carry-forward preserves ids deliberately**: recurring patterns matched against `readPendingSections` keep their original `S-NNN` id and original `Source` field (lines 534–552) rather than getting a fresh id each week — this avoids id churn in the suggestions report across cycles.
- **Auth failure is a named, actionable exit code**: `runClaudeJudgment`'s `auth` outcome degrades with exit code 3 specifically (line 757), distinct from the exit-0 degrade used for `no-binary`/`timeout`/`error` — auth failures are considered actionable-by-the-user, others are silent skips.
- **`.distil-last-run` is NOT advanced on degrade** (only on a successful `proposeFromCandidates` call, line 581) — this is intentional so a skipped/failed judgment pass doesn't lose the time window; the next attempt (even the scheduled skill) still sees the full unprocessed range.
- **Fence-awareness is load-bearing, not decorative**: `parseSuggestionSections` explicitly tracks fence state per §4.5/B-003 grammar so that heading-like or field-like text embedded inside a fenced payload (e.g. example markdown in a proposed rule text) is never misparsed as a new section boundary or field.
- **The threshold config lives in `cortex.config.json`** under `pulse.distilThresholdN` (default 3, `readThresholdN` lines 161–172) — a malformed or missing config silently falls back to the default rather than erroring.
- **Mutual exclusivity guard**: `--collect` and `--propose` are asserted mutually exclusive at the top of `runDistil` (lines 689–692) — combining them exits 1 immediately, before any file I/O.

## File map

- Lines 1–35: module doc comment (design references, write-scope statement) and imports/constants (`DISTIL_FIRST_RUN_WINDOW_DAYS`, `DEFAULT_THRESHOLD_N`, file name constants).
- Lines 37–172: shared parsing/helpers section — `normaliseText`, `PriorSection` type, `parseSuggestionSections`, `readPendingSections`, dismissal types and `readUnexpiredDismissals`/`isDismissed`, `readThresholdN`.
- Lines 174–244: collect half — `CorpusSession`/`SessionCorpus`/`CollectOptions`/`CollectResult` types and `collectCorpus`.
- Lines 246–429: propose half, part 1 — `DistilCandidate` type and validators (`isRecord`, `isStringArray`, `validateDistilCandidate`), compass/insight-prose readers (`readCompassNormalised`, `readInsightProse`, `insightFileCovering`), `ProposeCounts`/`ProposalDraft` types, `distilSectionText`.
- Lines 431–464: report writer — `WriteReportOptions`, `writeSuggestionsReport`.
- Lines 466–603: propose half, part 2 — `ProposeOptions`, `proposeFromCandidates` (the main filter/carry-forward/allocate/write orchestration), `writeDegradedReport`.
- Lines 605–668: bare-mode subprocess boundary — `SubprocessOutcome` type, `runClaudeJudgment`, `parseCandidatesFromOutput`, `judgmentPrompt`.
- Lines 670–781: entry point — `DistilOptions` type and `runDistil`, dispatching collect-only / propose-only / bare (collect → judgment subprocess → propose) modes.

## Connections

Uses:
- `src/cli/claude-auth.ts` — `AUTH_FAILURE_PATTERN` regex used in `runClaudeJudgment` to detect an unauthenticated Claude CLI from combined stdout/stderr.
- `src/loops/report.ts` — `writePulseReport`, the shared always-write-a-report helper used by `writeSuggestionsReport` to land `suggestions.md` with standard frontmatter/provenance.
- `src/pulse/fences.ts` — `openingFence`, `closesFence`, `chooseOuterFence`, `headingLinesOutsideFences`, `FenceOpen` type; drive the fence-aware §4.5 section parser and the outer-fence choice when emitting a proposal's payload.
- `src/pulse/suggestion-ids.ts` — `allocateSuggestionIds`, used to mint fresh `S-NNN` ids for candidates that aren't carried forward from a prior pending section.
- `src/sessions/read.ts` — `listSessions`, `readSessionFile`, `extractMessages` (+ `ExtractedMessage` type), the session-reading layer `collectCorpus` delegates to rather than re-implementing transcript parsing.

Used by:
- `src/insight/session-observe.ts` — consumes distil's shared helpers/output shape as part of the session-observe loop's insight-enrichment routing.
- `src/loops/bug-triage.ts` — reuses shared distil helpers (likely `normaliseText`/section-parsing conventions) for its own triage report handling.
- `src/loops/skill-suggest.ts` — reuses the shared session-corpus / pattern-matching conventions distil establishes (both loops mine the same corpus per design §11.5).

Semantically related (not imports):
- `src/pulse/promote.ts` — consumes the `promotion` proposal shape (`**Source:** ... insight ...`) that `distilSectionText` emits when `promoteFrom` is set; the two files agree on the promotion-provenance text format without importing each other.
- `src/pulse/review.ts` — the accept-side gate that reads `suggestions.md` sections this file writes and performs the actual transactional write to compass (distil proposes, review/promote apply).

## Query pointers

- If you need to understand how a `promotion` proposal is later accepted and landed in compass, also read: `src/pulse/promote.ts`, `src/pulse/review.ts`.
- If you need to understand the §4.5 report/section format and fence grammar this file both writes and parses, also read: `src/pulse/fences.ts`.
- If you need to understand the shared session corpus consumed by sibling loops, also read: `src/sessions/read.ts`, `src/loops/skill-suggest.ts`, `src/loops/bug-triage.ts`.
- If you need to understand suggestion id allocation across loops, also read: `src/pulse/suggestion-ids.ts`.
