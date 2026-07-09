---
path: src/schema/checks/devspec.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 96
size_tokens: 1291
centrality: medium
built_at_commit: "8248c76"
source_sha256: "f508dd957bfff7f44fff3ba6d11cc5be58cdd337098187d679767d163e1565f1"
---
# src/schema/checks/devspec.ts

## Purpose
Validates developer specs (`*.spec.md` under `specs/`, schema §4.6): `checkDevSpecs` requires `id`, `status` (must be one of `draft`/`implementing`/`implemented`), and a strictly single-valued resolvable `implements` field (accepting either a bare string or a one-element array, but erroring if the array has more or fewer than one entry) — enforcing the CLAUDE.md rule that every dev spec implements exactly one business spec. It also validates `depends_on` and `governed_by` ID lists resolve via the project index, and validates the optional `governs` glob list using the same zero-match-is-warning convention as compass rules.

## Connections
Uses:
- src/paths.ts: `specsRoot` — resolves the `specs/` root directory.
- src/schema/checks/compass.ts: `globMatchesNothing` — reused for the `governs` glob validation, avoiding duplicating that logic.
- src/schema/index-build.ts: `ProjectIndex`, `resolveId`, `resolveRelativePath`.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkDevSpecs(root, index)`.

Semantically related (not imports):
- src/schema/checks/bizspec.ts is the business-spec-side counterpart validating the mirror `implemented_by` field.
- src/schema/checks/xref.ts cross-checks that `implements` and `implemented_by` stay symmetric.
