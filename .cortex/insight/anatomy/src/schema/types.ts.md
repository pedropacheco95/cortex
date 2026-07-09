---
path: src/schema/types.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 3
size_lines: 22
size_tokens: 101
centrality: high
built_at_commit: "8248c76"
source_sha256: "689ad1cda4b50e06e631b3f3ada0c24ea4fe4e4499a61f4afc2a90477a58b331"
---
# src/schema/types.ts

## Purpose
The shared type contract for the entire schema validator: `Severity` (`'error' | 'warning'`), `Violation` (the single shape every check function returns — severity, check id, schema clause, a `location` with path/optional-key/optional-line, and a human message), and `ValidationReport` (the top-level result `validate()` returns — schema version, target, conformant flag, the full violations list, and error/warning counts). This is the single narrowest file in the schema module — pure type declarations, zero logic, zero I/O — and it is imported by literally every check module plus the CLI and orchestrator.

## Main players
- `Violation` (lines 3–13) — the universal per-finding shape every one of the ~17 check modules constructs and returns. [critical]
- `ValidationReport` (lines 15–21) — the top-level shape `validate()` in validate.ts returns to its callers (the CLI, `cortex init`, the lint-scheduled loop). [critical]
- `Severity` (line 1) — the two-value severity enum every `Violation` carries. [critical]

## Insights
- This file has zero imports and the highest fan-in in the entire schema module (imported by all 17 check files, cli.ts, and validate.ts) — it is the true load-bearing contract of the validator; any change to `Violation`'s shape ripples into every check.

## Connections
Uses:
- (none src-internal)

Used by:
- src/loops/lint-scheduled.ts: consumes `Violation`/`ValidationReport` for the scheduled lint loop's output.
- All 17 files under src/schema/checks/*.ts: every check imports `Violation` for its return type.
- src/schema/cli.ts: imports `ValidationReport` for `formatReport`'s input.
- src/schema/validate.ts: imports both `ValidationReport` and `Violation` — the orchestrator's core contract.

## Query pointers
If you need to change the shape of a validation finding, also read: every file under src/schema/checks/ (all 17 depend on `Violation`'s exact shape), and src/schema/validate.ts (aggregates and counts them).
