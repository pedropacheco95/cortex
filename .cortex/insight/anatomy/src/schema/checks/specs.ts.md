---
path: src/schema/checks/specs.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 172
size_tokens: 1499
centrality: medium
built_at_commit: "8248c76"
source_sha256: "fb321bad3813e8e8224ad412a7e2c3eb7ef56ab4a653937282a98adb12adbceb"
---
# src/schema/checks/specs.ts

## Purpose
Validates the spec-tree structural scaffolding shared by both `specs/` and `specs-business/` (schema §2.2/§7.2/§7.3): `checkSpecsIndex` requires `specs/_index.md` to exist and contain the required headings ("Read this when:", "## Domains", "## Dependency Graph", "## Build Order"); `checkOverviewPresent` recursively walks both trees requiring every non-underscore, non-dot directory to carry an `_overview.md`; `checkOverviewShape` validates each found `_overview.md`'s required headings, and additionally — for business-tree overviews only — warns if the content outside a "## Related groups" section contains file-path-like or ID-like patterns (business overviews are meant to stay implementation-detail-free except in that one designated section); `checkIdMatchesPath` derives the expected spec `id` from each file's path (dots joining path segments, suffix stripped) and errors if the frontmatter `id` doesn't match.

## Connections
Uses:
- src/paths.ts: `specsRoot`, `businessRoot`, `specsIndexPath`, `SPECS_REL` — path resolution helpers for both trees.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls all four exports (`checkSpecsIndex`, `checkOverviewPresent`, `checkOverviewShape`, `checkIdMatchesPath`).

## Query pointers
If you need to understand the path-derived id convention (`checkIdMatchesPath`), also read: src/paths.ts, and src/schema/checks/devspec.ts / bizspec.ts (which validate the `id` field's presence, while this file validates its VALUE matches the path).
