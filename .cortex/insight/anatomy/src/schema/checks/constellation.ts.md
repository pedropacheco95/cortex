---
path: src/schema/checks/constellation.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 108
size_tokens: 1034
centrality: medium
built_at_commit: "8248c76"
source_sha256: "3fbbb55c1f80c3e07492072c824483c48ee8cb7a8c6f6aa96965318b529c300d"
---
# src/schema/checks/constellation.ts

## Purpose
Validates `.cortex/constellation.json` (schema §4.9), a compiled/regenerable and gitignored graph artifact, hence the check only runs when the file actually exists — its absence is never a violation. Checks required top-level keys, node-id uniqueness, that every node's `group` resolves to a declared group or child id, that every node's `module` is in a fixed enum (`rule`, `bug`, `compass`, `atlas`, `spec-dev`, `spec-business` — notably `anatomy` was removed from this enum at v3.0), and that every edge's `from`/`to` endpoints resolve to an emitted node id.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkConstellation(root)` as part of the full run.

Semantically related (not imports):
- src/schema/checks/insight.ts's `checkInsightGraph` validates a structurally similar node/edge JSON shape (nodes.id uniqueness, edge endpoint resolution) for the separate insight-module graph — the two files independently reimplement similar graph-shape validation for different artefacts rather than sharing a common graph-validation utility.
