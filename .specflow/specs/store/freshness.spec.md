---
id: store.freshness
status: draft
depends_on:
  - store.layout
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/freshness.ts"
  - "src/store/checks/now-until.ts"
  - "src/store/checks/stale.ts"
---

# Freshness: `until:` expiry and `depends_on` staleness

## Intent

Each module goes stale in its own way (schema S1). Two mechanisms are deterministic and live in Core. `now/` items expire on their `until:` date. Facts that declare `depends_on` are flagged when git shows those paths changed after the fact's `verified` date. Re-verifying a fact is judgement, so Core only reports.

## Rules

1. `check.now-until`: a `now/` item without `until:` is an `error`. An item whose `until` ≤ today is a `warning` ("expired").
2. `cortex store expire` lists the expired items. With `--apply`, it removes them from their `now/` files and appends them, with their source file, to `history/changes/<today>-now-expired.md` (`kind: other`, `status: expired`). The history file is created, or appended to if it already exists today. Nothing else is deleted. An expired item in `now/proposals.md` (heading `## S-NNN: …` or `## G-NNN: …`) is a **proposal that expired unreviewed**. Its history record keeps its id and full text under the marker line `pending decision, expired unreviewed`. `cortex store expire` (with or without `--apply`) prints a separate line `<n> proposal(s) expired unreviewed: <ids>` whenever n > 0, so a morning reader sees that the calendar, not a person, closed them.
3. `cortex store stale [--json]` (and `check.stale`, a warning): for every file with `depends_on`, list each path or glob with at least one commit after the file's `verified` date (`git log --since=<verified+1 day> -- <path>`), with the newest commit's short sha and date.
4. `today` is injectable (`--today YYYY-MM-DD`) for tests and loops. Its default is the local date.
5. Outside a git repository, `stale` prints `not a git repository` and exits 0 with no findings.

## Acceptance Criteria

### A `now/` item without until is an error

- **Given** `now/team.md` contains `- Rui is away`
- **When** the store is validated
- **Then** `check.now-until` reports an `error` naming the item

### An expired item is a warning

- **Given** an item with `until: 2026-10-01`, and today is 2026-10-14
- **When** the store is validated
- **Then** `check.now-until` warns "expired"

### Expiry moves items to history

- **Given** `now/team.md` has an expired item and one that is not expired
- **When** `cortex store expire --apply --today 2026-10-14` runs
- **Then** `now/team.md` keeps only the unexpired item
- **And** `history/changes/2026-10-14-now-expired.md` contains the expired item's text and `now/team.md` as its origin

### Unreviewed proposals are marked and counted on expiry

- **Given** `now/proposals.md` holds `## S-021: Headless cortex commands hang` with `until: 2026-10-10` and `status: pending decision`, and today is 2026-10-14
- **When** `cortex store expire --apply --today 2026-10-14` runs
- **Then** it prints the line `1 proposal(s) expired unreviewed: S-021`
- **And** `history/changes/2026-10-14-now-expired.md` holds `S-021`, its full text and the line `pending decision, expired unreviewed`

### Expire without --apply changes nothing

- **Given** the same store
- **When** `cortex store expire` runs
- **Then** it lists the expired item, and no file changes

### A changed dependency is reported stale

- **Given** `code/hooks/latency.md` has `verified: 2026-10-01 (observed)` and `depends_on: [src/hooks/pre-read.ts]`, and a commit on 2026-10-05 changed that file
- **When** `cortex store stale` runs
- **Then** it reports `code/hooks/latency.md` → `src/hooks/pre-read.ts` with that commit's sha and date

### An unchanged dependency is not reported

- **Given** the same file, but no commit touched `src/hooks/pre-read.ts` after 2026-10-01
- **When** `cortex store stale` runs
- **Then** it reports nothing

### Outside git, stale is a no-op

- **Given** a store in a directory that isn't a git repository
- **When** `cortex store stale` runs
- **Then** it prints `not a git repository` and exits 0
