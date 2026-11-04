# Store — Overview

## What this is

The engineering specs for the schema 4.0 store: the visible `cortex/` folder, its validator, the generated `MAP.md` and managed blocks, first-class rules, freshness, the 3.x → 4.0 migration, and the one capture skill. Contract: `cortex-schema.md` Part II.

## What it covers

- `store.layout`: modules, folders, file shape, frontmatter and naming (schema S1–S3, S6, S7).
- `store.validate`: `cortex store validate` and every 4.0 check, including the placement lint and near-duplicate detection (S11).
- `store.map`: `MAP.md` generation (read triggers, placement procedure, kind → folder table, tie-breaker, hard rules, cast, terms) (S8.1, S8.2).
- `store.rules`: rules as first-class files and the `applies_when` description lint (S4).
- `store.freshness`: `until:` expiry and the `depends_on` staleness report (S3, S6).
- `store.managed-block`: the 4.0 `CLAUDE.md` and `AGENTS.md` blocks, with the `## Specs` section (S8.3).
- `store.migrate`: `cortex migrate` 3.x → 4.0, with dry run, plan file, coverage report, apply and accept (S9.3).
- `store.remember-skill`: the `cortex-remember` skill, which captures a fact by MAP's placement procedure and ends with a readback.

## Why it's grouped this way

One store, one contract section. The layout spec defines the shape, and every other spec reads or writes it. Each lives in `src/store/`, with a verb under `cortex store` (`migrate` is top-level), so the 3.x commands keep working on `.cortex/` until a project accepts its migration.

## Related groups

- Business outcome: `../../specs-business/store/`
- Superseded at 4.0 (still in force for 3.x stores): `../recall/`, `../hooks/` (search-annotate, prompt-route, session-end), `../pulse/` (threads, distil, hygiene, review-cli)
- The 3.x validator, which keeps running on `.cortex/`: `../schema/`
