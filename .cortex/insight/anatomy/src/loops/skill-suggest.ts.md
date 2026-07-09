---
path: src/loops/skill-suggest.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 3
size_lines: 456
size_tokens: 4204
centrality: high
built_at_commit: "8248c76"
source_sha256: "d69c80a2fcaffdbb0f62647d479de1fe906c82746375fc51e3c5b22508f28811"
---

# src/loops/skill-suggest.ts

## Purpose

Implements `cortex loop-skill-suggest`, the weekly workflow-mining loop (spec `loops.skill-suggest`, described in its own header as "distil's workflow-mining sibling"): it reuses the shared session corpus that `pulse-distil`'s collect phase produces, mines it (via an in-session or headless judgment) for multi-step workflows Claude re-derived repeatedly across sessions, and proposes each as a `§4.5` skill-suggestion section whose payload is a complete draft `SKILL.md`. It never creates a skill file itself — that only happens through `cortex pulse-accept` — so this file's job ends at validating candidates, filtering (below-threshold / already-covered / dismissed), carrying forward still-pending proposals under their original `S-NNN` ids, and always-writing `skill-suggestions.md`.

## Main players

- `validateSkillCandidate` (lines 62–81) — Rule 2 shape/slug validation of a raw candidate: `workflowName` must match the skill-slug regex, `draftSkillMd` must parse with frontmatter `name` matching the slug and a non-empty description/body. [critical]
- `skillNameExists` (lines 93–98) — dedup check: true if a skill of that name already exists project-locally (`.claude/skills/<name>`) or ships in the package's own `skills/` dir. [critical]
- `proposeSkillCandidates` (lines 187–273) — the deterministic "propose" half: filters passing candidates (threshold → covered → dismissed), carries forward pending sections matched by normalised workflow name, allocates fresh `S-NNN` ids for the rest via the shared counter, and always-writes the report. [critical]
- `runSkillSuggest` (lines 356–455) — the three-mode entrypoint (`--collect`, `--propose <file>`, bare), mirroring `pulse-distil`'s Rule 1 subprocess semantics exactly (same auth/timeout/no-binary/error classification and degrade-with-notice behaviour). [critical]
- `sectionText` (lines 114–133) — renders one `## S-NNN: <workflow>` proposal section, choosing a fence via `chooseOuterFence` so a draft SKILL.md containing its own fenced examples can't break the section boundary. [supporting]
- `writeSkillSuggestionsReport` / `writeDegradedSkillReport` (lines 145–174, 276–287) — always-write and degraded-mode report writers built on `writePulseReport`. [supporting]
- `runClaudeJudgment` / `judgmentPrompt` (lines 299–337) — subprocess invocation of the headless `claude` binary and the prompt text instructing it to mine the corpus conservatively and output only a JSON candidate array. [supporting]

## Insights

- Rule 1 explicitly reuses the shared session corpus (`pulse/.session-corpus.json`) written by `pulse-distil`'s collect phase rather than re-collecting session data — bare mode only collects when the corpus file is absent, an explicit design choice to avoid duplicate session reads across sibling loops.
- Shares the single monotonic `S-NNN` id counter (`allocateSuggestionIds`) with `pulse-distil` so the two loops' proposals can never collide on ids, even though they run independently.
- The carry-forward logic (match pending report sections by normalised workflow name, reuse their id and `Source`) is deliberately identical in shape to distil's own carry-forward rule — the header comment calls out "identical conventions to distil Rule 6."
- `chooseOuterFence` from `fences.ts` is used specifically because draft `SKILL.md` payloads routinely embed their own fenced code examples — this is the B-003 bug fix applied at the call site, not just referenced.
- Enforces the propose/mutate boundary at the type level: this file can only ever produce a markdown proposal; actual skill-directory creation is deferred entirely to `cortex pulse-accept`, which this file's own report text states explicitly ("this loop never creates skills").

## Connections

Uses:
- `src/cli/claude-auth.ts` — `AUTH_FAILURE_PATTERN`, for classifying the headless subprocess's auth-failure output.
- `src/loops/report.ts` — `writePulseReport`, the shared always-write report writer.
- `src/pulse/distil.ts` — `collectCorpus`, `normaliseText`, `readPendingSections`, `readUnexpiredDismissals`, `isDismissed`, `readThresholdN`, `parseCandidatesFromOutput`, `CORPUS_FILE`, and the `CollectOptions`/`CollectResult` types — the entire shared corpus/dedup/threshold machinery is borrowed rather than reimplemented.
- `src/pulse/fences.ts` — `chooseOuterFence`, to safely wrap draft SKILL.md payloads that may contain their own fences.
- `src/pulse/suggestion-ids.ts` — `allocateSuggestionIds`, for fresh `S-NNN` ids on non-carried candidates.

Used by: (none src-internal)

Semantically related (not imports): `src/loops/bug-triage.ts` — shares the identical three-mode (collect/apply-report/bare) shape and the same `runClaudeJudgment`/`judgmentPrompt`/subprocess-outcome-classification pattern almost verbatim, strongly suggesting a shared template both loops were built from.

## Query pointers

If you need to understand the shared session corpus format or threshold/dismissal semantics, also read: `src/pulse/distil.ts`. If you need to see the `S-NNN` allocation contract, also read: `src/pulse/suggestion-ids.ts`. If you need the fence-wrapping contract this file depends on, also read: `src/pulse/fences.ts`. If you need to see the sibling loop this one was modeled after, also read: `src/loops/bug-triage.ts`.
