---
path: src/schema/checks/provenance.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 131
size_tokens: 1252
centrality: medium
built_at_commit: "8248c76"
source_sha256: "3e99e22473ed884952f820bff04c5c4090c7d9bc1fd497c2454c87af424e8dd0"
---
# src/schema/checks/provenance.ts

## Purpose
Validates the optional `provenance:` frontmatter field (schema §6, addendum A6) on the four artefact kinds that may carry it: compass rules, dev specs, business specs, atlas decisions. Each `provenance` entry must be a single-key `{ derives_from: <ref> }` mapping; the ref must match one of three forms — an archive path (`archive/documents/<slug>/...`) or an atlas-decision path (`atlas/decisions/<slug>.md`), both of which must resolve to an existing file on disk (error if not), or a `claude-sessions/<user>/<id>` reference, which is cited-not-resolved (only shape-checked, never verified on disk since sessions aren't persisted artefacts). Deliberately kept as its own file rather than folded into xref.ts because provenance has its own reference grammar and shares its scan with the separate backward-traversal index in provenance-index.ts, distinct from xref's spec-tree symmetry/uniqueness/acyclicity concerns.

## Connections
Uses:
- src/schema/provenance-index.ts: `scanProvenanceCarriers`, `provenanceRefResolves`, `ARCHIVE_REF_PATTERN`, `ATLAS_DECISION_REF_PATTERN`, `CLAUDE_SESSION_REF_PATTERN` — this check shares the exact same scan the backward-traversal index uses, so both stay in sync by construction.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkProvenance(root)`.

## Query pointers
If you need to understand the backward-traversal ("what derives from this?") side of provenance, also read: src/schema/provenance-index.ts (the module this check shares its scan with).
