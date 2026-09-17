---
id: hooks.pre-read-writeback
status: implemented
depends_on:
  - core-cli.init
  - anatomy.scanner
  - recall.recall-index
  - hooks.search-annotate
governs:
  - "src/hooks/pre-read.ts"
implements: ../../specs-business/anatomy/assistant-refines-the-map-while-working.business.md
governed_by:
  - R-001
---

# PreRead Hook with Writeback Invitation

## Intent

The PreRead hook (design §5, now core opt-out) injects the anatomy summary before a file read — purpose, tokens, specs, rules — plus the one-line writeback invitation that makes it the priming half of refine-during-use: if the purpose proves wrong or stale, the session emits a `<cortex:purpose>` tag that `hooks.post-read` captures. Injection primes; capture happens downstream.

## Entities

- **READS:** stdin (`tool_input.file_path`, `cwd`, `session_id`; Rule 7 also `transcript_path`); `.cortex/anatomy/files.md` (the row); cerebrum rules (`governs` match for `{{APPLICABLE_RULE_IDS}}`); `cortex.config.json` (`hooks.preRead`; Rule 7 `hooks.readDefer`); a per-session read-memory (duplicate-read detection); `.cortex/recall-index.json` (Rule 6 — the recall marker; the only recall surface this hook opens); Rule 7 only: the insight entry's `size_lines` and `## Connections` section, the per-session deferral ledger `pulse/state/read-deferred/<session-id>`, and the first `"type":"user"` line of the transcript at `transcript_path` (scheduled-session detection). Rule 8: the target file's current body, hashed against the entry's `source_sha256` (never parsed, never injected).
- **WRITES:** `pulse/reports/hook-errors.md` (degradation only); the per-session read-memory (transient); Rule 7: `pulse/state/read-deferred/<session-id>` (append, transient — written **before** the deny).
- **CREATES:** nothing durable.

## Rules

1. **Invocation.** Registered by init as `{"command": "cortex hook pre-read", "timeout": 10}` under `PreToolUse` matcher `Read`, **iff `hooks.preRead` is true (the default)** — one flag registers/removes the pair with `hooks.post-read` together (schema §5, §10.1). `cortex hook ` ownership marker as ever.
2. **Payload (schema §5, pinned).** Emitted only when the target path has a `files.md` row: the summary line, then the writeback instruction line — **included only when the row's `purpose_source` is not `read-time`** — then the duplicate-read note when applicable. Envelope: `additionalContext` JSON, exit 0. Budget <75 tokens with the instruction, <50 without. When the entry is **stale** (Rule 8) the summary line ends with ` (stale: built at <commit>)`, inside the same budget.
3. **Silence is the common case:** no anatomy row, no `.cortex/`, or flag off → exit 0, empty stdout.
4. **Duplicate-read note** per design §5: the same path read again within a session appends `(already read this session)`.
5. **Warn-never-block conventions** as the other hooks: always exit 0; internal errors degrade to silence + `hook-errors.md`; pure deterministic Core (R-001).
6. **Recall marker (3.4 second revision; recall work, step 3).** When the Read target is a **spec file** (`.specflow/specs/**/*.spec.md`, `.specflow/specs-business/**/*.business.md`), a **compass rule** (`.cortex/compass/rules/R-NNN-*.md`), an **atlas decision or evidence file** (`.cortex/atlas/decisions/*.md`, `.cortex/atlas/evidence/*.md`), or **`cortex-schema.md`**, the hook looks the target up in `.cortex/recall-index.json` — and in nothing else — using `hooks.search-annotate` Rule 5's candidate keys (the path; the spec id; `R-NNN`; for the schema document every `schema:§…` subject, aggregated). When a subject is found, **one line** is appended to the payload (after the summary, invitation and duplicate note, or alone when the target has no insight entry — the usual case for these kinds): `Decided: <decision ids, max 3> · Evidence: <evidence ids, max 2> · Open: <T-ids, max 2>` — each part newest-first, an empty part omitted with its separator, and ` · more: cortex why <key>` appended when any part was cut. **≤50 tokens** for the line by the chars/4 estimate, enforced by dropping the `more:` tail, then cutting `Open:` to one id, then `Decided:` to one; ids are never truncated. No subject, no index, a malformed index, or any other target kind → no line, and the rest of the payload is exactly as Rules 2–4 make it (an absent index is an expected state, never logged). The line is a pointer in `hooks.search-annotate` Rule 7's grammar — no imperative, no body text — and `pulse.usage` Rule 11 counts it by its `Decided:` prefix. Budget across the whole payload: the RULES.md rule 11 PreRead figure is **extended, not pooled anew** — summary <50, plus at most 50 for this line, combined ceiling **100** (125 with the writeback invitation). Source files are deliberately *not* marked in this step, even when a `bears_on` path ref names them: the everyday `src/` read path stays at its current cost until the follow rate of the search-time pointer is measured (Notes). **Bugs part (3.4 fifth revision; brief §3.2).** The marker gains a fourth part, last: ` · Bugs: <B-ids, max 2>` — the subject's `bugs` list (`recall.recall-index` Rule 17: `open` or `triaged` bugs whose `affects` names the read target), newest `opened` first, omitted when empty, and `pulse.usage` Rule 11 counts a marker that begins with it. Budget enforcement order becomes: drop the `more:` tail, cut `Open:` to one id, cut `Decided:` to one, cut `Bugs:` to one — the bug part is cut last because it is the part most likely to be acted on. **One narrow widening of the source-file exclusion:** a Read of a source file (any path that is not a marked kind above) whose subject has a non-empty `bugs` list gets a marker consisting of the `Bugs:` part **alone** (`Bugs: B-019 · more: cortex why src/schema/checks/xref.ts` when cut); its `decided`, `evidence` and `threads` are still not shown — what is known-broken about the file in front of a session is the fact the brief's four sessions each rediscovered, and it rides only when it exists, so the everyday `src/` read still costs nothing. The line still fits the 50-token pool and the 100/125 combined ceiling.
7. **Read deferral — the one measured exception to warn-never-block (3.4 third revision; recall work, step 4; `hooks.readDefer`, default off).** RULES.md rule 6 carves out exactly this rule: when every condition below holds, the hook returns the **deny** envelope `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "<reason>"}}`, exit 0 — Claude Code does not run the Read and shows the reason to the assistant in its place. It ships **for measurement only** (the 2026-09-02 Fable 5.1 audit found stop-and-wait gates reduce quality; the question this answers is whether the map's summary ever replaces a read — `pulse.usage` Rule 13, "Read deferrals"). The conditions, checked cheapest first, **all** required:
   (a) `cortex.config.json` `hooks.readDefer` is boolean `true` (schema §10.1; absent, `false`, or any non-boolean → this rule is off and Rules 2–6 apply unchanged);
   (b) stdin carries a non-empty `session_id` (no id → no ledger → the retry guarantee below cannot be kept → never defer);
   (c) the target is a **deferrable kind**: it is *not* a Rule 6 marked target, not under `.cortex/` or `.specflow/`, not `RULES.md`, `CLAUDE.md` or `cortex-schema.md`, and not an `_index.md` or `_overview.md` — gated and scaffolding files are read for exactness and are never deferred;
   (d) the target has an insight per-file entry (`fileQuery`) with a non-empty `## Purpose` first line **and** a frontmatter `size_lines` of at least `READ_DEFER_MIN_LINES` (40) — a tiny file is cheaper to read than to describe; a missing `size_lines` counts as tiny;
   (e) the path is in **neither** the Rule 4 read-memory `pulse/state/reads/<session-id>` **nor** the deferral ledger `pulse/state/read-deferred/<session-id>` — one deferral per session per file;
   (f) the deferral ledger holds fewer than `READ_DEFER_CIRCUIT_BREAKER` (25) lines — the circuit breaker: a session that has been held 25 times is never held again;
   (g) the session is **interactive**: stdin `transcript_path` names a readable file whose first line containing `"type":"user"` (scanned within the first 256 KiB, the `hooks.session-end` Rule 5b idiom) parses to a user message that is not scheduled per `pulse.distil` Rule 11 (`Base directory for this skill:` prefix or `<scheduled-task`); a missing or unreadable transcript, or no user line yet, is *unknown* and **does not defer**.
   **Order of effects.** The path is appended to `pulse/state/read-deferred/<session-id>` (`mkdir -p`) **before** the deny is emitted; if that append fails, the hook does **not** deny and falls through to Rules 2–6 (a retry that could not be recognised would be a second deny — the one thing this rule forbids). The Rule 4 read-memory is **not** written on a deferral: the file was not read. The retry therefore arrives with the path in the deferral ledger only, passes (e), gets the ordinary Rule 2 payload **without** the `(already read this session)` note, and is then recorded in the read-memory as any first read is; a third read gets the note.
   **The reason, pinned line by line, ≤250 tokens (1,000 characters by the chars/4 estimate):**
   ```
   Deferred: {{PATH}} (~{{TOKENS}} tok, {{LINES}} lines). {{PURPOSE}}
   Connections: {{CONNECTIONS}}
   Rules: {{APPLICABLE_RULE_IDS}}.
   Reading this path again proceeds without this notice.
   ```
   `{{PURPOSE}}` is the entry's Purpose first line (Rule 2's field) — followed, when the entry is stale (Rule 8), by the same ` (stale: built at <commit>)` marker the summary line carries; `{{CONNECTIONS}}` is the entry's `## Connections` section reduced to its `Uses:` and `Used by:` bullets, each rendered as `<path>: <symbols>` with the bullet's explanatory tail after the ` — ` dropped, at most six, joined by `; `, or `-` when the section is absent; the rules list renders `-` when empty (as Rule 2). Budget enforcement drops Connections bullets from the end, then trims the purpose — never the first line's `Deferred: {{PATH}}`, never its stale marker, and never the closing sentence, which is the retry contract. The recall marker (Rule 6) never rides on a deny (source files are not marked); the writeback invitation never rides (nothing was read to correct). The first-line prefix `Deferred: ` is what `pulse.usage` Rule 13 counts.
   **Never:** in a scheduled session; for a gated kind; when the flag is absent; twice for one path in one session; past 25 deferrals in a session; when any ledger cannot be written; when anything throws (an exception anywhere in this rule degrades to the Rules 2–6 payload plus one `hook-errors.md` entry, never to a deny and never to a non-zero exit). Registration is unchanged — this mode lives inside the existing `cortex hook pre-read` entry, so `hooks.readDefer: true` with `hooks.preRead: false` has no effect (`check.config` warns, schema §10.1).
8. **Stale marker (parallel-wave brief §3.1; 2026-09-17).** An entry is **stale** when its `source_sha256` (schema §4.10.2) does not equal the sha256 of the target file's current body — `insight.cli` Rule 9's comparison, shared with it (`entryStaleness` in `src/insight/query.ts`), made in-process against the file the Read is about to open, never via git and never via `ledger.json`. When it is, the summary line (Rule 2) ends with ` (stale: built at <commit>)` and, in the deferral mode (Rule 7), the reason's first line ends with the same marker after the purpose — the Purpose the assistant is shown may describe a file that has since changed, and the marker is what lets it weigh that. `<commit>` is the entry's `built_at_commit` cut to its first seven characters. **Budget:** the marker rides inside the existing ceilings, not beside them. It is the tail of the summary line — after the `… tok). Rules: ….` sentence, so every existing pin on that sentence and `pulse.usage`'s prefixes still hold — and counts toward Rule 2's 50/75-token figure, Rule 6's combined 100/125 figure and Rule 7's 1,000 characters; each rule's budget enforcement trims the purpose (Rule 7: Connections first) to make room, and the marker itself — at most 31 characters, about 8 tokens — is never cut. **Never:** on a fresh entry; on the recall marker standing alone (no entry, nothing to be stale); when the target cannot be read or hashed — fail-open: no marker, no `hook-errors.md` entry, the payload exactly as Rules 2–7 make it. The marker is a parenthetical on an existing line, never a new line and never an imperative (schema §5 pointer conventions).

## Acceptance Criteria

### Summary plus invitation on a first read

- **Given** a row for `src/a.ts` with purpose "Does A.", `purpose_source: scanner-llm`, tokens 120, one spec link, one governing rule
- **When** the hook receives a Read for it
- **Then** `additionalContext` carries path, purpose, ~120 tok, the spec id, the rule id, and the `<cortex:purpose file="src/a.ts">` instruction line
- **And** the estimate is under 75 tokens

### read-time provenance suppresses the invitation

- **Given** the row's `purpose_source` is `read-time`
- **When** the hook fires
- **Then** the summary is injected without the writeback instruction, under 50 tokens

### Unindexed file is silent

- **Given** a path with no row
- **Then** exit 0, empty stdout

### Duplicate read is noted

- **Given** a second Read of the same path in one session
- **Then** the payload ends with the already-read note

### Flag off → hook not registered

- **Given** a fresh init with `hooks.preRead: false`
- **Then** `.claude/settings.json` carries neither pre-read nor post-read entries, and `check.hook-config` passes

### A spec read with a recall subject gets the marker alone

- **Given** no insight entry for `.specflow/specs/pulse/usage.spec.md`, and an index whose `subjects["pulse.usage"]` has `decided: []`, `evidence: ["evidence.2026-09-15-usage"]`, `threads: ["T-004"]`
- **When** the hook receives a Read for that spec file
- **Then** `additionalContext` is exactly `Evidence: evidence.2026-09-15-usage · Open: T-004` and the estimate is under 50 tokens

### A rule read with three of everything is cut and pointed onward

- **Given** `subjects["R-003"]` with four current decisions, three evidence ids and three open threads
- **When** the hook receives a Read for `.cortex/compass/rules/R-003-x.md`
- **Then** the marker line names three decisions, two evidence ids and two threads, newest first, and ends with ` · more: cortex why R-003`

### The schema document aggregates its clause subjects

- **Given** `subjects["schema:§5"].decided` is `["decision.2026-08-05-x"]` and `subjects["schema:§4.11"].threads` is `["T-010"]`
- **When** the hook receives a Read for `cortex-schema.md`
- **Then** the marker line is `Decided: decision.2026-08-05-x · Open: T-010`

### An open bug rides the marker last, and alone on a source file

- **Given** `subjects["schema.validator"]` with `decided: ["decision.2026-07-07-a"]` and
  `bugs: ["B-019"]`, and `subjects["src/schema/checks/xref.ts"]` with
  `decided: ["decision.2026-07-07-a"]`, `bugs: ["B-019"]`, and `src/schema/checks/xref.ts`
  having an insight entry
- **When** the hook receives a Read for `.specflow/specs/schema/validator.spec.md`, then one for
  `src/schema/checks/xref.ts`
- **Then** the first payload's marker is `Decided: decision.2026-07-07-a · Bugs: B-019`; the
  second payload is the summary, the invitation, then the line `Bugs: B-019` — no `Decided:`
  part — and is under 100 tokens; and given the bug's status changed to `resolved` and the
  index recompiled, the second payload carries no marker at all

### The marker rides after the summary within the combined ceiling

- **Given** `src/a.ts` has an insight entry **and** (for this test only) a path subject `src/a.ts` with one decision
- **When** the hook fires
- **Then** the payload is the summary, the invitation, then no marker — source files are not marked (Rule 6) — and is under 75 tokens; and given instead a spec file with both a (fixture) insight entry and a subject, the payload is the summary then the `Decided:` line, under 100 tokens

### No index, no marker, nothing logged

- **Given** a spec file target and no `.cortex/recall-index.json`
- **When** the hook fires
- **Then** stdout is empty (no insight entry either) and `pulse/reports/hook-errors.md` is not created

### Flag absent or off → never a deny

- **Given** `src/a.ts` with an insight entry (`size_lines: 235`, a Purpose, a Connections section), a `session_id` `s1`, an interactive transcript, and `cortex.config.json` whose `hooks` block, in turn, omits `readDefer`, sets it `false`, and sets it `"yes"`
- **When** the hook receives a first Read for it under each config
- **Then** every run emits the Rule 2 payload with `permissionDecision: allow`, no `pulse/state/read-deferred/` directory is created, and the estimate is under 75 tokens

### Flag on: the first read of a source file is deferred, with the summary in its place

- **Given** the same `src/a.ts` and `hooks.readDefer: true`
- **When** the hook receives the first Read for it in session `s1`
- **Then** stdout is the `PreToolUse` envelope with `permissionDecision: deny` and a `permissionDecisionReason` whose first line is `Deferred: src/a.ts (~2532 tok, 235 lines). <Purpose first line>`, whose second line starts `Connections: ` and names at most six `<path>: <symbols>` items, whose third line starts `Rules: `, whose last line is exactly `Reading this path again proceeds without this notice.`, and which is at most 1,000 characters; `pulse/state/read-deferred/s1` lists `src/a.ts` and `pulse/state/reads/s1` does not exist

### The retry proceeds with the ordinary payload, and the third read is the duplicate

- **Given** the deferral above has happened
- **When** the hook receives a second Read of `src/a.ts` in `s1`, then a third
- **Then** the second emits `permissionDecision: allow` with the summary and the invitation and **no** `(already read this session)` note, and `pulse/state/reads/s1` now lists `src/a.ts`; the third emits the note

### Gated and scaffolding kinds are never deferred

- **Given** `hooks.readDefer: true` and (fixture) insight entries with `size_lines: 300` for `.specflow/specs/pulse/usage.spec.md`, `.cortex/compass/rules/R-001-core-no-llm-calls.md`, `cortex-schema.md`, `RULES.md`, and `src/hooks/_index.md`
- **When** the hook receives a first Read of each
- **Then** no run emits `deny`; each payload is exactly what Rules 2–6 produce for that target

### A tiny file, or one without an entry, is never deferred

- **Given** `hooks.readDefer: true`, `src/tiny.ts` with an entry whose `size_lines` is `39`, `src/nolines.ts` with an entry lacking `size_lines`, and `src/none.ts` with no entry
- **When** the hook receives a first Read of each
- **Then** the first two emit the Rule 2 `allow` payload and the third emits empty stdout; the deferral ledger is not created

### The circuit breaker holds at 25

- **Given** `hooks.readDefer: true` and `pulse/state/read-deferred/s1` holding 25 distinct paths
- **When** the hook receives a first Read of a 26th eligible source file
- **Then** the payload is the Rule 2 `allow` payload and the ledger still holds 25 lines

### Scheduled and unknown sessions are never deferred

- **Given** `hooks.readDefer: true` and an eligible file, with stdin `transcript_path` pointing, in turn, at a transcript whose first user line starts `Base directory for this skill:`, at one whose first user line contains `<scheduled-task`, at a path that does not exist, and absent from stdin
- **When** the hook receives a first Read under each
- **Then** every run emits the Rule 2 `allow` payload and no deferral ledger is written

### An unwritable ledger means allow, once logged

- **Given** `hooks.readDefer: true`, an eligible file, and `pulse/state/read-deferred/s1` present as a **directory**
- **When** the hook receives a first Read
- **Then** the payload is the Rule 2 `allow` payload, exactly one `pulse/reports/hook-errors.md` entry names `pre-read` and the ledger path, and the exit code is 0

### The deny never leaks into any other decision

- **Given** any run across the criteria above
- **Then** the JSON never contains `"ask"` or `updatedInput`, the exit code is always 0, and `deny` appears only in the runs the deferral criteria name

### A stale entry is marked on the summary line within the ceiling

- **Given** `src/a.ts` with an entry whose `source_sha256` is not the hash of the current `src/a.ts` body, `built_at_commit: 9f2c1ab0deadbeef`, purpose "Does A.", tokens 120, no governing rule
- **When** the hook receives a first Read for it
- **Then** the payload's first line is exactly `src/a.ts: Does A. (~120 tok). Rules: -. (stale: built at 9f2c1ab)`, the invitation line follows unchanged, and the estimate is under 75 tokens
- **And** given instead an entry whose `source_sha256` is the hash of the body, the first line is `src/a.ts: Does A. (~120 tok). Rules: -.` with no marker

### A stale entry is marked on the deferral reason's first line

- **Given** `hooks.readDefer: true`, session `s1`, an interactive transcript, and the stale `src/a.ts` entry above with `size_lines: 235`, `size_tokens: 2532`, a 600-character purpose and a Connections section of eight `Uses:` bullets
- **When** the hook receives the first Read for it
- **Then** the deny reason's first line is `Deferred: src/a.ts (~2532 tok, 235 lines). <the purpose, trimmed with … if needed> (stale: built at 9f2c1ab)`, its last line is still `Reading this path again proceeds without this notice.`, and the whole reason is at most 1,000 characters

### An unreadable target is never marked and never logged

- **Given** the stale entry above and a `src/a.ts` that is a directory
- **When** the hook receives a Read for it
- **Then** the payload is exactly what Rules 2–6 produce with no marker, and `pulse/reports/hook-errors.md` is not created

## Notes

- The invitation's wording ("wrong or stale after reading") is the first draft of a real prompt-engineering surface — expect a B-00N refining it once dogfooding surfaces false-positive/negative rates (Pedro, at gate review).
- **Also supports** (Rule 6, added 2026-09-15): `scaffolding.assistant-reaches-for-cortex-instead-of-guessing` — the recall marker is one of the four step-3 consumers of the recall index. `implements:` stays single-valued on the anatomy outcome (RULES.md rule 10); the business spec's Notes name this spec.
- **Why source files are not marked yet.** A `bears_on` path ref on `src/pulse/usage.ts` is exactly the precise case the marker exists for, and the search-time hook already covers it on the Grep/Bash side. Marking reads of source files would put a line on the hottest read path before the pointer follow rate (`pulse.usage` Rule 11) has a single measured value; the first `cortex usage --record` after step 3 ships is the evidence that decides whether to widen Rule 6 to path subjects (one rule edit, no schema change).
- **Rule 7 also supports** `scaffolding.assistant-reaches-for-cortex-instead-of-guessing` (added 2026-09-16): the read-deferral gate is the measurement behind that outcome's amended business rule 6 and its "deferral proceed-rate" metric. `implements:` stays single-valued on the anatomy outcome (RULES.md rule 10); the scaffolding spec's Notes name this rule.
- **Why a sibling ledger, not the read-memory.** The brief was "write the marker before the deny so a retry passes". Writing the *read-memory* would make the retry's payload say `(already read this session)` about a file that was never read — a false claim to the assistant (business rule 4). The deferral ledger under `pulse/state/read-deferred/` is the marker instead: it gives the retry guarantee, it is the circuit breaker's counter, and it keeps Rule 4's note truthful. Both ledgers are transient `pulse/state/` files; `pulse.hygiene`'s 14-day reads retention should extend to `read-deferred/` and `recall-fired/` (OPEN — a one-rule hygiene amendment, not made here).
- **Why deny, and why default off.** Pedro approved the carve-out in August (one deferral per session per file, marker before the deny, fail-open, circuit breaker, default off). The Fable 5.1 audit then found that gates which stop and wait reduce quality, so the mode ships as an **instrument**: `hooks.readDefer` is written `false` by init, stays `false` in this repo, and is turned on for one measured week only after a baseline `cortex usage --record`. The number that decides its fate is `pulse.usage` Rule 13's proceed-rate: if the assistant reads anyway almost every time, the summary did not replace the read and the gate should stay off for good.
- **Where the reason lands (externally owned).** Claude Code shows a `deny`'s `permissionDecisionReason` to the assistant and records the blocked call's `tool_result` as an error carrying that text; `pulse.usage` Rule 13 assumes the reason is findable in the transcript as a `tool_result` text block **or** a `hook_additional_context` attachment and scans both. If Claude Code changes the shape, the `deferred` count drops to zero while the ledger still fills — the discrepancy is the signal to re-observe, not a reason to widen the scan.
- **Why a parenthetical on the summary line (Rule 8, 2026-09-17).** The brief's ask was that inferred knowledge say "as of when"; on the hottest read path the cheapest true answer is "may be wrong, built at X" appended to the line the assistant already reads — never a second line (RULES.md rule 11) and never a `Decided:`-shaped pointer (`pulse.usage` counts those). In this repo on 2026-09-16, 24 of 83 entries were stale by this comparison, so the marker will fire often until the daily tier catches up — that is the point. The hook hashes the file it is about to let Claude read: one extra read of a file that is being read anyway, inside the same 10 s timeout, fail-open. Plan: `plans/2026-09-17-wave-a.md`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
