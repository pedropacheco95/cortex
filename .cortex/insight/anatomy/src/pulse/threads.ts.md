---
path: src/pulse/threads.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 2
size_lines: 694
size_tokens: 6593
centrality: high
built_at_commit: "a66041b"
source_sha256: "b46f3c2e2073cf5bd66647cc5a5c69c450151d928b489b9a113ccbe98257b06b"
---
# src/pulse/threads.ts

## Purpose

Owns the threads ledger's file contract end to end (schema §4.5.3, `pulse.threads` Rules 1, 2, 5, 7): a thread is one thing a session left unresolved (question, offer, approval, finding, or artefact), kept as one markdown file at `.cortex/pulse/threads/T-NNN-<slug>.md` with lifecycle `open → answered | dropped | expired`. This module provides parse/serialise (`parseThreadFile`/`serialiseThread`, byte-stable round trip), the `T-` id allocator (its own counter file, distinct from `suggestion-counter`), the normalised dedupe/mention key (`threadKey`/`keyText`), the atomic writer (`writeThread`, temp-file + rename), and the two heavyweight session-record consumers: `openThreadsFromRecord` (Rules 3, 4, 7, 8 — opens one thread per session-record item, deduping against every currently-open thread by normalised key, appending this session's citation to a match rather than duplicating) and `detectAnswered` (Rule 9 — marks a thread answered when the current session names its id, restates its key text, or replies to it as an offer/question). The `cortex thread` verbs that operate on this ledger live in the sibling `thread-cli.ts`; this file is the lower batch-0/1 layer they and several hooks build on. Deterministic Core (R-001): fs/path/gray-matter only, writes confined to `.cortex/pulse/`.

## Connections

Uses:
- src/insight/session-observe.ts — `decisionSlug`, reused by `threadSlug` to derive a thread's filename slug from its key text (fallback `'thread'` when the text has no alphanumerics).
- src/pulse/distil.ts — `normaliseText` (for the dedupe key) and the `SessionKind` type (carried on `SessionRecord.session_kind`, gating whether a scheduled session's non-finding/artefact candidates are suppressed in `candidatesOf`).
- src/sessions/read.ts — `ExtractedMessage` type only, describing the shape `detectAnswered`'s `messages` option and `DetectAnsweredOptions` consume.

Used by:
- src/hooks/prompt-route.ts — reads/uses thread primitives to route prompts against open threads.
- src/hooks/session-end.ts — the SessionEnd hook assembles a `SessionRecord` and drives `openThreadsFromRecord`/`detectAnswered` at the end of every session.
- src/pulse/hygiene.ts — `expireThreads` (in `hygiene.ts`) parses ledger files via `parseThreadFile` and rewrites `status:` in place for threads past `expires` (never deletes).
- src/pulse/thread-cli.ts — the `cortex thread` verb layer built directly on this file's exports.
- src/recall/index.ts — surfaces open threads as `Open:` pointer lines in hook-injected recall context.
- src/schema/checks/threads.ts — the validator for `pulse/threads/*.md` files, checking shape against this file's contract.

Semantically related (not imports):
- src/pulse/hygiene.ts — `expireThreads` there and this file's lifecycle model agree on "expire in place, never delete" (`pulse.threads` Rule 10) without either file importing status-transition logic from the other; the actual `parseThreadFile`/`THREADS_DIR` import is the only direct link.
