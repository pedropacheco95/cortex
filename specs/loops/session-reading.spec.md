---
id: loops.session-reading
status: implemented
depends_on:
  - schema.validator
implements: ../../specs-business/loops/developer-benefits-from-what-past-sessions-taught.business.md
governed_by:
  - R-001
---

# Session-Reading Layer

## Intent

The session-reading layer is the shared substrate (design §11.5, §16.2 step 10) that lets distil and skill-suggest read Claude Code session transcripts for *this project only*: locate the project's transcript directory, enumerate sessions, and parse their JSONL tolerantly into typed entries. Verified 2026-07-02 (resolving design open question #9 / §10.7, case 2): transcripts live globally at `~/.claude/projects/<slug>/<session-id>.jsonl`, where `<slug>` is the project's absolute path with `/` replaced by `-`. Deterministic Core library; consumers add the LLM judgment.

## Entities

- **READS:** `<home>/.claude/projects/<slug>/*.jsonl` — and nothing else. `home` is injectable (defaults to the OS home) so tests never touch the real transcript store.
- **WRITES:** nothing, ever. The layer is strictly read-only; consumers write their outputs to `.cortex/pulse/` under their own specs.
- **CREATES:** in-memory session listings and parsed entries only.

## Rules

1. **Location.** `projectSlug(root)` = the absolute project path with every `/` replaced by `-` (e.g. `/Users/x/proj` → `-Users-x-proj`). The transcript directory is `<home>/.claude/projects/<slug>/`. This encoding is an observed Claude Code convention, not a Cortex-owned schema — see Rule 6.
2. **Enumeration.** `listSessions(root, {home?, since?})` returns this project's sessions only — session id (filename stem) and last-modified timestamp — sorted newest-first. `since` filters by file mtime. Another project's directory is never read, even when its slug shares a prefix.
3. **Tolerant parsing.** `readSession(...)` parses JSONL line-by-line: each valid line yields its object with its `type` preserved (unknown types pass through untouched); malformed lines are skipped and counted in a `skipped` counter, never thrown. A session that is 90% unreadable still yields its readable 10%.
4. **Message extraction.** A helper distils what consumers actually need: the ordered user/assistant message texts with timestamps, ignoring non-message entry types. Consumers needing more read the raw entries from Rule 3.
5. **Read-only, local, Core.** No writes, no network, no LLM, no subprocess (governed by R-001). Parsed content is returned in-process only — persistence decisions belong to consumers, whose own specs confine them to `.cortex/pulse/`.
6. **Format is externally owned — degrade, don't insist.** The transcript location and entry shapes are Claude Code's, unversioned and changeable. Missing directory → empty list. A future format change surfaces as high `skipped` counts, not crashes; consumers are expected to treat low-yield reads as "nothing learned this week".

## Acceptance Criteria

### Slug encoding is exact

- **Given** project root `/Users/pedropacheco1/Documents/Projetos/cortex`
- **When** `projectSlug` runs
- **Then** it returns `-Users-pedropacheco1-Documents-Projetos-cortex`

### Project isolation

- **Given** a fake home containing `projects/-tmp-proj-a/s1.jsonl` and `projects/-tmp-proj-a-b/s2.jsonl`
- **When** `listSessions` runs for root `/tmp/proj-a`
- **Then** it returns exactly `s1` — the prefix-sharing sibling is not read

### since-filter and ordering

- **Given** three session files with distinct mtimes
- **When** `listSessions` runs with `since` between the first and second
- **Then** only the two newer sessions return, newest first

### Tolerant parse yields the readable parts

- **Given** a session file with 3 valid JSONL lines, 2 malformed lines, and 1 valid line of an unknown `type`
- **When** `readSession` runs
- **Then** 4 entries are returned (unknown type included, `type` preserved) and `skipped` is 2

### Message extraction

- **Given** a session containing user/assistant message entries interleaved with non-message types
- **When** the message helper runs
- **Then** it returns only the user/assistant texts, in order, with timestamps

### Missing history is empty, not an error

- **Given** a fake home with no `projects/<slug>/` directory for the root
- **When** `listSessions` runs
- **Then** it returns an empty list with no error

### Strictly read-only

- **Given** any sequence of list/read/extract calls over a fixture home
- **Then** no file under the fixture home or project root was created, modified, or deleted

## Notes

- **Resolves design §10.7 / open question #9** (case 2: global storage, project-filtered). Distil and skill-suggest remain in v1 scope; the design doc was updated in this round to record the verified answer.
- The real fixture shapes for tests are modelled on observed entries (`{"type":"last-prompt",...}`, `{"type":"mode",...}`, message entries) but the layer never *requires* those types — Rule 3/6 tolerance is the contract, precisely because the format is Claude-Code-owned.
- Sensitive-content note: transcripts may contain anything the user typed. This layer confines exposure by design — in-process return only, project-scoped, read-only; the only durable artefacts derived from transcripts are the suggestion entries the human reviews at the pulse gate.
- Also supports: `cortex-pulse-distil` and `cortex-loop-skill-suggest` (design §11.5 shared machinery). Primary parent remains `loops.developer-benefits-from-what-past-sessions-taught`.
