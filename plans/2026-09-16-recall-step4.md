# Plan — recall work, step 4: open-thread prompt routing and the read-deferral flag (schema 3.4, third revision in place)

Date: 2026-09-16
Spec (new, draft): `.specflow/specs/hooks/prompt-route.spec.md` (`hooks.prompt-route`).
Specs (amended in place): `hooks.pre-read-writeback` Rule 7 + nine ACs + Entities + Notes;
`pulse.usage` Rule 11 (prefixes `Evidence:`/`Open:`, `cortex thread list` tail, thread-verb
follow) and new Rule 13 (Read deferrals) + five ACs; `atlas.evidence` Rule 5 (findings order);
`pulse.threads` Rule 14 (step-4 note); `hooks.search-annotate` Notes.
Business outcome: `scaffolding.assistant-reaches-for-cortex-instead-of-guessing` (journey 1,
business rules 1 and 6, a new "deferral proceed-rate" metric, out-of-scope 3, Notes,
`implemented_by` + `hooks/prompt-route.spec.md`); `anatomy.assistant-refines-the-map-while-working`
Notes (the gate is not its promise).
Schema: `cortex-schema.md` **3.4, third revision in place** — header note; §4.5.3 consumers;
§4.11 "not a fifth consumer"; §5 (opening sentence, PreRead row (d), new `UserPromptSubmit` row,
pointer grammar third shape + counted prefixes, envelope carve-out, `check.hook-config`
validated-by); §10.1 `hooks.readDefer`; Appendix A (`check.hook-config`, `check.config`, check
count). RULES.md rule 6 (the one measured exception). CLAUDE.md "What NOT to Do" hook line.
**Already written** — no schema, RULES, CLAUDE.md or spec edits in this plan.
Status: **ready to execute** (Pedro approved step 4 on 2026-09-16; no code or tests exist yet).

## Ground rules for every task

- **Tests first.** `specflow-tests` writes the test file named in the task before the
  implementation file; the task is done when the named `pnpm vitest run …` command is green.
- **R-001 governs** `src/hooks/**`, `src/recall/**`, `src/pulse/**`, `src/cli/**`,
  `src/schema/**` (regex predicate: no LLM SDK import). Nothing here imports an SDK, spawns a
  subprocess, or touches the network.
- **RULES.md rule 6, as amended.** `cortex hook prompt-route` exits 0 always and **never exits
  2** (that erases the human's prompt). `cortex hook pre-read` emits `deny` **only** on the
  Rule 7 path — flag `true`, interactive session, deferrable kind, entry with `size_lines ≥ 40`,
  first time this session, ledger under 25, ledger append succeeded — and every failure inside
  Rule 7 falls through to the Rules 2–6 payload. Expected empty states are silent and unlogged.
- **RULES.md rule 11 budgets** are chars/4: the `Open:` payload ≤240 chars over ≤2 lines; the
  deny reason ≤1,000 chars; the PreRead allow payload unchanged (300/200 + 200 marker).
- **RULES.md rule 19:** each batch report enumerates every contract surface touched. The full
  set for this step: `cortexHookEntries` (+1 row); `runHook` (+1 case); `checkHookConfig`
  `required` table (+1 row); `checkConfig` (`hooks.readDefer` type + pairing warning);
  `CONFIG_DEFAULTS.hooks` (+`readDefer: false`); the PreRead deny envelope and its four pinned
  reason lines; the `Open:` line grammar; `pointerTargetsIn`'s prefix regex and `MORE_TAIL_RE`;
  `follows`/the thread-verb follow; `UsageCounts` (+4 fields); `renderUsageBody` (+1 section);
  `usageFindings` (+4 findings, position pinned by `atlas.evidence` Rule 5).
- **Grammar is pinned.** `Open: <T-NNN> (<YYYY-MM-DD>) <key text> (<path>)` and the four
  `Deferred:` reason lines are quoted in the specs; `pulse.usage` counts by them. Do not
  "improve" the wording.
- **Standing authorities:** the engineering-call constants are already in the specs
  (`RESUME_WINDOW_DAYS = 7`, `PROMPT_ROUTE_MAX_THREADS = 200`,
  `PROMPT_ROUTE_MAX_PROMPT_CHARS = 2000`, the 2-hit rule, the 80/40/20 cuts,
  `READ_DEFER_MIN_LINES = 40`, `READ_DEFER_CIRCUIT_BREAKER = 25`, `DEFER_RETRY_WINDOW = 3`,
  six Connections items); do not re-decide them.
- **The flag stays off in this repo.** No task sets `hooks.readDefer: true` in
  `.cortex/cortex.config.json`; the experiment is the close-out's last step and Pedro's call.
- **Parallel-batch caveat:** a batch's own suite run can see a sibling's in-flight edits; only
  the orchestrator's full `pnpm test` after both batches is authoritative.
- **Insight is current for the files you modify** (`cortex insight file src/hooks/pre-read.ts`,
  `src/pulse/usage.ts`, `src/hooks/session-end.ts`, `src/pulse/distil.ts`, `src/cli/scaffold.ts`,
  `src/schema/checks/hooks.ts`, `src/schema/checks/config.ts`, `src/cli/templates.ts`); there is
  no entry yet for `src/recall/query.ts` or `src/hooks/search-annotate.ts` — read them.

## Exploration summary

- **Relevant existing code:** `src/hooks/search-annotate.ts` — `RECALL_FIRED_DIR`,
  `recallFiredPath(root, sessionId)`, `readFired(memPath)` (private; lift), the `envelope`
  helper, the `run` shape (`try` → `SILENT` + `appendHookError`); `src/recall/query.ts` —
  `tokenise(text, index?)` → `{ tokens, refs }` (refs include `T-\d{3,}`), `cutTitle(title,
  max)`, `POINTER_BUDGET_CHARS = 240`, `POINTER_MAX_LINES = 2`, `moreTail(ref)`;
  `src/pulse/threads.ts` — `listThreads(root)` → `{ threads, skipped }` sorted by id,
  `keyText(t)`, `threadKey(t)`, `Thread` (`id`, `kind`, `status`, `opened`, `body`),
  `THREAD_KINDS`, `threadFilename(t)` / `threadPath(root, id)`; `src/hooks/session-end.ts` —
  `HARNESS_MARKERS`, `isHarnessInjected(m)` (message-typed; needs a string twin), the Rule 5b
  first-user-line scan inside `readTranscript`, `SESSION_END_LINE_BYTES`; `src/pulse/distil.ts`
  — `sessionKind(messages)` over the private constants `SCHEDULED_SKILL_PREAMBLE` /
  `SCHEDULED_TASK_TAG` (line 256–257; export them); `src/hooks/pre-read.ts` — `run` (220–351),
  `readsMemoryPath`, `isMarkedTarget`, `envelope`, `SILENT`, the Rule 4 memory block (the
  `fs.appendFileSync(memPath, relPath + '\n')` that Rule 7 must **not** reach on a deferral),
  `MAX_CHARS_*`, `fileQuery` result (`entry.frontmatter.size_tokens`; `size_lines` is in the
  same frontmatter — `.cortex/insight/anatomy/<path>.md`), `entryResult.sections['Connections']`;
  `src/pulse/usage.ts` — `UsageCounts` (60–), `POINTER_WINDOW` (57), `pointerTargetsIn` (268,
  regex `/^(Recall|Decided):/`), `MORE_TAIL_RE` (250), `ID_SHAPES`, `injectedText` (298 —
  reads raw `entry.message.content` blocks; the `tool_result` scan goes beside it),
  `follows` (333), `invokesWhy` (348), the per-session `pending` loop in `collectUsage` (376–445),
  `renderUsageBody` (498; `## Pointer follow-through` at 578), `usageFindings` (608–626);
  `src/schema/checks/hooks.ts` — `required` table (~line 70); `src/schema/checks/config.ts` —
  `checkConfig(root)`, `knownKeys` (112), the `profile` block as the template for a typed key;
  `src/cli/scaffold.ts` — `cortexHookEntries` (417–440), `mergeSettings`; `src/cli/templates.ts`
  — `CONFIG_DEFAULTS` (line ~19: `hooks: { preRead: true }`); `src/hooks/cli.ts` — `runHook`
  switch.
- **Established patterns:** hooks are `run(stdinJson, opts?) → Promise<HookRunResult>`;
  per-session memory under `.cortex/pulse/state/<name>/<sanitised session id>`; expected-empty
  → `SILENT` unlogged, unexpected throw → `SILENT` + `appendHookError`; tests build temp roots
  with `fs.mkdtempSync` and write fixtures directly; usage tests build transcript JSONL fixtures
  in `tests/fixtures/` style and assert `collectUsage` counts plus `renderUsageBody` text.
- **Tech stack:** Node ≥20, TypeScript strict, vitest, `gray-matter` already used by
  `listThreads`; no new dependency (RULES.md rule 2 not triggered).

## Gap analysis

- **Can reuse:** everything above. `listThreads` already skips malformed files; `tokenise`
  already yields `T-NNN` refs; `recallFiredPath` is the shared memory; `cutTitle` and
  `POINTER_BUDGET_CHARS` give the budget idiom; `fileQuery` gives Purpose, Connections and
  `size_lines`; `checkConfig`'s `profile` block is the typed-key template.
- **Must create:** `src/hooks/prompt-route.ts`; `src/hooks/transcript-head.ts` (the first-user-
  line session-kind probe, shared by nothing else yet but owned by no batch's hot file);
  tests `tests/atomic/hooks/prompt-route.test.ts`, `tests/spec/hooks/prompt-route.spec.test.ts`,
  `tests/atomic/hooks/transcript-head.test.ts`, `tests/atomic/schema/config-check.test.ts`.
- **Must modify:** `src/hooks/session-end.ts` (+`isHarnessText`), `src/pulse/distil.ts`
  (export the two scheduled markers + `isScheduledPromptText`), `src/recall/query.ts` (+`openLine`,
  `fitOpenLines`), `src/pulse/usage.ts` (Rules 11 and 13), `src/cli/templates.ts`
  (`CONFIG_DEFAULTS`), `src/hooks/cli.ts` (+case), `src/cli/scaffold.ts` (+row),
  `src/schema/checks/hooks.ts` (+required row), `src/schema/checks/config.ts` (`readDefer`),
  `src/hooks/pre-read.ts` (Rule 7); tests that pin the hook set or the config shape:
  `tests/atomic/schema/hook-config.test.ts`, `tests/atomic/core-cli/init.test.ts` (line 222
  config shape; hook-set fixtures), `tests/spec/core-cli/init.test.ts`,
  `tests/atomic/core-cli/sync.test.ts`, `tests/spec/hooks/hooks.test.ts`,
  `tests/atomic/hooks/pre-read.test.ts`, `tests/spec/hooks/pre-read.test.ts`,
  `tests/atomic/pulse/usage.test.ts`, `tests/spec/pulse/usage.test.ts`,
  `tests/atomic/atlas/evidence.test.ts` / `tests/spec/atlas/evidence.spec.test.ts` (findings
  order, if they enumerate it), `tests/atomic/hooks/session-end.test.ts`,
  `tests/atomic/pulse/distil.test.ts`, `tests/atomic/recall/query.test.ts`.
- **Open questions (assumptions stated, proceed):** (1) Claude Code's `UserPromptSubmit` stdin
  carries `session_id`, `prompt`, `cwd`, `hook_event_name` and optionally `prompt_id`,
  `transcript_path`, `permission_mode` — all read as optional strings; the JSON
  `hookSpecificOutput.additionalContext` form is used (the docs also accept plain stdout for this
  event). (2) A denied Read's `permissionDecisionReason` is recorded in the transcript as the
  blocked call's `tool_result` text (error) — `pulse.usage` Rule 13 scans `tool_result` blocks
  and `hook_additional_context` attachments; a shape change shows as `deferred` dropping to 0
  while ledgers fill. (3) `fileQuery`'s frontmatter exposes `size_lines`; if it is typed away,
  read `entry.frontmatter['size_lines']` as `unknown` and treat a non-number as tiny.
  (4) `cortex sync` (close-out) registers the `UserPromptSubmit` row in this repo; `init` is not
  re-run.

## Size check and batching

One new spec plus five amended, roughly 3,200 lines of relevant existing code — over the
one-agent heuristic, so it is **split**: one sequential seed batch (shared helpers the two hooks
and the counter need), then two batches with **disjoint file ownership** that run in parallel,
each at Light depth.

```
Batch 0 (seed, sequential)  isHarnessText · scheduled markers · transcript-head probe · Open: line + budget in query.ts
                            · pulse.usage Rules 11 + 13 · CONFIG_DEFAULTS.hooks.readDefer ─┐
                                                                                            ├─► Batch 1  prompt-route hook + dispatch + registration + check.hook-config
                                                                                            │            (owns src/hooks/prompt-route.ts, src/hooks/cli.ts, src/cli/scaffold.ts,
                                                                                            │             src/schema/checks/hooks.ts, the hook-set tests, tests/*/hooks/prompt-route*)
                                                                                            └─► Batch 2  read-defer mode + check.config
                                                                                                         (owns src/hooks/pre-read.ts, src/schema/checks/config.ts,
                                                                                                          tests/*/hooks/pre-read*, tests/atomic/schema/config-check.test.ts)
Orchestrator: pnpm test → pnpm build → cortex sync (this repo) → cortex validate → specs to implemented → commit
              → one week of sessions → cortex usage --record (baseline) → Pedro decides the readDefer week
```

Ownership notes: `src/pulse/usage.ts`, `src/recall/query.ts`, `src/hooks/session-end.ts`,
`src/pulse/distil.ts`, `src/hooks/transcript-head.ts`, `src/cli/templates.ts` and
`tests/atomic/core-cli/init.test.ts` line 222 belong to **batch 0 only**; batch 1 later edits the
hook-set fixtures in `tests/atomic/core-cli/init.test.ts` (different lines — coordinate at merge
if the file moved). Neither parallel batch edits `src/recall/query.ts` or `src/pulse/usage.ts`.

---

## Batch 0 — shared helpers, the `Open:` line, the counters, the config default (sequential; ~50 min)

### Task 0.1: The string-level harness predicate and the scheduled markers

**Criterion:** `hooks.prompt-route` — "Harness-injected prompts never fire" (the predicate half)
**Files:** `tests/atomic/hooks/session-end.test.ts` (modify — one `describe('isHarnessText')`),
`tests/atomic/pulse/distil.test.ts` (modify — one case), `src/hooks/session-end.ts` (modify —
additive), `src/pulse/distil.ts` (modify — additive)
**Change:** In `distil.ts` export `SCHEDULED_SKILL_PREAMBLE` and `SCHEDULED_TASK_TAG` (today
`const` at lines 256–257) and add `export function isScheduledPromptText(text: string): boolean`
= `text.trimStart().startsWith(SCHEDULED_SKILL_PREAMBLE) || text.includes(SCHEDULED_TASK_TAG)`;
make `sessionKind` call it (behaviour unchanged). In `session-end.ts` add
`export function isHarnessText(text: string): boolean` — trimmed text starts with `<` or `[`, or
its first `HARNESS_SCAN_CHARS` characters contain a `HARNESS_MARKERS` entry, **or**
`isScheduledPromptText(text)` — and make `isHarnessInjected(m)` return
`m.role === 'user' && isHarnessText(m.text)`. Note: this adds the scheduled markers to
`isHarnessInjected`; a scheduled preamble already starts with `B…`? No — `Base directory for this
skill:` does not start with `<`/`[`, so today it is *not* harness-injected for the session-end
extractors. **Keep the two predicates separate to preserve session-end behaviour:**
`isHarnessText` = the old predicate; `isHarnessPrompt(text)` = `isHarnessText(text) ||
isScheduledPromptText(text)` is what prompt-route uses. Tests: the four AC prompt shapes are
`isHarnessPrompt` true; a plain human line is false; `sessionKind` still classifies the
preamble as `scheduled`.
**Verify:** `pnpm vitest run tests/atomic/hooks/session-end.test.ts tests/atomic/pulse/distil.test.ts`

### Task 0.2: The transcript-head session-kind probe

**Criterion:** `hooks.pre-read-writeback` — "Scheduled and unknown sessions are never deferred"
(the probe half)
**Files:** `tests/atomic/hooks/transcript-head.test.ts` (create), `src/hooks/transcript-head.ts`
(create)
**Change:** `export function sessionKindFromTranscriptHead(transcriptPath: string):
'interactive' | 'scheduled' | 'unknown'` — open the file, read at most the first
`TRANSCRIPT_HEAD_BYTES` (256 KiB, exported), split on `\n`, find the first line containing
`"type":"user"`, `JSON.parse` it (a parse failure or a line longer than the head → `unknown`),
extract the user text exactly as `extractMessages` would (string content or the first `text`
block), return `isScheduledPromptText(text) ? 'scheduled' : 'interactive'`; ENOENT, a directory,
an empty file, or no user line → `unknown`. Never throws. Tests: a scheduled fixture, an
interactive fixture, a missing path, a 300 KiB first line, an empty file.
**Verify:** `pnpm vitest run tests/atomic/hooks/transcript-head.test.ts`

### Task 0.3: The `Open:` line and its budget in `query.ts`

**Criterion:** `hooks.prompt-route` — "The first prompt of a session surfaces the previous
session's hanging question" (the exact string); "Budget cuts the key text, then the second line,
never the path"; "Three qualifying threads show the two newest and point onward" (the tail)
**Files:** `tests/atomic/recall/query.test.ts` (modify — new `describe('Open: lines')`),
`src/recall/query.ts` (modify — additive)
**Change:** Export `OPEN_TITLE_MAX = 80`, `THREAD_LIST_TAIL = ' · more: cortex thread list'`,
`openLine(id, openedIso, keyText, relPath, titleMax = OPEN_TITLE_MAX): string` =
`` `Open: ${id} (${openedIso.slice(0, 10)}) ${cutTitle(keyText.replace(/\s+/g, ' ').trim(), titleMax)} (${relPath})` ``,
and `fitOpenLines(items: { id; opened; keyText; relPath }[], more: boolean): string[]` — render
up to `POINTER_MAX_LINES` lines at 80; while the joined payload (with the tail on the last line
when `more`) exceeds `POINTER_BUDGET_CHARS`: re-render at 40, then 20, then drop the second line
(setting `more = true` since something is now unshown), then drop the tail. Tests: the AC's exact
string; two 200-char key texts with 60-char slugs → ≤240 chars, paths intact, `…` present;
three items → two lines and the tail on line two.
**Verify:** `pnpm vitest run tests/atomic/recall/query.test.ts`

### Task 0.4: `pulse.usage` Rule 11 — prefixes, the thread-list tail, the thread-verb follow

**Criterion:** `pulse.usage` — "An Open pointer is fired and followed by a thread verb"; "A
marker beginning Evidence: or Open: is fired"; the three existing Rule 11 ACs stay green
**Files:** `tests/atomic/pulse/usage.test.ts` (modify — Rule 11 `describe`), `src/pulse/usage.ts`
(modify)
**Change:** `pointerTargetsIn`: prefix regex → `/^(Recall|Decided|Evidence|Open):/`;
`MORE_TAIL_RE` → `/\s*·\s*more:\s*cortex (why (\S+)|thread list)\s*$/` and `PointerTarget` gains
`threadId?: string` (the first `/^T-\d{3,}$/` token on an `Open:` line) and `moreCommand?:
'why' | 'thread list'`; keep `whyRef` for the `why` form. In `collectUsage`'s Bash branch, a
pending pointer is followed when `invokesWhy` matches (as today), **or** its `moreCommand` is
`thread list` and the quote-stripped command has a segment whose tokens start `cortex thread
list`, **or** its `threadId` is set and a segment's tokens are `cortex thread (close|drop|promote)
<threadId>`. Factor `invokesWhy` into `invokesCortexVerb(unquoted, predicate)` if that keeps it
readable. Report text unchanged except the sentence naming the prefixes gains the two new ones.
**Verify:** `pnpm vitest run tests/atomic/pulse/usage.test.ts tests/spec/pulse/usage.test.ts`

### Task 0.5: `pulse.usage` Rule 13 — Read deferrals

**Criterion:** `pulse.usage` — "A deferral retried within three calls is proceeded"; "A late
retry is later, a missing one is abandoned"; "Read deferrals are reported even at zero and
recorded in order"; `atlas.evidence` Rule 5's findings order (its existing ACs stay green)
**Files:** `tests/atomic/pulse/usage.test.ts` (modify — new `describe('Rule 13: read
deferrals')`), `tests/spec/pulse/usage.test.ts` (modify — the `--record` case asserts the four
new findings after `pointers.followed`), `tests/atomic/atlas/evidence.test.ts` and
`tests/spec/atlas/evidence.spec.test.ts` (modify **only if** they enumerate the findings order),
`src/pulse/usage.ts` (modify)
**Change:** `UsageCounts` gains `deferralsDeferred`, `deferralsProceeded`, `deferralsLater`,
`deferralsAbandoned` (init 0). Export `DEFER_RETRY_WINDOW = 3` and `deferredPathsIn(text):
string[]` (every line matching `/^Deferred: (\S+)/`, the path normalised as `normalisePath`).
Add a private `resultText(entry)` beside `injectedText`: for a `user` entry, the text of every
`tool_result` content block (string content, or its `text` blocks). In the per-session loop keep
`pendingDeferrals: { path; remaining; seen: boolean }[]`: on each `Deferred:` line (from
`injectedText` **or** `resultText`) push `{ remaining: DEFER_RETRY_WINDOW }` and increment
`deferralsDeferred`; on every `tool_use` decrement `remaining`; on a `Read` whose normalised
`file_path` equals a pending path, classify `remaining >= 0 ? proceeded : later`, count, and drop
it; at session end every still-pending entry counts `abandoned`. `renderUsageBody`: after the
`## Pointer follow-through` block add `## Read deferrals` with the four counts and
`proceed-rate: <proceeded/deferred to 2 dp | ->`. `usageFindings`: insert the four
`deferrals.*` findings between `pointers.followed` and `questions.before-consult`.
**Verify:** `pnpm vitest run tests/atomic/pulse/usage.test.ts tests/spec/pulse/usage.test.ts tests/atomic/atlas/evidence.test.ts tests/spec/atlas/evidence.spec.test.ts`

### Task 0.6: `CONFIG_DEFAULTS` writes `readDefer: false`

**Criterion:** `hooks.pre-read-writeback` — "Flag absent or off → never a deny" (the
self-documenting default half; schema §10.1)
**Files:** `tests/atomic/core-cli/init.test.ts` (modify — the config-shape assertion at line
~222 gains `readDefer: false`), `src/cli/templates.ts` (modify)
**Change:** `CONFIG_DEFAULTS.hooks` → `{ preRead: true, readDefer: false }`; update the docblock
above it with the §10.1 third-revision sentence. `init.ts` line 161 merges `CONFIG_DEFAULTS`
under an existing config with a **top-level** spread (`{ ...CONFIG_DEFAULTS, ...existing, … }`),
reachable only under `--force`: a seeded `hooks: { preRead: true }` therefore keeps its block
and does **not** gain `readDefer: false`. Leave that as is — absent means `false` (§10.1), and
`cortex sync` never adds the key either — and assert it in the ~592 pre-seeded case so the
behaviour is pinned rather than accidental. Only a **fresh** init writes the explicit `false`.
**Verify:** `pnpm vitest run tests/atomic/core-cli/init.test.ts tests/spec/core-cli/init.test.ts`

---

## Batch 1 — the prompt-route hook, dispatch, registration, `check.hook-config` (~60 min)

### Task 1.1: The hook

**Criterion:** `hooks.prompt-route` — every AC except "Registered under UserPromptSubmit by init
and sync, required by the validator"
**Files:** `tests/atomic/hooks/prompt-route.test.ts` (create), `src/hooks/prompt-route.ts`
(create)
**Change:** `export async function run(stdinJson, opts?: HookRunOptions): Promise<HookRunResult>`
mirroring `search-annotate.ts`. Export `RESUME_WINDOW_DAYS = 7`, `PROMPT_ROUTE_MAX_THREADS =
200`, `PROMPT_ROUTE_MAX_PROMPT_CHARS = 2000`, `ROUTABLE_KINDS = ['question', 'offer',
'approval']`. Steps: resolve root from `cwd`; silent unless `.cortex/cortex.config.json` exists;
`prompt` and `session_id` must be non-empty strings else `SILENT`; `isHarnessPrompt(prompt)`
(Task 0.1) → `SILENT`. Candidates: `listThreads(root).threads` filtered to `status === 'open'`
and `ROUTABLE_KINDS`; when the directory listing exceeds 200 files, take the 200 highest ids
before parsing (add an optional `limit` to `listThreads` or pre-filter names — keep
`listThreads`' signature backward-compatible). Resumption: `memPath = recallFiredPath(root,
sid)`; first prompt iff `!fs.existsSync(memPath) && !fs.existsSync(<root>/.cortex/pulse/state/
sessions/<sanitised sid>.last.json)`; if so, read every `pulse/sessions/*.json` (skip parse
failures and `session_id === sid`), take the greatest `ended`; require `session_kind ===
'interactive'` and `Date.now() - ended ≤ 7 days`; `threads_opened ∩ candidates` of kind
`question|offer`, sorted by `opened` desc then id desc. Mention: `text = prompt.slice(0,
2000)`; `{ tokens, refs } = tokenise(text)`; per candidate, `idHit = refs.includes(t.id)`,
`hits = distinct tokens ∩ tokenise(keyText(t)).tokens`; qualify iff `idHit || hits.size >= 2`;
sort idHit first, hits desc, opened desc, id desc. Merge (resumption first, dedupe), drop ids in
the fired memory (`readFired` — lift from `search-annotate.ts` into `query.ts` as
`readFiredKeys(memPath)` or duplicate the four lines; do not import `search-annotate.ts`),
`shown = rest.slice(0, 2)`, `more = rest.length > 2`; `fitOpenLines(shown.map(t => ({ id,
opened, keyText: keyText(t), relPath: path.relative(root, threadPath(root, t.id)) })), more)`;
append shown ids to the memory (`mkdir -p`, best-effort); return
`{ exitCode: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName:
'UserPromptSubmit', additionalContext: lines.join('\n') } }) }` or `SILENT`. Outer `try/catch`
→ `SILENT` + `appendHookError` (the only logging path). Tests: one fixture root per AC with
thread files written via `writeThread` (or literal frontmatter), session records as JSON;
assert exact `additionalContext` strings, byte length ≤240, the memory file, the
`fs.readFileSync` spy for the never-the-index AC, `hook-errors.md` absent for the fail-open AC,
and no thread file's bytes changed.
**Verify:** `pnpm vitest run tests/atomic/hooks/prompt-route.test.ts`

### Task 1.2: Dispatch, registration, the validator row

**Criterion:** `hooks.prompt-route` — "Registered under UserPromptSubmit by init and sync,
required by the validator"
**Files:** `src/hooks/cli.ts` (modify), `src/cli/scaffold.ts` (modify),
`src/schema/checks/hooks.ts` (modify), `tests/atomic/schema/hook-config.test.ts` (modify),
`tests/atomic/core-cli/init.test.ts` (modify — hook-set fixtures only), `tests/spec/core-cli/init.test.ts`,
`tests/atomic/core-cli/sync.test.ts`, `tests/spec/hooks/hooks.test.ts` (modify — fixtures and
expectations that enumerate the hook set), `tests/spec/hooks/prompt-route.spec.test.ts` (create
— the integrated slice: `runInit --no-llm` a temp project, open a thread through
`openThreadsFromRecord`, write a session record, run the built hook on a first-prompt stdin,
assert the `Open:` line, then `validate`)
**Change:** `runHook`: `case 'prompt-route': return promptRoute(stdinJson);`.
`cortexHookEntries`: add `{ event: 'UserPromptSubmit', command: 'cortex hook prompt-route' }`
(no matcher) after the `Grep|Bash` row, **before** the `if (preRead)` block. `checkHookConfig`:
add `['cortex hook prompt-route', 'hooks.UserPromptSubmit', 'UserPromptSubmit']` to `required`;
widen the message's parenthetical to name the four always-on rows. Update every test whose
fixture asserts the exact registered set (grep the five test files for `search-annotate` to find
them — `sync.test.ts:380` is the "gains on sync, once, idempotent" shape to mirror for the new
row) to include the new entry; the init summary line's count of registered hooks moves from 8 to 9.
**Verify:** `pnpm vitest run tests/atomic/schema/hook-config.test.ts tests/atomic/core-cli/init.test.ts tests/spec/core-cli/init.test.ts tests/atomic/core-cli/sync.test.ts tests/spec/hooks/hooks.test.ts tests/spec/hooks/prompt-route.spec.test.ts`

---

## Batch 2 — the read-deferral mode and `check.config` (~60 min)

### Task 2.1: Rule 7 in `pre-read.ts`

**Criterion:** `hooks.pre-read-writeback` — "Flag absent or off → never a deny"; "Flag on: the
first read of a source file is deferred, with the summary in its place"; "The retry proceeds
with the ordinary payload, and the third read is the duplicate"; "Gated and scaffolding kinds
are never deferred"; "A tiny file, or one without an entry, is never deferred"; "The circuit
breaker holds at 25"; "Scheduled and unknown sessions are never deferred"; "An unwritable ledger
means allow, once logged"; "The deny never leaks into any other decision"; the ten pre-existing
ACs stay green
**Files:** `tests/atomic/hooks/pre-read.test.ts` (modify — new `describe('Rule 7: read
deferral')`), `tests/spec/hooks/pre-read.test.ts` (modify — one integrated case: flag on, deny,
retry allow), `src/hooks/pre-read.ts` (modify)
**Change:** Export `READ_DEFER_MIN_LINES = 40`, `READ_DEFER_CIRCUIT_BREAKER = 25`,
`READ_DEFER_DIR = 'pulse/state/read-deferred'`, `readDeferPath(root, sessionId)` (the sanitised
idiom), `DEFER_REASON_MAX_CHARS = 1000`, `isDeferrableKind(relPath)` = `!isMarkedTarget(relPath)
&& !relPath.startsWith('.cortex/') && !relPath.startsWith('.specflow/') && !['RULES.md',
'CLAUDE.md', SCHEMA_DOC_FILENAME].includes(relPath) && !/(^|\/)_(index|overview)\.md$/.test(relPath)`,
and `denyEnvelope(reason)` = the `PreToolUse` JSON with `permissionDecision: 'deny'` and
`permissionDecisionReason`. In `run`, after the config parse keep `readDefer = config.hooks?.
readDefer === true`. After `entryResult` is found and `purpose !== ''` and **before** the Rule 4
memory block, evaluate Rule 7 in order: `readDefer` → `sessionId !== ''` →
`isDeferrableKind(relPath)` → `size_lines` (from `entryResult.entry.frontmatter`, numeric,
`>= 40`) → path absent from both `readsMemoryPath` and `readDeferPath` contents → deferral
ledger line count `< 25` → `sessionKindFromTranscriptHead(stdin.transcript_path) ===
'interactive'`. If all hold: `mkdir -p` + `appendFileSync(deferPath, relPath + '\n')` inside a
`try` — on failure `appendHookError` once and **fall through** to the ordinary payload; on
success build the reason: line 1 `` `Deferred: ${relPath} (~${tokens} tok, ${lines} lines).
${purpose}` ``; line 2 `Connections: ` + up to six items from `entryResult.sections['Connections']`
— each bullet line matching `/^- ([^:]+): ([^—]+)/` under a `Uses:` or `Used by:` heading,
rendered `<path>: <symbols trimmed>`, joined `; `, or `-`; line 3 `` `Rules: ${ruleIds.join(' ')
|| '-'}.` `` (compute `ruleIds` before this point — move the `applicableRuleIds` call up); line 4
`Reading this path again proceeds without this notice.`. Fit to 1,000 chars by dropping
Connections items from the end, then trimming the purpose with `…`; never lines 1 or 4. Return
`denyEnvelope(reason)` — **without** touching the Rule 4 read-memory. Wrap the whole Rule 7
evaluation in its own `try/catch` that logs and falls through. Tests: one fixture insight entry
(`size_lines: 235`, `size_tokens: 2532`, a Purpose, a Connections section with `Uses:`/`Used
by:` bullets) at `.cortex/insight/anatomy/src/a.ts.md`; a transcript fixture per kind; assert the
exact first and last reason lines, `≤ 1000` chars, the ledger contents, the retry payload's lack
of the duplicate note, the 25-line breaker, the directory-as-ledger error case, and that
`"ask"`/`updatedInput` never appear.
**Verify:** `pnpm vitest run tests/atomic/hooks/pre-read.test.ts tests/spec/hooks/pre-read.test.ts`

### Task 2.2: `check.config` learns `hooks.readDefer`

**Criterion:** `hooks.pre-read-writeback` Rule 7 / schema §10.1 — "Flag absent or off → never a
deny" (the `"yes"` value is a `check.config` error, not a silent on); Appendix A `check.config`
**Files:** `tests/atomic/schema/config-check.test.ts` (create), `src/schema/checks/config.ts`
(modify)
**Change:** After the `profile` block: if `config.hooks` is an object and `hooks.readDefer !==
undefined`: non-boolean → `{ severity: 'error', check: 'check.config', clause: '§10.1',
location: { path: configPath, key: 'hooks.readDefer' }, message: 'cortex.config.json
"hooks.readDefer" must be a boolean, got …' }`; `true` with `hooks.preRead === false` →
`warning`, same clause/key, message `hooks.readDefer is true but hooks.preRead is false — the
Read pair is not registered, so the deferral mode cannot fire`. Tests: absent → no violation;
`false` → none; `true` + preRead default → none; `"yes"` → one error; `true` + `preRead: false`
→ one warning; run `cortex validate`'s `checkConfig` on a temp root for each.
**Verify:** `pnpm vitest run tests/atomic/schema/config-check.test.ts tests/atomic/schema/validator.test.ts`

---

## Close-out (orchestrator, sequential)

1. `pnpm test` — the whole suite, authoritative.
2. `pnpm build`.
3. `cortex sync` in this repo — adds the `UserPromptSubmit` row to `.claude/settings.json`
   (expect the summary to name it; nine hooks registered). `.cortex/cortex.config.json` is
   **not** edited: `hooks.readDefer` stays absent (= off) here until step 7.
4. `cortex validate` — conformant; expect no `check.hook-config` or `check.config` finding.
5. Update `hooks.prompt-route` to `status: implemented`; `hooks.pre-read-writeback`, `pulse.usage`,
   `atlas.evidence` stay `implemented`; update `.specflow/specs/_index.md`'s recall step 4 line;
   `.specflow/specs/hooks/_overview.md` already names both. Commit with the RULES 19 enumeration
   in the message (the list under "Ground rules").
6. **Baseline before the experiment.** After a week of ordinary sessions: `cortex usage --record`
   — the `Open:` lines' fired/followed join `pointers.*`; `deferrals.*` record four zeros (the
   flag was off). This is `evidence.<date>-usage`, superseding the 2026-09-15 file.
7. **The experiment is Pedro's call.** If approved: set `hooks.readDefer: true` in this repo's
   `.cortex/cortex.config.json` for **one week**, then `cortex usage --record` again and read the
   proceed-rate. A rate near 1 → set the flag back to `false` and open a spec change to remove
   Rule 7 and the RULES.md rule 6 carve-out; a markedly lower rate with no loss of task quality →
   the decision to keep it is recorded as an atlas decision with `bears_on: [schema:§5,
   hooks.pre-read-writeback]` and `sources:` the two evidence files. Either way the flag returns to
   `false` at the end of the week; leaving it on is a separate decision.
