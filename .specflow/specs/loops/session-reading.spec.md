---
id: loops.session-reading
status: implemented
depends_on:
  - schema.validator
implements: ../../specs-business/loops/developer-benefits-from-what-past-sessions-taught.business.md
governed_by:
  - R-001
governs:
  - "src/sessions/**/*.ts"
---

# Session-Reading Layer

## Intent

The session-reading layer is the shared substrate (design §11.5, §16.2 step 10) that lets the session-consuming loops (distil — now carrying both the rule lens and the absorbed skill lens — and session-observe) read Claude Code session transcripts for *this project only*: locate the project's transcript directory, enumerate sessions, and parse their JSONL tolerantly into typed entries. Verified 2026-07-02 (resolving design open question #9 / §10.7, case 2): transcripts live globally at `~/.claude/projects/<slug>/<session-id>.jsonl`, where `<slug>` is the project's absolute path with `/` replaced by `-`. Deterministic Core library; consumers add the LLM judgment.

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
7. **Tool-use extraction.** Rule 4 keeps message *text* only, so a session that wrote a defect list to its scratchpad or edited files is invisible to consumers reading the extraction. Two further deterministic helpers close that hole without touching Rule 4's `extractMessages` (whose signature and output are unchanged): (a) `extractToolUses(entries)` returns, in transcript order, one `{ name, timestamp?, filePath?, command? }` per `tool_use` content part of each assistant message entry — `filePath` is `input.file_path` (falling back to `input.notebook_path`) for `Write`, `Edit`, `Read` and `NotebookEdit`; `command` is the first 200 characters of `input.command` for `Bash`; nothing else is taken from any input (no file bodies, no `tool_result` contents, no other tool's arguments); `timestamp` is the enclosing entry's. Parts that are not records, lack a string `name`, or carry a non-string/non-record input are skipped, never thrown (Rule 3/6). (b) `sessionTitle(entries)` returns the `customTitle` of the last `custom-title` entry, or `undefined` when none is present (the entry shape is an observed convention — see Notes). Both helpers are pure functions over already-parsed entries: Rule 5 continues to hold — no writes, no network, no LLM, no subprocess (R-001), results returned in-process only.

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

### Tool uses are extracted in order with paths

- **Given** a session whose assistant entries carry `tool_use` parts for `Read` (`file_path: a.ts`), `Edit` (`file_path: b.ts`), `Write` (`file_path: c.md`), `NotebookEdit` (`notebook_path: d.ipynb`) and `Grep` (`pattern: x`), interleaved with text parts, user entries and non-message types
- **When** `extractToolUses` runs
- **Then** it returns five records in transcript order, each with its `name` and the enclosing entry's `timestamp`; the four file tools carry `filePath`; `Grep` carries neither `filePath` nor `command`; no record carries any other input field

### Bash commands are truncated

- **Given** an assistant `tool_use` part for `Bash` whose `command` is 500 characters long
- **When** `extractToolUses` runs
- **Then** the record's `command` is exactly the first 200 characters and no other input field (e.g. `description`) is carried

### Malformed tool-use parts are skipped, not thrown

- **Given** an assistant entry whose content array mixes a valid `tool_use` part with a `null` part, a `tool_use` part with no `name`, a `tool_use` part whose `input` is a string, and a `tool_result` part
- **When** `extractToolUses` runs
- **Then** it does not throw and returns exactly one record for the valid part, and the `tool_result` contents appear nowhere in the output

### No tool use yields an empty array

- **Given** a session containing only user/assistant text messages and non-message entry types
- **When** `extractToolUses` runs
- **Then** it returns `[]`

### Session title is read when present, undefined when absent

- **Given** a session containing a `custom-title` entry (`customTitle: "Cortex daily"`) and a session with no such entry
- **When** `sessionTitle` runs on each
- **Then** it returns `"Cortex daily"` for the first (the last such entry wins when several repeat it) and `undefined` for the second

### Missing history is empty, not an error

- **Given** a fake home with no `projects/<slug>/` directory for the root
- **When** `listSessions` runs
- **Then** it returns an empty list with no error

### Strictly read-only

- **Given** any sequence of list/read/extract calls (message, tool-use and title helpers alike) over a fixture home
- **Then** no file under the fixture home or project root was created, modified, or deleted

## Notes

- **Resolves design §10.7 / open question #9** (case 2: global storage, project-filtered). Distil (now carrying the absorbed skill lens) and session-observe remain in v1 scope; the design doc was updated in this round to record the verified answer. (The former separate `skill-suggest` consumer is retired — folded into distil.)
- The real fixture shapes for tests are modelled on observed entries (`{"type":"last-prompt",...}`, `{"type":"mode",...}`, message entries) but the layer never *requires* those types — Rule 3/6 tolerance is the contract, precisely because the format is Claude-Code-owned.
- **Observed session-metadata entry shapes (Rule 7; externally owned per Rule 6, verified 2026-09-15 against this project's real transcripts).** `{"type":"custom-title","customTitle":"Cortex daily","sessionId":"<uuid>"}` — the user- or scheduler-assigned session title; it is appended (not rewritten) and repeats verbatim many times in one transcript (observed 4–15 copies), so the helper takes the last one. `{"type":"last-prompt","leafUuid":"<uuid>","sessionId":"<uuid>"}`, sometimes with a `lastPrompt` string carrying the most recent user prompt text — a resume pointer, not something this layer models. Both carry no `timestamp`. The fixture lines elsewhere in this spec that use `"prompt"` on a `last-prompt` entry are deliberately *not* the real shape: they exist to prove unknown fields pass through untouched.
- Sensitive-content note: transcripts may contain anything the user typed. This layer confines exposure by design — in-process return only, project-scoped, read-only; the only durable artefacts derived from transcripts are the suggestion entries the human reviews at the pulse gate.
- Also supports: `cortex-pulse-distil` (which now also carries the skill lens absorbed from the retired `cortex-loop-skill-suggest`) and `cortex-loop-session-observe` (design §11.5 shared machinery). Primary parent remains `loops.developer-benefits-from-what-past-sessions-taught`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
