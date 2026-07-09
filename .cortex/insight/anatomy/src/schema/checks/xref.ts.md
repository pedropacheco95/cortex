---
path: src/schema/checks/xref.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 176
size_tokens: 1474
centrality: medium
built_at_commit: "8248c76"
source_sha256: "23d5579d979e9925f2df9b7903f7d482f325a55129c04caababfc7158e901935"
---
# src/schema/checks/xref.ts

## Purpose
Validates cross-reference integrity across the spec trees (schema §6): `checkXrefSymmetry` verifies that for every dev spec's `implements:` link, the target business spec's `implemented_by:` list actually contains that dev spec back — enforcing the CLAUDE.md bidirectional-linking rule; `checkXrefUnique` scans all spec files (both trees) for duplicate `id` values; `checkXrefAcyclic` builds a `depends_on` dependency graph per tree and runs DFS-based cycle detection, reporting each unique cycle (deduplicated by a sorted-cycle key so the same cycle isn't reported once per node in it) with the full cycle path in the message.

## Main players
- `checkXrefSymmetry` (lines 10–70) — one-directional check that every `implements:` has a matching reverse `implemented_by:` entry. [critical]
- `checkXrefUnique` (lines 72–109) — flags duplicate spec `id` values across both trees. [critical]
- `checkXrefAcyclic` (lines 111–175) — DFS cycle detection over `depends_on` graphs, run separately per tree. [critical]

## Insights
- `checkXrefSymmetry` only checks one direction (dev `implements` → biz `implemented_by`) — it does not separately check for a business spec's `implemented_by` entry that has no corresponding dev spec `implements` back-reference (an orphaned `implemented_by` entry pointing at a dev spec that doesn't reference the business spec at all would only be caught if that dev spec itself has some `implements` value, not caught if it has none).
- Cycle deduplication uses a sorted-node-key (`cycle.slice().sort().join(',')`) rather than a rotation-normalized cycle key — two different cycles that happen to contain the same node set but traverse in different order would be treated as the same cycle and only reported once.

## Connections
Uses:
- src/paths.ts: `specsRoot`, `SPECS_GLOB`, `BUSINESS_GLOB`.
- src/schema/index-build.ts: `ProjectIndex`, `resolveId`, `resolveRelativePath`.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls all three exports (`checkXrefSymmetry`, `checkXrefUnique`, `checkXrefAcyclic`).

## Query pointers
If you need to understand the full bidirectional-linking contract this file enforces, also read: this repo's CLAUDE.md ("Every directory in both trees..." / "Never break the implements:/implemented_by: links"), and src/schema/checks/devspec.ts / bizspec.ts (which validate the fields' presence and single-valuedness that this file cross-checks).
