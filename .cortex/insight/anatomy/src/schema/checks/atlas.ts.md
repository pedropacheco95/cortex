---
path: src/schema/checks/atlas.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 124
size_tokens: 1734
centrality: medium
built_at_commit: "8248c76"
source_sha256: "0cf4a823c3ebeb8739c6944a177491203eea359daf1175030481bbe1376816a1"
---
# src/schema/checks/atlas.ts

## Purpose
Validates `.cortex/atlas/` artefacts (schema §4.4): every markdown file (excluding `_index.md`/`_overview.md`) must carry an `id` and, depending on its id prefix (`decision.`, `stakeholder.`, `domain.`), the type-specific required fields (`title`+`date`, `name`+`role`, `term`+`definition` respectively). It also validates `supersedes`/`sources`/`compass_rules`/`related_specs` cross-references resolve via the project index. A separate carve-out (B-006) exempts raw files under `atlas/sources/` from the blanket id requirement — only their `.meta.md` sidecars are id-bearing, and those are validated by the internal `checkSourceMeta` helper against a fixed `kind` enum and ISO-date `captured` field.

## Connections
Uses:
- src/schema/index-build.ts: `ProjectIndex` type, `resolveId`, `resolveRelativePath` — used to check that cross-reference fields resolve.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkAtlas(root, index)` as part of the full run.

Semantically related (not imports):
- src/schema/checks/compass.ts and src/schema/checks/bizspec.ts share the same gray-matter-parse-then-validate-frontmatter pattern.

## Query pointers
If you need to understand the atlas sources sidecar exemption (B-006), also read: src/schema/checks/atlas.ts (this file, `checkSourceMeta`), and the atlas domain docs under `.cortex/atlas/`.
