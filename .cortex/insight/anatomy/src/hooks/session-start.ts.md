---
path: src/hooks/session-start.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 3
size_lines: 296
size_tokens: 2965
centrality: high
built_at_commit: "0998c19"
source_sha256: "162e7ee72878f0983e88a9ae65ee0aec5cc3da5ff6e943716b3c146e3cb01e1e"
---
# src/hooks/session-start.ts

## Purpose
The SessionStart hook — injects a sub-100-token pointer payload on every session (schema version, `.cortex/_index.md` pointer, present module list), a new (schema §5, v3.3) profile-scoped **entry line** that re-arms the process gate each session, plus an optional one-line hygiene summary when `.cortex/pulse/reports/hygiene.md` is fresh (within a configurable window), plus a separately-budgeted (<=150-token) observations digest (schema §4.10.11) when `.cortex/insight/observations/` has at least one qualifying entry. Degrades to whatever part of the payload is still derivable on any internal error, always exiting 0.

## Main players
- `run` (lines 191–296) — reads config, builds the pointer+modules payload, appends the entry line when applicable, conditionally appends the hygiene summary within its budget, reads and renders the qualifying observations digest in its own separate budget, and returns the envelope; a top-level catch falls back to the bare pointer line. [critical]
- `entryLineFor` (lines 55–59) — NEW: returns the `ENTRY_LINE` constant only when `readProfile(root)` is `'specflow'` AND `.claude/skills/specflow-entry/` exists on disk; returns `null` otherwise (non-specflow profile, or the bundle simply isn't installed). [critical]
- `readQualifyingObservations` (lines 118–157) — reads every `.cortex/insight/observations/*.md` entry (skipping `_index.md`), qualifies each one (`salient: true` OR `sessions.length >= 3`), and collects per-entry parse failures separately rather than throwing; an absent directory returns silently empty. [critical]
- `renderObservationsDigest` (lines 166–189) — orders qualifying entries (salient first, then by session count descending, then alphabetically by theme) and greedily packs "theme: gist" one-liners into the 592-char (<=150-token) budget, truncating the single top entry's text if even it doesn't fit whole. [critical]
- `firstGist` (lines 93–102) — extracts the first sentence (or first line) of an observation entry's body prose for the digest's "gist" text. [supporting]
- `firstSummaryLine` (lines 83–90) — extracts the first meaningful (non-heading, non-blank) line of a report body for the hygiene summary. [supporting]
- `envelope` / `silent` (lines 61–72) — the two `HookRunResult` shapes: a `SessionStart` hookSpecificOutput payload, or a fully silent no-op. [supporting]

## Insights
- Also exports the shared `HookRunResult`/`HookRunOptions` interfaces that every other hook module in this scope imports purely for typing — this file is the de facto type-anchor for the hooks layer even though its own runtime logic is SessionStart-specific.
- **New at this pass — the entry line (schema §5, v3.3):** `ENTRY_LINE = 'Entry: run \`specflow-entry\` first — classify the request, then run the skill it routes to.'`. It is deliberately gated on BOTH conditions in `entryLineFor` (profile `specflow` AND the skill dir present), not either alone — pointing at a skill the project doesn't have would be noise, and a `superpowers` project has no spec-first gate to re-arm at all. It is inserted into `lines` right after the module list and before the hygiene line (see `run`, ~line 237), so it always appears near the top of the payload when present. This is a pointer only — hooks warn, never block (RULES 6); nothing here enforces `specflow-entry` actually running.
- `MAX_PAYLOAD_CHARS = 396` encodes the <100-token budget (RULES.md rule 11) at the project's chars/4 token-estimate convention; `MAX_OBSERVATIONS_DIGEST_CHARS = 592` is a SEPARATE, additional <=150-token budget for the observations digest (schema §4.10.11) — the two pools never share room, and the digest line is appended with its own `\n` after the (already-truncated) pointer+hygiene+entry payload rather than competing for the same slice. The entry line itself is NOT separately budgeted — it counts against `MAX_PAYLOAD_CHARS` like the hygiene line, so on a very long hygiene summary the entry line could in principle be truncated away; in practice the entry line is added before the hygiene summary is computed, so the hygiene summary is what gets clipped to fit the remaining room (see the `roomForSummary` computation), not the entry line.
- The observations digest's ordering is deterministic by construction (documented in the amendment's own doc comment): salient entries always sort before frequency-only ones regardless of session count, so a single forcefully-stated observation can outrank a dozen mildly-repeated ones — mirrors the two-signal importance model in schema §4.10.11 (max of frequency and emphasis, never a combined score).
- When not even the single top-priority one-liner fits the whole budget, `renderObservationsDigest` truncates ONLY that one-liner's text (never drops the prefix/pointer) — the digest always carries the `.cortex/insight/observations/` pointer even in the degenerate single-entry-too-long case.
- `readQualifyingObservations` never throws on a per-file parse failure — it accumulates `{file, failure}` pairs the caller logs via `appendHookError`, so one malformed observation entry never blocks the digest for every other qualifying entry.
- On total failure, the catch block still returns a real payload (`Cortex is active (schema ...)`) rather than a silent no-op — SessionStart is the one hook considered too valuable to ever go fully silent; the observations digest AND the entry line are deliberately NOT attempted in that fallback path (only the bare schema-version pointer is — the fallback never calls `readProfile` or touches the filesystem beyond the one `appendHookError` write).
- **Live bug in `firstGist` (lines 92-102):** its sentence-boundary regex `/^[^.!?]*[.!?]/` stops at the *first* `.`/`!`/`?` in the line, with no awareness that a period inside a backtick-quoted path (e.g. `` `.cortex/insight/` ``) isn't a sentence end. Any observation whose first prose line opens with such a path renders a gist truncated mid-clause. Confirmed live on 2026-09-06 in this project's own SessionStart output (three of four rendered gists cut off exactly at an internal path period), not just in the audit that first found it. See `insight/observations/session-start-digest-gist-truncation.md`. (claude-sessions/pedropacheco1/b6fa9d2b-cc7e-472d-a709-12d5dd22d38a)

## File map
- Lines 1–53: module doc, `HookRunResult`/`HookRunOptions` interfaces, budget constants (`MAX_PAYLOAD_CHARS`, `MAX_OBSERVATIONS_DIGEST_CHARS`, `OBSERVATIONS_QUALIFY_SESSIONS`, path/prefix constants), the new `ENTRY_LINE`/`ENTRY_SKILL_REL` constants.
- Lines 55–59: `entryLineFor` (NEW — profile + skill-presence gated entry-line lookup).
- Lines 61–72: `silent`/`envelope`.
- Lines 74–102: `toDate`, `firstSummaryLine`, `firstGist`.
- Lines 104–157: the observations digest machinery — `QualifyingObservation`, `readQualifyingObservations`.
- Lines 159–189: `renderObservationsDigest`.
- Lines 191–296: `run` — config read, pointer+modules payload, entry line, hygiene summary, observations digest, envelope assembly, top-level catch.

## Connections
Uses:
- src/cli/templates.ts: `SCHEMA_VERSION` — fallback schema version string
- src/cli/profile.ts: `readProfile` — NEW, drives `entryLineFor`'s profile gate
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
- If you need the profile mechanism the entry line depends on, also read src/cli/profile.ts (`readProfile`) and src/schema/checks/config.ts (the `profile` key's validation).
