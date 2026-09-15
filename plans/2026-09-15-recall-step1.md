# Plan — recall work, step 1: the session record and the threads ledger

Date: 2026-09-15
Specs: `.specflow/specs/hooks/session-end.spec.md` (`hooks.session-end`),
`.specflow/specs/pulse/threads.spec.md` (`pulse.threads`),
`.specflow/specs/pulse/hygiene.spec.md` Rule 8 (`pulse.hygiene`, amended).
Business outcomes: `insight.assistant-learns-from-sessions` (session-end),
`scaffolding.assistant-reaches-for-cortex-instead-of-guessing` (threads).
Schema: `cortex-schema.md` 3.3 third revision — §0 note, §1, §4.5 tree + retention, §4.5.3, §5
row + envelope + `check.hook-config` paragraph, Appendix A (`check.threads`, `check.pulse` skip,
`check.hook-config` row). **Already written** — no schema edits in this plan.
Status: **ready to execute** (Pedro approved step 1 on 2026-09-15; specs, schema text and this plan
are the deliverable of the spec pass; no code or tests exist yet).

## Ground rules for every task

- **Tests first.** `specflow-tests` writes the test file named in the task before the
  implementation file; the task is done when the named `pnpm vitest run …` command is green.
- **R-001 governs** `src/pulse/**` and `src/schema/**` (regex predicate: no LLM SDK import); the
  hook specs carry `governed_by: R-001` for `src/hooks/**` too. Nothing in this plan imports an
  SDK, spawns a subprocess, or touches the network.
- **RULES.md rule 6/7:** the hook is silent, exit 0, fail-open; every writer other than
  `cortex thread promote` writes only under `.cortex/pulse/`.
- **RULES.md rule 19:** the batch-3 report must enumerate every validator check and scaffold row
  it touches (there are four: `check.hook-config`, new `check.threads`, `check.pulse` skip,
  `cortexHookEntries` row).
- **Standing authorities:** engineering-call constants (`SESSION_END_LINE_BYTES` 256 KiB,
  `SESSION_END_MAX_BYTES` 64 MiB, `SESSION_END_TAIL_BYTES` 2 MiB, `STOP_TEXT_CHARS` 2000,
  `THREAD_TTL_DAYS` 30, `SESSION_RECORD_RETENTION_DAYS` 30, the 20-character key floor) are
  already in the specs; do not re-decide them.
- **Claude Code contract** (hook spec Notes): `SessionEnd` ignores exit code and output, shares a
  1.5 s default budget (we register `timeout: 10`), fires on every `reason` when registered without
  a matcher, and the transcript may lag — hence the `Stop` companion. Never branch on a `reason`
  value.
- **Insight is stale for new files.** `cortex insight file` has no entry for
  `src/hooks/session-end.ts`, `src/hooks/stop.ts`, `src/pulse/threads.ts`, `src/pulse/thread-cli.ts`,
  `src/schema/checks/threads.ts` until the next extraction; consult it for the files you modify
  (`src/hooks/post-read.ts`, `src/pulse/suggestion-ids.ts`, `src/pulse/hygiene.ts`,
  `src/insight/session-observe.ts`, `src/cli/scaffold.ts`, `src/cli/cli.ts`,
  `src/schema/checks/hooks.ts`, `src/schema/checks/pulse.ts`).
- **Parallel-batch caveat** (standing-authorities): a batch's own suite run can see a sibling's
  in-flight edits; only the orchestrator's full `pnpm test` after all batches is authoritative.

## Exploration summary

- **Relevant existing code:** `src/hooks/post-read.ts` — `readTranscriptTail`, the bounded-tail
  idiom, `appendHookError`, the silent envelope; `src/hooks/cli.ts` — the `switch` dispatcher;
  `src/sessions/read.ts` — `parseSessionJsonl`, `extractMessages`, `extractToolUses`,
  `sessionTitle` (`ExtractedMessage { role, text, timestamp? }`,
  `ExtractedToolUse { name, timestamp?, filePath?, command? }`); `src/pulse/distil.ts` —
  `normaliseText` (line 54) and `sessionKind` (line 264, exported); `src/pulse/suggestion-ids.ts`
  — the allocator to mirror; `src/insight/session-observe.ts` — `decisionSlug` (525),
  `provenanceUser` (538), `decisionFilePayload` (555); `src/pulse/hygiene.ts` —
  `cleanStaleReadLedgers` (332) and the report-section renderer; `src/cli/scaffold.ts` —
  `cortexHookEntries` (415) and `mergeSettings` (430); `src/schema/checks/hooks.ts` —
  `checkHookConfig`; `src/schema/checks/pulse.ts` — `checkPulse` (globs `**/*.md` under pulse);
  `src/schema/validate.ts` — check wiring (lines 110, 132, 151); `src/cli/cli.ts` —
  `PULSE_LOOP_COMMANDS` (83) and the verb branches.
- **Established patterns:** hooks export `run(stdinJson, opts?) → HookRunResult`, `const SILENT`,
  `HOOK_NAME`, exported engineering constants at the top; pulse modules take `root` and build
  paths with `path.join(root, '.cortex', 'pulse', …)`; checks return `Violation[]` with
  `{ severity, check, clause, location: { path, key? }, message }`; CLI verbs are
  `if (argv[0] === '…') { const { fn } = await import('…'); return fn(...) }`; tests use
  fixture roots under `tests/fixtures/` helpers and `os.tmpdir()`.
- **Tech stack:** Node 18, TypeScript strict, vitest, `gray-matter` for frontmatter, `fast-glob`.

## Gap analysis

- **Can reuse:** everything listed above; no new dependency (RULES.md rule 2 not triggered).
- **Must create:** `src/pulse/threads.ts`, `src/pulse/thread-cli.ts`, `src/hooks/session-end.ts`,
  `src/hooks/stop.ts`, `src/schema/checks/threads.ts`; tests `tests/atomic/pulse/threads.test.ts`,
  `tests/spec/pulse/threads.test.ts`, `tests/atomic/pulse/thread-cli.test.ts`,
  `tests/spec/pulse/thread-cli.test.ts`, `tests/atomic/hooks/session-end.test.ts`,
  `tests/atomic/hooks/stop.test.ts`, `tests/spec/hooks/session-end.test.ts`,
  `tests/atomic/schema/threads-check.test.ts`.
- **Must modify:** `src/hooks/cli.ts` (new case), `src/cli/cli.ts` (`thread` verb +
  `PULSE_LOOP_COMMANDS`), `src/cli/scaffold.ts` (SessionEnd row), `src/pulse/hygiene.ts`
  (Rule 8), `src/schema/checks/hooks.ts`, `src/schema/checks/pulse.ts`, `src/schema/validate.ts`;
  tests that pin the hook-entry set: `tests/atomic/core-cli/init.test.ts`,
  `tests/atomic/core-cli/sync.test.ts`, `tests/spec/core-cli/init.test.ts`,
  `tests/spec/hooks/hooks.test.ts` (its "all five registered names" case becomes seven),
  `tests/atomic/schema/hook-config.test.ts`, `tests/atomic/pulse/hygiene.test.ts`,
  `tests/spec/pulse/hygiene.test.ts`.
- **Open questions (assumptions stated, proceed):** (1) Claude Code's `SessionEnd` stdin field
  names are taken from the observed convention; the hook degrades if any is missing (spec Rule 3),
  so a rename is a low-yield record, not a crash. (2) `check.business-status` may warn that
  `insight.assistant-learns-from-sessions` is `implemented` while a new implementer is `draft`;
  that is the correct signal until batch 1 lands and the dev spec's status flips.

## Size check and batching

Three specs, roughly 1,900 lines of relevant existing code — over the one-agent heuristic and
Standard-depth by the table, so it is **split**: one short sequential seed batch, then three
batches with **disjoint file ownership** that run in parallel, each at Light depth.

```
Batch 0 (seed, sequential)  src/pulse/threads.ts primitives ─┐
                                                              ├─► Batch 1  hook + record + open/answer   (owns src/hooks/session-end.ts, src/hooks/cli.ts, threads.ts additions)
                                                              ├─► Batch 2  verbs + promote               (owns src/pulse/thread-cli.ts, src/cli/cli.ts)
                                                              └─► Batch 3  hygiene + validator + scaffold (owns hygiene.ts, checks/*, validate.ts, scaffold.ts, pinned tests)
Orchestrator: pnpm test → pnpm build → cortex sync (this repo) → cortex validate
```

Batch 1 is the only batch that edits `src/pulse/threads.ts` after batch 0; batches 2 and 3 only
import from it.

---

## Batch 0 — ledger primitives (sequential seed; ~20 min)

### Task 0.1: Thread types, parse, serialise

**Criterion:** `pulse.threads` — "A thread file has the contract frontmatter and body"
**Files:** `tests/atomic/pulse/threads.test.ts` (create), `src/pulse/threads.ts` (create)
**Change:** Export `THREAD_KINDS`, `THREAD_STATUSES`, `THREAD_TTL_DAYS = 30`, `THREADS_DIR`
(`pulse/threads`), `THREAD_COUNTER_FILE = 'thread-counter'`; `interface Thread { id, kind,
status, opened, session, sessions, bears_on, expires, answered?, resolved_by?, body }`;
`parseThreadFile(raw): Thread | null` (gray-matter; `null` on any shape failure — never throw);
`serialiseThread(t): string` (frontmatter in the §4.5.3 field order, body verbatim, trailing
newline); `threadFilename(t)` = `${id}-${slug}.md` with `threadSlug(text)` mirroring
`decisionSlug` (import it from `src/insight/session-observe.ts`; fallback `thread`);
`listThreads(root): Thread[]` (sorted by id, unparseable files skipped and counted in a second
return value); `threadPath(root, id)`. Round-trip test: serialise → parse is identity.
**Verify:** `pnpm vitest run tests/atomic/pulse/threads.test.ts`

### Task 0.2: The T-id allocator

**Criterion:** `pulse.threads` — "Ids come from their own counter and never collide with S-ids"
**Files:** `tests/atomic/pulse/threads.test.ts` (extend), `src/pulse/threads.ts` (extend)
**Change:** `readThreadCounter(root)` and `allocateThreadIds(root, n): string[]` — copy the body
of `readSuggestionCounter`/`allocateSuggestionIds` from `src/pulse/suggestion-ids.ts`, pointed at
`state/thread-counter`, prefix `T-`. Test: allocate 3 with `suggestion-counter` = 41 present →
`T-001..T-003`, `thread-counter` = `3`, `suggestion-counter` unchanged.
**Verify:** `pnpm vitest run tests/atomic/pulse/threads.test.ts`

### Task 0.3: The key and the writer

**Criterion:** `pulse.threads` — "Same question twice opens one thread with a two-session trail"
(the key half; dedupe itself is Task 1.5)
**Files:** `tests/atomic/pulse/threads.test.ts` (extend), `src/pulse/threads.ts` (extend)
**Change:** `threadKey(t): string` per spec Rule 7 (question/offer/finding → `normaliseText` of
the text; approval → of the *approved* text; artefact → of the original path; import
`normaliseText` from `src/pulse/distil.ts`); `writeThread(root, t)` (mkdir -p, atomic
write-then-rename); `updateThreadStatus(root, id, patch)` rewriting only frontmatter fields, body
byte-identical.
**Verify:** `pnpm vitest run tests/atomic/pulse/threads.test.ts`

---

## Batch 1 — the hook, the record, thread opening and answering (parallel; Light)

Owns: `src/hooks/session-end.ts`, `src/hooks/stop.ts`, `src/hooks/cli.ts`, additions to
`src/pulse/threads.ts`, `tests/atomic/hooks/session-end.test.ts`, `tests/atomic/hooks/stop.test.ts`,
`tests/spec/hooks/session-end.test.ts`, `tests/spec/pulse/threads.test.ts`, and the
`tests/spec/hooks/hooks.test.ts` "seven names" update.

### Task 1.0: The Stop companion hook

**Criterion:** `hooks.session-end` — "The Stop companion records the last assistant message and
nothing else"; "The Stop companion is silent on missing input"
**Files:** `tests/atomic/hooks/stop.test.ts` (create), `src/hooks/stop.ts` (create)
**Change:** Export `STOP_TEXT_CHARS = 2000`, `STOP_STATE_DIR = 'sessions'` (under `pulse/state/`),
`stopStatePath(root, sessionId)`; `run(stdinJson, opts?)` in the `post-read.ts` shape: resolve
`root`; no `.cortex/` → `SILENT`; `session_id` or `last_assistant_message` missing/non-string →
`SILENT` with **no** `appendHookError`; else `mkdir -p`, write `{ text: msg.slice(0, 2000), at:
now.toISOString() }` to a temp file and `renameSync` over the target; return `SILENT`. Outer
try/catch → `SILENT`. Never emits JSON.
**Verify:** `pnpm vitest run tests/atomic/hooks/stop.test.ts`

### Task 1.1: Two-pass bounded transcript read

**Criterion:** `hooks.session-end` — "Message extraction is capped at the tail, prefix scans cover
the whole file"; "A transcript over the hard cap still yields a tail record"; "Bulk lines are
skipped without loss of small ones"
**Files:** `tests/atomic/hooks/session-end.test.ts` (create), `src/hooks/session-end.ts` (create)
**Change:** Export `SESSION_END_LINE_BYTES = 256 * 1024`, `SESSION_END_TAIL_BYTES = 2 * 1024 * 1024`,
`SESSION_END_MAX_BYTES = 64 * 1024 * 1024`, `PREFIX_TRIGGERS = ['"custom-title"', '"tool_use"',
'<cortex:finding']`. `readTranscript(path, openThreadIds): { tailEntries, prefixEntries,
firstUserEntry, partial }` — (a) `stat`; `tailRaw = readTranscriptTail(path,
SESSION_END_TAIL_BYTES)` (import from `src/hooks/post-read.ts`) → `parseSessionJsonl` →
`tailEntries`; `partial = size > SESSION_END_TAIL_BYTES`. (b) if `size <= SESSION_END_MAX_BYTES`,
stream with `readline` over `fs.createReadStream`; per line: skip if `Buffer.byteLength >
SESSION_END_LINE_BYTES`; parse if it includes any `PREFIX_TRIGGERS` entry or any of
`openThreadIds` (as `T-NNN` substrings); parse the **first** line including `"type":"user"` into
`firstUserEntry`; else `partial = true`. Tests: a 5 MiB fixture built from repeated filler lines
with the four prefix hits in the head and a question in the tail; the 70 MiB case by stubbing
`statSync` size and spying that `createReadStream` is never called; the 300 KiB line case.
**Verify:** `pnpm vitest run tests/atomic/hooks/session-end.test.ts`

### Task 1.2: Header fields and the three text extractors

**Criterion:** `hooks.session-end` — "A question left hanging becomes the record's open question";
"A fresher companion file wins over a lagging transcript and is then deleted"; "An older companion
file is ignored and still deleted"; "An offer is recorded as an offer, an answered question is not
recorded"; "Approvals are paired with what was approved"; "Tagged findings are captured, malformed
tags are skipped"; "Untagged measurements fall back to the lexicon in interactive sessions only"
**Files:** `tests/atomic/hooks/session-end.test.ts` (extend), `src/hooks/session-end.ts` (extend)
**Change:** Export the three lexicon regexes exactly as quoted in spec Rule 7 (`OFFER_RE`,
`APPROVAL_RE`, `MEASUREMENT_RE`) and `FINDING_TAG_RE`; pure functions:
`extractOpenQuestion(tailMessages, companion: { text, at } | null)` — companion wins when its `at`
is later than every tail message timestamp, else last assistant text with no user message after;
`extractApprovals(tailMessages)` (cap 20); `extractFindings(prefixMessages, tailMessages,
sessionKind)` (tags from the prefix pass first, lexicon over the tail only when `interactive`,
cap 20); `lastParagraph(text)`; `cap(text, n)`. Header via `sessionTitle(prefixEntries)`,
`sessionKind` (import from `src/pulse/distil.ts`) over `firstUserEntry` when present else the
tail's first user message, `provenanceUser()` (import from `src/insight/session-observe.ts`).
Companion file read via `stopStatePath` from `src/hooks/stop.ts`; deletion happens in Task 1.7.
**Verify:** `pnpm vitest run tests/atomic/hooks/session-end.test.ts`

### Task 1.3: Scratchpad artefact copies

**Criterion:** `hooks.session-end` — "Scratchpad artefacts are copied with their first heading,
using `scratchpad_dir` when given"; "Without `scratchpad_dir` the path heuristic applies"
**Files:** `tests/atomic/hooks/session-end.test.ts` (extend), `src/hooks/session-end.ts` (extend)
**Change:** `collectArtefacts(root, sessionId, toolUses, scratchpadDir?: string)` — filter
`Write`/`Edit`; when `scratchpadDir` is a non-empty string keep paths where
`path.resolve(filePath)` starts with `path.resolve(scratchpadDir) + path.sep`, else keep paths
including `/scratchpad/`; dedupe by path (cap 20); for each: exists, `size <= 65536`, no `\0` in
the first 8 KiB → copy to `.cortex/pulse/scratch/<sessionId>/<basename>` (suffix `-2`, `-3`
before the extension on basename clash), `first_heading` from `/^#{1,6}\s+(.+)$/m`; else
`{ copied: false, first_heading: null }`. Create the directory only on first successful copy.
**Verify:** `pnpm vitest run tests/atomic/hooks/session-end.test.ts`

### Task 1.4: Open threads from a record

**Criterion:** `pulse.threads` — "One thread per record item, in creation order"; "A scheduled
record opens finding and artefact threads only"; "A finding's tag targets lead its `bears_on`,
capped at 12"
**Files:** `tests/spec/pulse/threads.test.ts` (create), `src/pulse/threads.ts` (extend)
**Change:** `openThreadsFromRecord(root, record, now): string[]` — build candidate threads in
Rule 3/8 order, skipping question/offer/approval candidates when `record.session_kind ===
'scheduled'`; `bears_on` per Rule 4 (read `pulse/state/reads/<session-id>` line by line, keep
`.cortex/`/`.specflow/` prefixes, prepend tag targets, dedupe, slice 12); allocate ids once for the
non-deduped candidates (`allocateThreadIds(root, k)`); write files; return ids in order.
**Verify:** `pnpm vitest run tests/spec/pulse/threads.test.ts`

### Task 1.5: Dedupe by key against open threads

**Criterion:** `pulse.threads` — "Same question twice opens one thread with a two-session trail";
"An answered thread does not block a new one"
**Files:** `tests/spec/pulse/threads.test.ts` (extend), `src/pulse/threads.ts` (extend)
**Change:** In `openThreadsFromRecord`, before allocation: `existingOpen = listThreads(root)
.filter(status === 'open')`; a candidate whose `threadKey` equals an open thread's key appends the
session citation to that thread's `sessions` (if absent) via `updateThreadStatus`-style
frontmatter rewrite and contributes that id to the return list at its position.
**Verify:** `pnpm vitest run tests/spec/pulse/threads.test.ts`

### Task 1.6: Answered detection

**Criterion:** `pulse.threads` — "Mentioning a thread id answers it"; "Restating a thread's text
answers it, short keys excepted"; "The next interactive session's first message answers a hanging
question"; "A scheduled session or an approval thread is not answered by reply"; "Threads opened
this run are never answered by this run"
**Files:** `tests/spec/pulse/threads.test.ts` (extend), `src/pulse/threads.ts` (extend)
**Change:** `detectAnswered(root, { sessionId, citation, sessionKind, messages, ended,
openBefore: Thread[] })` — Rule 9 a/b/c exactly; `KEY_MIN_CHARS = 20`; for (c) read
`pulse/sessions/*.json`, pick greatest `ended` with `session_id !== sessionId`, check its
`threads_opened`; apply `status: answered`, `answered`, `resolved_by` via `updateThreadStatus`.
Callers pass the `open` set captured **before** `openThreadsFromRecord` ran.
**Verify:** `pnpm vitest run tests/spec/pulse/threads.test.ts`

### Task 1.7: The hook `run` and the record write

**Criterion:** `hooks.session-end` — "Threads opened and answered are named in the record"; "A
scheduled session opens finding and artefact threads only"; "Missing transcript degrades to
nothing"; "Only pulse is written"; "Re-firing for the same session replaces the record without
doubling threads"; the deletion half of "A fresher companion file wins…" and "An older companion
file is ignored and still deleted"
**Files:** `tests/spec/hooks/session-end.test.ts` (create), `src/hooks/session-end.ts` (extend)
**Change:** `export async function run(stdinJson, opts?): Promise<HookRunResult>` in the
`post-read.ts` shape: resolve `root` from `cwd`; no `.cortex/` → `SILENT`; missing/unreadable
`transcript_path` → one `appendHookError` + `SILENT`; read every stdin field as an optional string
(`reason` verbatim, default `unknown`; `scratchpad_dir` passed to Task 1.3); `openBefore =
listThreads(root)` filtered open **before** reading (their ids feed Task 1.1's prefix triggers);
assemble the record (`kind: 'pulse-session-record'`, every §4.5.3 field, `null` where absent);
`threads_opened = openThreadsFromRecord(...)`; `threads_answered = detectAnswered(...)` — both
wrapped in try/catch that logs and yields `[]`; write `pulse/sessions/<id>.json` (mkdir -p,
`JSON.stringify(record, null, 2)`); then `fs.rmSync(stopStatePath(root, id), { force: true })`;
return `SILENT`. Outer try/catch → log + `SILENT`. Spec-layer tests run `run()` end to end over fixture transcripts and
assert the filesystem (snapshot the project tree before/after for "Only pulse is written").
**Verify:** `pnpm vitest run tests/spec/hooks/session-end.test.ts`

### Task 1.8: Dispatch

**Criterion:** `hooks.session-end` — "Registered under SessionEnd and Stop by init and sync"
(dispatch half; registration is Task 3.5)
**Files:** `src/hooks/cli.ts` (modify), `tests/spec/hooks/hooks.test.ts` (modify)
**Change:** `import { run as sessionEnd } from './session-end.js'` and `import { run as stop }
from './stop.js'`; `case 'session-end': return sessionEnd(stdinJson);` and `case 'stop': return
stop(stdinJson);`; update the docblock's name list. In `hooks.test.ts`, the "all five registered
names" case becomes seven and includes `session-end` and `stop`.
**Verify:** `pnpm vitest run tests/spec/hooks/hooks.test.ts`

---

## Batch 2 — human verbs and promote (parallel; Light)

Owns: `src/pulse/thread-cli.ts`, `src/cli/cli.ts`, `tests/atomic/pulse/thread-cli.test.ts`,
`tests/spec/pulse/thread-cli.test.ts`. Imports batch 0's primitives only.

### Task 2.1: `thread list`

**Criterion:** `pulse.threads` — "`thread list` filters by status and by `bears_on` prefix"
**Files:** `tests/atomic/pulse/thread-cli.test.ts` (create), `src/pulse/thread-cli.ts` (create)
**Change:** `export async function threadCli(argv: string[], root = '.'): Promise<number>`;
`list` parses `--status` (default `open`, enum-checked → exit 2 on bad value) and `--touching X`
(`bears_on.some(e => e.startsWith(X))`); prints `${id}  ${kind}  ${opened.slice(0,10)}
${keyText.slice(0,80)}` oldest first, or `No threads.`; exit 0.
**Verify:** `pnpm vitest run tests/atomic/pulse/thread-cli.test.ts`

### Task 2.2: `thread drop` and `thread close`

**Criterion:** `pulse.threads` — "`drop` and `close` change status once"; "`close` requires `--by`
and records it verbatim"
**Files:** `tests/atomic/pulse/thread-cli.test.ts` (extend), `src/pulse/thread-cli.ts` (extend)
**Change:** `drop T-NNN` → `updateThreadStatus(root, id, { status: 'dropped' })`; `close T-NNN
--by <path>` → `{ status: 'answered', answered: now, resolved_by: path }`; missing `--by` → usage,
exit 2, no write; unknown id or non-open → print current status, exit 1, no write.
**Verify:** `pnpm vitest run tests/atomic/pulse/thread-cli.test.ts`

### Task 2.3: `thread promote --to atlas/decisions`

**Criterion:** `pulse.threads` — "Promote to a decision drafts a schema-valid file"
**Files:** `tests/spec/pulse/thread-cli.test.ts` (create), `src/pulse/thread-cli.ts` (extend)
**Change:** Build `{ targetRel, payload }` by calling `decisionFilePayload({ type:
'decision-candidate', title: keyText.slice(0, 80), reasoning: DRAFT_LINE + '\n\n' + body,
sessionIds: sessions.map(citation → id) }, now, user)` from `src/insight/session-observe.ts`,
then insert `confidence: INFERRED` after `date:` (one `replace` on the payload — or extend
`decisionFilePayload` with an optional `confidence` argument if that is cleaner; either way the
existing session-observe tests must stay green); refuse if target exists (exit 1); write; set the
thread answered with `resolved_by: targetRel`. Spec test runs `cortex validate`'s `checkAtlas` and
`checkProvenance` over the result.
**Verify:** `pnpm vitest run tests/spec/pulse/thread-cli.test.ts`

### Task 2.4: `thread promote --to compass/bugs`, reserved and unknown targets

**Criterion:** `pulse.threads` — "Promote to a bug requires a type and resolvable `affects`";
"Promote refuses the reserved and unknown targets, and never clobbers"
**Files:** `tests/spec/pulse/thread-cli.test.ts` (extend), `src/pulse/thread-cli.ts` (extend)
**Change:** `nextBugId(root)` scans `.cortex/compass/bugs/B-(\d+)` filenames (mirror
`nextRuleId` in session-observe.ts); `--type` required and enum-checked against the seven §4.2
types (exit 2 otherwise); `affects` = `--affects` values, else `bears_on` entries that
`fs.existsSync(path.join(root, e))`; empty → exit 2 naming `--affects`; frontmatter `id, title,
type, severity: medium, status: open, affects, opened`; body DRAFT line + thread body; `--to
atlas/evidence` → exit 2 "reserved for step 2"; other → exit 2. Spec test runs `checkBugs` over
the result.
**Verify:** `pnpm vitest run tests/spec/pulse/thread-cli.test.ts`

### Task 2.5: Wire `cortex thread`

**Criterion:** `pulse.threads` — Rule 11 (every verb AC above, end to end through `run(argv)`)
**Files:** `src/cli/cli.ts` (modify), `tests/spec/pulse/thread-cli.test.ts` (extend)
**Change:** Add `'thread'` to `PULSE_LOOP_COMMANDS`; add the branch `if (argv[0] === 'thread') {
const { threadCli } = await import('../pulse/thread-cli.js'); return threadCli(argv.slice(1)); }`
above the `insight` branch; update the file docblock's verb list. One spec test calls
`run(['thread', 'list'])` against a fixture root (chdir) and asserts exit 0.
**Verify:** `pnpm vitest run tests/spec/pulse/thread-cli.test.ts`

---

## Batch 3 — hygiene Rule 8, validator checks, registration (parallel; Light)

Owns: `src/pulse/hygiene.ts`, `src/schema/checks/threads.ts`, `src/schema/checks/hooks.ts`,
`src/schema/checks/pulse.ts`, `src/schema/validate.ts`, `src/cli/scaffold.ts`,
`tests/atomic/pulse/hygiene.test.ts`, `tests/spec/pulse/hygiene.test.ts`,
`tests/atomic/schema/threads-check.test.ts`, `tests/atomic/schema/hook-config.test.ts`,
`tests/atomic/core-cli/init.test.ts`, `tests/atomic/core-cli/sync.test.ts`,
`tests/spec/core-cli/init.test.ts`.

### Task 3.1: Thread expiry in place

**Criterion:** `pulse.hygiene` — "An open thread past its expiry is expired in place"
**Files:** `tests/atomic/pulse/hygiene.test.ts` (extend), `src/pulse/hygiene.ts` (modify)
**Change:** `export function expireThreads(root, nowMs): { expired: number; skipped: number }` —
glob `pulse/threads/T-*.md`, parse with `gray-matter` **inline** (do not import batch 0's module,
so this batch has no dependency on it), `status === 'open' && Date.parse(expires) < nowMs` →
rewrite only the `status:` frontmatter line (regex on the raw text, body untouched). Tolerate an
absent directory.
**Verify:** `pnpm vitest run tests/atomic/pulse/hygiene.test.ts`

### Task 3.2: Record and scratch retention

**Criterion:** `pulse.hygiene` — "Old session records and their scratch copies are deleted together"
**Files:** `tests/atomic/pulse/hygiene.test.ts` (extend), `src/pulse/hygiene.ts` (modify)
**Change:** `export const SESSION_RECORD_RETENTION_DAYS = 30` beside `READS_RETENTION_DAYS`;
`cleanStaleSessionRecords(root, nowMs): { records: number; scratchDirs: number; companions:
number }` — delete `pulse/sessions/*.json` past the window and `pulse/scratch/<same id>/`
(`fs.rmSync(…, { recursive: true })`), any `pulse/scratch/<id>/` past the window on its own
mtime, and any `pulse/state/sessions/*.last.json` past the window; swallow per-file errors like
`cleanStaleReadLedgers`.
**Verify:** `pnpm vitest run tests/atomic/pulse/hygiene.test.ts`

### Task 3.3: Report section and wiring

**Criterion:** `pulse.hygiene` — "Nothing to expire reports the empty line"; "Only the report is
written" (amended wording)
**Files:** `tests/spec/pulse/hygiene.test.ts` (extend), `src/pulse/hygiene.ts` (modify)
**Change:** In `runHygiene`, call both new functions and render a "Threads and session records"
section with the four counts, or the exact empty line from spec Rule 8; add the section to the
footer's threshold list (`SESSION_RECORD_RETENTION_DAYS`, `THREAD_TTL_DAYS` note). Update the
existing "only the report is written" spec test to allow the Rule 8 paths.
**Verify:** `pnpm vitest run tests/spec/pulse/hygiene.test.ts`

### Task 3.4: `check.threads` and the `check.pulse` skip

**Criterion:** `pulse.threads` — "Malformed thread files are warned, never fatal"; "A thread file
has the contract frontmatter and body" (the validate clause)
**Files:** `tests/atomic/schema/threads-check.test.ts` (create), `src/schema/checks/threads.ts`
(create), `src/schema/checks/pulse.ts` (modify), `src/schema/validate.ts` (modify)
**Change:** `export async function checkThreads(root): Promise<Violation[]>` — every rule in
Appendix A's `check.threads` row, all `severity: 'warning'`, `clause: '§4.5.3'`, `check:
'check.threads'`; tolerate an absent directory; reuse `CLAUDE_SESSION_REF_PATTERN` from
`src/schema/checks/provenance.ts` for citations. In `checkPulse`, add `'threads/**'` to the
`fg` `ignore` list. Wire `checkThreads` in `validate.ts` after `checkPulse`. Test: the bad-file
fixture yields exactly the enum and missing-field warnings and no error.
**Verify:** `pnpm vitest run tests/atomic/schema/threads-check.test.ts tests/atomic/schema/validator.test.ts`

### Task 3.5: SessionEnd and Stop registration and `check.hook-config`

**Criterion:** `hooks.session-end` — "Registered under SessionEnd and Stop by init and sync"
**Files:** `src/cli/scaffold.ts` (modify), `src/schema/checks/hooks.ts` (modify),
`tests/atomic/schema/hook-config.test.ts` (extend), `tests/atomic/core-cli/init.test.ts`,
`tests/atomic/core-cli/sync.test.ts`, `tests/spec/core-cli/init.test.ts` (extend the pinned
hook sets)
**Change:** Add `timeout?: number` to `HookEntry`; in `cortexHookEntries` append
`{ event: 'SessionEnd', command: 'cortex hook session-end', timeout: 10 }` and
`{ event: 'Stop', command: 'cortex hook stop' }` to the unconditional list (after PostToolUse
Write|Edit, before the Read pair); in `mergeSettings` emit `timeout` on the inner
`{ type: 'command', command, timeout }` object when present. The `already` check keys on the
command string, so an existing project gains both rows on `sync` without duplicates. In
`checkHookConfig`: `const anyCortex = hooksJson.includes('cortex hook ')`; for each of
`'cortex hook session-end'` (key `hooks.SessionEnd`) and `'cortex hook stop'` (key `hooks.Stop`),
if `anyCortex` and the marker is absent push an `error`, `clause: '§5'`, message ending "run
`cortex sync`". Tests: init and sync both register both once (idempotent on re-run, `timeout: 10`
present on SessionEnd only); hook-config passes with both, errors naming each missing one when
other Cortex entries exist, and is silent for a settings file with no Cortex entries.
**Verify:** `pnpm vitest run tests/atomic/schema/hook-config.test.ts tests/atomic/core-cli/init.test.ts tests/atomic/core-cli/sync.test.ts tests/spec/core-cli/init.test.ts`

---

## Orchestrator close-out (after all batches)

1. `pnpm test` — full suite green (the authoritative run).
2. `pnpm build`, then `cortex sync` **in this repo** so `.claude/settings.json` gains the
   `SessionEnd` and `Stop` rows (otherwise `check.hook-config` now errors here — by design).
3. `cortex validate` → conformant; the two `governs`-resolves warnings on the new specs disappear
   once the governed files exist.
4. Flip `status: draft → implemented` on `hooks.session-end` and `pulse.threads`; re-read both
   business specs for drift (none expected — this step injects nothing).
5. Run one real session to its end and confirm `pulse/sessions/<id>.json` and a thread appear;
   then `cortex usage` to confirm the `pulse/threads` read figure is still 0 (nothing consumes it
   yet — that is step 3's number to move).
6. Rule-19 report: enumerate the two `cortexHookEntries` rows and the `timeout` field,
   `check.hook-config` clause, `check.threads` (new), `check.pulse` ignore list, hygiene Rule 8
   deletions.

## Deliberately not in this plan

- No SessionStart, PreRead, or CLAUDE.md change of any kind (both specs' Notes; step 3).
- No `atlas/evidence` target (step 2, schema 3.4).
- No `cortex.config.json` keys for the retention windows (same deferral as `readsRetentionDays`).
- No skill-bundle change and therefore no `.claude/skills/` mirror work.
