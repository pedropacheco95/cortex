---
path: src/pulse/distil.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 3
size_lines: 932
size_tokens: 9109
centrality: high
built_at_commit: "a66041b"
source_sha256: "28fd5ef4bf18706af95616d0071e0cd1b04336eced3f930e0f590979784910a9"
---
# src/pulse/distil.ts

## Purpose

Implements `cortex pulse-distil`, the weekly session-distillation loop (spec `pulse.distil`, design §10.3): it mines the project's Claude Code session transcripts for recurring user-stated patterns (corrections, preferences, environment facts) and proposes them as compass additions in `.cortex/pulse/suggestions.md`, without ever mutating compass/atlas/cerebrum directly (propose-don't-mutate). It also carries the retired `loops/skill-suggest.ts` loop's workflow-mining lens as a second candidate type: a `skill-proposal`-typed candidate proposes a brand-new `.claude/skills/<name>/SKILL.md` in the same `suggestions.md` output. The file is built as two deterministic halves — `collectCorpus` (extract messages since last run into a JSON corpus) and `proposeFromCandidates` (validate, filter, dedupe, and write proposal sections) — around an agentic middle that the shipped skill runs in-session; a bare/degraded fallback path spawns the `claude` CLI headlessly only when nothing else is available, keeping Core itself LLM-free per the two-layer architecture rule.

## Main players

- `collectCorpus` (lines 231–254) — deterministic first half: reads `state/distil-last-run` (or defaults to a `DISTIL_FIRST_RUN_WINDOW_DAYS`-day first-run window), lists/reads session files via `sessions/read.ts` through `readCorpusSessions`, and writes `.cortex/pulse/state/session-corpus.json`. [critical]
- `refreshCorpus` (lines 326–345) — Rule 11(b) incremental append: upserts by session id every session whose transcript mtime is at-or-after the corpus's `generated` stamp, without touching `state/distil-last-run` — used by consumers (e.g. session-observe) that need a fresher corpus without disturbing distil's own since-window. Returns null when no corpus yet exists. [supporting]
- `validateDistilCandidate` (lines 384–405) — Rule 2 / §4.5.1 shape gate for judgment output; branches on `DistilCandidateType`: a `rule-candidate` (default when `type` is absent) enforces `proposedTarget` starts with `.cortex/compass/` and rejects `..` path traversal, while a `skill-proposal` enforces `proposedTarget` matches `.claude/skills/<slug>/SKILL.md` for a NEW skill. [critical]
- `readCompassNormalised` (lines 408–432) — walks `.cortex/compass/` recursively and normalises all `.md` text for the "already covered by compass" filter. [supporting]
- `readInsightProse` (lines 450–498) / `insightFileCovering` (lines 501–506) — reads both the legacy v2 `insight/map/*.md` prose and the v3 per-file `insight/anatomy/**` (and `insight/scopes/<s>/anatomy/**`) entries to detect when a candidate is already captured in insight, redirecting it to a `promotion` proposal instead of a fresh rule-candidate; skipped entirely for `skill-proposal` candidates (a draft SKILL.md never graduates to a compass promotion). [critical]
- `proposeFromCandidates` (lines 625–733) — the orchestrating second half: applies the ordered filter chain (malformed → below-threshold → covered-by-compass → dismissed), computes promotions vs. fresh candidates, carries forward still-pending prior sections by matched normalised pattern text (no id churn), allocates fresh S-ids, always-writes the report, and advances `state/distil-last-run` on success. [critical]
- `readUnexpiredDismissals` (lines 143–163) / `isDismissed` (lines 166–170) — rejection-memory: parses `dismissed.md` and suppresses re-proposal of matching (unexpired) patterns. [supporting]
- `parseSuggestionSections` (lines 80–124) / `readPendingSections` (lines 127–130) — fence-aware §4.5 report parser shared by carry-forward and dismissal logic; heading/field-looking lines inside a fenced payload are never treated as structural. [critical]
- `writeDegradedReport` (lines 742–753) — degraded-mode report writer: re-emits still-pending prior sections verbatim when the judgment pass could not run, and deliberately does NOT advance `state/distil-last-run` so the window stays open for a later scheduled run. [supporting]
- `runClaudeJudgment` (lines 765–793) — the Rule 6 subprocess boundary: spawns the `claude` CLI headless via `execFile`, classifying the outcome into `ok`/`no-binary`/`timeout`/`auth`/`error` using `AUTH_FAILURE_PATTERN` from `claude-auth.ts`. [supporting]
- `parseCandidatesFromOutput` (lines 796–806) — extracts the first JSON array embedded anywhere in the subprocess stdout (tolerant of surrounding prose). [supporting]
- `runDistil` (lines 835–931) — top-level entry dispatching the three modes (`--collect`, `--propose <file>`, bare) and the degrade-and-report fallback logic for each subprocess failure kind. [critical]

## Insights

- **The workflow-mining lens is a candidate-type branch, not a separate pipeline**: `DistilCandidateType` (`'rule-candidate' | 'skill-proposal'`, line 359) threads through `validateDistilCandidate` (different Target-shape gate per type), `insightFileCovering`'s caller in `proposeFromCandidates` (promotion path skipped for `skill-proposal`), and `distilSectionText` (a distinct `**Type:** skill-proposal` / `**Proposed file:**` rendering block) — the collect half, filter ordering, carry-forward, and id allocation are all shared unchanged between the two types.
- **Ordered filter chain matters for counts**: malformed → below-threshold → covered-by-compass → dismissed is a strict pipeline in `proposeFromCandidates` — a candidate covered by compass is never separately counted as dismissed even if it would also match a dismissal, because `continue` short-circuits per stage.
- **Promotion vs. fresh candidate is a graduation path, not just dedup**: if a `rule-candidate`'s `proposedText` already appears in insight prose (not compass), the code doesn't drop it as "covered" — it re-labels it a `promotion` referencing the insight file (`distilSectionText`), which is a different accept path in `review.ts`/`promote.ts`. This is the "capture once in session-observe, detect repetition later in distil" boundary the header comment names.
- **Carry-forward preserves ids deliberately**: recurring patterns matched against `readPendingSections` keep their original `S-NNN` id and original `Source` field rather than getting a fresh id each week — this avoids id churn in the suggestions report across cycles.
- **Auth failure is a named, actionable exit code**: `runClaudeJudgment`'s `auth` outcome degrades with exit code 3 (`core-cli.init` Rule 6 semantics), distinct from the exit-0 degrade used for `no-binary`/`timeout`/`error` — auth failures are considered actionable-by-the-user, others are silent skips.
- **`state/distil-last-run` is NOT advanced on degrade** (only on a successful `proposeFromCandidates` call, and never by `refreshCorpus`) — intentional so a skipped/failed judgment pass, or an incremental refresh by another consumer, never loses the time window; the next attempt (even the scheduled skill) still sees the full unprocessed range.
- **Fence-awareness is load-bearing, not decorative**: `parseSuggestionSections` explicitly tracks fence state per §4.5/B-003 grammar so that heading-like or field-like text embedded inside a fenced payload (e.g. example markdown in a proposed rule text, or an entire draft SKILL.md for a skill-proposal) is never misparsed as a new section boundary or field.
- **The threshold config lives in `cortex.config.json`** under `pulse.distilThresholdN` (default 3, `readThresholdN`) — a malformed or missing config silently falls back to the default rather than erroring.
- **Mutual exclusivity guard**: `--collect` and `--propose` are asserted mutually exclusive at the top of `runDistil` — combining them exits 1 immediately, before any file I/O.
- When run bare (`cortex pulse-distil` with no driving session) the judgment step spawns a headless `claude` CLI subprocess rather than calling a model API directly — the sanctioned way this file honours R-001 (Core makes no LLM calls); it degrades gracefully if the CLI is missing/unauthenticated/times out by re-emitting pending suggestions without advancing the time window, so no sessions are lost.
- A candidate pattern already captured in the ungated insight layer is not dropped as a duplicate during `--propose`; it is re-labeled a `promotion` suggestion instead of a `rule-candidate` — the mechanical link between session-observe's per-session capture and distil's cross-session gated proposals.
- `parseSuggestionSections`'s `raw` capture for the LAST heading in a report runs to end-of-file, not to the next logical boundary — there is no closing sentinel after the final section. A consumer that appends its own trailing content after emitting `readPendingSections`' carried-forward `raw` text will have that trailing content baked into the "last" pending section's `raw` on the next run, then re-appended fresh on top of it. This file's own callers don't append anything after the last carried-forward section, so the quirk is dormant here — it only bites a consumer that does (e.g. `src/insight/session-observe.ts`'s report footer, per prior-session observation).

## File map

- Lines 1–34: module doc comment (design references, write-scope statement, workflow-mining-lens note) and top-level imports/constants (`DISTIL_FIRST_RUN_WINDOW_DAYS`, `DEFAULT_THRESHOLD_N`, `DEFAULT_TIMEOUT_MS`, `DAY_MS`, file-name constants).
- Lines 36–47: `stateDir`/`pulseRootDir` path helpers.
- Lines 49–184: shared parsing/helpers section — `normaliseText`, `PriorSection` type, `parseSuggestionSections`, `readPendingSections`, dismissal types and `readUnexpiredDismissals`/`isDismissed`, `readThresholdN`.
- Lines 186–254: collect half — `SessionKind`, `CorpusSession`/`SessionCorpus`/`CollectOptions`/`CollectResult` types, `collectCorpus`.
- Lines 256–345: `sessionKind` classifier, `readCorpusSessions`, `writeCorpus`, `readCorpus`, `RefreshResult`, `refreshCorpus`.
- Lines 347–405: propose half, part 1 — `DistilCandidateType`, `DistilCandidate` type and validators (`isRecord`, `isStringArray`, `SKILL_PROPOSAL_TARGET_RE`, `validateDistilCandidate`).
- Lines 407–506: compass/insight-prose readers — `readCompassNormalised`, `readInsightProse`, `insightFileCovering`.
- Lines 508–611: `ProposeCounts`/`ProposalDraft` types, `distilSectionText` (skill-proposal vs. rule-candidate/promotion rendering branches), `WriteReportOptions`, `writeSuggestionsReport`.
- Lines 613–733: `ProposeOptions`, `proposeFromCandidates` — the main filter/carry-forward/allocate/write orchestration.
- Lines 735–753: `writeDegradedReport`.
- Lines 755–818: bare-mode subprocess boundary — `SubprocessOutcome` type, `runClaudeJudgment`, `parseCandidatesFromOutput`, `judgmentPrompt`.
- Lines 820–931: entry point — `DistilOptions` type and `runDistil`, dispatching collect-only / propose-only / bare (collect → judgment subprocess → propose) modes.

## Connections

Uses:
- src/cli/claude-auth.ts — `AUTH_FAILURE_PATTERN` regex used in `runClaudeJudgment` to detect an unauthenticated Claude CLI from combined stdout/stderr.
- src/loops/report.ts — `writePulseReport`, the shared always-write-a-report helper used by `writeSuggestionsReport` to land `suggestions.md` with standard frontmatter/provenance.
- src/pulse/fences.ts — `openingFence`, `closesFence`, `chooseOuterFence`, `headingLinesOutsideFences`, `FenceOpen` type; drive the fence-aware §4.5 section parser and the outer-fence choice when emitting a proposal's payload (including a skill-proposal's draft SKILL.md body).
- src/pulse/suggestion-ids.ts — `allocateSuggestionIds`, used to mint fresh `S-NNN` ids for candidates that aren't carried forward from a prior pending section.
- src/sessions/read.ts — `listSessions`, `readSessionFile`, `extractMessages` (+ `ExtractedMessage` type), the session-reading layer `collectCorpus`/`refreshCorpus` delegate to rather than re-implementing transcript parsing.

Used by:
- src/hooks/session-end.ts — the SessionEnd hook path touches distil's corpus/shared logic as part of assembling session records.
- src/insight/session-observe.ts — consumes distil's shared helpers (`refreshCorpus`, `normaliseText`, section-parsing conventions) as part of the session-observe loop's insight-enrichment routing.
- src/loops/bug-triage.ts — reuses shared distil helpers for its own triage report handling.
- src/pulse/threads.ts — imports `normaliseText` for the thread dedupe/mention key, and `SessionKind` to gate scheduled-session thread candidates.
- src/cli/cli.ts — the `pulse-distil` verb dynamically imports `runDistil`, which also carries the workflow-mining lens formerly served by the retired `loop-skill-suggest` verb.

Semantically related (not imports):
- src/pulse/promote.ts — consumes the `promotion` proposal shape (`**Source:** ... insight ...`) that `distilSectionText` emits when `promoteFrom` is set; the two files agree on the promotion-provenance text format without importing each other.
- src/pulse/review.ts — the accept-side gate that reads `suggestions.md` sections this file writes and performs the actual transactional write to compass (distil proposes, review/promote apply) or installs a proposed skill bundle for a `skill-proposal` section.

## Query pointers

- If you need to understand how a `promotion` proposal is later accepted and landed in compass or atlas, also read: `src/pulse/promote.ts`, `src/pulse/review.ts`.
- If you need to understand the §4.5 report/section format and fence grammar this file both writes and parses, also read: `src/pulse/fences.ts`.
- If you need to understand the shared session corpus consumed by sibling loops, also read: `src/sessions/read.ts`, `src/pulse/threads.ts`, `src/loops/bug-triage.ts`.
- If you need to understand suggestion id allocation across loops, also read: `src/pulse/suggestion-ids.ts`.
- If you need the retired skill-suggest loop this file's workflow-mining lens absorbed, note it no longer exists (`src/loops/skill-suggest.ts` deleted) — the lens is entirely inside `validateDistilCandidate`/`distilSectionText` above.
