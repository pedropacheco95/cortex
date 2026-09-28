---
path: src/recall/index-blocks.ts
extracted_at: 2026-09-22T09:55:44Z
extraction_level: 2
size_lines: 176
size_tokens: 2031
centrality: medium
built_at_commit: "a66041b"
source_sha256: "5aabcb9f47b8f3d19132c96ef2e465aa6ac58ca45e9222cf6cade56f3f8ecd33"
---

## Purpose

Generates and rewrites the "generated recall block" embedded in
`atlas/decisions/_index.md` and `atlas/evidence/_index.md` (schema §7.1,
spec `recall.index-blocks`) — the fourth consumer of the recall index. For
each of the two targets it renders one newest-first line per decision or
evidence entry (date, id, title, and the subjects it bears on, inverted from
`subjects` so the block mirrors what the hooks would answer), keeps the whole
file within §7.1's 300-token budget using the same `words × 1.3` estimator as
`check.index-shape`, and collapses any overflow into a single count line
pointing at `cortex recall --kind <kind>`. It also exposes `stripRecallBlock`,
which `cortex sync` uses to remove the block before comparing the file
against its template. Callers are `cortex scan` and `cortex init`,
immediately after `writeRecallIndex` — never a hook and never `cortex
validate`. Deterministic Core: sorting and string assembly, at most one read
and one write per target file, idempotent on unchanged input.

## Connections

Uses:
- `src/cli/templates.ts`: `SCHEMA_VERSION` — stamped into the block's
  versioned start marker (`RECALL_BLOCK_START`).
- `src/recall/index.ts`: the `RecallIndex` / `RecallSubject` types — the
  compiled index object (`writeRecallIndex`'s in-process result) this module
  renders from without re-reading the file.

Used by:
- `src/cli/sync.ts`: calls `stripRecallBlock` to remove the generated block
  before comparing `_index.md` against its template (Rule 7).
- `tests/atomic/recall/index-blocks.test.ts`: unit coverage of budget
  collapse, marker stripping and block assembly.
- `tests/spec/recall/index-blocks.spec.test.ts`: spec-level acceptance test
  for `recall.index-blocks`.
