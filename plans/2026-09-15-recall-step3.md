# Plan — recall work, step 3: the consumers of the recall index (schema 3.4, second revision in place)

Date: 2026-09-15
Specs (new, draft): `.specflow/specs/hooks/search-annotate.spec.md` (`hooks.search-annotate`),
`.specflow/specs/recall/why.spec.md` (`recall.why`),
`.specflow/specs/recall/index-blocks.spec.md` (`recall.index-blocks`).
Specs (amended in place): `hooks.pre-read-writeback` Rule 6 + five ACs; `recall.recall-index`
Rule 12; `pulse.usage` Rule 11 + one AC; `core-cli.init` Rule 2 and Rule 18 (B-018, the
invocation gate) + four ACs; `core-cli.sync` Rule 4;
`scaffolding.coverage-map` and `scaffolding.rationalization-table` Notes only.
Business outcome: `scaffolding.assistant-reaches-for-cortex-instead-of-guessing` (journey 1/3,
business rule 1, out-of-scope 3, two metrics and `implemented_by` rewritten in the spec pass).
Schema: `cortex-schema.md` **3.4, second revision in place** — header note, §4.11 consumers
paragraph, §5 (PreRead row (c), new Grep/Bash row, pointer-line grammar, envelope sentence,
`check.hook-config` validated-by), §7.1 generated block, §8 marker note, Appendix A row + check
count. RULES.md rule 11. **Already written** — no schema, RULES or spec edits in this plan.
Status: **ready to execute** (Pedro approved step 3 on 2026-09-15; no code or tests exist yet).

## Ground rules for every task

- **Tests first.** `specflow-tests` writes the test file named in the task before the
  implementation file; the task is done when the named `pnpm vitest run …` command is green.
- **R-001 governs** `src/hooks/**`, `src/recall/**`, `src/pulse/**`, `src/cli/**`,
  `src/schema/**` (regex predicate: no LLM SDK import). Nothing in this plan imports an SDK,
  spawns a subprocess, or touches the network.
- **RULES.md rule 6:** both hooks exit 0 always; the search hook's expected empty states
  (no stdin, no index, malformed index) are **silent and unlogged**; only unexpected exceptions
  reach `pulse/reports/hook-errors.md`.
- **RULES.md rule 11 budgets** are chars/4: search-annotate ≤240 chars over ≤2 lines; the
  PreRead marker line ≤200 chars; a PreRead payload carrying summary + marker ≤400 chars (500
  with the invitation).
- **RULES.md rule 19:** the batch-1 report must enumerate every contract surface touched. The
  full set for this step: `check.hook-config` (one new required entry, no new id);
  `cortexHookEntries` in `src/cli/scaffold.ts` (+1 row); `runHook` in `src/hooks/cli.ts` (+1
  case); the §5 envelope for the new hook; the `Decided:`/`Recall:` grammar (tested in batch 0);
  `pulse.usage` Rule 11's pointer target rule (id-shaped fallback + `cortex why` follow).
- **Index only.** No consumer opens frontmatter to answer what the index answers. The one
  spec'd exception is `cortex why`'s evidence `findings` (`recall.why` Rule 4) — bounded to the
  files the listing names. A test that reads a rule, decision or thread body to build a pointer
  is a spec violation, not a shortcut.
- **Grammar is pinned.** `Recall: ` and `Decided: ` are the only line prefixes any consumer
  injects; `pulse.usage` counts by them. Do not "improve" the wording.
- **Standing authorities:** engineering-call constants are already in the specs (the 60/40-char
  title cuts, the 3-char token floor, `STOP_TOKENS`, the 2-hit / 1-ref rule, the 3/2/2 marker
  caps, the top-5 recall cap, the 4-ref block cap, the `words × 1.3` estimator); do not
  re-decide them.
- **Parallel-batch caveat:** a batch's own suite run can see a sibling's in-flight edits; only
  the orchestrator's full `pnpm test` after all batches is authoritative.
- **Insight is stale for new files.** `cortex insight file` has no entry for `src/recall/query.ts`,
  `src/recall/cli.ts`, `src/recall/index-blocks.ts`, `src/hooks/search-annotate.ts`,
  `src/recall/index.ts` or `src/pulse/thread-cli.ts`; consult it for the files you modify
  (`src/hooks/pre-read.ts`, `src/pulse/usage.ts`, `src/cli/cli.ts`, `src/cli/init.ts`,
  `src/cli/scaffold.ts`, `src/cli/sync.ts`, `src/schema/checks/hooks.ts`, `src/hooks/cli.ts`).

## Exploration summary

- **Relevant existing code:** `src/recall/index.ts` — `RecallIndex`, `RecallSubject`,
  `RecallEntry`, `RECALL_ENTRY_KINDS`, `recallIndexPath(root)`, `compileRecallIndex`,
  `writeRecallIndex` (lines 52–110, 339, 431); `src/schema/refs.ts` — `classifyRef`,
  `normalisePathRef`, `RULE_RE`, `BUG_RE`, `DOMAIN_RE`, `CONCEPT_RE`; `src/schema/clauses.ts` —
  `CLAUSE_REF_RE`, `SCHEMA_DOC_FILENAME`, `loadClauseIndex` (heading regex
  `/^#{2,4}\s+(\d+(?:\.\d+){0,2})[.\s]/`, fence toggling — reuse the grammar, extend to keep
  heading text); `src/pulse/usage.ts` — `stripQuotedSpans` (174), `searchTargetsIn` (223),
  `pointerPathsIn` (247), `follows` (~290), `cortexRelative`, `UsageCounts.pointersFired/
  pointersFollowed`; `src/hooks/pre-read.ts` — `run` (125–235), `envelope`, `SILENT`,
  `readsMemoryPath` (the per-session memory idiom), `MAX_CHARS_WITH_INVITE` /
  `MAX_CHARS_WITHOUT_INVITE`, `compose`; `src/hooks/cli.ts` — `runHook` switch (the `case`
  list), `main`; `src/hooks/errors.ts` — `appendHookError`; `src/hooks/session-start.ts` —
  `HookRunResult`, `HookRunOptions`; `src/cli/scaffold.ts` — `cortexHookEntries(preRead)`
  (417–436), `mergeSettings`; `src/schema/checks/hooks.ts` — `checkHookConfig`, the
  `required` table (3.3 third revision block, ~line 70); `src/cli/cli.ts` — verb dispatch idiom
  `if (argv[0] === '…') { const { fn } = await import('…'); return fn(...) }` (`thread` at 447,
  `usage` at 152, `scan` at 399–415); `src/cli/init.ts` — the recall compile (551–552);
  `src/cli/sync.ts` — `refreshIndexes` (163–178), `knownIndexTemplate`; `src/cli/templates.ts`
  — `CORTEX_INDEXES['atlas/decisions']`, `['atlas/evidence']`, `SCHEMA_VERSION`;
  `src/schema/checks/layout.ts` — the `wordCount * 1.3 > 300` estimator (159–168);
  `src/pulse/thread-cli.ts` — `parseFlags(argv, repeatable)`, `threadCli(argv, root, opts)` as
  the verb-module shape to mirror.
- **Established patterns:** hooks are `run(stdinJson, opts?) → Promise<HookRunResult>` with
  `{ exitCode: 0, stdout }`, `SILENT` for nothing, an `envelope(payload)` helper, `try/catch`
  around the body degrading to `SILENT` + `appendHookError`; per-session memory under
  `.cortex/pulse/state/<name>/<sanitised session id>`; verbs are modules exporting
  `xCli(argv, root, opts)` returning an exit code and printing via `opts.stdout ?? console.log`;
  tests build temp roots with `fs.mkdtempSync(path.join(os.tmpdir(), …))` and write fixture
  files directly; checks return `Violation[]` with `{ severity, check, clause, location,
  message }`.
- **Tech stack:** Node ≥20, TypeScript strict, vitest, `gray-matter` (only `recall.why` Rule 4
  and nothing in the hooks), no new dependency (RULES.md rule 2 not triggered).

## Gap analysis

- **Can reuse:** everything above. `searchTargetsIn`/`stripQuotedSpans` are already exported;
  `classifyRef`/`normalisePathRef` give the ref shapes; `readsMemoryPath` is the memory idiom;
  `envelope` in `pre-read.ts` is the PreToolUse allow envelope (lift it into `query.ts` or copy
  the four lines — do not import `pre-read.ts` from the new hook).
- **Must create:** `src/recall/query.ts`, `src/hooks/search-annotate.ts`, `src/recall/cli.ts`,
  `src/recall/index-blocks.ts`; tests `tests/atomic/recall/query.test.ts`,
  `tests/atomic/hooks/search-annotate.test.ts`, `tests/spec/hooks/search-annotate.spec.test.ts`,
  `tests/atomic/recall/cli.test.ts`, `tests/spec/recall/why.spec.test.ts`,
  `tests/atomic/recall/index-blocks.test.ts`, `tests/spec/recall/index-blocks.spec.test.ts`.
- **Must modify:** `src/hooks/cli.ts` (+case), `src/cli/scaffold.ts` (+row),
  `src/schema/checks/hooks.ts` (+required entry), `src/hooks/pre-read.ts` (Rule 6),
  `src/pulse/usage.ts` (Rule 11 id-shaped targets + `cortex why` follow), `src/cli/cli.ts`
  (`why`, `recall` verbs; `scan` calls the block writer), `src/cli/init.ts` (block writer after
  the recall index), `src/cli/sync.ts` (block-opaque comparison), `src/schema/clauses.ts`
  (heading text kept alongside the number — additive, `ClauseIndex` stays a `Set` and a new
  `loadClauseHeadings(root): Map<string, string>` is added; **do not** change `ClauseIndex`'s
  type, `check.bears-on` depends on it); tests that pin the hook set:
  `tests/atomic/core-cli/init.test.ts`, `tests/spec/core-cli/init.test.ts`,
  `tests/atomic/core-cli/sync.test.ts`, `tests/spec/hooks/hooks.test.ts`,
  `tests/atomic/schema/hook-config.test.ts` (fixtures that list "the whole set" gain the
  search-annotate entry), `tests/atomic/hooks/pre-read.test.ts`, `tests/spec/hooks/pre-read.test.ts`,
  `tests/atomic/pulse/usage.test.ts`, `tests/spec/pulse/usage.test.ts`.
- **Open questions (assumptions stated, proceed):** (1) Claude Code's `PreToolUse` stdin for
  `Grep` carries `tool_input.pattern` and optional `tool_input.path`; for `Bash`,
  `tool_input.command`; both carry `tool_name`, `cwd`, `session_id` — the same envelope the
  Read hook already parses. If a field is absent the hook is silent (spec Rule 10). (2) The
  Rule 5e schema-heading read uses `loadClauseHeadings` below; if `src/schema/clauses.ts` proves
  awkward to extend, put the heading map in `query.ts` with the same regex and say so in the
  batch report. (3) `cortex init` on this repo is not re-run; `cortex sync` adds the hook row
  (close-out).

## Size check and batching

Three new specs plus six amended, roughly 4,800 lines of relevant existing code — over the
one-agent heuristic, so it is **split**: one sequential seed batch (the shared module every
consumer imports), then four batches with **disjoint file ownership** that run in parallel, each
at Light depth.

```
Batch 0 (seed, sequential)  src/recall/query.ts + src/schema/clauses.ts headings + pulse.usage Rule 11 ─┐
                                                                                                         ├─► Batch 1  search-annotate hook + registration + check.hook-config
                                                                                                         │            (owns src/hooks/search-annotate.ts, src/hooks/cli.ts, src/cli/scaffold.ts, src/schema/checks/hooks.ts, the hook-set tests)
                                                                                                         ├─► Batch 2  PreRead recall marker
                                                                                                         │            (owns src/hooks/pre-read.ts and its two tests)
                                                                                                         ├─► Batch 3  cortex why / cortex recall
                                                                                                         │            (owns src/recall/cli.ts, the `why`/`recall` branches in src/cli/cli.ts, tests/*/recall/cli|why*)
                                                                                                         └─► Batch 4  generated index blocks in scan / init / sync
                                                                                                                      (owns src/recall/index-blocks.ts, the `scan` branch in src/cli/cli.ts, src/cli/init.ts, src/cli/sync.ts)
Orchestrator: pnpm test → pnpm build → cortex sync (this repo) → cortex scan → cortex validate → (after a few sessions) cortex usage --record
```

Ownership notes: `src/cli/cli.ts` is split by region — batch 3 adds two new `if (argv[0] ===
…)` blocks **immediately after the `thread` block** (line ~455) and replaces the terminal
fall-through block (~531–570) plus the header docblock (Task 3.3, B-018); batch 4 edits only
the body of the existing `scan` block (399–415). Neither touches the other's lines; coordinate at merge if
the file moved. `src/schema/clauses.ts` belongs to batch 0 only. `src/pulse/usage.ts` belongs
to batch 0 only (Rule 11). No batch edits `src/recall/index.ts`.

---

## Batch 0 — the shared query module (sequential seed; ~40 min)

### Task 0.1: Clause headings with their text

**Criterion:** `hooks.search-annotate` — "A schema grep matches clause subjects by heading text"
**Files:** `tests/atomic/schema/clauses.test.ts` (modify — add one `describe`),
`src/schema/clauses.ts` (modify — additive)
**Change:** Export `loadClauseHeadings(root): Map<string, string>` — same file, same fence
toggling and heading regex as `loadClauseIndex`, but the map value is the heading text after the
number with leading `.`/whitespace trimmed (`"5"` → `"Hook payload contracts"`). ENOENT → empty
map. Leave `ClauseIndex`, `loadClauseIndex`, `clauseNumber`, `clauseResolves` untouched. Test:
a temp `cortex-schema.md` with `## 5. Hook payload contracts`, `### 4.11 recall-index.json …`,
a fenced `## 9. fake`; assert the two entries and the absence of the fenced one.
**Verify:** `pnpm vitest run tests/atomic/schema/clauses.test.ts`

### Task 0.2: The index loader, tokeniser, candidate keys and matcher

**Criterion:** `hooks.search-annotate` — "Two keyword hits qualify an entry; one plain hit does
not"; "A ref-shaped token qualifies on one hit"; "A spec path matches by its id"; "Fail-open is
silent and unlogged" (the loader half)
**Files:** `tests/atomic/recall/query.test.ts` (create), `src/recall/query.ts` (create)
**Change:** Export, from `src/recall/query.ts`:
- `loadRecallIndex(root): RecallIndex | null` — reads `recallIndexPath(root)` once per process
  per root (a module-level `Map<string, RecallIndex | null>` cache keyed by resolved root, with
  `clearRecallIndexCache()` for tests); returns `null` on ENOENT, on a JSON parse error, or when
  the parsed value fails a shape probe (`subjects` and `entries` are plain objects, every
  subject has four arrays of strings). Never throws, never logs.
- `STOP_TOKENS: ReadonlySet<string>` = `the and for with from that this into not are was but`.
- `tokenise(text): { tokens: string[]; refs: string[] }` — `tokens`: lowercase, split on
  `/[^a-z0-9]+/`, length ≥ 3, stop-list removed, deduplicated in first-seen order; `refs`:
  every span of the raw text matching `RULE_RE`, `BUG_RE`, `/^T-\d{3,}$/`, `CLAUSE_REF_RE`,
  `CONCEPT_RE`, `DOMAIN_RE`, or a dotted id (`/^[a-z0-9-]+(\.[a-z0-9-]+)+$/`) present as a key
  of `subjects` or in any entry's keywords — tokenised on whitespace with surrounding
  `` `'"()[] `` stripped, case-sensitive, deduplicated.
- `candidateKeys(root, targetPath, index, patternTokens?): string[]` — spec Rule 5 (a)–(e) in
  that order: normalise (`normalisePathRef`, trailing `/` stripped, `path.relative(root, …)`
  when absolute; a result starting `..` → `[]`), the path; parents with the stop rule
  (`.cortex/<module>`, `.specflow/<tree>`, first segment otherwise); spec id
  (`.specflow/specs/` or `.specflow/specs-business/` prefix stripped, `.spec.md`/`.business.md`
  stripped, `/` → `.`); compass/domain/concept ids from the basename regexes; for
  `cortex-schema.md` every `subjects` key matching `CLAUSE_REF_RE` whose number is in
  `patternTokens` or whose heading (`loadClauseHeadings`) contains a token — when
  `patternTokens` is `undefined` (the PreRead/why callers), **all** clause subjects. Return only
  keys present in `index.subjects`, deduplicated, in Rule 5's order.
- `keywordMatches(index, tokens, refs, kind?): { id: string; hits: number }[]` — spec Rule 6:
  ≥2 distinct token hits or ≥1 ref hit against `entries[id].keywords`; sort hits desc, `date`
  desc, id asc; `kind` filters.
Tests: a hand-built `RecallIndex` literal (three subjects, five entries) written to a temp
`.cortex/recall-index.json`; assert each bullet, plus: a `{not json` file loads as `null` with
no throw, and a second `loadRecallIndex` call does not re-read (spy on `fs.readFileSync`).
**Verify:** `pnpm vitest run tests/atomic/recall/query.test.ts`

### Task 0.3: The pointer-line formatter and selection

**Criterion:** `hooks.search-annotate` — "A grep into a subject directory points at the newest
current decision"; "A subject with a decision and an open thread gets the Decided line";
"Subject beats keyword, open thread beats older decision"; "The more tail names the subject";
"Budget trims the title, then drops the second line"; "The imperative-free grammar"
**Files:** `tests/atomic/recall/query.test.ts` (modify — second `describe`), `src/recall/query.ts`
(modify)
**Change:** Export `cutTitle(title, max): string` (word boundary, `…`), `recallLine(entry): string`
(`Recall: <kind> <date.slice(0,10)> <cutTitle(title,60)> (<path>)`), `decidedLine(decisionId,
threadEntry): string` (`Decided: <id> · Open: <threadId> <cutTitle(title,40)>`),
`markerLine(subject, key, index): string | null` (the PreRead form — `Decided: <max 3> ·
Evidence: <max 2> · Open: <max 2>`, newest first by entry date, parts omitted when empty,
` · more: cortex why <key>` when any part was cut; `null` when all three are empty), and
`selectPointers(index, subjectKeys, keywordHits, alreadyFired: Set<string>): { lines: string[];
fired: string[] }` implementing spec Rules 8–10: strength order thread > decision > evidence >
observation, newest first; a `Decided:` line when the leading subject has both; second line from
the leading subject's next member else the top keyword entry; skip subjects/entries in
`alreadyFired`; append the `more:` tail; enforce ≤240 chars by cutting titles to 20, then
dropping line two, then the tail. `fired` returns the subject key and entry ids used. Tests
assert the exact strings from the spec's ACs and that no line contains `read`, `consult`,
`check`, `should`, `you` as whole words.
**Verify:** `pnpm vitest run tests/atomic/recall/query.test.ts`

### Task 0.4: `pulse.usage` Rule 11 — id-shaped pointer targets and the `cortex why` follow

**Criterion:** `pulse.usage` — "An id-shaped pointer is followed by a read of the file it stands
for"; "A followed pointer is counted within ten tool calls" and "A pointer past the window is
fired but not followed" (must stay green)
**Files:** `tests/atomic/pulse/usage.test.ts` (modify — Rule 11 `describe`), `src/pulse/usage.ts`
(modify)
**Change:** In `pointerPathsIn` (rename internally to `pointerTargetsIn`, keep the old export
name as an alias for the existing tests), when a line has no `/`-bearing token, take its first
token matching `/^decision\.[^\s·]+$/`, `/^evidence\.[^\s·]+$/` or `/^T-\d{3,}$/` and map it:
`decision.<stem>` → `.cortex/atlas/decisions/<stem>.md`; `evidence.<stem>` →
`.cortex/atlas/evidence/<stem>.md`; `T-NNN` → the pseudo-path `.cortex/pulse/threads/T-NNN-`
(a prefix). Extend `follows(pointed, target, kind)` so a `T-NNN-` prefix matches any path whose
basename starts with it. Also parse the line's ` · more: cortex why <ref>` tail (if present)
into a `whyRef`; in the follow scan, a `Bash` tool use whose quote-stripped command starts
`cortex why <whyRef>` within the window counts as followed. Keep the fired/followed counters and
report rendering unchanged.
**Verify:** `pnpm vitest run tests/atomic/pulse/usage.test.ts tests/spec/pulse/usage.test.ts`

---

## Batch 1 — the search-annotate hook, registration, `check.hook-config` (~50 min)

### Task 1.1: The hook

**Criterion:** `hooks.search-annotate` — every AC except "Registered with the set, required by
the validator"
**Files:** `tests/atomic/hooks/search-annotate.test.ts` (create),
`src/hooks/search-annotate.ts` (create)
**Change:** `export async function run(stdinJson, opts?: HookRunOptions): Promise<HookRunResult>`
mirroring `pre-read.ts`'s shape: resolve `root` from `cwd`; silent unless
`.cortex/cortex.config.json` exists; branch on `tool_name` — `Grep`: `pattern`, `path` (default
`root` → no candidates); `Bash`: `stripQuotedSpans(command)` → `searchTargetsIn` (first three),
pattern text = the quoted spans of the raw command (`/'([^']*)'|"([^"]*)"/g`) plus per segment
the unquoted non-flag tokens minus command word and path operand; else silent. `loadRecallIndex`
→ `null` → `SILENT` (no log). `tokenise`, `candidateKeys` per target (union, Rule 5 order),
`keywordMatches`, read `.cortex/pulse/state/recall-fired/<sanitised session_id>` into a Set,
`selectPointers`, append `fired` to the memory (mkdir -p; a write failure still emits), and
return `envelope(lines.join('\n'))` or `SILENT`. Outer `try/catch` → `SILENT` + `appendHookError`
(the only logging path). Export `RECALL_FIRED_DIR = 'pulse/state/recall-fired'`. Tests: temp
root with `cortex.config.json` and a literal index per AC; a `Bash` fixture per Rule 3 case;
assert exact `additionalContext` strings, byte length ≤240, the memory file, and — for the
fail-open AC — that `pulse/reports/hook-errors.md` does not exist afterwards.
**Verify:** `pnpm vitest run tests/atomic/hooks/search-annotate.test.ts`

### Task 1.2: Dispatch, registration, the validator row

**Criterion:** `hooks.search-annotate` — "Registered with the set, required by the validator"
**Files:** `src/hooks/cli.ts` (modify), `src/cli/scaffold.ts` (modify),
`src/schema/checks/hooks.ts` (modify), `tests/atomic/schema/hook-config.test.ts` (modify),
`tests/atomic/core-cli/init.test.ts`, `tests/spec/core-cli/init.test.ts`,
`tests/atomic/core-cli/sync.test.ts`, `tests/spec/hooks/hooks.test.ts` (modify — fixtures and
expectations that enumerate the hook set), `tests/spec/hooks/search-annotate.spec.test.ts`
(create — the integrated slice: init a temp project, run the built hook function on a `Grep`
stdin against a compiled index, then `validate`)
**Change:** `runHook`: `case 'search-annotate': return searchAnnotate(stdinJson);`.
`cortexHookEntries`: add `{ event: 'PreToolUse', matcher: 'Grep|Bash', command: 'cortex hook
search-annotate' }` **before** the `if (preRead)` block (always registered). `checkHookConfig`:
add `['cortex hook search-annotate', 'hooks.PreToolUse', 'PreToolUse (Grep|Bash)']` to the
`required` table so it is demanded whenever `anyCortex`; the message names `cortex sync`.
Update every test whose fixture asserts the exact registered set (grep the four test files for
`session-end` to find them) to include the new entry.
**Verify:** `pnpm vitest run tests/atomic/schema/hook-config.test.ts tests/atomic/core-cli/init.test.ts tests/spec/core-cli/init.test.ts tests/atomic/core-cli/sync.test.ts tests/spec/hooks/hooks.test.ts tests/spec/hooks/search-annotate.spec.test.ts`

---

## Batch 2 — the PreRead recall marker (~30 min)

### Task 2.1: Rule 6 in `pre-read.ts`

**Criterion:** `hooks.pre-read-writeback` — "A spec read with a recall subject gets the marker
alone"; "A rule read with three of everything is cut and pointed onward"; "The schema document
aggregates its clause subjects"; "The marker rides after the summary within the combined
ceiling"; "No index, no marker, nothing logged"; and the five pre-existing ACs stay green
**Files:** `tests/atomic/hooks/pre-read.test.ts` (modify — new `describe('Rule 6: recall
marker')`), `tests/spec/hooks/pre-read.test.ts` (modify — one integrated case),
`src/hooks/pre-read.ts` (modify)
**Change:** After the `relPath` guard and **before** the `fileQuery` early return, compute
`markedKind = isMarkedTarget(relPath)` — true for `.specflow/specs/**/*.spec.md`,
`.specflow/specs-business/**/*.business.md`, `.cortex/compass/rules/R-*.md`,
`.cortex/atlas/decisions/*.md`, `.cortex/atlas/evidence/*.md` (not `_index.md`), and
`cortex-schema.md`. When true: `loadRecallIndex(root)`; `candidateKeys(root, relPath, index)`
(no tokens → all clause subjects for the schema); for the schema document merge every clause
subject's lists into one synthetic subject with key `cortex-schema.md`; `markerLine(subject,
key, index)`; enforce ≤200 chars by dropping the tail, then `Open:` to one id, then `Decided:`
to one. Restructure the tail of `run` so that "no insight entry" no longer returns `SILENT`
outright: it returns `SILENT` only when there is also no marker; with a marker and no entry the
payload is the marker line alone; with both, the marker is appended after the existing lines
and the ceiling becomes `MAX_CHARS_WITH_INVITE + 200` / `MAX_CHARS_WITHOUT_INVITE + 200` (trim
the purpose as today; never the marker). Source files (`src/**` etc.) never get a marker even
when a path subject exists. No index → no marker and **no** `appendHookError`.
**Verify:** `pnpm vitest run tests/atomic/hooks/pre-read.test.ts tests/spec/hooks/pre-read.test.ts`

---

## Batch 3 — `cortex why` and `cortex recall` (~45 min)

### Task 3.1: The verb module

**Criterion:** `recall.why` — every AC except "The verbs are counted the day they ship"
**Files:** `tests/atomic/recall/cli.test.ts` (create), `src/recall/cli.ts` (create)
**Change:** `export async function recallCli(argv: string[], root = '.', opts: { stdout?,
stderr? } = {}): Promise<number>` where `argv[0]` is `why` or `recall` (the CLI passes the
verb through). Parse with the `parseFlags` idiom from `src/pulse/thread-cli.ts` (copy the
helper, do not import it — the verbs are unrelated). Grammar errors → usage line on stderr,
exit 2. `loadRecallIndex(root)`: `null` and the file absent → the `no recall index … run
\`cortex scan\`` message, exit 1; present but unloadable → `malformed`, exit 1. `why`:
`classifyRef(ref)`; for `path` kind, `candidateKeys(root, ref, index)`; otherwise `[ref]`;
schema document → aggregate; render the Rule 4 listing exactly (two-space indents, two spaces
between columns, dates `slice(0,10)`, counts line first, sections omitted when empty); the
evidence sub-line reads `findings` with `gray-matter` from `path.join(root, entry.path)`, first
three, `metric=value[ unit]`, `(findings unreadable)` on any failure; `--json` per Rule 5 with
`JSON.stringify(obj, null, 2) + '\n'` over an object whose keys are inserted in sorted order.
`recall`: `tokenise(words.join(' '))` → `keywordMatches(index, tokens, refs, kind)` → top five
lines `<kind> <date> <id> — <title> (<path>)`; `No matches.` exit 0.
**Verify:** `pnpm vitest run tests/atomic/recall/cli.test.ts`

### Task 3.2: Wire the verbs and the integrated slice

**Criterion:** `recall.why` — "The verbs are counted the day they ship"; "A missing index is
exit 1 with the scan hint" (end-to-end)
**Files:** `src/cli/cli.ts` (modify — two blocks immediately after the `thread` block),
`tests/spec/recall/why.spec.test.ts` (create)
**Change:** `if (argv[0] === 'why' || argv[0] === 'recall') { const { recallCli } = await
import('../recall/cli.js'); return recallCli(argv, '.'); }`. Confirm the unknown-verb
fall-through below it is not reached for these two. The spec test initialises a temp project
(`runInit` with `--no-llm`, as `tests/spec/recall/recall-index.spec.test.ts` does), writes one
decision with `bears_on: [R-001]`, runs `writeRecallIndex`, then `recallCli(['why','R-001'])`
and asserts the listing; deletes the index and asserts exit 1; and runs `collectUsage` over a
transcript fixture containing `cortex why R-001` to assert the Rule 9 count.
**Verify:** `pnpm vitest run tests/spec/recall/why.spec.test.ts tests/atomic/pulse/usage.test.ts`

### Task 3.3: The invocation gate — B-018 (red first)

**Criterion:** `core-cli.init` Rule 18 — "`--help` prints usage and writes nothing"; "A mistyped
verb in a directory without .cortex/ is refused, not initialised"; "Bare `cortex` prints usage
and writes nothing"; "The explicit verb still initialises, with the verb stripped"
**Files:** `tests/atomic/core-cli/dispatch.test.ts` (create), `src/cli/cli.ts` (modify — the
fall-through block at the end of `run()`, today `// Otherwise argv is everything after cortex
init.` at line ~531, and the file-header docblock)
**Change:** Tests first, and **all four must fail before the fix** (today `--help`, `nonsense`
and bare `cortex` scaffold the temp cwd; `insihgt file src/x.ts` scaffolds `./file/`): call
`run([...])` from `src/cli/cli.ts` inside a `fs.mkdtempSync` cwd (`process.chdir`, restored in
`afterEach`) with `HOME` redirected via the `withHomeEnv` pattern in
`tests/atomic/core-cli/sync.test.ts`; capture stdout with a `console.log` spy; assert exit 2,
`fs.readdirSync(cwd)` empty, `$HOME/.claude/scheduled-tasks` absent, and the usage text's
first line naming the bad verb. Then in `cli.ts`: export `USAGE_VERBS: readonly string[]`
built from one constant that the header docblock quotes (add `why`, `recall`, `init`, `sync`,
`validate` … — every `argv[0]` the dispatcher matches) and `usageText(unrecognised?: string):
string`; replace the fall-through with three terminal branches in this order —
`argv[0] === 'init'` → parse `argv.slice(1)` exactly as the old block parsed `argv` (the
`--timeout-ms`/`--profile` positional filter now runs over the sliced array, so index 0 is a
real positional) and call `init(...)`; `argv.length === 0 || argv[0] === '--help' || argv[0]
=== '-h'` → `console.log(usageText())`, return 2; else → `console.log(usageText(argv[0]))`,
return 2. Nothing else in `run()` moves; batch 3's `why`/`recall` branches (Task 3.2) sit above
these. `tests/spec/core-cli/init.test.ts` cases that invoke `run([...])` with a leading `init`
stay green; any that relied on the accident (passing init flags with no `init` verb) are
corrected to pass `init` first.
**Verify:** `pnpm vitest run tests/atomic/core-cli/dispatch.test.ts tests/atomic/core-cli/init.test.ts tests/spec/core-cli/init.test.ts tests/spec/core-cli/init-profile.spec.test.ts`
**B-018 status:** this task is the fix. The bug file's `status: open` line is edited to `fixed`
(with a Resolution section naming this plan and the commit) by the **orchestrator at close-out
step 6**, not by this batch.

---

## Batch 4 — the generated index blocks (~45 min)

### Task 4.1: The block writer

**Criterion:** `recall.index-blocks` — "The block lists entries newest first with their
subjects"; "Hand-written text outside the markers survives"; "Over budget collapses to a count
line and validates clean"; "No entries, no block"; "A rerun writes nothing"
**Files:** `tests/atomic/recall/index-blocks.test.ts` (create), `src/recall/index-blocks.ts`
(create)
**Change:** Export `RECALL_BLOCK_START = (v: string) => \`<!-- cortex:recall:start v${v} -->\``,
`RECALL_BLOCK_END = '<!-- cortex:recall:end -->'`, `stripRecallBlock(content): string` (removes
the block and the one preceding blank line; used by sync), `renderRecallBlock(kind, index,
outsideText): string | null` (Rule 2 lines from inverting `index.subjects`; Rule 3 collapse
using `estimateTokens = (s) => s.split(/\s+/).length * 1.3` over `outsideText + block`; `null`
when no entry of `kind`), and `writeRecallIndexBlocks(root, index): { written: string[];
unchanged: string[]; skipped: string[] }` over `[['decision', 'atlas/decisions'], ['evidence',
'atlas/evidence']]`: skip when the directory or `_index.md` is missing; `outside =
stripRecallBlock(current)`; `next = block ? outside + '\n' + block + '\n' : outside`; write
only when `next !== current`. Tests build indexes with 2 and 40 decisions; the over-budget
case asserts `checkLayout`/`check.index-shape` yields no warning for the file.
**Verify:** `pnpm vitest run tests/atomic/recall/index-blocks.test.ts`

### Task 4.2: scan, init, and sync's opaque comparison

**Criterion:** `recall.index-blocks` — "scan and init write the blocks; the post-commit tier
does not"; "sync sees a blocked index as current"; `core-cli.init` — "Gitignore additions are
exact and idempotent" (stays green: a fresh project writes no block)
**Files:** `src/cli/cli.ts` (modify — `scan` block body only), `src/cli/init.ts` (modify — after
line 552), `src/cli/sync.ts` (modify — `refreshIndexes`), `tests/spec/recall/index-blocks.spec.test.ts`
(create), `tests/atomic/core-cli/sync.test.ts` (modify — one case)
**Change:** In `scan`: after `writeRecallIndex('.')` returns `recall`, `const { writeRecallIndexBlocks }
= await import('../recall/index-blocks.js'); const blocks = writeRecallIndexBlocks('.', recall);`
and append `; index blocks: ${blocks.written.length} written` to the summary line. In `init.ts`:
the same two lines after `writeRecallIndex(absRoot)` (capture its return). In `sync.ts`
`refreshIndexes`: compare `stripRecallBlock(bytes) === template`; when refreshing, write
`template` plus the previously present block (re-derive with `bytes.slice(bytes.indexOf(RECALL
start marker))` trimmed to the end marker) so the block survives. Do **not** touch
`src/insight/refresh-fast.ts`. The spec test runs `runInit`, writes two decisions and one
evidence file, calls the `scan` code path (`compile` + `writeRecallIndex` + `writeRecallIndexBlocks`),
asserts both blocks, then calls `runInsightRefreshFast` and asserts the blocks are unchanged.
**Verify:** `pnpm vitest run tests/spec/recall/index-blocks.spec.test.ts tests/atomic/core-cli/sync.test.ts tests/spec/core-cli/init.test.ts`

---

## Close-out (orchestrator, sequential)

1. `pnpm test` — the whole suite, authoritative.
2. `pnpm build`.
3. `cortex sync` in this repo — adds the `PreToolUse` `Grep|Bash` row to `.claude/settings.json`
   (expect the summary to name it; expect `atlas/decisions` and `atlas/evidence` indexes
   reported as current).
4. `cortex scan` — writes the recall index and both generated blocks; read
   `.cortex/atlas/decisions/_index.md` and confirm the block collapses (this repo has ten
   decisions) and the hand-written text is intact.
5. `cortex validate` — conformant; expect the two pre-existing `check.atlas` warnings on the
   2026-08-05 decision (Pedro's re-point is still pending) and no `check.index-shape` warning.
6. Update the three new specs to `status: implemented`, `hooks.pre-read-writeback` stays
   `implemented`; update `.specflow/specs/_index.md`'s recall step 3 line; move
   `.cortex/compass/bugs/B-018-unmatched-verb-falls-through-to-init.md` to `status: fixed` and
   fill its Resolution section (Task 3.3, this plan, the commit hash); commit with the RULES 19
   enumeration in the message.
7. After a few working sessions: `cortex usage --record` — the first `pointersFired` /
   `pointersFollowed` figures against `evidence.2026-09-15-usage` (0/0). That file, not this
   plan, decides whether `hooks.pre-read-writeback` Rule 6 widens to source-file path subjects.
