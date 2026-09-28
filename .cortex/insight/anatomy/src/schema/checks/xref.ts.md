---
path: src/schema/checks/xref.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 158
size_tokens: 1375
centrality: medium
built_at_commit: "a66041b"
source_sha256: "bda7c0a40092dde9687aab88f50c3a44795dda38c4d3d82310cb6e067c2f0f7c"
---
# src/schema/checks/xref.ts

## Purpose
Validates cross-reference integrity across the spec trees (schema §6): `checkXrefSymmetry` verifies that for every dev spec's `implements:` link, the target business spec's `implemented_by:` list actually contains that dev spec back — enforcing this repo's own CLAUDE.md bidirectional-linking rule; `checkXrefUnique` reads uniqueness directly off the project index's own single scan (`index.idToFiles`, covering both spec trees, compass rules, compass bugs, atlas artefacts and scenario specs per validator Rule 12/B-019) rather than re-globbing narrower; `checkXrefAcyclic` builds a `depends_on` dependency graph independently per tree (dev specs and business specs) and runs DFS-based cycle detection, deduplicating reported cycles by a sorted-node-key so the same cycle isn't reported once per node in it.

## Connections
Uses:
- src/paths.ts: `specsRoot`, `SPECS_GLOB`, `BUSINESS_GLOB` — the two spec-tree roots/globs `checkXrefSymmetry` and `checkXrefAcyclic` walk.
- src/schema/index-build.ts: `ProjectIndex`, `resolveId`, `resolveRelativePath` — `checkXrefUnique` reads `idToFiles` directly off the index rather than rebuilding it; the other two use `resolveRelativePath` to follow `implements:` links.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls all three exports (`checkXrefSymmetry`, `checkXrefUnique`, `checkXrefAcyclic`).

Semantically related (not imports):
- src/schema/checks/devspec.ts / bizspec.ts (outside this scope) validate the presence and single-valuedness of the `implements`/`implemented_by` fields this file cross-checks for symmetry — a malformed field there means this file's symmetry check is validating already-flagged data.

## Query pointers
If you need the full bidirectional-linking contract this file enforces, also read: this repo's CLAUDE.md ("Every directory in both trees..." / "Never break the implements:/implemented_by: links"), and src/schema/checks/devspec.ts / bizspec.ts. If you need to understand `checkXrefUnique`'s single-scan source, also read: src/schema/index-build.ts's `idToFiles` construction.
