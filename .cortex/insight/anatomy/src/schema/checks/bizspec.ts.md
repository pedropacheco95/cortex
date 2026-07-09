---
path: src/schema/checks/bizspec.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 129
size_tokens: 1275
centrality: medium
built_at_commit: "8248c76"
source_sha256: "ecb1d94562b6c7e0fa55df999b7a408cae65153bdf36d99efad2131952836079"
---
# src/schema/checks/bizspec.ts

## Purpose
Validates business specs (`*.business.md` under `specs-business/`, schema §4.7): `checkBizSpecs` requires `id`, `status`, and a resolvable `implemented_by` list, plus body-content warnings discouraging implementation detail leaking into business specs (fenced code blocks, HTTP verbs, or Given/When/Then AC markers — the business tree is meant to state outcomes, not acceptance criteria). `checkBusinessStatus` implements Policy A of the §4.7 status policy: if every dev spec listed in a business spec's `implemented_by` has reached `status: implemented` but the business spec itself hasn't, that's a lagging-status warning — the drift the project's own CLAUDE.md build loop step 9 is meant to prevent.

## Connections
Uses:
- src/paths.ts: `businessRoot` — resolves the `specs-business/` root directory.
- src/schema/index-build.ts: `ProjectIndex`, `resolveRelativePath`.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls both `checkBizSpecs` and `checkBusinessStatus`.

Semantically related (not imports):
- src/schema/checks/devspec.ts is the developer-spec-side counterpart validating the mirror-image `implements:` field.
- src/schema/checks/xref.ts separately validates that `implements`/`implemented_by` are symmetric across both files.
