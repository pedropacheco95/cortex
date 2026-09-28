---
path: src/pulse/thread-cli.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 2
size_lines: 481
size_tokens: 5227
centrality: high
built_at_commit: "a66041b"
source_sha256: "3b4ce6348742ce2bbf1f94720a59f961599652f8f37f995b84baff5296a83036"
---
# src/pulse/thread-cli.ts

## Purpose

Implements `threadCli`, the deterministic Core logic behind `cortex thread list|drop|close|promote` — the human verbs over the threads ledger (spec `pulse.threads` Rules 10–13, schema §4.5.3). `list` filters and prints open (or other-status) threads with optional `--status`/`--touching` flags; `drop` and `close` are simple status transitions (a `requireOpen` guard refuses any thread not currently `open`, printing its terminal state and exiting 1 without writing); `promote` is the one verb with the standing of `pulse-accept` — it drafts a gated file at one of three targets (`atlas/decisions` via `decisionFilePayload`, `compass/bugs` via a hand-built frontmatter payload with a registry-allocated `B-NNN` id, or `atlas/evidence` via the shared evidence writer, restricted to `finding` threads of kind `measurement`), writes it only if the target doesn't already exist, and marks the thread `answered` with `resolved_by` set to the new file's path. Every promoted file opens with a `DRAFT_LINE_PREFIX` line naming the thread that spawned it, so a human reviews before relying on it. Deterministic Core (R-001): fs/path only, no LLM, no network, no subprocess.

## Connections

Uses:
- src/atlas/evidence.ts — `ensureEvidenceDir`, `evidenceFilePayload`, `EvidenceFinding` (type) back the `--to atlas/evidence` promote path: parsed `--finding metric=value` flags become typed findings in the drafted evidence file.
- src/compass/git-head.ts — `readHeadCommit` supplies the bug draft's `found_at_commit` field (`compass.bug-currency` Rule 5) when `.git/HEAD` resolves; omitted otherwise.
- src/compass/registry.ts — `allocateId` mints the `B-NNN` id for a `--to compass/bugs` promotion through the shared id registry (schema.id-registry Rule 2), one appended line, never reused.
- src/insight/session-observe.ts — `decisionFilePayload`, `decisionSlug`, `provenanceUser` build the `--to atlas/decisions` draft's target path and frontmatter, and supply the default `--by`-less username fallback for provenance.
- src/pulse/threads.ts — `THREAD_STATUSES`, `Thread`/`ThreadStatus` types, `listThreads`, `threadPath`, `parseThreadFile`, `keyText`, `threadSlug`, `updateThreadStatus` — every verb here is built directly on these batch-0/1 primitives; this file owns no ledger I/O of its own beyond `loadThread`'s thin wrapper.

Used by:
- (none src-internal — reached only via `src/cli/cli.ts`'s dynamic import of the `thread` verb, not tracked as an in-tree edge)
