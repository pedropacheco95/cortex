# Cerebrum — Overview

## What this is

The write-time enforcement layer and the unified bug ledger. It holds project conventions, operational pointers, rules, decisions in spec form, and a bug file per defect — the enforcement and observation view of the project.

## What it covers

_No specs written yet — this tree is scaffolded structure only. Planned coverage:_

- `preferences.md` — project conventions
- `environment.md` — operational pointers (never secrets)
- `do-not-repeat.md`
- `decisions.md` — ADRs in spec format
- `rules/` — one file per rule, frontmatter plus an optional machine-checkable `check:` predicate
- `bugs/` — one file per bug, classified against SpecFlow's seven-type taxonomy

## Why it's grouped this way

Cerebrum is the enforcement/observation view: what should be enforced at write time and what has gone wrong. Rules are NOT specs — specs reference rules by ID, keeping the rule corpus separate from the contract it constrains. The narrative *why* behind decisions lives in `atlas/`; cerebrum holds only the enforceable and the observed.

The bug ledger lives here (rather than in `specflow/`) because it is an ongoing observation surface the enforcement hooks read, even though its taxonomy is defined by the absorbed SpecFlow lineage.

## Related groups

- Business outcomes for this domain: `../../specs-business/cerebrum/`
- Narrative decisions and the *why*: `../atlas/`
- Rules enforced at write time by: `../hooks/`
- Bug taxonomy defined by: `../specflow/`
