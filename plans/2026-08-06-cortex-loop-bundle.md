# Plan — merge the eleven loop bundles into one callable-only `cortex-loop`

Date: 2026-08-06
Spec: `.specflow/specs/loops/cortex-loop-bundle.spec.md`
Status: **executed** (approved by Pedro 2026-08-06 — all 11, Tier D, in-skill dispatch, no
coverage-map line). **Outcome: 4,426 → 3,224 chars, 1,107 → 806 tok (−301/session).**
1787 tests pass (+65 for this spec), guard green, `cortex validate` conformant, mirror
identical. Two defects found and fixed during execution: a duplicate 3.3 migration entry
(the chain allows one per version — folded into the existing entry) and `governs:` drift in
eleven loop specs still pointing at the deleted directories (validate 2 → 13 warnings, now
back to the 2 pre-existing ones).

## Depth and batching

Twelve acceptance criteria across 12 skill directories, `templates.ts`, `scaffold.ts`, the
guard, 13 test files, and the mirror. That is **Standard** by the size table, and
standing-authorities caps `specflow-develop` at **Minimal or Light** until the writer/verifier
harness ships — the instruction is to *split the batch*, not to retry lower mid-run. So this
runs as **four Light-depth batches**, each with its own verify command, executed in order.

A batch may leave the suite red; only the state after batch 4 is required green. Each batch
states what it is expected to break, so a red run is recognisable as progress rather than
regression.

## Batch 1 — build `cortex-loop`, leave the old bundles in place

Create `skills/cortex-loop/SKILL.md` (Tier D description, dispatch table, shared discipline)
and `skills/cortex-loop/references/<short-id>.md` ×11, each carrying its source bundle's
discipline **verbatim** (Rule 2 — the thick loops, `session-observe` 167 lines,
`pulse-distil` 92, `insight-refresh-daily` 85, are moves, not summaries).

The eleven short ids: `hygiene`, `bug-triage`, `spec-drift`, `rule-decay`, `onboarding-drift`,
`atlas-staleness`, `distil`, `session-observe`, `test-runner`, `insight-refresh-daily`,
`insight-refresh-full`.

- Criterion: "Every loop has a reference file carrying its discipline", "The dispatch table
  names every reference file", "The merged skill advertises nothing"
- Verify: every reference file contains its loop's CLI verb and report path; `SKILL.md`
  description ≤ 60 chars including name
- Expected red: none yet — nothing has been deleted

## Batch 2 — rewrite the payloads and the profile scoping

`src/cli/templates.ts`: in all five bundles, change each merged member's instruction from
invoking `cortex-loop-<x>` to invoking `cortex-loop` + `references/<short-id>.md`; collapse
`requiredSkills` (dedup `cortex-loop`); drop the merged names from `specflowOnlySkills`,
leaving only real droppable skill directories (`specflow-bugs`, `specflow-lint`).
`specflowOnlyMembers` is untouched — it holds member names, and `specflow-verify` among them
is a CLI verb with no bundle of its own.

- Criterion: "Each payload invokes `cortex-loop` and names the reference file"; "Cadence,
  model, order, and failure isolation are unchanged"; "`requiredSkills` names only directories
  that exist"; "A non-`specflow` profile still skips the spec loops, by instruction"
- Verify: `pnpm test tests/atomic/core-cli tests/spec/core-cli`
- Expected red: task-payload and init/sync tests asserting old member text — those are the
  tests batch 4 updates

## Batch 3 — retire the eleven, update the guard

`src/cli/scaffold.ts`: append a `SKILL_MIGRATIONS` entry **at version 3.3** (Rule 7 — entries
are declarative, `retiredBundles` is called with `toVersion = SCHEMA_VERSION`, so a 3.3 entry
is in force for every project at or past 3.3 on the next sync). **No `SCHEMA_VERSION` change.**

Delete the eleven directories from `skills/` and `.claude/skills/`.

`scripts/measure-skill-descriptions.mjs`: drop the eleven from `TIERS` and
`REQUIRED_TRIGGERS`, add `cortex-loop: 'D'` with an empty phrase list, and correct the
`TIER_CEILING` docblock's Tier D description to admit payload dispatch.

`.specflow/specs/scaffolding/skill-listing-budget.spec.md`: amend Rule 3's Tier D rationale
the same way (Rule 3 of this spec — a new spec must not leave an old one's rule wrong).

`cortex-schema.md` §9.1: amend the "prompt body invokes each member loop's underlying skill by
its real name" sentence. **Prose only** — no version header, no changelog entry.

- Criterion: "The migration entry names all eleven at the current version"; "The listing cost
  falls to one Tier D entry"; "The sibling tier rule is amended, not left contradicting"
- Verify: `pnpm check:skill-budget` → green, total ≥ 1,100 chars lower
- Expected red: `tests/spec/scaffolding/skill-listing-budget.test.ts` — its Tier D membership
  assertion pins exactly `['specflow-deep-onboard', 'specflow-viewer']`

## Batch 4 — tests and mirror

Update the **13** test files that name the merged bundles:
`tests/spec/core-cli/{init,sync}.test.ts`, `tests/spec/pulse/{promotion-mechanism.spec,hygiene}.test.ts`,
`tests/spec/loops/{atlas-staleness,rule-decay}.test.ts`, `tests/spec/specflow/awareness.test.ts`,
`tests/atomic/core-cli/{tasks-register,init,init-profile,task-scoping}.test.ts`,
`tests/atomic/pulse/review-cli.test.ts`, and
`tests/spec/scaffolding/skill-listing-budget.test.ts` (Tier D membership — decide: extend the
literal to three, or derive it from `TIERS`; derive is better, it stops the next Tier D
addition from breaking an unrelated test).

Add tests for this spec's twelve ACs under `tests/atomic/loops/` and `tests/spec/loops/`.
Mirror `skills/cortex-loop/` into `.claude/skills/` and confirm the eleven are gone from both.

- Verify: `pnpm test` green; `pnpm check:skill-budget` green; `pnpm dev validate` conformant
- Expected red: none — this is the batch that must land green

## Constraints

1. **Verbatim moves.** A reference file that summarises a thick loop is a behaviour change
   wearing a packaging change's clothes (spec Rule 2).
2. **Mirror is test-enforced.** Every edit lands in both `skills/` and `.claude/skills/`;
   pinned phrases must not be reflowed across lines.
3. **`cortex-schema.md` is already dirty** with the in-flight coverage-map work, so the §9.1
   prose edit cannot be committed cleanly on its own — flag it at commit time rather than
   sweeping that work in, exactly as `_index.md` was handled last round.
4. **No `SCHEMA_VERSION` bump**, and therefore no churn in `supportedMinor`, the CLAUDE.md
   managed-block template, or the version-agreement tests.
