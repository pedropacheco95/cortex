# Compass — Overview

## What this is

The write-time enforcement layer and the unified bug ledger. It holds project conventions, operational pointers, rules, and a bug file per defect — the enforcement and observation view of the project. Renamed from `cerebrum/` at v3 (`migration.compass-rename`): the module is named for its role — the thing that tells the project which way it must go — not for a brain metaphor.

## What it covers

_No dev specs live in this folder yet — the module's enforcement surfaces are specified where they are built (the hooks, the loops, the schema checks). Coverage of the `.cortex/compass/` module:_

- `preferences.md` — project conventions
- `environment.md` — operational pointers (never secrets)
- `do-not-repeat.md`
- `rules/` — one file per rule, frontmatter plus an optional machine-checkable `check:` predicate
- `bugs/` — one file per bug, classified against SpecFlow's seven-type taxonomy

Decisions no longer live here: at v3, `atlas/decisions/` is the sole decisions home (`migration.decisions-single-home`) and a compass rule that derives from a decision cites it via `provenance:` frontmatter instead of restating it.

## Why it's grouped this way

Compass is the enforcement/observation view: what should be enforced at write time and what has gone wrong. Rules are NOT specs — specs reference rules by ID, keeping the rule corpus separate from the contract it constrains. The narrative *why* behind decisions lives in `atlas/`; compass holds only the enforceable and the observed.

The bug ledger lives here (rather than in `specflow/`) because it is an ongoing observation surface the enforcement hooks read, even though its taxonomy is defined by the absorbed SpecFlow lineage.

## Related groups

- Business outcomes for this domain: `../../specs-business/compass/`
- Narrative decisions and the *why*: `../atlas/`
- Rules enforced at write time by: `../hooks/`
- Bug taxonomy defined by: `../specflow/`
- The rename and decisions consolidation that shaped this module: `../migration/`
