---
id: loops.onboarding-drift
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
implements: ../../specs-business/loops/developer-gets-upkeep-proposals-without-asking.business.md
governed_by:
  - R-001
governs:
  - "src/loops/onboarding-drift.ts"
  - "skills/cortex-loop-onboarding-drift/**"
---

# Onboarding-Drift Loop

## Intent

`cortex loop-onboarding-drift` (monthly, design §11.4 item 7) checks the scaffolding that directs Claude into Cortex — the CLAUDE.md managed block and every `_index.md` — against the current schema's templates and budgets, and writes refresh proposals to `pulse/scaffolding-review.md`. Propose-don't-mutate: refreshing is the human running init-style updates, never this loop.

## Entities

- **READS:** `CLAUDE.md` (managed block, marker version); every `.cortex/**/_index.md`; `cortex.config.json` (`schemaVersion`); the shipped templates (`src/cli/templates.ts` output shapes).
- **WRITES:** `.cortex/pulse/scaffolding-review.md` only.
- **CREATES:** the report per schema §4.5 (`kind: pulse-scaffolding-review`, always-write).

## Rules

1. **Command + bundle.** `cortex loop-onboarding-drift` + shipped `skills/cortex-loop-onboarding-drift/SKILL.md` (registers the `onboarding-drift` task under `--partial`).
2. **Drift signals (v1):** (a) the CLAUDE.md block's marker version differs from `schemaVersion`, or the block is missing; (b) an `_index.md` missing a §7.1 required heading (reuse the validator's `check.index-shape` logic, don't reimplement); (c) an `_index.md` over the 300-token budget (chars/4); (d) a `.cortex/` directory whose `_index.md` is byte-identical to the shipped template while its directory content has since gained artefacts — a hint the prompt was never localised. Each finding proposes a concrete refresh action.
3. **Always-write (schema §4.5):** explicit "Scaffolding is current." when quiet.
4. **Read-only Core** (R-001): proposes `cortex init --force`-style refreshes; performs none.

## Acceptance Criteria

### Version-lagging CLAUDE.md block flagged

- **Given** a CLAUDE.md block marked `v0.9` while `schemaVersion` is `1.0`
- **When** the loop runs
- **Then** the report names the mismatch and proposes refreshing the managed block

### Malformed index flagged via shared logic

- **Given** an `_index.md` missing its "Read this when:" heading
- **Then** the report flags it (consistent with `check.index-shape`)

### Over-budget index flagged

- **Given** an `_index.md` of ~2000 characters
- **Then** the report flags the ~500-token estimate against the 300 budget

### Current scaffolding is a stated clean run

- **Given** a freshly initialised project
- **Then** the report reads "Scaffolding is current.", exit 0

### Only the report is written

- **Then** the only file created or modified is `pulse/scaffolding-review.md`

## Notes

- Signal (d) is a heuristic hint, labelled as such in the report — never an error.
- **Future work (noted, not this round):** an `_index.md` goes stale the moment its directory gains a file; this loop catches that monthly, which suits cerebrum churn. A PostWrite-hook enhancement could catch it at write time — candidate for §16.2 step 28 or v1.x.
