---
path: src/pulse/migrate.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 171
size_tokens: 1872
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "1acd5ff9297a86d6f5af3b6c12774bb366221d4b875c9ae9b8e19a9c3d584ab5"
---
# src/pulse/migrate.ts

## Purpose

This file implements the idempotent, best-effort migration from the flat `.cortex/pulse/` layout to the subdivided one (pulse-reorg design): loop reports move under `reports/` (three renaming their basename), machine working state moves under `state/` with leading dots dropped, the per-session read ledgers `.reads-<id>` become one file each under `state/reads/<id>`, and Skill-layer extraction artefacts move under `extraction/`; files written only by retired loops are deleted outright rather than moved. `suggestions.md`, `dismissed.md`, and `_index.md` stay at the pulse root. `migratePulseLayout` runs the whole tree migration in one pass (invoked from the CLI), while the exported `renameIfLegacy` is a cheap O(1) single-file self-heal that hooks call inline on latency-critical paths: if the old path exists and the new slot is empty it renames, if both exist the new file wins and the stale old copy is deleted (`superseded`), and a missing old path is a no-op. Every operation is wrapped to never throw — a migration failure must never fail the loop or hook that triggered it.

## Connections

Uses: (none src-internal)

Used by:
- `src/cli/cli.ts` — dynamically imports `migratePulseLayout` to run the full one-shot pulse-tree migration as a CLI command.
- `src/hooks/pre-read.ts` — imports `renameIfLegacy` for an inline, latency-critical self-heal of legacy paths on the read-hook's hot path.
- `src/hooks/errors.ts` — imports `renameIfLegacy` for the same inline self-heal on the error-hook's hot path.
