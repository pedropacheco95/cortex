---
path: src/schema/checks/archive.ts
extracted_at: 2026-08-05T01:00:00Z
extraction_level: 3
size_lines: 291
size_tokens: 1942
centrality: medium
built_at_commit: "c667a9a"
source_sha256: "a2370395e7a010f8486bd2aa01f787bdc703124fd80f3b2748cefe6486f29796"
---
# src/schema/checks/archive.ts

## Purpose
Implements the four archive-module validator checks (schema §4.4/§4.4.1/§4.4.2/§4.4.3, Appendix A) that keep `.cortex/archive/` conformant: `checkArchiveLayout` verifies the required layout (`_index.md`, `register.md`, `types/`, and per-document `source.*` + `metadata.yaml` + `extracted/` under `documents/<slug>/`); `checkArchiveMetadata` validates each document's `metadata.yaml` frontmatter (`id` matches `archive.<slug>`, `kind` resolves to a declared type, `supersedes` paths resolve); `checkArchiveType` validates each `types/*.yaml` declaration's `id` matches its filename stem; `checkArchiveIntentRegister` (new at schema 3.2) validates the optional `intent-register.yaml` — shape via `parseIntentRegister`, plus link resolution the pure parser can't do (`landing` against a rule id or a spec's acceptance-criterion heading, `covering_spec_test` against an existing file path, `flagged_bug` against a bug ledger entry). All four tolerate the module (or the intent register specifically) being entirely absent, following the "spine" convention that every v3 module check must degrade gracefully when its directory/file doesn't exist yet.

## Connections
Uses:
- src/archive/formats.ts: `parseArchiveMetadata`, `parseArchiveTypeDef`, and (new) `parseIntentRegister` — the actual YAML shape parsers; this file only orchestrates file-tree walking and calls into them for parsing/validation logic.
- src/schema/types.ts: `Violation` type for the return shape of all four checks.
- src/schema/index-build.ts: `ProjectIndex` type and `resolveId` — `checkArchiveIntentRegister` is the only check here needing the project index, to resolve a `landing` reference to a spec id.

Used by:
- src/schema/validate.ts: calls all four checks (`checkArchiveLayout`, `checkArchiveMetadata`, `checkArchiveType`, `checkArchiveIntentRegister`) as part of the full validation run.

Semantically related (not imports):
- src/schema/checks/atlas.ts and src/schema/checks/compass.ts follow the same "tolerant of absent module" pattern and per-artefact frontmatter validation style.

## Main players
- `checkArchiveIntentRegister(root, index)` — the newest and only check here that takes a `ProjectIndex`: it needs cross-file resolution (spec ids, acceptance-criterion headings) that the other three checks don't. Explicitly does NOT judge whether a spec test semantically subsumes a stated intent — that judgment belongs to the reconciliation Skill; this check only verifies well-formedness and that referenced things exist.
- `slugifyHeading` (internal) — loose comparison helper so a `landing` criterion reference can match a heading by hyphenated-slug form, not just exact text.

## Insights
- `checkArchiveIntentRegister` runs link resolution "over whatever parsed cleanly" (comment at line ~242 in source) — a single malformed entry in `intent-register.yaml` does not suppress dangling-link errors in its sibling entries, unlike `checkArchiveMetadata`/`checkArchiveType` which `continue` past a document's shape errors before attempting resolution checks.
- The `landing` field's target resolution branches on shape: an `R-\d{3,}` pattern is checked directly against `compass/rules/` by filename prefix, while anything else goes through `resolveId(index, ...)` against the spec tree — two different resolution paths for the same field depending on what kind of id was written.
