---
path: src/loops/lint-scheduled.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 101
size_tokens: 1107
centrality: low
built_at_commit: "8248c76"
source_sha256: "af69491c3a24bff04a32381415c35d7a2dc4e77e191e0163719fa37c4ad87491"
---

## Purpose

Implements `cortex loop-specflow-lint`, the daily scheduled spec-lint loop (spec `loops.lint-scheduled`, design §11.4 item 8) — a cadence-and-paper-trail wrapper around the schema validator: it runs the existing `validate()` function (never reimplementing checks), filters violations down to those located under the spec tree (`.specflow/specs/`, `.specflow/specs-business/`, `tests/scenario/specs/`), groups the remaining spec-tree violations by check name, and always-writes `.cortex/pulse/lint-report.md` regardless of clean/dirty outcome (exit 0 either way — the report is the product; `cortex validate` remains the actual CI gate). It's a deterministic Core module (R-001): read-only against the spec tree, its only write is the pulse report.

## Connections

Uses:
- `src/loops/report.ts` — `writePulseReport`, the shared always-write-report helper used to land `lint-report.md`.
- `src/paths.ts` — `SPECS_REL`, `BUSINESS_REL`, the canonical spec-tree root path constants used to build `SPEC_TREE_PREFIXES`.
- `src/schema/types.ts` — `Violation` type, the shape returned by the validator and grouped/rendered here.
- `src/schema/validate.ts` — `validate`, the actual schema/spec-tree checker this loop wraps and never reimplements.

Used by: (none src-internal — no importers in the given data; this loop is invoked only via the CLI/scheduled task, not imported by other source modules)
