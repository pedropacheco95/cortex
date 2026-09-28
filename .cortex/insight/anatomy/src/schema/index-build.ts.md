---
path: src/schema/index-build.ts
extracted_at: 2026-09-22T09:54:56Z
extraction_level: 3
size_lines: 72
size_tokens: 607
centrality: high
built_at_commit: "a66041b"
source_sha256: "bac36b2f006af9bccc5c1f54e5578b636d6658b129232faefdac7b7f2afc1673"
---
# src/schema/index-build.ts

## Purpose
Builds the single `ProjectIndex` that almost every other schema check depends on: a project-wide scan (via fast-glob) over both spec trees, compass rules, compass bugs, atlas markdown, and scenario specs, producing four maps — `idToPath` (id → the one absolute path that uniquely owns it), `idToFiles` (id → every absolute path carrying it, in glob order), `pathToData` (parsed frontmatter), and `pathToContent` (raw file content) — plus the resolved project `root`. Computed once per validation run (in `validate.ts`) and passed by reference into every check that needs to resolve an `id`-style cross-reference or a relative-path cross-reference.

## Main players
- `ProjectIndex` (lines 7–19) — the four-map interface; `idToFiles` is the newer of the two id maps, added alongside `idToPath` specifically to support duplicate-id detection. [critical]
- `buildIndex` (lines 21–62) — scans the fixed glob pattern list and builds all four maps in one pass; unreadable/unparseable files are silently skipped (another check's job to flag). [critical]
- `resolveId` (lines 64–66) — a thin lookup into `idToPath`; returns `undefined` both for an unknown id and for a duplicated one. [critical]
- `resolveRelativePath` (lines 68–71) — resolves a path relative to a given file's directory and confirms it exists on disk; the distinct resolution strategy for path-string frontmatter fields (`implements`/`implemented_by`) as opposed to id-string fields. [critical]

## Insights
- **Duplicate-id handling changed (schema.xref-unique Rule 12, B-019):** `buildIndex` now explicitly deletes the id from `idToPath` the instant a second file carrying the same id is seen (`idToPath.delete(id)` in the loop, right after pushing onto `idToFiles`) — so `resolveId`/`resolveRef` return `undefined` for any duplicated id rather than silently resolving to whichever file the glob happened to visit first. `idToFiles` is the map that keeps *all* owners of a duplicated id, and it's what `check.xref-unique` reads (length > 1 signals the duplicate); `idToPath` is now strictly "the one file that uniquely owns this id," never an arbitrary pick among duplicates.
- The glob pattern list (lines 27–34) is the de facto definition of "everything with an id other artefacts might reference" — adding a new id-bearing artefact kind to the schema requires updating this list, or that kind's cross-references silently fail to resolve everywhere.
- `resolveId` and `resolveRelativePath` remain two genuinely different resolution strategies: `id`-string fields use `resolveId` against the index (now duplicate-safe), while path-string fields use `resolveRelativePath` computed relative to the referencing file, not the index. Mixing these up would silently break resolution or mask a duplicate.

## Connections
Uses:
- src/paths.ts: `SPECS_GLOB`, `BUSINESS_GLOB` — the two spec-tree glob patterns.

Used by:
- src/loops/atlas-staleness.ts, src/loops/rule-decay.ts, src/pulse/hygiene.ts: reuse the index for their own cross-reference resolution outside the validator.
- src/recall/index.ts: the recall compiler builds/consumes the same index for its own id resolution.
- src/schema/refs.ts: `resolveRef`'s gated-kind branch reads `ProjectIndex.idToPath` directly — inherits the duplicate-safe behaviour above.
- src/schema/checks/archive.ts, atlas.ts, bears-on.ts, bizspec.ts, compass.ts, devspec.ts, scenario.ts, xref.ts: every one of these checks takes `ProjectIndex` as a parameter; `xref.ts`'s `checkXrefUnique` is the one that specifically walks `idToFiles` to flag duplicates.
- src/schema/validate.ts: calls `buildIndex(root)` once, right after the config check passes, then threads the result through every subsequent check that needs it.
- tests/atomic/insight/session-observe.test.ts, tests/atomic/schema/bears-on-check.test.ts, tests/atomic/schema/bug-currency-check.test.ts, tests/atomic/schema/refs.test.ts, tests/atomic/schema/xref-unique.test.ts, tests/spec/insight/session-observe.spec.test.ts, tests/spec/pulse/thread-cli.spec.test.ts: exercise index construction and duplicate-id resolution directly or via consumers.

## Query pointers
If you need to add a new id-bearing artefact kind to the project index, also read: src/paths.ts (glob constants), and every file listed under "Used by" above (they all assume the index's completeness). If you need to change duplicate-id behaviour again, also read: tests/atomic/schema/xref-unique.test.ts (the duplicate-detection contract), src/schema/checks/xref.ts (`checkXrefUnique`, the primary reader of `idToFiles`), and src/schema/refs.ts (`resolveRef`'s gated-kind branch, which now silently returns "unresolved" rather than an arbitrary file for a duplicate).
