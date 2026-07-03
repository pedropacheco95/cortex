---
id: hooks.post-read
status: implemented
depends_on:
  - core-cli.init
  - anatomy.scanner
  - hooks.pre-read-writeback
governs:
  - "src/hooks/post-read.ts"
implements: ../../specs-business/anatomy/assistant-refines-the-map-while-working.business.md
governed_by:
  - R-001
---

# PostRead Hook — Writeback Capture

## Intent

The PostRead hook is the capture half of refine-during-use (design §5): after a Read it silently sweeps the session transcript for `<cortex:purpose>` tags the session emitted in response to PreRead's invitation, validates them, and writes the corrected purposes into anatomy as `purpose_source: read-time` — the top of the trust ordering.

## Entities

- **READS:** stdin (`transcript_path`, `cwd`); the transcript's recent assistant messages; `.cortex/anatomy/files.md`; `pulse/.readback-applied` (applied-tag memory).
- **WRITES:** `.cortex/anatomy/files.md` (matched rows); `pulse/.readback-applied`; `pulse/hook-errors.md` (degradation only).
- **CREATES:** nothing else.

## Rules

1. **Invocation.** Registered by init under `PostToolUse` matcher `Read` as `cortex hook post-read`, paired with pre-read under the one `hooks.preRead` flag (schema §5, §10.1).
2. **Always silent.** Exit 0, empty stdout, every case — the PostWrite envelope discipline.
3. **Sweep.** Parse `<cortex:purpose file="...">...</cortex:purpose>` tags from the transcript's recent assistant messages (bounded tail — engineering-call constant, footer of the module). Tags already in `pulse/.readback-applied` (hashed) are skipped.
4. **Validation.** The `file` attribute must have a `files.md` row (project-relative after normalisation); the payload must be non-empty, single-line, sanitized to the row grammar, ≤120 chars — **a writeback-specific ceiling, not an anatomy-wide purpose limit** (schema §5; existing purposes are untouched by it). Invalid tags are recorded to `hook-errors.md` and remembered as processed (no retry storms).
5. **Apply.** Purpose + `purpose_source: read-time` + `last_seen` in one atomic row write (the coordination pin); `needs_purpose_refresh` cleared. `read-time` sits atop the trust ordering, so the write is always permitted; bulk tiers may not overwrite it until the file's content changes (schema §4.1 — enforced by those tiers, asserted here).
6. **Applied-tag memory is transient and per-session** (schema §5): it exists only to avoid redundant writes within a session; it carries no cross-session guarantee, because re-applying an identical tag is idempotent. No persistence machinery.
7. **Degradation.** Unreadable transcript, corrupt anatomy → no write, `hook-errors.md` entry, exit 0. Deterministic Core (R-001) — the hook never calls an LLM; it captures what the session already said.

## Acceptance Criteria

### Tag captured and applied with provenance

- **Given** a transcript whose last assistant message contains `<cortex:purpose file="src/a.ts">Parses anatomy rows.</cortex:purpose>` and a flagged row for `src/a.ts`
- **When** the hook fires after a Read
- **Then** the row's purpose is "Parses anatomy rows.", `purpose_source` is `read-time`, `needs_purpose_refresh` is `false`, `last_seen` fresh — one atomic row write
- **And** stdout is empty, exit 0

### Same tag not applied twice in a session

- **Given** the tag was applied and recorded in `.readback-applied`
- **When** a later Read fires the hook
- **Then** `files.md` is byte-identical

### Invalid tags rejected without noise

- **Given** tags with an unknown `file`, a multi-line payload, and a 300-char payload
- **When** the hook fires
- **Then** no row changes, each is recorded to `hook-errors.md` once, and none is retried on the next fire

### Deep tier respects the trust ordering (cross-tier regression)

- **Given** a row with `purpose_source: read-time` and `needs_purpose_refresh: false`
- **When** the deep tier's apply runs with a result for that path
- **Then** the row is untouched (lower-trust writer, unchanged content)

### No tags → no writes

- **Given** a transcript with no tags
- **Then** exit 0, nothing written anywhere

### Transcript unavailable degrades silently

- **Given** a missing `transcript_path`
- **Then** exit 0, empty stdout, one `hook-errors.md` entry

## Notes

- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
