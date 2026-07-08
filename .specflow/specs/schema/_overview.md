# Schema — Overview

## What this is

The `cortex-schema.md` contract plus the schema validator — the load-bearing artefact that defines the `.cortex/` directory layout, file formats, frontmatter conventions, traceability, and schema versioning. Core implements it, Skills consume it, and both reference it by version.

## What it covers

**Specs written:**

- `schema.validator` — Verifies any artefact tree (`.cortex/`, `specs/`, `specs-business/`, `tests/`) against the contract: directory layout, frontmatter, traceability symmetry, cross-reference resolution, test-layer conventions, and schema version.

_Planned coverage (not yet written):_

- The `.cortex/` directory layout and the `specs/`, `specs-business/`, and `tests/` conventions
- File formats and YAML frontmatter conventions
- Traceability fields: `implements:` (single value), `implemented_by:` (list), `covers:`
- Test-layer conventions (atomic / spec / journey / scenario)
- Hook payload contracts
- Cross-reference conventions between artefacts
- Schema versioning

## Why it's grouped this way

This domain owns the *contract* only. The things that implement it (Core) or consume it (Skills) live in other domains and reference the schema by version. Keeping the contract isolated lets every other domain depend on a single versioned source of truth without coupling to each other.

The validator lives here because it is the executable embodiment of the contract — it checks artefacts against exactly the conventions this domain defines, and nothing about runtime behaviour.

## Related groups

- Business outcomes for this domain: `../../specs-business/schema/`
- Implemented by the CLI: `../core-cli/`
- Consumed by the absorbed spec-and-test lineage: `../specflow/`
