---
id: hooks.pre-read-writeback
status: implemented
depends_on:
  - core-cli.init
  - anatomy.scanner
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

- **READS:** stdin (`tool_input.file_path`, `cwd`, `session_id`); `.cortex/anatomy/files.md` (the row); cerebrum rules (`governs` match for `{{APPLICABLE_RULE_IDS}}`); `cortex.config.json` (`hooks.preRead`); a per-session read-memory (duplicate-read detection).
- **WRITES:** `pulse/hook-errors.md` (degradation only); the per-session read-memory (transient).
- **CREATES:** nothing durable.

## Rules

1. **Invocation.** Registered by init as `{"command": "cortex hook pre-read", "timeout": 10}` under `PreToolUse` matcher `Read`, **iff `hooks.preRead` is true (the default)** — one flag registers/removes the pair with `hooks.post-read` together (schema §5, §10.1). `cortex hook ` ownership marker as ever.
2. **Payload (schema §5, pinned).** Emitted only when the target path has a `files.md` row: the summary line, then the writeback instruction line — **included only when the row's `purpose_source` is not `read-time`** — then the duplicate-read note when applicable. Envelope: `additionalContext` JSON, exit 0. Budget <75 tokens with the instruction, <50 without.
3. **Silence is the common case:** no anatomy row, no `.cortex/`, or flag off → exit 0, empty stdout.
4. **Duplicate-read note** per design §5: the same path read again within a session appends `(already read this session)`.
5. **Warn-never-block conventions** as the other hooks: always exit 0; internal errors degrade to silence + `hook-errors.md`; pure deterministic Core (R-001).

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

## Notes

- The invitation's wording ("wrong or stale after reading") is the first draft of a real prompt-engineering surface — expect a B-00N refining it once dogfooding surfaces false-positive/negative rates (Pedro, at gate review).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
