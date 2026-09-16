---
id: hooks.prompt-route
status: draft
depends_on:
  - core-cli.init
  - pulse.threads
  - hooks.session-end
  - hooks.search-annotate
  - pulse.usage
governs:
  - "src/hooks/prompt-route.ts"
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
---

# Open-Thread Prompt Routing — `cortex hook prompt-route` (UserPromptSubmit)

## Intent

The threads ledger (`pulse.threads`) remembers the question a session asked and nobody answered,
the offer nobody took up, the approval that never reached a gated file. The search-time pointer
(`hooks.search-annotate`) surfaces those threads when a session searches a subject they bear on —
but the motivating case of the 2026-09-08 proposal was a session that *asked about* a thing the
previous session had left open without ever searching for it. That moment is the prompt. This
hook runs on `UserPromptSubmit`, matches the human's prompt against **open threads only**, and
injects at most two `Open:` pointer lines. Two deterministic modes: **resumption** (the first
prompt of an interactive session surfaces the immediately preceding interactive session's still-open
question or offer, regardless of vocabulary — conversation continuity across sessions) and
**mention** (a prompt that names a thread id or shares two words with an open thread's key text
surfaces that thread). It never consults the general recall index: the proposal's evidence was
that the general form would not have fired for the motivating case, and lowering the bar to make
it fire would spend trust on wrong pointers — the same precision-over-recall stance the search
hook took. Measured by `pulse.usage` Rule 11, which gains the `Open:` prefix.

## Entities

- **READS:** `UserPromptSubmit` stdin (`session_id`, `prompt`, `cwd`, `hook_event_name`,
  optional `prompt_id`, `transcript_path`, `permission_mode` — Claude Code's fields, externally
  owned, read as optional strings); `.cortex/cortex.config.json` (existence only);
  `.cortex/pulse/threads/*.md` (the open-thread candidates, via `listThreads` in
  `src/pulse/threads.ts`); `.cortex/pulse/sessions/*.json` (the newest prior record, resumption
  mode); `.cortex/pulse/state/recall-fired/<session-id>` (the per-session fired memory shared with
  `hooks.search-annotate` Rule 9) and `.cortex/pulse/state/sessions/<session-id>.last.json`
  (existence only — the first-prompt test).
- **WRITES:** `.cortex/pulse/state/recall-fired/<session-id>` (append, transient);
  `pulse/reports/hook-errors.md` (unexpected exceptions only, Rule 10).
- **CREATES:** nothing durable. Never opens `.cortex/recall-index.json`, a decision, a rule, an
  evidence file, an observation, or the transcript. Never changes a thread's status.

## Rules

1. **Invocation.** Registered by `cortex init` and refreshed by `cortex sync` through the same
   `cortexHookEntries` table as the other hooks (`src/cli/scaffold.ts`): under
   `UserPromptSubmit`, `{"type": "command", "command": "cortex hook prompt-route"}` with **no
   matcher** — the event has no matcher support in Claude Code (one written there is silently
   ignored), and the hook is wanted on every prompt because Rule 4 does its own filtering.
   Dispatched by `src/hooks/cli.ts` under the name `prompt-route`. Always registered — not behind
   `hooks.preRead` (the Read pair's flag) nor behind `hooks.readDefer`; `check.hook-config`
   (schema §5, Appendix A) requires the entry whenever the settings file carries **any**
   `cortex hook ` entry, exactly as it requires `SessionEnd`, `Stop` and the `Grep|Bash` row; the
   remedy named is `cortex sync`. The `cortex hook ` prefix is the ownership marker, as ever.

2. **Envelope.** On a match: exit 0 and stdout
   `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "<lines>"}}`
   — the SessionStart envelope shape with the event name changed (schema §5). Claude Code adds a
   `UserPromptSubmit` hook's context to the turn; the docs accept plain stdout for this event too,
   and the JSON form is used so every injecting Cortex hook has one envelope discipline. No match,
   or any Rule 10 condition: exit 0, **empty stdout**, nothing on stderr. Never exit 2 — for this
   event that **blocks and erases the human's prompt** — never a `decision` key, never `continue`
   (RULES.md rule 6; this hook is not the rule's measured exception, which belongs to
   `hooks.pre-read-writeback` Rule 7 alone).

3. **Stdin, externally owned.** Every field is read as an optional string. A missing or empty
   `prompt` → silent. A missing `session_id` → silent: without it the Rule 8 memory cannot be
   kept, and a pointer that could repeat on every turn is the one thing this hook must not
   become. A missing `cwd` falls back to the process working directory; no
   `.cortex/cortex.config.json` under the root → silent. `hook_event_name` is not branched on.

4. **Harness prompts never fire.** The prompt is **harness-shaped** — and the hook is silent —
   when its trimmed text starts with `<` or `[`, or its first 300 characters contain any entry of
   `HARNESS_MARKERS` (`hooks.session-end` Rule 7's list, exported from `src/hooks/session-end.ts`),
   or it starts with `Base directory for this skill:` or contains `<scheduled-task` (the
   `pulse.distil` Rule 11 scheduled-session markers, exported from `src/pulse/distil.ts`). The
   predicate is the string form of `isHarnessInjected` — one exported `isHarnessText(text)` both
   call — so the two hooks cannot disagree about what a human said. A scheduled session's prompt is
   harness-shaped by construction, so scheduled sessions never see a routing line; teammate
   messages, system reminders, task notifications and `!`-shell echoes never do either.

5. **Candidates — open threads, and nothing else.** The hook lists `pulse/threads/` **once**
   (`listThreads`, which skips unparseable files) and keeps threads with `status: open` and `kind`
   in `question | offer | approval`. `finding` and `artefact` threads are records, not questions
   to resume, and are never surfaced here (the search hook already points at them by subject).
   An absent directory is an empty set. When the directory holds more than
   `PROMPT_ROUTE_MAX_THREADS` (200) `.md` files, only the 200 highest ids are parsed (engineering
   call — the ledger is bounded by `THREAD_TTL_DAYS` and hygiene, so this cap is a guard, not a
   working limit). The recall index is **not** read: it lacks a thread's `kind` and `status`
   (entries exist for closed threads too, §4.11), so the ledger is the only surface that answers
   "which open questions", and reading it costs one directory listing plus small frontmatter
   parses — the latency argument is in Notes.

6. **Resumption mode — the first prompt picks up where the last session stopped.** Fires when
   **all** of: (a) this is the session's **first prompt** — neither
   `pulse/state/recall-fired/<session-id>` nor `pulse/state/sessions/<session-id>.last.json`
   exists (no pointer has fired and no `Stop` has happened; the Stop companion is deleted at
   `SessionEnd`, so a resumed session looks like a first prompt and is treated as one — Rule 8
   still prevents repeats); (b) the **newest** record under `pulse/sessions/` by `ended` (every
   record is parsed — they are small and hygiene bounds them to 30 days; a record that fails to
   parse is skipped; a record whose `session_id` equals this session's is skipped, so a resumed
   session never resumes itself) has `session_kind: interactive` and an `ended` within
   `RESUME_WINDOW_DAYS` (7) of now; (c) that record's `threads_opened` names at least one Rule 5
   candidate of kind `question` or `offer`. Those threads are surfaced, newest `opened` first,
   **regardless of the prompt's vocabulary** — the human answering `state/ please` to yesterday's
   question is exactly the case `pulse.threads` Rule 9c will resolve at this session's end, and
   this line is what lets the assistant know which question that answer belongs to. An
   `approval` thread is never surfaced by resumption (it is not addressed to the next session).

7. **Mention mode — the prompt names an open thread.** The prompt text considered is its first
   `PROMPT_ROUTE_MAX_PROMPT_CHARS` (2,000) characters (a human prompt is short; a pasted document
   is what the cap guards against). `tokenise(text)` from `src/recall/query.ts` yields its tokens
   (lowercase, ≥3 characters, `STOP_TOKENS` removed) and its ref-shaped spans. A Rule 5 candidate
   qualifies when (a) its `id` appears verbatim among the refs (`T-NNN`, case-sensitive), or (b)
   **two or more** distinct prompt tokens occur in `tokenise(keyText(thread)).tokens` — the
   thread's key text per `pulse.threads` Rule 7, the same text `thread list` prints. One shared
   word is not evidence (the search hook's reasoning, Rule 6 there). Qualifying threads rank:
   id-ref hits first, then distinct token hits descending, then `opened` descending, then id
   descending. All three kinds qualify here — an approval the human is now asking about is worth
   naming.

8. **Selection and once-per-session.** The ordered list is Rule 6's threads, then Rule 7's not
   already listed; every id present in `pulse/state/recall-fired/<session-id>` (newline-separated,
   the sanitised-session-id file `hooks.search-annotate` Rule 9 keeps — the fired keys written
   here are thread ids, which is also what the search hook writes for a thread entry, so a
   thread pointed at by either hook is pointed at by neither again) is dropped. At most **two**
   lines, the first two of what remains. When more qualified than were shown, the last line ends
   ` · more: cortex thread list`. Emitted ids are appended to the memory after emission
   (`mkdir -p`; a failed write still emits — best-effort like all of `pulse/`).

9. **Line grammar and budget — recorded once in schema §5.** Exactly one line shape:
   `Open: <T-NNN> (<YYYY-MM-DD of opened>) <key text cut to 80> (<path>)` — `<key text>` is
   `keyText(thread)` whitespace-collapsed and cut with `cutTitle(…, 80)` (word boundary, trailing
   `…`); `<path>` is the thread file's project-relative POSIX path. **No imperative, no second
   person, no body beyond the key text** — the key text is the question that was left open, a
   name for a gap, the same standing the `Decided:` line's thread fragment already has. Budget
   (RULES.md rule 11: ≤60 tokens, at most two lines, by the chars/4 estimate ⇒ ≤240 characters
   including the newline): cut both key texts to 40, then to 20; then drop the second line (and
   append the ` · more:` tail to the first if not already present — more qualified than is now
   shown); then drop the tail. Ids, dates and paths are never cut. Thread slugs run to 60
   characters, so two full lines rarely fit; the second qualifying thread is usually reached
   through the tail, which is the intended shape (Notes). `pulse.usage` Rule 11 counts the line by
   its `Open:` prefix; its `(<path>)` is the pointed target, and a Read of that path or a
   `cortex thread close|drop|promote <T-NNN>` within the window is a follow.

10. **Fail-open, silent, unlogged where expected.** No stdin, no `prompt`, no `session_id`, no
    `.cortex/`, no `pulse/threads/`, no `pulse/sessions/`, a thread or record file that does not
    parse — each is an **expected** state: exit 0, empty stdout, nothing appended to
    `hook-errors.md`. Only an unexpected exception reaches `pulse/reports/hook-errors.md` (one
    entry, hook `prompt-route`), and the outcome is still exit 0 with empty stdout. Wall-clock
    target **<50 ms** with 100 threads and 100 records: one `readdirSync` of `threads/`, one of
    `sessions/`, at most 200 small frontmatter parses, no transcript read, no index read, no
    network, no subprocess (RULES.md rules 3 and 6; R-001).

11. **Deterministic Core, pulse-confined.** Two runs over the same stdin and the same `pulse/`
    state emit byte-identical output. Writes only `pulse/state/recall-fired/<session-id>` and
    `pulse/reports/hook-errors.md`; never a thread file, never a record, never anything gated.

## Acceptance Criteria

### Registered under UserPromptSubmit by init and sync, required by the validator

- **Given** a fresh `cortex init --no-llm` and, separately, an existing `.claude/settings.json`
  carrying `cortex hook session-start` but no prompt-route entry
- **When** init runs, then `cortex validate` runs against the second project
- **Then** the first project's `.claude/settings.json` carries under `UserPromptSubmit` exactly one
  entry whose command is `cortex hook prompt-route` with no matcher, the other eight hook entries
  are unchanged, and it validates clean; the second project's report carries one
  `check.hook-config` error naming `cortex hook prompt-route` and `cortex sync`

### The first prompt of a session surfaces the previous session's hanging question

- **Given** `pulse/sessions/s1.json` with `session_kind: interactive`, `ended` two hours ago and
  `threads_opened: ["T-006"]`, where `T-006` is an open `question` thread with key text
  `Do you want the counter in state/ or at the pulse root?` opened 2026-09-15; no
  `pulse/state/recall-fired/s2` and no `pulse/state/sessions/s2.last.json`
- **When** the hook runs with `{"session_id":"s2","prompt":"state/ please","cwd":"<root>"}`
- **Then** stdout is the `UserPromptSubmit` envelope whose `additionalContext` is exactly
  `Open: T-006 (2026-09-15) Do you want the counter in state/ or at the pulse root? (.cortex/pulse/threads/T-006-do-you-want-the-counter-in-state-or-at-the-pulse-root.md)`,
  exit 0, and `pulse/state/recall-fired/s2` lists `T-006`

### Resumption has four gates and each one holds

- **Given** the same setup but, in turn: (a) `pulse/state/sessions/s2.last.json` exists; (b)
  `s1.json` has `session_kind: scheduled`; (c) `s1.json`'s `ended` is eight days ago; (d) `T-006`
  is an `approval` thread; (e) `s1.json`'s `session_id` is `s2`
- **When** the hook runs for each with the prompt `state/ please`
- **Then** every run exits 0 with empty stdout

### Naming a thread id surfaces it on any prompt

- **Given** `T-003` open, kind `offer`, and `pulse/state/recall-fired/s9` already present (not a
  first prompt)
- **When** the hook runs with the prompt `let's pick up T-003 now`
- **Then** one `Open: T-003 …` line is emitted, and given the prompt `let's pick up t-003 now`
  instead (lowercase), nothing is emitted

### Two shared words qualify a thread; one does not

- **Given** `T-004` open, kind `question`, key text `Do you want the counter in state/ or at the pulse root?`,
  and a non-first prompt
- **When** the hook runs with the prompt `where should the counter live, state or root?`, then
  with `something about the counter`
- **Then** the first emits one `Open: T-004 …` line and the second emits nothing

### Finding and artefact threads are never surfaced

- **Given** `T-007` open, kind `finding`, key text `2 insight invocations over 55 sessions`, and
  `T-008` open, kind `artefact`, key text `/tmp/x/scratchpad/defects.md`
- **When** the hook runs with the prompt `T-007 and T-008: the insight invocations over 55 sessions and the scratchpad defects file`
- **Then** stdout is empty

### Harness-injected prompts never fire

- **Given** `T-004` open as above and a first-prompt state (no memory, no companion), with
  `s1.json` naming `T-004`
- **When** the hook runs, in turn, with the prompts
  `Another Claude session sent a message:\n<teammate-message teammate_id="x">counter state root</teammate-message>`,
  `<system-reminder>counter state root</system-reminder>`,
  `Base directory for this skill: /x\n\ncounter state root`, and
  `[SYSTEM NOTIFICATION] counter state root`
- **Then** every run exits 0 with empty stdout and no memory file is created

### Once per session per thread, shared with the search hook

- **Given** `T-004` open and `pulse/state/recall-fired/s5` containing the line `T-004` (written by
  `cortex hook search-annotate` earlier in the session)
- **When** the hook runs with a prompt sharing three words with `T-004`'s key text, then again
  after `T-004` is removed from the memory
- **Then** the first run emits nothing; the second emits the `Open: T-004 …` line and appends
  `T-004`; a third run with the same prompt emits nothing

### Three qualifying threads show the two newest and point onward

- **Given** open `question` threads `T-010` (opened 2026-09-10), `T-011` (2026-09-12) and
  `T-012` (2026-09-14), each with key text `Should the recall index be rebuilt on every commit?`
  (short slugs), and a prompt `rebuild the recall index on commit?`
- **When** the hook runs
- **Then** the payload is two lines naming `T-012` then `T-011`, the second ending
  ` · more: cortex thread list`, and `T-010` is not named

### Budget cuts the key text, then the second line, never the path

- **Given** two qualifying threads whose key texts are 200 characters each and whose slugs are 60
  characters
- **When** the hook runs
- **Then** the payload is at most 240 characters, every emitted line ends with an intact
  `(.cortex/pulse/threads/T-NNN-<slug>.md)`, the key text ends with `…`, and when only one line
  fits it ends ` · more: cortex thread list`

### The imperative-free grammar

- **Given** any emitted payload across the criteria above
- **When** each line is checked
- **Then** every line begins `Open: T-` and none contains the whole-word tokens `read`,
  `consult`, `check`, `should`, `you`, and the JSON carries no `decision` or `continue` key

### The general index is never consulted

- **Given** a `.cortex/recall-index.json` whose entry `decision.2026-08-05-insight-pull-only-stance-reversed`
  has keywords `insight`, `pull`, `stance`, `reversed`, no open threads, and a non-first prompt
- **When** the hook runs with the prompt `why was the insight pull stance reversed?`
- **Then** stdout is empty (and a spy on `fs.readFileSync` shows the index file was never opened)

### Fail-open is silent and unlogged

- **Given** in turn: no stdin; `{"prompt":"x"}` (no `session_id`); a root without `.cortex/`; a
  `.cortex/` without `pulse/threads/`; a `pulse/threads/T-001-x.md` containing `{not: [yaml`; a
  `pulse/sessions/s1.json` containing `{not json`
- **When** the hook runs for each
- **Then** every run exits 0 with empty stdout, nothing on stderr, and
  `pulse/reports/hook-errors.md` is not created

### Only pulse state is written

- **Given** any run over any fixture above
- **Then** every file created or modified under the project is `pulse/state/recall-fired/<id>`
  or `pulse/reports/hook-errors.md`; no thread file changed

## Notes

- **Why the prompt and not SessionStart.** The 2026-09-08 proposal rejected a session-start
  coverage map (paid every session, read in none) and routed at the first search instead. A
  hanging question is different from coverage: it is addressed to *this* session, and the first
  prompt is the first moment the session says anything. Resumption mode is the smallest thing
  that closes the gap the search hook cannot — it fires on at most one prompt per session, names
  one or two ids, and costs nothing when the previous session left nothing open.
- **Why open threads only, never the general index.** The proposal recorded that the general
  recall form would not have fired for the motivating case; the fix is not a lower bar. A thread
  is the one artefact that is *addressed to a later session* — surfacing it on a prompt that names
  it, or on the first prompt after the session that asked it, is exact. Matching decisions and
  evidence against prompt vocabulary would be relevance-guessing (business out-of-scope 3).
- **Why the ledger, not the index, and the latency.** The index has no thread `kind` or `status`
  and keeps entries for closed threads (§4.11). Reading the ledger is one `readdirSync` and, for
  a ledger at its 30-day working size (this repo: under 30 files), under 10 ms of frontmatter
  parsing; the 200-file cap keeps a pathological ledger under the 50 ms target. Records are read
  only on a first prompt. No validator measures latency; the atomic tests assert the call shape
  (one listing of each directory, no index read, no transcript read).
- **Why key text is not "content".** Same reasoning as `hooks.search-annotate`'s `Decided:`
  fragment: the key text names the gap. Business rule 2 holds. Two lines rarely fit the budget
  with 60-character slugs; the tail `cortex thread list` is the pull side, as `cortex why` is
  for the search hook.
- **The follow that is not counted.** `pulse.threads` Rule 9c will mark a resumed question
  `answered` at this session's end because the human replied. That is visible in the ledger
  (`resolved_by`), not in the transcript, and `pulse.usage` Rule 11 counts from transcripts only
  (Rule 2 there) — so it is **not** in `followed`. It can be recovered by hand from
  `pulse/threads/`; a later amendment may join the two if the figure matters.
- **Engineering-call constants**, exported from the module and quoted here so tests pin them:
  `RESUME_WINDOW_DAYS = 7`, `PROMPT_ROUTE_MAX_THREADS = 200`,
  `PROMPT_ROUTE_MAX_PROMPT_CHARS = 2000`, the 2-hit rule, the 80/40/20 cuts.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
