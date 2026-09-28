---
path: src/schema/checks/evidence.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 157
size_tokens: 1927
centrality: medium
built_at_commit: "a66041b"
source_sha256: "4c1e3bc7e75d74a4d1cc3f9066126d7e43323fb88738ea3226801c75d38e194d"
---
# src/schema/checks/evidence.ts

## Purpose
Implements `check.evidence` (schema §4.3, new at 3.4): validates every `.cortex/atlas/evidence/*.md` file (except `_index.md`) against the evidence frontmatter contract, all at `error` severity. Checks: `id` shape `evidence.<YYYY-MM-DD>-<slug>` AND equal to `evidence.` + the filename stem; `title` non-empty; `date` an iso-datetime; `kind` in `EVIDENCE_KINDS` (`measurement|experiment|audit`); `instrument` a non-empty string naming what produced the numbers; `window` a map with iso `from`/`to` and an optional non-negative-integer `sessions` (all window problems collapse into ONE violation per file); `findings` a non-empty list of `{metric, value, unit?}` maps; `bears_on` a non-empty list of non-empty strings (resolution of those entries is `check.bears-on`'s job, not this file's); `supersedes` entries that resolve, relative to the file, to a path under `atlas/evidence/` (existence on disk is `check.atlas`'s job — not repeated here). A missing `id` altogether is also `check.atlas`'s finding and is deliberately not repeated. The whole directory being absent is tolerated per schema §1's present-tolerant convention.

## Connections
Uses:
- src/atlas/evidence.ts: `EVIDENCE_KINDS` — the shared evidence-kind enum, defined once and consumed here rather than redeclared.
- src/insight/storage.ts: `isIsoDatetime` — the datetime-shape helper reused across insight and schema modules for consistency.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkEvidence(root)`.
- tests/atomic/schema/evidence-check.test.ts: the dedicated atomic-layer test.
- tests/spec/pulse/thread-cli.spec.test.ts: integrated-slice coverage.

Semantically related (not imports):
- src/schema/checks/atlas.ts owns presence of `id` and existence-resolution of `supersedes`/`sources` paths; this file owns the evidence-specific shape once those basics are satisfied — the two checks deliberately partition the same file's frontmatter rather than duplicating each other's findings.
- src/schema/checks/bears-on.ts resolves this file's `bears_on` entries; this file only checks they're present and well-shaped as strings.

## Query pointers
If you need the full evidence artefact contract end to end, also read: src/schema/checks/atlas.ts (id/supersedes/sources) and src/schema/checks/bears-on.ts (bears_on resolution) alongside this file (the rest of the shape). If you need the evidence-kind enum's source, also read src/atlas/evidence.ts.
