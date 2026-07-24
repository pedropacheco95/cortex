---
path: src/hooks/session-start.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 3
size_lines: 275
size_tokens: 2720
centrality: high
built_at_commit: "bcbda52"
source_sha256: "ced4b08bd36fef2649f95812fdc90e4b130e103c3ab057b38a91227f20585fd9"
---
# src/hooks/session-start.ts

## Purpose
The SessionStart hook — injects a sub-100-token pointer payload on every session (schema version, `.cortex/_index.md` pointer, present module list) plus an optional one-line hygiene summary when `.cortex/pulse/reports/hygiene.md` is fresh (within a configurable window), plus a separately-budgeted (<=150-token) observations digest (schema §4.10.11) when `.cortex/insight/observations/` has at least one qualifying entry. Degrades to whatever part of the payload is still derivable on any internal error, always exiting 0.

## Main players
- `run` (lines 174–260) — reads config, builds the pointer+modules payload, conditionally appends the hygiene summary within its budget, reads and renders the qualifying observations digest in its own separate budget, and returns the envelope; a top-level catch falls back to the bare pointer line. [critical]
- `readQualifyingObservations` (lines 101–140) — reads every `.cortex/insight/observations/*.md` entry (skipping `_index.md`), qualifies each one (`salient: true` OR `sessions.length >= 3`), and collects per-entry parse failures separately rather than throwing; an absent directory returns silently empty. [critical]
- `renderObservationsDigest` (lines 149–172) — orders qualifying entries (salient first, then by session count descending, then alphabetically by theme) and greedily packs "theme: gist" one-liners into the 592-char (<=150-token) budget, truncating the single top entry's text if even it doesn't fit whole. [critical]
- `firstGist` (lines 76–85) — extracts the first sentence (or first line) of an observation entry's body prose for the digest's "gist" text. [supporting]
- `firstSummaryLine` (lines 66–73) — extracts the first meaningful (non-heading, non-blank) line of a report body for the hygiene summary. [supporting]
- `envelope` / `silent` (lines 44–55) — the two `HookRunResult` shapes: a `SessionStart` hookSpecificOutput payload, or a fully silent no-op. [supporting]

## Insights
- Also exports the shared `HookRunResult`/`HookRunOptions` interfaces that every other hook module in this scope imports purely for typing — this file is the de facto type-anchor for the hooks layer even though its own runtime logic is SessionStart-specific.
- `MAX_PAYLOAD_CHARS = 396` encodes the <100-token budget (RULES.md rule 11) at the project's chars/4 token-estimate convention; `MAX_OBSERVATIONS_DIGEST_CHARS = 592` is a SEPARATE, additional <=150-token budget for the observations digest (schema §4.10.11) — the two pools never share room, and the digest line is appended with its own `\n` after the (already-truncated) pointer+hygiene payload rather than competing for the same slice.
- The observations digest's ordering is deterministic by construction (documented in the amendment's own doc comment): salient entries always sort before frequency-only ones regardless of session count, so a single forcefully-stated observation can outrank a dozen mildly-repeated ones — mirrors the two-signal importance model in schema §4.10.11 (max of frequency and emphasis, never a combined score).
- When not even the single top-priority one-liner fits the whole budget, `renderObservationsDigest` truncates ONLY that one-liner's text (never drops the prefix/pointer) — the digest always carries the `.cortex/insight/observations/` pointer even in the degenerate single-entry-too-long case.
- `readQualifyingObservations` never throws on a per-file parse failure — it accumulates `{file, failure}` pairs the caller logs via `appendHookError`, so one malformed observation entry never blocks the digest for every other qualifying entry.
- On total failure, the catch block still returns a real payload (`Cortex is active (schema ...)`) rather than a silent no-op — SessionStart is the one hook considered too valuable to ever go fully silent; the observations digest is deliberately NOT attempted in that fallback path (only the bare schema-version pointer is).

## File map
- Lines 1–46: module doc, `HookRunResult`/`HookRunOptions` interfaces, budget constants (`MAX_PAYLOAD_CHARS`, `MAX_OBSERVATIONS_DIGEST_CHARS`, `OBSERVATIONS_QUALIFY_SESSIONS`, path/prefix constants), `silent`/`envelope`.
- Lines 57–74: `toDate`, `firstSummaryLine`.
- Lines 76–172: the observations digest machinery — `firstGist`, `QualifyingObservation`, `readQualifyingObservations`, `renderObservationsDigest`.
- Lines 174–260: `run` — config read, pointer+modules payload, hygiene summary, observations digest, envelope assembly, top-level catch.

## Connections
Uses:
- src/cli/templates.ts: `SCHEMA_VERSION` — fallback schema version string
- src/hooks/errors.ts: `appendHookError` — logs unparseable config, malformed hygiene reports, and per-entry observations parse failures

Used by:
- src/hooks/cli.ts: dispatches `case 'session-start'` to this module's `run`
- src/hooks/post-write.ts: imports `HookRunResult`, `HookRunOptions` types only
- src/hooks/pre-read.ts: imports `HookRunResult`, `HookRunOptions` types only
- src/hooks/pre-write.ts: imports `HookRunResult`, `HookRunOptions` types only

## Query pointers
- If you need the shared hook result/options types, this file is their source even for hooks whose logic lives elsewhere.
- If you need the hygiene report's frontmatter shape, also read the loop that writes `.cortex/pulse/reports/hygiene.md` (outside this scope).
- If you need the observations-entry frontmatter contract this digest reads, also read src/schema/checks/insight.ts's `checkInsightObservations` (the authoritative shape check) and schema §4.10.11 — this hook is tolerant/best-effort, not the validator.
