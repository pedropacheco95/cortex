---
path: src/pulse/types.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 107
size_tokens: 1089
centrality: low
built_at_commit: "8248c76"
source_sha256: "7dd6b6dd4a69a95085e56dda5e872f0574ae69f544146d5c110a69a402155e0b"
---

# src/pulse/types.ts

## Purpose

Defines the typed pulse gate's shared type→policy contract (schema §4.5.1/§4.5.2): the six legal `**Type:**` values (`SUGGESTION_TYPES`, including the v3.0-added `decision-candidate`), the three payload-operation shape markers (`PAYLOAD_SHAPES`), and — most importantly — the per-type permitted `**Target:**` root table (`permittedRoots`/`isTargetPermitted`/`permittedRootsLabel`), e.g. `rule-candidate` may only target `.cortex/compass/`, `decision-candidate` only `.cortex/atlas/decisions/`, and only `user-directed-capture` may target the ungated `.cortex/insight/map/`. The header states its reason for existing explicitly: this table is extracted so the runtime accept path and the schema validator share one copy of the policy and "cannot drift." It is a pure module — no fs, no LLM, no network.

## Connections

Uses: (none src-internal)

Used by:
- `src/pulse/review.ts` — the runtime accept path, which additionally resolves paths against the same `permittedRoots(type)` table for `..`-escape safety beyond this file's pure string check.
- `src/schema/checks/pulse.ts` — the schema validator, using `isTargetPermitted`/`permittedRootsLabel` as the structural authority for target-root validation.

Semantically related (not imports): `src/pulse/fences.ts` — both are pure §4.5-contract policy modules shared between writers and validators specifically to prevent drift between independent consumers.
