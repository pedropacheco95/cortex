---
path: src/insight/cli.ts
extracted_at: 2026-09-22T09:55:19Z
extraction_level: 2
size_lines: 258
size_tokens: 2472
centrality: low
built_at_commit: "a66041b"
source_sha256: "736c8c281d4a27fbb26aca8e2f2867dfeea514f84b8fe2311edd8b8a2fa6eba0"
---
# src/insight/cli.ts

## Purpose

Implements the `cortex insight` CLI surface — three deterministic, read-only subcommands (`file <path>`, `concept <name>`, `element <query>`) that call the query engine and render either human-readable text or a stable `--json` payload, mapping results to exit codes (0 on any found result including element's explicit "no rich entry" answer, 1 on a miss/malformed artefact/absent module/retired verb). It also intercepts the retired v2 verbs (`query | get | neighbors | list`) with a pointed migration message. This is the thin I/O layer over `query.ts` — it parses argv, renders, and sets exit codes, but does no querying logic itself; per the module doc it is Deterministic Core (RULES 3), reading only `.cortex/insight/` and writing nothing.

## Connections

Uses:
- src/insight/query.ts: calls `fileQuery`, `conceptQuery`, `elementQuery` to answer each subcommand, imports `entryStaleness` to compute Rule 9's staleness stamp for `file`, and imports `InsightArtefactError` to catch malformed-artefact errors at the top level.

Used by:
- (none src-internal — only exercised by tests/atomic/insight/cli-staleness.test.ts and tests/spec/insight/cli.spec.test.ts per L1)

Semantically related (not imports):
- src/schema/checks/insight.ts validates the same artefact shapes this CLI reads; a shape change there changes what this CLI can render.

## Query pointers

If you need to change subcommand behavior or output shape, also read: src/insight/query.ts (the engine), src/insight/entry.ts (the per-file entry contract rendered by `file`). If you need to understand the retired-verb migration message, this file is the only place it lives.
