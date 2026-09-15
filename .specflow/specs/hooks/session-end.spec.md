---
id: hooks.session-end
status: implemented
depends_on:
  - core-cli.init
  - loops.session-reading
  - pulse.threads
governs:
  - "src/hooks/session-end.ts"
  - "src/hooks/stop.ts"
implements: ../../specs-business/insight/assistant-learns-from-sessions.business.md
governed_by:
  - R-001
---

# SessionEnd Hook — The Session Record (with its Stop companion)

## Intent

Conclusions, open questions, offers, approvals, and scratchpad artefacts made mid-session
evaporate unless a human writes them into a gated file. Transcripts get pruned (41 of 55 remained
on this machine on 2026-09-15), the daily session-observe pass runs late, and its judgment contract
cannot express a question. This spec closes the gap at the cheapest possible moment: when Claude
Code fires `SessionEnd`, one hook reads the transcript **once**, deterministically, and writes one
**session record** under `.cortex/pulse/sessions/` plus the threads that record opens or answers
(`pulse.threads`). Because the transcript is written asynchronously and may lag at `SessionEnd`,
a tiny companion hook on `Stop` keeps the last assistant message in a state file so the final
question or offer is never lost to the lag. No LLM, no network, nothing injected into any session
— capture only. Consumers of the record and the ledger arrive in a later step (see Notes).

## Entities

- **READS:** `SessionEnd` stdin (Claude Code's JSON — `hook_event_name`, `session_id`,
  `transcript_path`, `cwd`, `reason`, and optionally `prompt_id`, `scratchpad_dir`,
  `permission_mode`); `Stop` stdin (`session_id`, `last_assistant_message`); the session transcript
  at `transcript_path` (via `loops.session-reading`'s `parseSessionJsonl`, `extractMessages`,
  `extractToolUses`, `sessionTitle`); `.cortex/pulse/state/sessions/<session-id>.last.json` (the
  Stop companion's file); `.cortex/pulse/state/reads/<session-id>` (presence and entries, for the
  `bears_on` seed); `.cortex/pulse/threads/*.md` (open threads, for dedupe and answered detection);
  `.cortex/pulse/sessions/*.json` (the newest prior record, `pulse.threads` Rule 9c); scratchpad
  files the session wrote (Rule 8 — read for copying only).
- **WRITES:** `.cortex/pulse/sessions/<session-id>.json` (the record — Rule 4);
  `.cortex/pulse/scratch/<session-id>/<basename>` (artefact copies — Rule 8);
  `.cortex/pulse/state/sessions/<session-id>.last.json` (the Stop companion — Rule 11);
  `.cortex/pulse/threads/T-NNN-<slug>.md` and `.cortex/pulse/state/thread-counter` (through the
  `pulse.threads` allocator and lifecycle); `.cortex/pulse/reports/hook-errors.md` (append,
  degradation only).
- **DELETES:** `.cortex/pulse/state/sessions/<session-id>.last.json` — its own companion's file,
  after the record is written (Rule 7a). Nothing else, ever.
- **CREATES:** the `pulse/sessions/`, `pulse/state/sessions/`, `pulse/scratch/<session-id>/` and
  `pulse/threads/` directories on first use (`mkdir -p`; `cortex init` does not scaffold them).
- **Never touches:** `compass/`, `atlas/`, `insight/`, `archive/`, either spec tree, `RULES.md`,
  `CLAUDE.md` — everything is pulse-only (RULES.md rule 7).

## Rules

1. **Invocation.** `cortex init` registers, and `cortex sync` refreshes, two entries in
   `.claude/settings.json` through the same `cortexHookEntries` table as the other hooks
   (`src/cli/scaffold.ts`): under `SessionEnd`, `{"type": "command", "command": "cortex hook
   session-end", "timeout": 10}` with **no matcher** (a `SessionEnd` matcher filters by `reason`;
   the record is wanted on every reason); and under `Stop`, `{"type": "command", "command":
   "cortex hook stop"}` with no matcher. Both are dispatched by `src/hooks/cli.ts` under the names
   `session-end` and `stop`. The `cortex hook ` prefix is the ownership marker (schema §5);
   `check.hook-config` requires both entries whenever the settings file carries any Cortex-owned
   hook entry (schema Appendix A). The explicit `timeout: 10` (seconds; Claude Code caps it at 60) lifts SessionEnd's shared
   1.5 s default budget for this one hook; the hook itself targets well under 100 ms (Rule 5).
   `mergeSettings` writes the field on the inner `{"type": "command", …}` object;
   `check.hook-config` detects entries by the command string alone, so the `timeout` field is
   neither required nor rejected by it, and a user who edits the value keeps a conformant file.

2. **Always silent, always exit 0.** Empty stdout in every case for both hooks — the
   PostWrite/PostRead envelope discipline. Claude Code ignores `SessionEnd`'s exit code and output
   anyway, and a `Stop` hook could in principle emit a decision: ours **never** does — no JSON, no
   `decision`, no `continue`, nothing. Nothing is injected anywhere: not into this session and not
   into the next one. Neither hook exits non-zero or throws to the runner (RULES.md rule 6).

3. **Fail-open on every path.** Malformed or empty stdin, a missing or unreadable
   `transcript_path`, a transcript that parses to zero entries, an absent `.cortex/`, an
   unwritable `pulse/` — each produces **no record, no thread, no scratch copy**, exit 0, and at
   most one `reports/hook-errors.md` entry. Field names and values on stdin are Claude Code's
   convention, not Cortex's (`loops.session-reading` Rule 6): every field is read as an optional
   string; a missing `session_id` degrades to the transcript filename stem; `reason` is recorded
   verbatim and **never branched on** — the values seen (`clear`, `resume`, `logout`,
   `prompt_input_exit`, `other`, `complete`, `sigterm`) are documentation, not an enum; a missing
   `reason` is recorded as `unknown`; a missing `cwd` falls back to the process working directory;
   a missing `scratchpad_dir` falls back to Rule 8's path heuristic.

4. **One record, deterministic.** The SessionEnd hook writes exactly one JSON file,
   `.cortex/pulse/sessions/<session-id>.json`, `kind: pulse-session-record` (schema §4.5.3), and
   overwrites it if it already exists (a `SessionEnd` re-fired for the same session — e.g. after a
   resume — replaces the record; threads opened by the earlier fire are deduped by `pulse.threads`
   Rule 7, never doubled). Every field is derived by the deterministic extractors below; two runs
   over the same transcript, the same companion file and the same `pulse/` state produce
   byte-identical records apart from `ended`. Deterministic Core — governed by R-001.

5. **Bounded read — two passes, hard-capped.** The transcript may be several MB and the hook has
   a wall-clock target of **under 100 ms typical** (transcript ≤ 4 MiB).
   (a) **Message pass (tail only).** Message-level extraction — `open_question`, `approvals`,
   lexicon findings, `session_kind`, and `pulse.threads` Rule 9b key-mention detection — runs over
   the **last `SESSION_END_TAIL_BYTES` (2 MiB)** of the file, read with `readTranscriptTail` from
   `src/hooks/post-read.ts` (leading partial line dropped) and parsed with `parseSessionJsonl`.
   This is the hard cap on bytes fully parsed; a session whose approvals fell out of the last
   2 MiB loses them, and the record says so with `partial: true` whenever the file was larger than
   the tail. `session_kind` is detected from the first user message *of the parsed tail* when the
   file was larger than the tail — and, because the first user message of a scheduled session is
   typically past the cap, the hook first checks the file's **first line** (Rule 5b) for that
   message, so `session_kind` is correct even for a truncated read.
   (b) **Prefix pass (whole file, cheap).** Every line is scanned once as a string; a line is
   JSON-parsed only when it is at most `SESSION_END_LINE_BYTES` (256 KiB) **and** contains one of
   the fixed trigger substrings: `"custom-title"` (title), `"tool_use"` (artefacts — Rule 8),
   `<cortex:finding` (tagged findings — Rule 7c), and, for each thread that was `open` before this
   run, its id (`pulse.threads` Rule 9a id-mention). The first line whose raw text contains
   `"type":"user"` is also parsed once, for `session_kind`. No other line is parsed. A transcript
   larger than `SESSION_END_MAX_BYTES` (64 MiB) skips this pass entirely (the tail still runs) and
   sets `partial: true`. The three constants are engineering-call constants exported from the
   module. The hook does no work proportional to the size of `pulse/` beyond listing `threads/`
   and `sessions/` once.

6. **Header fields.** `title` is `sessionTitle(entries)` over the prefix-pass entries (may be
   absent); `session_kind` is `scheduled` or `interactive`, detected from the first user message
   exactly as `pulse.distil` Rule 11 defines it (`sessionKind` in `src/pulse/distil.ts`: starts
   with `Base directory for this skill:` or contains `<scheduled-task` → `scheduled`); `session` is
   the `claude-sessions/<user>/<session-id>` citation (schema §6, `provenanceUser()` from
   `src/insight/session-observe.ts`); `ended` is the hook's wall-clock iso-datetime; `reason` is
   stdin's `reason` verbatim or `unknown`; `reads` is the project-relative path
   `.cortex/pulse/state/reads/<session-id>` when that ledger exists, else `null` — recorded, never
   copied.

7. **Text extractors (in transcript order).**
   (a) **`open_question`** — the candidate is the **last assistant text**, taken from the Stop
   companion's file `state/sessions/<session-id>.last.json` when that file exists and its `at` is
   later than every message timestamp in the parsed tail (the transcript lagged; the companion is
   fresher), else the last assistant text message of the tail **provided no user message follows
   it**. The candidate's final paragraph is recorded when it ends with `?` or matches the offer
   lexicon `/\b(want me to|shall i|on request|if you want|i can\b[^.]{0,80}?\bif you|say the
   word)\b/i`. Stored as `{ kind: "question" | "offer", text, timestamp, source: "stop" |
   "transcript" }` — `question` when the paragraph ends with `?`, else `offer`; `text` is the
   final paragraph, trimmed, capped at 600 characters; `timestamp` is the companion's `at` or the
   message's timestamp. `null` otherwise. After the record is written the companion file is
   deleted, whether or not it was used.
   (b) **`approvals[]`** — every user message in the tail whose text matches the approval lexicon
   `/\b(approved|go ahead|let'?s go with|yes,? do it|ship it|proceed)\b/i`, paired with the final
   paragraph of the **immediately preceding assistant text message** (the thing being approved).
   Each entry is `{ approval, approved, timestamp }`, both texts capped at 600 characters; a match
   with no preceding assistant message is skipped. Cap 20 entries (the first 20 in order).
   (c) **`findings[]`** — every `<cortex:finding kind="measurement|conclusion" bears_on="a, b">text
   </cortex:finding>` tag in assistant text anywhere in the file (prefix pass), matched by
   `/<cortex:finding\s+kind="(measurement|conclusion)"(?:\s+bears_on="([^"]*)")?\s*>([^\n<]{1,300})<\/cortex:finding>/g`
   — single line, 1–300 characters, otherwise the tag is skipped (never truncated, never logged).
   Stored as `{ kind, text, bears_on: string[], timestamp, source: "tag" }`, `bears_on` split on
   commas and trimmed. Plus a **lexicon fallback** for untagged measurements in the tail: any
   assistant sentence (split on `. `, `! `, `? ` and newlines) that contains a digit **and** matches
   `/\bover \d+ sessions\b|\d+(\.\d+)?[x×] (cheaper|faster)|\bmedian\b|\bmeasured\b/i` becomes
   `{ kind: "measurement", text, timestamp, source: "lexicon" }`, text capped at 300 characters.
   Tagged findings come first; the combined list is capped at 20. Scheduled sessions skip the
   lexicon fallback — loop reports quote their own numbers back constantly and would flood the
   ledger.

8. **Artefacts.** From `extractToolUses(entries)` over the prefix pass: every `Write` or `Edit`
   record whose `filePath` is **under stdin's `scratchpad_dir`** (path-prefix match after
   resolving both) when that field is present, else whose path contains the segment
   `/scratchpad/`; deduplicated by path (one entry per file regardless of how many writes). For
   each: if the file still exists, is at most 64 KiB, and is text (no NUL byte in its first 8 KiB),
   it is copied to `.cortex/pulse/scratch/<session-id>/<basename>` (two distinct paths sharing a
   basename get `-2`, `-3` suffixes before the extension; the copy is taken from disk at session
   end, so it is the file's final state) and the entry records `{ path, copied: true,
   first_heading }` — `first_heading` is the text of the first line matching `/^#{1,6}\s+(.+)$/`,
   else `null`. A file that is gone, too large, or binary records `{ path, copied: false,
   first_heading: null }`. Cap 20 entries. The copy directory is created only when at least one
   copy succeeds.

9. **Threads.** After the record is assembled the hook hands it to `pulse.threads`: Rule 3 there
   opens threads (for an **interactive** session: one `question`/`offer` from `open_question`, one
   `approval` per approval, one `finding` per finding, one `artefact` per copied artefact; for a
   **scheduled** session: `finding` and `artefact` threads only — a loop's question or approval is
   addressed to nobody and would be noise), each deduped by normalised text against open threads,
   and Rule 9 there marks open threads answered by this session. The ids returned land in the
   record as `threads_opened[]` and `threads_answered[]`, in that order; the record is written
   **after** the thread step so it names the ids (a thread-step failure is caught, logged to
   `hook-errors.md`, and the record is still written with empty id lists — the record never depends
   on the ledger succeeding). The scheduled record still carries its `open_question` and
   `approvals` fields; only the thread opening is suppressed.

10. **Deterministic and offline.** Pure Node file I/O; no network, no LLM, no subprocess
    (RULES.md rules 3 and 6; R-001). The hooks capture what the session already said and wrote;
    they never interpret, rank, or summarise it.

11. **The Stop companion (`cortex hook stop`).** On every `Stop` event the hook reads `session_id`
    and `last_assistant_message` from stdin and writes
    `.cortex/pulse/state/sessions/<session-id>.last.json` = `{ "text": <the message, capped at
    2000 characters>, "at": <iso-datetime, wall-clock> }`, overwriting the previous turn's file
    (`mkdir -p`, write-then-rename). Missing or non-string `last_assistant_message`, missing
    `session_id`, absent `.cortex/` → write nothing, exit 0, no error entry (this hook fires every
    turn; logging its no-ops would flood `hook-errors.md`). It reads nothing else, never touches
    the transcript, and completes in well under 5 ms. `pulse.hygiene` Rule 8 deletes companion
    files orphaned by a session that never reached `SessionEnd`.

## Acceptance Criteria

### Registered under SessionEnd and Stop by init and sync

- **Given** a fresh `cortex init` (and, separately, a project initialised before this spec on which
  `cortex sync` runs)
- **When** `.claude/settings.json` is read
- **Then** `SessionEnd` carries exactly one entry whose command is `cortex hook session-end`, with
  `timeout: 10` and no matcher; `Stop` carries exactly one entry whose command is
  `cortex hook stop`, with no matcher; the other five hook entries are unchanged
- **And** `cortex validate` reports no `check.hook-config` violation

### The Stop companion records the last assistant message and nothing else

- **Given** stdin `{"session_id":"abc","last_assistant_message":"<2500 chars ending in ?>","cwd":"<root>"}`
- **When** `cortex hook stop` runs
- **Then** `.cortex/pulse/state/sessions/abc.last.json` holds `text` of exactly 2000 characters
  and an iso `at`, stdout is empty, exit 0, and no other file under the project changed

### The Stop companion is silent on missing input

- **Given** stdin `{"session_id":"abc"}` and, separately, stdin `{}`
- **When** `cortex hook stop` runs on each
- **Then** exit 0, empty stdout, no file written, and `reports/hook-errors.md` is not created

### A question left hanging becomes the record's open question

- **Given** a transcript whose last assistant message ends with the paragraph
  `Two options remain. Do you want the counter in state/ or at the pulse root?` and no user message
  after it, and no companion file
- **When** the hook fires with `reason: "prompt_input_exit"`
- **Then** `.cortex/pulse/sessions/<id>.json` has `kind: pulse-session-record`,
  `open_question.kind` is `question`, `open_question.text` is that paragraph,
  `open_question.source` is `transcript`, `reason` is `prompt_input_exit`, and stdout is empty
  with exit 0

### A fresher companion file wins over a lagging transcript and is then deleted

- **Given** a transcript whose last message is the user's `ok, which one?` at `10:00:00Z`, and
  `state/sessions/<id>.last.json` = `{ "text": "…\n\nShall I keep the counter in state/?", "at":
  "…10:00:04Z" }`
- **When** the hook fires
- **Then** `open_question.text` is `Shall I keep the counter in state/?`, `open_question.source`
  is `stop`, `timestamp` is `10:00:04Z`, and the companion file no longer exists

### An older companion file is ignored and still deleted

- **Given** a companion file with `at` `09:58:00Z` and a transcript whose last assistant message
  (`10:00:00Z`) is followed by a user message
- **When** the hook fires
- **Then** `open_question` is `null` and the companion file no longer exists

### An offer is recorded as an offer, an answered question is not recorded

- **Given** a transcript whose last assistant message ends `I can wire the sync path too if you
  want.` (no user message after), and a second transcript where the same message is followed by a
  user message `no, leave it`
- **When** the hook fires on each
- **Then** the first record's `open_question.kind` is `offer` and the second record's
  `open_question` is `null`

### Approvals are paired with what was approved

- **Given** a transcript with an assistant message ending `Proposal: allocate T-ids from a
  separate counter file.` followed by the user message `approved, go ahead`, and later a user
  message `proceed` with no assistant message before it in the transcript
- **When** the hook fires
- **Then** `approvals` has exactly one entry, `approval` is `approved, go ahead` and `approved` is
  `Proposal: allocate T-ids from a separate counter file.`

### Tagged findings are captured, malformed tags are skipped

- **Given** assistant text containing
  `<cortex:finding kind="measurement" bears_on="src/pulse/usage.ts, pulse.usage">2 insight invocations over 55 sessions</cortex:finding>`,
  a second tag whose body spans two lines, and a third whose body is 301 characters
- **When** the hook fires
- **Then** `findings` has exactly one entry with `kind: measurement`, that text,
  `bears_on: ["src/pulse/usage.ts", "pulse.usage"]` and `source: tag`

### Untagged measurements fall back to the lexicon in interactive sessions only

- **Given** an interactive transcript whose assistant text contains the sentence
  `The line-filtered pass measured 3.1x faster than a full parse.` and a scheduled transcript
  (first user message starts `Base directory for this skill:`) containing the same sentence
- **When** the hook fires on each
- **Then** the interactive record has one lexicon finding with that sentence and the scheduled
  record has zero findings, with `session_kind: scheduled`

### Scratchpad artefacts are copied with their first heading, using `scratchpad_dir` when given

- **Given** stdin with `scratchpad_dir: "/private/tmp/claude-502/x/scratchpad"`, and a transcript
  with a `Write` to `/private/tmp/claude-502/x/scratchpad/defects.md` whose on-disk content starts
  `# Defects found` (2 KiB), an `Edit` to `/private/tmp/claude-502/x/scratchpad/big.md` whose
  on-disk file is 100 KiB, a `Write` to `/elsewhere/scratchpad/notes.md`, and a `Write` to
  `src/hooks/session-end.ts`
- **When** the hook fires
- **Then** `artefacts` has two entries: `defects.md` with `copied: true` and
  `first_heading: "Defects found"`, `big.md` with `copied: false`; the copy exists at
  `.cortex/pulse/scratch/<id>/defects.md` byte-identical to the source; and neither
  `/elsewhere/scratchpad/notes.md` nor `src/hooks/session-end.ts` appears in the record

### Without `scratchpad_dir` the path heuristic applies

- **Given** stdin without `scratchpad_dir` and the same transcript
- **When** the hook fires
- **Then** `artefacts` has three entries, `/elsewhere/scratchpad/notes.md` among them

### Threads opened and answered are named in the record

- **Given** a project with no threads and an interactive transcript carrying one open question and
  one tagged finding
- **When** the hook fires
- **Then** `.cortex/pulse/threads/` holds two files, `threads_opened` lists their two ids in
  creation order, `threads_answered` is `[]`, and `state/thread-counter` reads `2`

### A scheduled session opens finding and artefact threads only

- **Given** a scheduled transcript carrying an open question, one approval, one tagged finding,
  and one copied scratchpad artefact
- **When** the hook fires
- **Then** the record carries the `open_question` and the approval, but `pulse/threads/` holds
  exactly two files, kinds `finding` and `artefact`, and `threads_opened` lists those two ids

### Message extraction is capped at the tail, prefix scans cover the whole file

- **Given** a transcript of 5 MiB whose first 3 MiB contain a tagged finding, a scratchpad
  `Write`, the scheduled-session first user message, and a user approval, and whose last 2 MiB
  contain an unanswered question
- **When** the hook fires
- **Then** the record has `partial: true`, `session_kind: scheduled`, the finding, the artefact,
  and the open question, and `approvals` is `[]` (the approval fell outside the message tail)

### A transcript over the hard cap still yields a tail record

- **Given** a transcript of 70 MiB (stubbed size) whose last 2 MiB contain an unanswered question
- **When** the hook fires
- **Then** the record carries `partial: true` and the open question, no line outside the tail was
  parsed, and the run completes

### Bulk lines are skipped without loss of small ones

- **Given** a transcript with one 300 KiB `"type":"assistant"` line carrying a `tool_use` followed
  by a 200-byte `Write` tool-use line to a scratchpad path
- **When** the hook fires
- **Then** `artefacts` has exactly one entry and no error is logged

### Missing transcript degrades to nothing

- **Given** stdin `{"session_id":"abc","transcript_path":"/nope.jsonl","cwd":"<root>"}`
- **When** the hook fires
- **Then** exit 0, empty stdout, no file under `pulse/sessions/`, `pulse/threads/` or
  `pulse/scratch/`, and exactly one `reports/hook-errors.md` entry naming `session-end`

### Only pulse is written

- **Given** any run of either hook over any fixture
- **Then** every file created or modified under the project is beneath `.cortex/pulse/` — never
  `compass/`, `atlas/`, `insight/`, `archive/`, `.specflow/`, `RULES.md` or `CLAUDE.md`

### Re-firing for the same session replaces the record without doubling threads

- **Given** the hook already ran for session `abc` and opened thread `T-001` from its open question
- **When** the hook fires again for `abc` with the same transcript
- **Then** `sessions/abc.json` is rewritten, `threads/` still holds exactly one file, and
  `threads_opened` is `["T-001"]`

## Notes

- **Nothing is injected in this step.** No `SessionStart` line, no `PreRead` change, no new
  pointer reads this record or the ledger; the `Stop` hook emits no decision and no text. Consumers
  (the recall surface) are a later step of the recall work; anyone adding an injection here is
  changing the wrong spec. `pulse.usage` Rules 10–11 already count reads of `pulse/threads/` and
  pointer follow-through so the before-figure exists.
- **Claude Code contract, as observed 2026-09-15 (externally owned, `loops.session-reading`
  Rule 6).** `SessionEnd` stdin carries `hook_event_name`, `session_id`, `transcript_path`, `cwd`,
  `reason`, and in newer versions `prompt_id`, `scratchpad_dir`, `permission_mode`; it cannot
  block, its exit code and stdout are ignored, and all `SessionEnd` hooks share a 1.5 s default
  budget extendable per hook via `timeout` up to 60 s. It fires for headless `claude -p` runs and on
  SIGTERM; for Desktop scheduled tasks it is implied by the headless path, **not documented** — a
  scheduled session that never produces a record is therefore a finding, not a bug. The transcript
  is written asynchronously and may lag at `SessionEnd`; the docs point hooks that need the final
  assistant text at `Stop`'s `last_assistant_message`, which is exactly why Rule 11 exists.
- **Lexicons are engineering-call constants**, exported from the module and quoted in Rule 7 so
  tests pin them; widening one is a spec edit, not a code tweak.
- **Why a record and not a proposal.** A record is evidence, not a claim: it says what the session
  said. The pulse gate (`S-NNN`) is for things that want to become gated; threads (`T-NNN`) are
  for things that want to be *remembered until resolved*. The two namespaces never mix.
- **Retention** is owned by `pulse.hygiene` Rule 8 (records, scratch copies and orphaned
  companion files older than 30 days are deleted; threads expire in place). The SessionEnd hook
  deletes only its own session's companion file.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention,
  established in the hooks round).
