---
path: src/schema/checks/layout.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 173
size_tokens: 1565
centrality: medium
built_at_commit: "8248c76"
source_sha256: "9814068590439d98138036b1a78f04e2528cc6a151d18ced3c0d654477f98823"
---
# src/schema/checks/layout.ts

## Purpose
Validates the overall `.cortex/` directory layout (schema §1/§7.1): `checkLayout` confirms each present top-level module (`compass`, `atlas`, `archive`, `insight`, `pulse` — note `anatomy`/`cerebrum` no longer exist at v3.0) and specific subdirectories (`compass/rules`, `compass/bugs`, `atlas/decisions`, `atlas/stakeholders`, `atlas/domain`) carry an `_index.md`. `checkIndexPresent` recursively walks the whole `.cortex/` tree requiring `_index.md` in every directory, with explicit exemptions for insight's data trees (`anatomy/`, `concepts/`, `scopes/`, legacy `map/` — these path-mirror the source tree and aren't navigable module indexes) and archive's data trees (`archive/documents/` and its per-slug subtrees, `archive/types/`). `checkIndexShape` validates every found `_index.md`'s content shape (must contain "Read this when:" and "What's here:" headings, and a soft ~300-token budget warning) — except `insight/_index.md` itself, which is locked template text per design §5.13 and deliberately omits those headings.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.

Used by:
- src/loops/onboarding-drift.ts: reuses layout-checking logic for the monthly scaffolding-drift review.
- src/schema/validate.ts: calls all three exports (`checkLayout`, `checkIndexPresent`, `checkIndexShape`).

## Query pointers
If you need to understand why insight's per-file directories are exempt from the `_index.md` requirement, also read: `cortex-schema.md` §4.10.1 and §7.1, and src/schema/checks/insight.ts (the module whose data trees this file exempts).
