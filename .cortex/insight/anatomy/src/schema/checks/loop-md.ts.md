---
path: src/schema/checks/loop-md.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 35
size_tokens: 239
centrality: medium
built_at_commit: "8248c76"
source_sha256: "8f6f3fadfc41c86c2b6ae2390c1958a9481e19c4e2c2f29028cb9ae70df3d3b1"
---
# src/schema/checks/loop-md.ts

## Purpose
A small, single-purpose check (schema §9): validates that the project's root `loop.md` (if present) contains the literal "Propose, don't mutate" clause and a "Stop condition:" line, both as warnings. This is the mechanical enforcement of the project-wide rule (also stated in this repo's CLAUDE.md) that autonomous loops never mutate cerebrum/anatomy/atlas/specs directly — they write proposals only.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkLoopMd(root)`.

Semantically related (not imports):
- The "propose, don't mutate" rule this check enforces mirrors the "Never let a Cortex loop or pulse mutate cerebrum/anatomy/atlas/specs directly" rule in this repo's own CLAUDE.md.
