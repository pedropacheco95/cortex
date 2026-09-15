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

- **READS:** stdin (`tool_input.file_path`, `cwd`, `session_id`); `.cortex/anatomy/files.md` (the row); cerebrum rules (`governs` match for `{{APPLICABLE_RULE_IDS}}`); `cortex.config.json` (`hooks.preRead`); a per-session read-memory (duplicate-read detection); `.cortex/recall-index.json` (Rule 6 — the recall marker; the only recall surface this hook opens).
- **WRITES:** `pulse/reports/hook-errors.md` (degradation only); the per-session read-memory (transient).
- **CREATES:** nothing durable.

## Rules

1. **Invocation.** Registered by init as `{"command": "cortex hook pre-read", "timeout": 10}` under `PreToolUse` matcher `Read`, **iff `hooks.preRead` is true (the default)** — one flag registers/removes the pair with `hooks.post-read` together (schema §5, §10.1). `cortex hook ` ownership marker as ever.
2. **Payload (schema §5, pinned).** Emitted only when the target path has a `files.md` row: the summary line, then the writeback instruction line — **included only when the row's `purpose_source` is not `read-time`** — then the duplicate-read note when applicable. Envelope: `additionalContext` JSON, exit 0. Budget <75 tokens with the instruction, <50 without.
3. **Silence is the common case:** no anatomy row, no `.cortex/`, or flag off → exit 0, empty stdout.
4. **Duplicate-read note** per design §5: the same path read again within a session appends `(already read this session)`.
5. **Warn-never-block conventions** as the other hooks: always exit 0; internal errors degrade to silence + `hook-errors.md`; pure deterministic Core (R-001).
6. **Recall marker (3.4 second revision; recall work, step 3).** When the Read target is a **spec file** (`.specflow/specs/**/*.spec.md`, `.specflow/specs-business/**/*.business.md`), a **compass rule** (`.cortex/compass/rules/R-NNN-*.md`), an **atlas decision or evidence file** (`.cortex/atlas/decisions/*.md`, `.cortex/atlas/evidence/*.md`), or **`cortex-schema.md`**, the hook looks the target up in `.cortex/recall-index.json` — and in nothing else — using `hooks.search-annotate` Rule 5's candidate keys (the path; the spec id; `R-NNN`; for the schema document every `schema:§…` subject, aggregated). When a subject is found, **one line** is appended to the payload (after the summary, invitation and duplicate note, or alone when the target has no insight entry — the usual case for these kinds): `Decided: <decision ids, max 3> · Evidence: <evidence ids, max 2> · Open: <T-ids, max 2>` — each part newest-first, an empty part omitted with its separator, and ` · more: cortex why <key>` appended when any part was cut. **≤50 tokens** for the line by the chars/4 estimate, enforced by dropping the `more:` tail, then cutting `Open:` to one id, then `Decided:` to one; ids are never truncated. No subject, no index, a malformed index, or any other target kind → no line, and the rest of the payload is exactly as Rules 2–4 make it (an absent index is an expected state, never logged). The line is a pointer in `hooks.search-annotate` Rule 7's grammar — no imperative, no body text — and `pulse.usage` Rule 11 counts it by its `Decided:` prefix. Budget across the whole payload: the RULES.md rule 11 PreRead figure is **extended, not pooled anew** — summary <50, plus at most 50 for this line, combined ceiling **100** (125 with the writeback invitation). Source files are deliberately *not* marked in this step, even when a `bears_on` path ref names them: the everyday `src/` read path stays at its current cost until the follow rate of the search-time pointer is measured (Notes).

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

### The marker rides after the summary within the combined ceiling

- **Given** `src/a.ts` has an insight entry **and** (for this test only) a path subject `src/a.ts` with one decision
- **When** the hook fires
- **Then** the payload is the summary, the invitation, then no marker — source files are not marked (Rule 6) — and is under 75 tokens; and given instead a spec file with both a (fixture) insight entry and a subject, the payload is the summary then the `Decided:` line, under 100 tokens

### No index, no marker, nothing logged

- **Given** a spec file target and no `.cortex/recall-index.json`
- **When** the hook fires
- **Then** stdout is empty (no insight entry either) and `pulse/reports/hook-errors.md` is not created

## Notes

- The invitation's wording ("wrong or stale after reading") is the first draft of a real prompt-engineering surface — expect a B-00N refining it once dogfooding surfaces false-positive/negative rates (Pedro, at gate review).
- **Also supports** (Rule 6, added 2026-09-15): `scaffolding.assistant-reaches-for-cortex-instead-of-guessing` — the recall marker is one of the four step-3 consumers of the recall index. `implements:` stays single-valued on the anatomy outcome (RULES.md rule 10); the business spec's Notes name this spec.
- **Why source files are not marked yet.** A `bears_on` path ref on `src/pulse/usage.ts` is exactly the precise case the marker exists for, and the search-time hook already covers it on the Grep/Bash side. Marking reads of source files would put a line on the hottest read path before the pointer follow rate (`pulse.usage` Rule 11) has a single measured value; the first `cortex usage --record` after step 3 ships is the evidence that decides whether to widen Rule 6 to path subjects (one rule edit, no schema change).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
