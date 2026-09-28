---
path: src/schema/checks/layout.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 182
size_tokens: 1739
centrality: medium
built_at_commit: "a66041b"
source_sha256: "65c1bc7a200b19bc9292e47d2d3d3c5efb6b1380f944f686eb6715027ded14bb"
---
# src/schema/checks/layout.ts

## Purpose
Validates the overall `.cortex/` directory layout (schema §1/§7.1): `checkLayout` confirms each present top-level module (`compass`, `atlas`, `archive`, `insight`, `pulse` — `anatomy`/`cerebrum` no longer exist at v3.0) and specific subdirectories (`compass/rules`, `compass/bugs`, `atlas/decisions`, `atlas/stakeholders`, `atlas/domain`, `atlas/evidence`) carry an `_index.md`. `checkIndexPresent` recursively walks the whole `.cortex/` tree requiring `_index.md` in every directory, with explicit exemptions for insight's data trees (`anatomy/`, `concepts/`, `scopes/`, legacy `map/` — these path-mirror the source tree and aren't navigable module indexes), archive's data trees (`archive/documents/` and its per-slug subtrees, `archive/types/`), and (B-008) the whole `pulse/` subtree below its module root (transient/generated working state) — `pulse/` itself still requires its own `_index.md`. `checkIndexShape` validates every found `_index.md`'s content shape (must contain "Read this when:" and "What's here:" headings, plus a soft ~300-token budget warning), except `insight/_index.md` itself, which is locked template text per design §5.13 and deliberately omits those headings.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.
(No other project-internal imports.)

Used by:
- src/loops/onboarding-drift.ts: reuses layout-checking logic for the monthly scaffolding-drift review.
- src/schema/validate.ts: calls all three exports (`checkLayout`, `checkIndexPresent`, `checkIndexShape`).
- tests/atomic/recall/index-blocks.test.ts: exercises the collapsed/generated-index handling this file's exemptions interact with.
- tests/atomic/schema/evidence-check.test.ts: exercises the `atlas/evidence` subdirectory addition.

Semantically related (not imports):
- src/schema/checks/index-completeness.ts checks the CONTENT of an `_index.md` that this file has already confirmed exists and is shaped correctly — the two checks compose in sequence (presence/shape here, completeness there) rather than overlapping.

## Query pointers
If you need to understand why insight's and archive's per-file directories are exempt from the `_index.md` requirement, also read: `cortex-schema.md` §4.10.1, §4.4 and §7.1, and src/schema/checks/insight.ts (the module whose data trees this file exempts).
