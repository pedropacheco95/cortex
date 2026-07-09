---
path: src/schema/index-build.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 3
size_lines: 59
size_tokens: 446
centrality: high
built_at_commit: "8248c76"
source_sha256: "8bbe629e69d5f98a15218cb000eb78c847fec8f3053a1f59873657164d90624c"
---
# src/schema/index-build.ts

## Purpose
Builds the single `ProjectIndex` that almost every other schema check depends on: a project-wide scan (via fast-glob) over both spec trees, compass rules, compass bugs, atlas markdown, and scenario specs, producing three maps — `id → absolute path`, `path → parsed frontmatter data`, and `path → raw file content` — plus the resolved project `root`. This is computed once per validation run (in `validate.ts`) and passed by reference into every check that needs to resolve an `id`-style cross-reference or a relative-path cross-reference, avoiding N separate directory walks across N checks.

## Main players
- `buildIndex` (lines 17–49) — scans the fixed glob pattern list and builds all three maps in one pass; unreadable/unparseable files are silently skipped (another check's job to flag). [critical]
- `resolveId` (lines 51–53) — looks up an id in the index's `idToPath` map, returning the absolute path or undefined. [critical]
- `resolveRelativePath` (lines 55–58) — resolves a path relative to a given file's directory and confirms it exists on disk; used for `implements`/`depends_on`-style relative-path frontmatter fields (distinct from `resolveId`, which resolves `id`-string references). [critical]

## Insights
- The glob pattern list (line 22–29) is the de facto definition of "everything with an id that other artefacts might reference" — adding a new id-bearing artefact kind to the schema requires updating this list, or that kind's cross-references will silently fail to resolve everywhere (every check using `resolveId` depends on this list being complete).
- `resolveId` and `resolveRelativePath` are two genuinely different resolution strategies used throughout the checks — `id`-string fields (like `depends_on`, `related_specs`) use `resolveId` against the index, while path-string fields (like `implements`, `implemented_by`) use `resolveRelativePath` computed relative to the referencing file, not the index. Mixing these up would silently break resolution.

## Connections
Uses:
- src/paths.ts: `SPECS_GLOB`, `BUSINESS_GLOB` — the two spec-tree glob patterns.

Used by:
- src/loops/atlas-staleness.ts, src/loops/rule-decay.ts, src/pulse/hygiene.ts: reuse the index for their own cross-reference resolution needs outside the validator.
- src/schema/checks/atlas.ts, bizspec.ts, compass.ts, devspec.ts, scenario.ts, xref.ts: every one of these checks takes `ProjectIndex` as a parameter and calls `resolveId`/`resolveRelativePath`.
- src/schema/validate.ts: calls `buildIndex(root)` once, right after the config check passes, then threads the result through every subsequent check that needs it.

## Query pointers
If you need to add a new id-bearing artefact kind to the project index, also read: src/paths.ts (glob constants), and every file listed under "Used by" above (they all assume the index's completeness).
