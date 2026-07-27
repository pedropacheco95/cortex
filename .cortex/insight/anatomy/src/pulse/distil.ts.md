---
path: src/pulse/distil.ts
extracted_at: 2026-07-10T10:00:00Z
extraction_level: 3
size_lines: 841
size_tokens: 8155
centrality: high
built_at_commit: "5f24181"
source_sha256: "0e6939d4bc35fa6168e9d9f0cb2dc441d6e6698f94f8bb26ac88358a759898af"
---

# src/pulse/distil.ts

## Purpose

Implements `cortex pulse-distil`, the weekly session-distillation loop (spec `pulse.distil`, design §10.3): it mines the project's Claude Code session transcripts for recurring user-stated patterns (corrections, preferences, environment facts) and proposes them as compass additions in `.cortex/pulse/suggestions.md`, without ever mutating compass/atlas/cerebrum directly (propose-don't-mutate). At v3.0, it also carries the retired `loops/skill-suggest.ts` loop's workflow-mining lens as a second candidate type: a `skill-proposal`-typed candidate proposes a brand-new `.claude/skills/<name>/SKILL.md` in the same `suggestions.md` output. The file is built as two deterministic halves — `collectCorpus` (extract messages since last run into a JSON corpus) and `proposeFromCandidates` (validate, filter, dedupe, and write proposal sections) — around an agentic middle that the shipped skill runs in-session; a bare/degraded fallback path spawns the `claude` CLI headlessly only when nothing else is available, keeping Core itself LLM-free per the two-layer architecture rule.

## Main players

- `collectCorpus` (lines 222–262) — deterministic first half: reads `.distil-last-run` (or defaults to a 30-day first-run window), lists/reads session files via `sessions/read.ts`, and writes `.cortex/pulse/.session-corpus.json`. [critical]
- `validateDistilCandidate` (lines 294–320) — Rule 2 / §4.5.1 shape gate for judgment output; branches on `DistilCandidateType`: a `rule-candidate` (default when `type` is absent) enforces `proposedTarget` starts with `.cortex/compass/` and rejects `..` path traversal, while a `skill-proposal` enforces `proposedTarget` matches `.claude/skills/<slug>/SKILL.md` for a NEW skill. [critical]
- `readCompassNormalised` (lines 286–310, shifted from prior extraction) — walks `.cortex/compass/` recursively and normalises all `.md` text for the "already covered by compass" filter. [supporting]
- `readInsightProse` / `insightFileCovering` — reads both the legacy v2 `insight/map/*.md` prose and the v3 per-file `insight/anatomy/**` (and `insight/scopes/<s>/anatomy/**`) entries to detect when a candidate is already captured in insight, redirecting it to a `promotion` proposal instead of a fresh rule-candidate; skipped entirely for `skill-proposal` candidates (a draft SKILL.md never graduates to a compass promotion). [critical]
- `proposeFromCandidates` (lines 535–651) — the orchestrating second half: applies the ordered filter chain (malformed → below-threshold → covered-by-compass → dismissed), computes promotions vs. fresh candidates, carries forward still-pending prior sections by matched normalised pattern text (no id churn), allocates fresh S-ids, always-writes the report, and advances `.distil-last-run` on success. [critical]
- `readUnexpiredDismissals` / `isDismissed` (lines 143–172) — rejection-memory: parses `dismissed.md` and suppresses re-proposal of matching (unexpired) patterns. [supporting]
- `parseSuggestionSections` / `readPendingSections` (lines 80–142) — fence-aware §4.5 report parser shared by carry-forward and dismissal logic; heading/field-looking lines inside a fenced payload are never treated as structural. [critical]
- `writeDegradedReport` (lines 652–705) — degraded-mode report writer: re-emits still-pending prior sections verbatim when the judgment pass could not run, and deliberately does NOT advance `.distil-last-run` so the window stays open for a later scheduled run. [supporting]
- `runClaudeJudgment` — the Rule 6 subprocess boundary: spawns the `claude` CLI headless via `execFile`, classifying the outcome into `ok`/`no-binary`/`timeout`/`auth`/`error` using `AUTH_FAILURE_PATTERN` from `claude-auth.ts`. [supporting]
- `parseCandidatesFromOutput` (lines 706–733) — extracts the first JSON array embedded anywhere in the subprocess stdout (tolerant of surrounding prose). [supporting]
- `runDistil` (lines 745–841) — top-level entry dispatching the three modes (`--collect`, `--propose <file>`, bare) and the degrade-and-report fallback logic for each subprocess failure kind. [critical]

## Insights

- **The workflow-mining lens is a candidate-type branch, not a separate pipeline**: `DistilCandidateType` (`'rule-candidate' | 'skill-proposal'`, line 269, new at v3.0) threads through `validateDistilCandidate` (different Target-shape gate per type), `insightFileCovering`'s caller in `proposeFromCandidates` (promotion path skipped for `skill-proposal`), and `distilSectionText` (a distinct `**Type:** skill-proposal` / `**Proposed file:**` rendering block) — the collect half, filter ordering, carry-forward, and id allocation are all shared unchanged between the two types.
- **Ordered filter chain matters for counts**: malformed → below-threshold → covered-by-compass → dismissed is a strict pipeline — a candidate covered by compass is never separately counted as dismissed even if it would also match a dismissal, because `continue` short-circuits per stage.
- **Promotion vs. fresh candidate is a graduation path, not just dedup**: if a `rule-candidate`'s `proposedText` already appears in insight prose (not compass), the code doesn't drop it as "covered" — it re-labels it a `promotion` referencing the insight file (`distilSectionText`), which is a different accept path in `review.ts`/`promote.ts`. This is the "capture once in session-observe, detect repetition later in distil" boundary mentioned in the comments.
- **Carry-forward preserves ids deliberately**: recurring patterns matched against `readPendingSections` keep their original `S-NNN` id and original `Source` field rather than getting a fresh id each week — this avoids id churn in the suggestions report across cycles.
- **Auth failure is a named, actionable exit code**: `runClaudeJudgment`'s `auth` outcome degrades with a distinct exit code, separate from the exit-0 degrade used for `no-binary`/`timeout`/`error` — auth failures are considered actionable-by-the-user, others are silent skips.
- **`.distil-last-run` is NOT advanced on degrade** (only on a successful `proposeFromCandidates` call) — this is intentional so a skipped/failed judgment pass doesn't lose the time window; the next attempt (even the scheduled skill) still sees the full unprocessed range.
- **Fence-awareness is load-bearing, not decorative**: `parseSuggestionSections` explicitly tracks fence state per §4.5/B-003 grammar so that heading-like or field-like text embedded inside a fenced payload (e.g. example markdown in a proposed rule text, or an entire draft SKILL.md for a skill-proposal) is never misparsed as a new section boundary or field.
- **The threshold config lives in `cortex.config.json`** under `pulse.distilThresholdN` (default 3, `readThresholdN`) — a malformed or missing config silently falls back to the default rather than erroring.
- **Mutual exclusivity guard**: `--collect` and `--propose` are asserted mutually exclusive at the top of `runDistil` — combining them exits 1 immediately, before any file I/O.

- When run bare (`cortex pulse-distil` with no driving session) the judgment step spawns a headless `claude` CLI subprocess rather than calling a model API directly — the sanctioned way this file honours R-001 (Core makes no LLM calls); it degrades gracefully if the CLI is missing/unauthenticated/times out by re-emitting pending suggestions without advancing the time window, so no sessions are lost. (claude-sessions/pedropacheco1/3bac199d-2d61-471f-b48b-f91c871cd282)
- A candidate pattern already captured in the ungated insight layer is not dropped as a duplicate during `--propose`; it is re-labeled a `promotion` suggestion instead of a `rule-candidate` — the mechanical link between session-observe's per-session capture and distil's cross-session gated proposals. (claude-sessions/pedropacheco1/3bac199d-2d61-471f-b48b-f91c871cd282)
- `parseSuggestionSections`'s `raw` capture for the LAST heading in a report runs to end-of-file, not to the next logical boundary — there is no closing sentinel after the final section. A consumer that appends its own trailing content (a footer paragraph, a closing note) after emitting `readPendingSections`' carried-forward `raw` text will have that trailing content baked into the "last" pending section's `raw` on the next run, then re-appended fresh on top of it — `src/insight/session-observe.ts`'s report footer duplicates this way across successive applies. This file's own two callers (report-heading assembly here) don't append anything after the last carried-forward section, so the quirk is dormant here — it only bites a consumer that does. (claude-sessions/pedropacheco1/797a3f69-2c76-4d6a-86b4-3a9dd6910913)
## File map

- Lines 1–36: module doc comment (design references, write-scope statement, now noting the folded-in workflow-mining lens) and imports/constants (`DISTIL_FIRST_RUN_WINDOW_DAYS`, `DEFAULT_THRESHOLD_N`, file name constants).
- Lines 37–189: shared parsing/helpers section — `normaliseText`, `PriorSection` type, `parseSuggestionSections`, `readPendingSections`, dismissal types and `readUnexpiredDismissals`/`isDismissed`, `readThresholdN`.
- Lines 190–262: collect half — `CorpusSession`/`SessionCorpus`/`CollectOptions`/`CollectResult` types and `collectCorpus`.
- Lines 264–460ish: propose half, part 1 — `DistilCandidateType` (new), `DistilCandidate` type and validators (`isRecord`, `isStringArray`, `SKILL_PROPOSAL_TARGET_RE` (new), `validateDistilCandidate`), compass/insight-prose readers (`readCompassNormalised`, `readInsightProse`, `insightFileCovering`), `ProposeCounts`/`ProposalDraft` types, `distilSectionText` (now with a `skill-proposal`-specific rendering branch).
- Lines ~460–522: report writer — `WriteReportOptions`, `writeSuggestionsReport`.
- Lines 523–651: propose half, part 2 — `ProposeOptions`, `proposeFromCandidates` (the main filter/carry-forward/allocate/write orchestration, promotion check now type-gated), `writeDegradedReport`.
- Lines 652–733: bare-mode subprocess boundary — `SubprocessOutcome` type, `runClaudeJudgment`, `parseCandidatesFromOutput`, `judgmentPrompt`.
- Lines 734–841: entry point — `DistilOptions` type and `runDistil`, dispatching collect-only / propose-only / bare (collect → judgment subprocess → propose) modes.

## Connections

Uses:
- `src/cli/claude-auth.ts` — `AUTH_FAILURE_PATTERN` regex used in `runClaudeJudgment` to detect an unauthenticated Claude CLI from combined stdout/stderr.
- `src/loops/report.ts` — `writePulseReport`, the shared always-write-a-report helper used by `writeSuggestionsReport` to land `suggestions.md` with standard frontmatter/provenance.
- `src/pulse/fences.ts` — `openingFence`, `closesFence`, `chooseOuterFence`, `headingLinesOutsideFences`, `FenceOpen` type; drive the fence-aware §4.5 section parser and the outer-fence choice when emitting a proposal's payload (including a skill-proposal's draft SKILL.md body).
- `src/pulse/suggestion-ids.ts` — `allocateSuggestionIds`, used to mint fresh `S-NNN` ids for candidates that aren't carried forward from a prior pending section.
- `src/sessions/read.ts` — `listSessions`, `readSessionFile`, `extractMessages` (+ `ExtractedMessage` type), the session-reading layer `collectCorpus` delegates to rather than re-implementing transcript parsing.

Used by:
- `src/insight/session-observe.ts` — consumes distil's shared helpers/output shape as part of the session-observe loop's insight-enrichment routing.
- `src/loops/bug-triage.ts` — reuses shared distil helpers (likely `normaliseText`/section-parsing conventions) for its own triage report handling.
- `src/cli/cli.ts` — the `pulse-distil` verb dynamically imports `runDistil`, which now also carries the workflow-mining lens formerly served by the retired `loop-skill-suggest` verb.

Semantically related (not imports):
- `src/pulse/promote.ts` — consumes the `promotion` proposal shape (`**Source:** ... insight ...`) that `distilSectionText` emits when `promoteFrom` is set; the two files agree on the promotion-provenance text format without importing each other.
- `src/pulse/review.ts` — the accept-side gate that reads `suggestions.md` sections this file writes and performs the actual transactional write to compass (distil proposes, review/promote apply) or installs a proposed skill bundle for a `skill-proposal` section.

## Query pointers

- If you need to understand how a `promotion` proposal is later accepted and landed in compass, also read: `src/pulse/promote.ts`, `src/pulse/review.ts`.
- If you need to understand the §4.5 report/section format and fence grammar this file both writes and parses, also read: `src/pulse/fences.ts`.
- If you need to understand the shared session corpus consumed by sibling loops, also read: `src/sessions/read.ts`, `src/loops/bug-triage.ts`.
- If you need to understand suggestion id allocation across loops, also read: `src/pulse/suggestion-ids.ts`.
- If you need the retired skill-suggest loop this file's workflow-mining lens absorbed, note it no longer exists (`src/loops/skill-suggest.ts` deleted) — the lens is entirely inside `validateDistilCandidate`/`distilSectionText` above.
