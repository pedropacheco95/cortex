---
path: src/insight/scaffold.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 2
size_lines: 56
size_tokens: 620
centrality: low
built_at_commit: "8248c76"
source_sha256: "ced41cde63496380fdf99835fb8da0c79e373c62810831ffc68d602e4324f777"
---
# src/insight/scaffold.ts

## Purpose

Init-time scaffolding for a project's `insight/` module: creates the committed flat-layout skeleton (`_index.md` from the shared template, plus empty `anatomy/` and `concepts/` directories) idempotently — an existing `_index.md` is never clobbered. It seeds no entries, concepts, or JSON files; those are the `cortex-extract-insight` skill's job, which also adds `scopes/` + `scope-registry.yaml` when it decides to scope the project. A legacy v2 `insight/map/` directory, if present, is left untouched.

## Connections

Uses:
- src/cli/templates.ts: `INSIGHT_INDEX_TEMPLATE`, the committed `_index.md` content.

Used by:
- src/cli/init.ts: calls `scaffoldInsight` during `cortex init`.
