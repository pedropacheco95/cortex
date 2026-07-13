---
path: src/hooks/pre-read.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 3
size_lines: 235
size_tokens: 2532
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "14660ea482e28282e8f18d313f5b7b31f7a5414e7371e4585eb285120878d60a"
---
# src/hooks/pre-read.ts

## Purpose
The PreToolUse Read hook — before a file read, injects a one-line summary sourced from the target's insight per-file entry (first line of `## Purpose`, `size_tokens`, applicable compass rule ids) plus a writeback-invitation instruction (unless the entry already carries a read-time provenance marker) and a duplicate-read note via per-session read-memory. Silent whenever there's no `.cortex/`, the `hooks.preRead` flag is off, or the target has no insight entry — extraction owns entry creation, this hook never fabricates one.

## Main players
- `run` (lines 125–235) — orchestrates the full flow: config/flag gating, insight lookup via `fileQuery`, invite/duplicate-read logic, and budget-truncated payload composition. [critical]
- `readsMemoryPath` (lines 53–56) — computes the current per-session read-memory path under `pulse/state/reads/<session>` (sanitised session id). [supporting]
- `legacyReadsMemoryPath` (lines 59–62) — the pre-reorg flat `pulse/.reads-<session>` path, kept only as the `renameIfLegacy` self-heal source. [supporting]
- `applicableRuleIds` (lines 80–114) — collects compass rule IDs whose `governs` glob matches the read target, silently skipping retired or malformed rule files. [supporting]
- `purposeFirstLine` (lines 117–123) — extracts and whitespace-collapses the first non-empty line of an entry's `## Purpose` section. [supporting]

## Insights
- Two payload budgets, not one: 50 tokens without the writeback invite, 75 with it (RULES.md rule 11 sets the summary-alone ceiling; the invitation gets additive room, mirroring the v2 precedent) — truncation only ever trims the purpose text, never the invitation's `<cortex:purpose>` tag.
- The writeback invitation is suppressed once the entry's `## Purpose` already carries `READ_TIME_MARKER` (owned by `post-read.ts`) — a session-witnessed correction outranks re-inviting more corrections, so a purpose stays un-invited until extraction next overwrites it wholesale.
- Duplicate-read memory (`pulse/state/reads/<session>`) is best-effort like the rest of `pulse/`: `legacyReadsMemoryPath` + `renameIfLegacy` carry forward the pre-reorg flat `.reads-<id>` file once, and any write failure just drops the "(already read this session)" note rather than affecting the read itself.

## Connections
Uses:
- src/insight/query.ts: `fileQuery` — the read-only insight lookup this hook's whole payload is built from
- src/hooks/post-read.ts: `READ_TIME_MARKER` — checked against the entry's Purpose section to decide whether the writeback invitation rides along
- src/hooks/errors.ts: `appendHookError` — logs unreadable insight entries and read-memory write failures
- src/pulse/migrate.ts: `renameIfLegacy` — self-heals the legacy flat `.reads-<session>` file into `state/reads/<session>`
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only

Used by:
- src/hooks/cli.ts: dispatches `case 'pre-read'` to this module's `run`

## Query pointers
- If you need the PreRead payload's exact wire format, read `compose`/`composeSummary` in `run` — the line order (summary, invite, dedupe note) and the budget-trim logic are pinned there.
- If you're touching the writeback loop end-to-end, also read `src/hooks/post-read.ts` — the `<cortex:purpose>` tag grammar and `READ_TIME_MARKER` are owned there, not here.
- If you need the pulse-reorg self-heal pattern, `legacyReadsMemoryPath` + `renameIfLegacy` here mirrors the same one-shot migration used in `errors.ts` and `post-read.ts`.
