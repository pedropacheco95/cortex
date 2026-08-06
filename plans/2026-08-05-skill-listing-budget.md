# Plan — cut the shipped skill listing's resident context cost

Date: 2026-08-05
Status: **executed** — approved 2026-08-05, including a fourth tier (callable-only) added
during execution at Pedro's request. Spec:
`.specflow/specs/scaffolding/skill-listing-budget.spec.md`.
**Outcome: 16,071 → 4,426 chars, 4,018 → 1,107 tok (−2,911 tok/session).** Tier census
A=26, B=2, C=1, D=2. Guard green, 1605/1605 tests pass.
Scope signal: 31 bundles, 1 domain (`specflow.*` specs govern `skills/specflow-*/**`) → **Light depth**

## Why this is a plan and not a develop run

`specflow-develop` was invoked, but its own prerequisites don't hold: there is no plan
artefact and no dev spec for the skill-listing budget. Commit 089b15e (the cortex shrink)
shipped spec-less; replicating that precedent is the wrong fix. Explore / gap analysis /
implementation plan belong to `specflow-plan`, which is what this file is. Execution waits
on (a) a spec under `.specflow/specs/specflow/` and (b) approval.

## The measurement

Resident cost is `name` + `description` only — the SKILL.md body is lazy-loaded and free
until invoked. Measured from `skills/*/SKILL.md` frontmatter, est. tokens at chars/4.

| group | bundles | chars | ~tok |
|---|---:|---:|---:|
| `cortex-*` (post-089b15e) | 14 | 1,586 | 397 |
| `specflow-*` + `verification-before-completion` | 17 | 14,486 | 3,622 |
| **repo total** | **31** | **16,072** | **4,018** |

Claude Code budgets the whole listing at ~1% of context (~2k tokens). This repo alone is
~2x over, before Anthropic's built-ins (`dataviz`, `claude-api`, `artifact-*`, `loop`,
`schedule`, …) and `graphify` — which share the same listing and which we cannot touch.

**Empirical proof of the failure mode, not just arithmetic:** in this session's listing,
`specflow-viewer`'s description is truncated mid-word — it ends `"...or w…"`. Entries are
already being cut off, which is exactly the routing degradation 089b15e described.

**Goal framing:** reduce *our controllable share* from ~4,018 → ~1,200 tok. Not "get the
listing under 2k" — the built-ins are in the same listing, so that framing would make a
good result read as a miss.

## Lever 1 (recommended): tiered description shrink

089b15e used a flat 120-char ceiling for `cortex-*`. **A flat 120 is wrong here**, and the
reason is the same one 089b15e itself used to exempt `cortex-archive-ingest`: *the ceiling
depends on whether the description is the bundle's only routing signal.*

The cortex loops could go to 120 because `SCHEDULED_TASKS` (`src/cli/templates.ts`)
dispatches them **by name** from the bundle prompt bodies — verified: `templates.ts:480,492,509`
name `cortex-loop-insight-refresh-daily`, `cortex-pulse-distil`, `cortex-loop-insight-refresh-full`
etc. inline. The same discriminator applies to specflow, via a different dispatcher:
`specflow-entry`'s routing table (`skills/specflow-entry/SKILL.md:35-40`) and sibling skill
bodies name most of the specflow bundles explicitly.

Inbound name references from *other* bundles' bodies (measured):

| bundle | inbound refs | chars now | tier | target |
|---|---:|---:|---|---:|
| specflow-bugs | 19 | 1,030 | A | 120 |
| specflow-plan | 12 | 648 | A | 120 |
| specflow-develop | 11 | 876 | A | 120 |
| specflow-tests | 11 | 567 | A | 120 |
| specflow-onboard-codebase | 8 | 723 | A | 120 |
| specflow-spec-editor | 7 | 1,118 | A | 120 |
| specflow-ingest | 6 | 756 | A | 120 |
| specflow-brainstorm | 3 | 682 | A | 120 |
| specflow-lint | 2 | 772 | A | 120 |
| specflow-receive-review | 2 | 599 | A | 120 |
| specflow-intent-reconcile | 1 | 651 | A | 120 |
| verification-before-completion | 1 | 633 | A | 120 |
| specflow-new-project | 0 | 1,037 | B | 250 |
| specflow-request-review | 0 | 685 | B | 250 |
| specflow-viewer | 0 | 1,890 | D | 60 |
| specflow-deep-onboard | 0 | 689 | D | 60 |
| specflow-entry | 2 | 1,130 | C | **keep** |

- **Tier A — name-dispatched (120 chars).** Reached because `specflow-entry` or a sibling
  names them. Description = what it does + 2–3 trigger phrases, exactly the 089b15e recipe.
- **Tier B — cold-phrasing entry points (250 chars).** Nothing names them; a human's
  unprompted wording is the only way in, so they keep real trigger surface.
- **Tier C — `specflow-entry` keeps its 1,130 chars.** It is the mandatory gate on
  *arbitrary* phrasing in every spec-managed project. Cutting the one entry whose whole job
  is catching unclassified requests is how you break routing while reporting a saving.
- **Tier D — callable-only (60 chars, no trigger phrases).** Added during execution:
  `specflow-viewer` and `specflow-deep-onboard`. For these, automatic routing is a *cost*,
  not a benefit — regenerating a client-facing site or spawning three parallel onboarding
  passes should never fire because a sentence resembled the purpose. The description exists
  only so the listing can name it; the developer types `/<name>`. The token saving is a
  consequence of removing the trigger surface, not the reason for it.

Measured after implementation: **16,071 → 4,426 chars, 4,018 → 1,107 tok — a 72% cut,
2,911 tok saved per session, in every consuming project.**

Everything cut moves to a `## When to use` section at the top of each body, where it costs
nothing until invocation — same as 089b15e.

## Lever 2 (recommended: don't): merge/cluster bundles

**Lever 1 alone brings the repo listing to ~1,289 tok, under the ~2k budget.** Merging is
therefore not needed for the budget, and has to justify itself on routing clarity or
maintenance instead. It doesn't, yet:

- **It is a delete in every downstream project.** Retirement is possible — `sync.spec.md`
  Rule 6 has the `SKILL_MIGRATIONS` chain and `specflow-change-router` already went that way
  — but each merge costs a migration entry, a prompt for every project whose copy was edited
  (Rule 13), and permanent orphan risk on decline.
- **It breaks name dispatch.** The 11 loop/pulse bundles are named inline in
  `SCHEDULED_TASKS` prompt bodies; the specflow bundles are named in `specflow-entry`'s
  routing table and in ~90 cross-references between bodies. A merge rewrites all of them.
- **It saves nothing extra.** 17 → 6 parent bundles saves ~11×120 = 1,320 chars ≈ 330 tok
  beyond Lever 1 — for surgery on the public skill surface of a published npm package.

If merging is wanted later on *maintenance* grounds, the natural cluster is the review pair
(`specflow-request-review` + `specflow-receive-review`) and the onboarding pair
(`specflow-onboard-codebase` + `specflow-deep-onboard`). That is a separate spec.

## Lever 3: widen the guard

`scripts/measure-skill-descriptions.mjs` **already has `--all`** — the work is small:

1. Make all-bundles the default (keep `--cortex-only` if a caller wants the old view).
2. Replace flat `MAX_CHARS = 120` with the tier map above, so a Tier B bundle isn't failed
   for being 250 and a Tier A one can't quietly grow.
3. Add `REQUIRED_TRIGGERS` entries for the 17 — the script already fails a bundle with no
   entry, so this is mandatory, not optional.

## Spec placement

Not `.specflow/specs/specflow/` — that group's territory is `skills/specflow-*/**`
(`specflow.reorg`'s `governs:` glob), and this spec governs the descriptions of **all 31
bundles including `cortex-*`** plus `scripts/measure-skill-descriptions.mjs`.

**Proposed: `.specflow/specs/scaffolding/skill-listing-budget.spec.md`.** That group's
`_overview.md` claims exactly this territory — *"active prompts disguised as documentation,
with token budgets"* — and its two written specs are both budgeted prompt surfaces
(`scaffolding.coverage-map` budgets the CLAUDE.md block; this budgets the skill listing).
`core-cli.sync` owns bundle *lifecycle* (Rule 6, retirement) but not their content.

`implements:` → `../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md`
(currently untracked, `status: draft`), adding a fourth entry to its `implemented_by:`. The
fit: a truncated description means the assistant cannot reach the right skill, which is the
same "stops being a gamble" outcome that spec promises. **This is the one placement call
worth a second opinion** — if the outcome is judged to be about knowledge coverage rather
than routing, a new sibling business spec is needed instead.

## Tasks

| # | Task | Files | Criterion | Verify |
|---|---|---|---|---|
| 0 | Write the dev spec, wire `implements:`/`implemented_by:`, update `scaffolding/_overview.md` + `specs/_index.md` | `.specflow/specs/scaffolding/skill-listing-budget.spec.md` + 3 | — | `cortex validate` |
| 1 | Tier A shrink (12 bundles) | `skills/<b>/SKILL.md` ×12 | AC3 | `node scripts/measure-skill-descriptions.mjs --all --base <pre-ref>` |
| 2 | Tier B shrink (4 bundles) | `skills/<b>/SKILL.md` ×4 | AC4 | same |
| 3 | Tier map + all-bundles default + `REQUIRED_TRIGGERS` ×17 | `scripts/measure-skill-descriptions.mjs` | AC1–2 | `pnpm check:skill-budget` → **green** |
| 4 | Mirror to `.claude/skills/` | `.claude/skills/<b>/SKILL.md` ×16 | AC5 | `pnpm test` (mirror tests) |
| 5 | Tests for all 12 ACs | `tests/atomic/scaffolding/`, `tests/spec/scaffolding/` | all | `pnpm test` |
| 6 | Re-measure and report | — | — | `pnpm check:skill-budget --base <pre-ref>` |

**Task 5 required a refactor of the guard.** Its checks ran at import time against a
module-level `SKILLS_DIR`, so the four negative-path ACs (unclassified bundle, over-ceiling,
dropped phrase, Tier D with phrases) could not be tested without breaking a real bundle on
disk. The per-row check is now an exported pure `evaluate(rows, triggers)` and the CLI is a
`main()` guarded on `isMain`; importing the module produces no output and no exit code.
Putting the conformance assertions in `tests/spec/` also means a regression fails `pnpm test`
rather than waiting for someone to remember `pnpm check:skill-budget`.

**Task order is deliberate: shrink before tightening the guard.** If the tier map landed
first it would fail on all 16 not-yet-shrunk bundles, so its own verify command could not
pass — the guard is tightened last, against already-compliant content, and goes green on the
first run. Tasks 1–2 verify with the explicit `--all --base` invocation (a measurement, not a
gate) until the gate exists.

`REQUIRED_TRIGGERS` phrases added in Task 3 must be substrings of the **post-shrink**
descriptions — pick each phrase from the rewritten text in Tasks 1–2, not from the current
sprawling one, or the trigger assertion fails for a reason unrelated to the budget.

Mirror count verified: `.claude/skills/` holds all 31 bundles, so Task 4 is exactly the 16
edited in Tasks 1–2.

## Constraints that bind execution

1. **The mirror is test-enforced.** Every edit lands in *both* `skills/` and
   `.claude/skills/`. Tests regex-match phrases — do not reflow a pinned phrase across lines.
2. **Single-line quoted scalars only.** The `>-` block scalars are what let descriptions
   sprawl in the first place (089b15e).
3. **No body content is lost** — everything cut from a description reappears under
   `## When to use`, and hard invariants stay under their own heading so they read as
   mandatory, not advisory.
4. **`cortex sync` is the delivery path.** Marker-clean bundles upgrade silently; edited ones
   prompt.

## Decisions needing approval (with recommendations)

1. **Tier B ceiling — recommend 250 chars.** Enough for a sentence plus three trigger
   phrases, which is what a cold-phrasing entry point needs. Still an 86% cut on
   `specflow-viewer`. Tighter risks making the four unreachable bundles genuinely
   unreachable.
2. **`specflow-entry` — recommend keeping all 1,130 chars.** Trimming to ~600 saves ~130 tok
   and undercuts the premise of the other 12 cuts: every Tier A justification assumes entry
   actually fires on arbitrary phrasing and routes by name. Cutting the router to fund the
   routed is the wrong trade.
3. **Lever 2 (merging) — recommend dropping it from this spec.** Priced above at ~330 tok
   beyond Lever 1, against migration entries, per-project prompts, and ~90 cross-reference
   rewrites. File the review-pair and onboarding-pair clusters as a separate maintenance
   spec if wanted on those grounds.
4. **Spec placement** — see above; `scaffolding/` recommended, worth a second opinion.
