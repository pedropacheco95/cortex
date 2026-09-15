---
id: hooks.search-annotate
status: draft
depends_on:
  - core-cli.init
  - recall.recall-index
  - pulse.usage
  - schema.bears-on
governs:
  - "src/hooks/search-annotate.ts"
  - "src/recall/query.ts"
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
---

# Search-Time Annotation — `cortex hook search-annotate` (PreToolUse on Grep and Bash)

## Intent

A session that greps `.cortex/compass/` or `src/pulse/usage.ts` has already decided what it is
looking for; it just does not know that the project recorded a decision about it, measured it, or
left a question open. That is the moment the recall index (`recall.recall-index`) was compiled
for: the `PreToolUse` hook on `Grep` and `Bash` reads `.cortex/recall-index.json` — nothing else
— matches the search's target path and pattern tokens against the index's subjects and entry
keywords, and injects at most two **pointer lines**: names, dates, ids and paths, never a body and
never an instruction. Routing happens at the first search rather than at session start (the
2026-09-08 proposal's call: a session-start coverage map is paid on every session and read in
none; a pointer at the search is paid only when it can be followed). Precision beats recall
here: an unmatched search injects nothing, and a wrong pointer costs more trust than a missed one.
The measurement is `pulse.usage` Rule 11 (pointers fired and followed), which already exists at
0/0 so the number to beat is recorded.

## Entities

- **READS:** stdin (`tool_name`, `tool_input.pattern` and `tool_input.path` for `Grep`,
  `tool_input.command` for `Bash`, `cwd`, `session_id`); `.cortex/recall-index.json` (schema
  §4.11 — the only knowledge surface this hook opens); `cortex-schema.md` heading lines, only
  when the search target is the schema document (Rule 5e); `.cortex/pulse/state/recall-fired/
  <session-id>` (the per-session fired memory, Rule 9).
- **WRITES:** `.cortex/pulse/state/recall-fired/<session-id>` (append, transient);
  `pulse/reports/hook-errors.md` (unexpected exceptions only, Rule 10).
- **CREATES:** nothing durable. Never opens frontmatter, a rule file, a decision file, a thread
  or an observation — every fact it emits is already in the index.

## Rules

1. **Invocation.** Registered by `cortex init` and refreshed by `cortex sync` through the same
   `cortexHookEntries` table as the other hooks (`src/cli/scaffold.ts`): under `PreToolUse`,
   matcher `Grep|Bash`, `{"type": "command", "command": "cortex hook search-annotate"}`. Always
   registered — it is not behind `hooks.preRead` (that flag is the Read pair's), and
   `check.hook-config` (schema §5, Appendix A) requires the entry whenever the settings file
   carries **any** `cortex hook ` entry, exactly as it requires `SessionEnd` and `Stop`; the
   remedy named is `cortex sync`. The `cortex hook ` prefix is the ownership marker, as ever.

2. **Envelope.** On a match: exit 0 and stdout
   `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow",
   "additionalContext": "<lines>"}}` — the PreWrite envelope, schema §5. No match, or any
   Rule 10 condition: exit 0, **empty stdout**. Never `deny`, never `ask`, never a non-zero
   exit (RULES.md rule 6).

3. **What counts as a search.** For `tool_name: Grep`, the search is the `pattern` against
   `path` (absent `path` means the project root: no subject candidate, keyword match only).
   For `tool_name: Bash`, the command is classified with `pulse.usage` Rule 8's segment
   classifier — `stripQuotedSpans` then `searchTargetsIn`, exported from `src/pulse/usage.ts`
   — so only segments whose command word is `grep`/`egrep`/`fgrep`/`rg`/`find` **with a path
   operand** are searches; a pipe filter (`| grep x`) never fires, and a non-search command
   (`cat`, `ls`, `cortex …`) never fires. At most the first three search segments are
   considered. Any other `tool_name` → silent.

4. **Tokens.** Pattern text is: the `Grep` `pattern`; for `Bash`, the contents of the whole
   command's quoted spans plus, per search segment, its unquoted non-flag tokens other than the
   command word and the path operand. Tokens are the pattern text lowercased and split on every
   non-alphanumeric character, keeping tokens of **three or more** characters and dropping the
   fixed stop-list `STOP_TOKENS` (`the and for with from that this into not are was but`;
   an exported constant, quoted here so tests pin it). Regex metacharacters vanish in the split;
   a pattern that yields no token still gets the Rule 5 subject match. Separately, the raw
   pattern text is scanned for **ref-shaped** spans, which are matched verbatim and
   case-sensitively: `R-NNN`, `B-NNN`, `T-NNN`, `schema:§N[.M[.K]]`, `concept:<slug>`,
   `domain.<term>`, and a dotted spec id present as a subject or keyword.

5. **Subject match — the strong signal.** The search target path is normalised as
   `schema.bears-on` normalises path refs (POSIX separators, leading `./` stripped, trailing `/`
   stripped, made project-relative from `cwd`; a path outside the project yields no candidates)
   and expanded to candidate subject keys, checked against `subjects` in order:
   - (a) the path itself;
   - (b) each parent directory, walking up and stopping inclusively at `.cortex/<module>` for a
     path under `.cortex/`, at `.specflow/<tree>` for a path under `.specflow/`, and at the first
     segment otherwise (`src/pulse/usage.ts` → `src/pulse`, `src`);
   - (c) for a spec file under `.specflow/specs/` or `.specflow/specs-business/`, its id (schema
     §2.2: tree root and `.spec.md`/`.business.md` stripped, `/` → `.`);
   - (d) for `.cortex/compass/rules/R-NNN-*.md` → `R-NNN`; `.cortex/compass/bugs/B-NNN-*.md` →
     `B-NNN`; `.cortex/atlas/domain/<term>.md` → `domain.<term>`;
     `.cortex/insight/concepts/<slug>.md` or `.cortex/insight/scopes/*/concepts/<slug>.md` →
     `concept:<slug>`;
   - (e) for `cortex-schema.md`: every subject key of the form `schema:§…` whose clause number
     equals a Rule 4 token (`4.11`, `5`) or whose heading text (the schema's heading lines,
     read once per process with the §6.2 grammar — the only file besides the index this hook
     ever opens, and only for this target) contains a Rule 4 token.
   Every candidate that is a key of `subjects` is a subject match; a ref-shaped span from Rule 4
   that is a subject key is a subject match too. Matched subjects are ordered: the exact path
   first, then (c)/(d)/(e), then parents nearest-first.

6. **Keyword match — the weak signal.** An entry in `entries` qualifies when **two or more**
   distinct Rule 4 tokens occur in its `keywords`, or when **one** ref-shaped span from Rule 4
   occurs in them verbatim. Qualifying entries rank by distinct hits descending, then `date`
   descending, then id ascending. Keyword matches never outrank a subject match.

7. **Pointer-line grammar — exactly this, recorded once in schema §5.** Two line shapes, and
   nothing else is ever emitted (`pulse.usage` Rule 11 counts lines by these prefixes):
   - `Recall: <kind> <YYYY-MM-DD> <title cut to 60> (<path>)` — one entry of any kind
     (`decision`, `evidence`, `thread`, `observation`); `<path>` is the entry's project-relative
     path from the index.
   - `Decided: <decision id> · Open: <T-id> <thread key text cut to 40>` — a subject that has
     both a current decision and an open thread, newest of each.
   The last emitted line ends with ` · more: cortex why <ref>` when the leading subject has more
   members than the lines showed, `<ref>` being that subject key. Titles are cut on a word
   boundary with a trailing `…`. **No imperative** — no "read", "consult", "check", no second
   person: Claude Code already injects autonomy text (the 2026-09-02 Fable 5.1 audit), and a
   pointer that instructs is a pointer that gets learned as ignorable. **No body text** — the
   index carries none (`recall.recall-index` Rule 8), so none can leak.

8. **Selection — the fewest lines that carry the strongest match.** With subject matches, take
   the first matched subject (Rule 5 order): if it has both `decided` and `threads` → one
   `Decided:` line; otherwise one `Recall:` line for its strongest member, strength order **open
   thread > current decision > evidence > observation**, newest first within a kind. A second
   line is added only when it adds a different entry: the leading subject's next-strongest
   member, else the top Rule 6 keyword entry. Without subject matches: up to two `Recall:` lines
   from the top Rule 6 entries. An entry already named on line one is never repeated on line two.

9. **Once per session per subject.** A subject key or entry id already recorded in
   `.cortex/pulse/state/recall-fired/<session-id>` (newline-separated, keyed by the sanitised
   stdin `session_id`, the `hooks.pre-read-writeback` read-memory idiom) is not pointed at again
   in that session; the hook falls through to the next candidate or to silence. Keys are
   appended after emission; a failed write still emits (best-effort, like `pulse/` everywhere).
   Without a `session_id` the memory is skipped. This keeps a session that greps the same
   directory five times from seeing the same two lines five times — and keeps Rule 11's
   fired/followed ratio a measurement of pointers, not of repeats.

10. **Budget and fail-open.** At most **2 lines, ≤60 tokens** total by the project-wide chars/4
    estimate (RULES.md rule 11 records the figure). Over budget: titles shorten to 20 characters,
    then the second line is dropped, then the `more:` tail. Missing or empty stdin, no
    `.cortex/cortex.config.json`, a missing `.cortex/recall-index.json`, malformed JSON, an index
    failing the §4.11 shape, or a `cwd` outside any project → **empty stdout, exit 0, no log
    entry** (these are expected states, not failures). An unexpected exception → empty stdout,
    exit 0, one line appended to `pulse/reports/hook-errors.md`, like every other hook.

11. **Latency.** Target **50 ms** wall-clock: one JSON read (the index is small), no directory
    walk, no glob, no frontmatter parse, no subprocess, no network (RULES.md rule 6). The
    schema-heading read in Rule 5e is bounded by the document's line count and happens only for
    that one target. Scheduled `cortex-loop` sessions are not special here — prompt-side routing
    for them is step 4's.

12. **Shared query module.** The index loader with its per-process cache, the Rule 4 tokeniser,
    the Rule 5 candidate expansion, the Rule 6 matcher and the Rule 7 formatter live in
    `src/recall/query.ts` and are the same functions `hooks.pre-read-writeback` Rule 6,
    `recall.why` and `recall.index-blocks` call — one tokeniser, one grammar, four consumers.
    This spec owns their semantics; `recall.why` owns the verbs built on them.

13. **Deterministic Core** (R-001): string matching, set operations, JSON read. No LLM, no
    network, no subprocess. Two fires with identical stdin and index emit identical bytes.

## Acceptance Criteria

### A grep into a subject directory points at the newest current decision

- **Given** an index whose `subjects[".cortex/compass"]` is absent and
  `subjects["R-001"].decided` is `["decision.2026-07-07-five-module-architecture"]`, and a
  `Bash` stdin whose command is `grep -rn "hook" .cortex/compass/rules/R-001-core-no-llm-calls.md`
- **When** the hook runs
- **Then** stdout is the PreToolUse allow envelope whose `additionalContext` is exactly one
  line `Recall: decision 2026-07-07 Five-module architecture
  (.cortex/atlas/decisions/2026-07-07-five-module-architecture.md)`
- **And** the payload is under 60 tokens

### A subject with a decision and an open thread gets the Decided line

- **Given** `subjects[".specflow/specs/pulse/hygiene.spec.md"]` with `decided:
  ["decision.2026-07-10-x"]` and `threads: ["T-004"]`, `entries["T-004"].title` being
  `Do you want the counter in state/ or at the pulse root?`, and a `Grep` stdin with
  `path: ".specflow/specs/pulse/hygiene.spec.md"` and `pattern: "retention"`
- **When** the hook runs
- **Then** the first line is `Decided: decision.2026-07-10-x · Open: T-004 Do you want the
  counter in state/ or the…`

### A spec path matches by its id

- **Given** `subjects["pulse.usage"].evidence` is `["evidence.2026-09-15-usage"]` and no
  path-keyed subject, and a `Grep` with `path: ".specflow/specs/pulse/usage.spec.md"`
- **When** the hook runs
- **Then** the payload names `evidence.2026-09-15-usage` via a `Recall: evidence 2026-09-15 …`
  line

### A schema grep matches clause subjects by heading text

- **Given** `subjects["schema:§5"].evidence` is `["evidence.2026-09-15-usage"]`, a
  `cortex-schema.md` whose `## 5. Hook payload contracts` heading exists, and a `Bash` command
  `grep -n "payload" cortex-schema.md`
- **When** the hook runs
- **Then** one `Recall: evidence …` line is emitted; and given the pattern `"frontmatter"`
  instead, nothing is emitted

### A pipe filter never fires

- **Given** any non-empty index and a `Bash` command `cat .cortex/compass/_index.md | grep rules`
- **When** the hook runs
- **Then** stdout is empty and the exit code is 0

### Two keyword hits qualify an entry; one plain hit does not

- **Given** `entries["decision.2026-08-05-insight-pull-only-stance-reversed"].keywords`
  containing `insight`, `pull`, `stance`, and a `Grep` with `path: "src/"` and
  `pattern: "insight.*stance"`
- **When** the hook runs
- **Then** one `Recall: decision 2026-08-05 …` line is emitted; and given `pattern: "insight"`
  alone, nothing is emitted

### A ref-shaped token qualifies on one hit

- **Given** `entries["T-004"].keywords` containing `.specflow/specs/pulse/hygiene.spec.md` and
  `entries["evidence.2026-09-15-usage"].keywords` containing `schema:§5`, and a `Grep` with
  `path: "src/"` and `pattern: "schema:§5"`
- **When** the hook runs
- **Then** the evidence entry is pointed at and the thread is not

### Subject beats keyword, open thread beats older decision

- **Given** a subject `src/pulse/usage.ts` with `decided: ["decision.2026-07-01-a"]` and
  `threads: ["T-009"]`, a keyword-only entry `decision.2026-09-01-b` whose keywords match the
  pattern twice, and a `Grep` with `path: "src/pulse/usage.ts"`
- **When** the hook runs
- **Then** line one is the `Decided: decision.2026-07-01-a · Open: T-009 …` line and no line
  names `decision.2026-09-01-b` before it

### The more tail names the subject

- **Given** a subject `R-003` with three current decisions and one evidence file
- **When** a `Grep` with `path: ".cortex/compass/rules/R-003-x.md"` fires
- **Then** the last line ends with ` · more: cortex why R-003`

### Budget trims the title, then drops the second line

- **Given** two matched entries whose titles are 200 characters each
- **When** the hook runs
- **Then** the payload is at most two lines and at most 240 characters, the first line's title
  ends with `…`, and the `(<path>)` of line one is intact

### Once per session

- **Given** a `session_id` of `abc` and two consecutive fires with the same `Grep` stdin
- **When** the hook runs twice
- **Then** the first emits a pointer and the second emits nothing, and
  `.cortex/pulse/state/recall-fired/abc` lists the subject key

### Fail-open is silent and unlogged

- **Given** in turn: no stdin, a `.cortex/` without `recall-index.json`, an index file
  containing `{not json`, and an index whose `subjects` is a string
- **When** the hook runs for each
- **Then** every run exits 0 with empty stdout and `pulse/reports/hook-errors.md` is not created

### The imperative-free grammar

- **Given** any emitted payload across the criteria above
- **When** each line is checked
- **Then** every line begins `Recall: ` or `Decided: `, and none contains the tokens `read`,
  `consult`, `check`, `should`, `you`

### Registered with the set, required by the validator

- **Given** a fresh `cortex init --no-llm` and, separately, an existing `.claude/settings.json`
  carrying `cortex hook session-start` but no search-annotate entry
- **When** init runs, then `cortex validate` runs against the second project
- **Then** the first project's settings carry a `PreToolUse` entry with matcher `Grep|Bash` and
  command `cortex hook search-annotate` and validate clean; the second project's report carries
  one `check.hook-config` error naming `cortex hook search-annotate` and `cortex sync`

## Notes

- **Why Grep and Bash, not Read.** Searches are where a session declares what it does not know;
  reads are where it already found something. The Read side gets the lighter marker
  (`hooks.pre-read-writeback` Rule 6); the search side gets the pointer, because a pointer that
  arrives after the file was found is a pointer that arrived late.
- **Why a stop-list and a two-hit rule.** Entry keywords are title tokens, and titles share
  words. One shared word is not evidence of relevance; two are; a ref is. The stop-list is the
  smallest list that removes the words every title shares. Widening either is a spec edit.
- **Why the thread key text is not "content".** The `Decided:` line's thread fragment is the
  question that was left open — a name for a gap, not knowledge — and it is already the entry's
  `title` in the index. Business rule 2 ("a table of contents, not the book") holds.
- **Latency is a target, not a validator concern.** No check measures it; the atomic tests
  assert one `fs.readFileSync` of the index per fire and no directory reads, which is what
  keeps the target true.
- **Not done here:** no routing for scheduled sessions (step 4, prompt hook); no read-deferral
  `deny` (moot, per the proposal); no per-turn relevance guessing — the hook matches what the
  session is already searching, and only that.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
