---
path: src/schema/checks/layout.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 180
size_tokens: 1714
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "0255c351a4b0a337d2977ff968963b325b7cffd6dfed2c80ac8de891cbfee2ff"
---
# src/schema/checks/layout.ts

## Purpose
Validates the overall `.cortex/` directory layout (schema §1/§7.1): `checkLayout` confirms each present top-level module (`compass`, `atlas`, `archive`, `insight`, `pulse` — note `anatomy`/`cerebrum` no longer exist at v3.0) and specific subdirectories (`compass/rules`, `compass/bugs`, `atlas/decisions`, `atlas/stakeholders`, `atlas/domain`) carry an `_index.md`. `checkIndexPresent` recursively walks the whole `.cortex/` tree requiring `_index.md` in every directory, with explicit exemptions for insight's data trees (`anatomy/`, `concepts/`, `scopes/`, legacy `map/` — these path-mirror the source tree and aren't navigable module indexes), archive's data trees (`archive/documents/` and its per-slug subtrees, `archive/types/`), and (B-008) the whole `pulse/` subtree below its module root (`reports/`, `state/`, `state/reads/`, `extraction/`, …) since it's transient/generated working state, not navigable module indexes — `pulse/` itself still requires its own `_index.md`. `checkIndexShape` validates every found `_index.md`'s content shape (must contain "Read this when:" and "What's here:" headings, and a soft ~300-token budget warning) — except `insight/_index.md` itself, which is locked template text per design §5.13 and deliberately omits those headings.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.

Used by:
- src/loops/onboarding-drift.ts: reuses layout-checking logic for the monthly scaffolding-drift review.
- src/schema/validate.ts: calls all three exports (`checkLayout`, `checkIndexPresent`, `checkIndexShape`).

## Query pointers
If you need to understand why insight's per-file directories are exempt from the `_index.md` requirement, also read: `cortex-schema.md` §4.10.1 and §7.1, and src/schema/checks/insight.ts (the module whose data trees this file exempts).
