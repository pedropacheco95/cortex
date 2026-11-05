# Schema — Overview

## What this is

The `cortex-schema.md` contract plus the schema validator — the load-bearing artefact that defines the `.cortex/` directory layout, file formats, frontmatter conventions, traceability, and schema versioning. Core implements it, Skills consume it, and both reference it by version.

## What it covers

**Specs written:**

- `schema.validator` — Verifies any artefact tree (`.cortex/`, `specs/`, `specs-business/`, `tests/`) against the contract: directory layout, frontmatter, traceability symmetry, cross-reference resolution, test-layer conventions, and schema version.
- `schema.version-2` — the version-gate wiring and the B-014 three-way agreement (contract header, validator constants, init template); amended in place at each MINOR, 3.4 included.
- `schema.validator-insight-checks` — the insight-module checks and the typed pulse-gate extension of `check.pulse`.
- `schema.schema-clauses` — (3.4) `schema:§N[.M[.K]]` as a reference form: the heading-scan resolver, cached per validate run, unresolved → warning.
- `schema.bears-on` — (3.4) the citation graph's first forward edge: the mixed-ref grammar and resolver by shape shared by every carrier, `check.bears-on` on decisions and evidence, and the rule that the inverse is computed (the recall index), never stored.
- `schema.id-registry` — (3.4 fifth revision) the append-only `compass/registry.md` every rule and bug id is issued through, `cortex id next rule|bug`, `check.id-registry`, and the `cortex sync` migration that creates it once — so parallel branches collide loudly in git instead of silently in the validator.
- `schema.visibility` — (3.4 fifth revision) `visibility.repo` in `cortex.config.json` and `check.visibility`: when the repository is public, a line-level warning for hosts, addresses, ports, SSH targets and account ids in tracked compass and atlas files, with an `allow` list.

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
