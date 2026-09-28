---
path: src/schema/types.ts
extracted_at: 2026-09-22T09:54:56Z
extraction_level: 2
size_lines: 26
size_tokens: 164
centrality: high
built_at_commit: "a66041b"
source_sha256: "0c0e31ff8b2e9ce6b672787d46db9f1e9e1af9294a95ccd1f924221fd56ba933"
---
# src/schema/types.ts

## Purpose
The shared type contract for the entire schema validator: `Severity` (`'error' | 'warning'`), `Violation` (the single shape every check function returns — severity, check id, schema clause, a `location` with path/optional-key/optional-line, and a human message), and `ValidationReport` (the top-level result `validate()` returns — schema version, target, conformant flag, the full violations list, error/warning counts, and an optional `notes` side channel used today only by `check.visibility`'s "allowed by visibility.allow: <path>" lines, §10.1, 3.4 fifth revision). Pure type declarations, zero logic, zero I/O, and the highest fan-in file in the schema module.

## Connections
Uses:
- (none src-internal)

Used by:
- src/schema/checks/*.ts (all ~24 check modules — archive, atlas, bears-on, bizspec, claude-md, compass, config, constellation, devspec, evidence, hooks, index-completeness, insight, layout, loop-md, provenance, pulse, recall-index, registry, scenario, specs, threads, visibility, xref): every check function constructs and returns `Violation[]` using this shape.
- src/schema/cli.ts: imports `ValidationReport` for `formatReport`'s input.
- src/schema/validate.ts: imports both `ValidationReport` and `Violation` — the orchestrator's core aggregation contract.
- src/loops/lint-scheduled.ts: consumes `Violation`/`ValidationReport` for the scheduled lint loop's output.
- tests/atomic/schema/*.test.ts (archive, bears-on-check, bug-currency-check, constellation, evidence-check, intent-register, provenance, registry-check) and tests/spec/*.spec.test.ts (archive/ingest-skill, compass/bug-currency, insight/storage-format, schema/id-registry, schema/validator-insight-checks): exercise checks whose return shape is this file's `Violation`.
