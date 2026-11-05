# Migration — Overview

## What this is

The engineering specs for the v3 module migration (build-order-v3 step 2): the in-place reshaping of `.cortex/` to the v3 module set and names — the `cerebrum`→`compass` rename with its full re-root ripple, and the decisions single-home consolidation that removes the last "same data, two views" duplicate.

## What it covers

- `migration.compass-rename` — the content-preserving directory move `cerebrum/`→`compass/`, every path-constant and validator-check re-root (check IDs unchanged), the scaffolding and skill/loop text re-root, node-id grammar re-spelling (content-keyed `rule:`/`bug:` prefixes untouched), and the coupled schema 3.0 version-gate activation — atomic with the rename.
- `migration.decisions-single-home` — `atlas/decisions/` becomes the sole decisions home: `cerebrum/decisions.md` is reconciled (no fact lost) and deleted in place, never renamed; compass rules that inlined decision text carry a `provenance: derives_from:` citation instead; the atlas-side field renames `cerebrum_rules`→`compass_rules`.

## Why it's grouped this way

Migration steps are real, shippable dev work with acceptance criteria of their own — but they are transitional by nature: they describe how the system got from the v2 shape to the v3 shape, not an ongoing capability. Grouping them apart from the modules they touched keeps the destination domains (`compass/`, `atlas/`) describing what *is*, while this domain records the verified path taken — including the sequencing constraints (rename before citations; version bump atomic with the rename; decisions removed, never renamed-then-removed) that made the migration safe.

## Related groups

- Business outcomes for this domain: `../../specs-business/migration/`
- The renamed module: `../compass/`
- The sole decisions home the consolidation confirmed: `../atlas/`
- The provenance upgrade that validated the migration-era citations: `../provenance/`
