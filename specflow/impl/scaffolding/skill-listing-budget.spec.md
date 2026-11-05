---
id: scaffolding.skill-listing-budget
status: draft
depends_on: []
implements: ../../promises/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
governs:
  - "skills/*/SKILL.md"
  - "scripts/measure-skill-descriptions.mjs"
---

# Skill Listing Budget — descriptions are routing signal, not documentation

## Intent

Claude Code loads every installed skill's `name` and `description` into the system prompt of
every session and budgets the whole listing at roughly 1% of the context window (~2k tokens at
200k). The SKILL.md **body** is lazy-loaded and costs nothing until the skill is invoked. So a
description is not documentation that happens to be short — it is a permanently-resident routing
signal, and every character it spends is spent in every session of every project that installs
the bundle.

Measured across this repo's 31 shipped bundles: `name` + `description` totals **16,071 chars ≈
4,018 tokens** — about twice the entire listing budget, before Anthropic's built-in skills and
any user-level bundles, which share the same listing and cannot be shrunk from here. The
consequence is observable rather than theoretical: `specflow-viewer`'s description is truncated
mid-word in live sessions (it ends `"...or w…"`), which is the listing being cut off. A
truncated listing degrades routing for **every** skill in it, not only the one that overflowed.

Commit 089b15e fixed the `cortex-*` half of this (1,922 → 396 tokens) under a flat 120-char
ceiling, but shipped without a spec, and the flat ceiling does not generalise. This spec states
the contract for all 31 bundles and makes the ceiling depend on the thing that actually
determines whether a description can be short: **whether it is the bundle's only way in.**

## Entities

- **READS:** every `skills/*/SKILL.md` frontmatter (`name`, `description`);
  `src/cli/templates.ts` `SCHEDULED_TASKS` prompt bodies and `skills/*/SKILL.md` bodies (the
  name-dispatch evidence that assigns a bundle its tier).
- **WRITES:** `skills/*/SKILL.md` frontmatter descriptions and the `## When to use` body
  section that receives what a description sheds; `scripts/measure-skill-descriptions.mjs`
  (the guard).
- **CREATES:** nothing. `.claude/skills/` mirrors are maintained by the existing mirror
  convention, not by this spec.

## Rules

1. **Resident cost is `name` + `description`, and nothing else.** The body is free until
   invocation. Measurement, budget, and every ceiling in this spec refer to that sum, in
   characters, with tokens estimated at chars/4 for reporting only. A bundle whose frontmatter
   carries `disable-model-invocation: true` is not in the listing, so its resident cost is zero.

2. **The ceiling is set by dispatch, not by importance.** A bundle that some other prompt names
   **by name** does not depend on its description to be reached, so its description can be
   minimal. A bundle that nothing names can only be reached by a human's unprompted phrasing
   matching its description, so it must keep trigger surface. The two dispatchers in this
   repo are the task payloads (`storeV4TaskSkillMd`, `src/cli/templates.ts`, which name the three
   task skills) and sibling skill bodies.

3. **Four tiers.**
   - **Tier A — name-dispatched: ≤ 120 chars.** Description says what the skill does plus two
     or three trigger phrases, and nothing else.
   - **Tier B — cold-phrasing entry point: ≤ 250 chars.** Nothing names it; the description is
     the only routing signal, so it carries real trigger surface.
   - **Tier D — callable-only: ≤ 60 chars, no trigger phrases.** A skill nobody should be
     routed *into* by a description matching a sentence. It is reached by one of two explicit
     namings: the developer decides to run it and types `/<name>`, or **a prompt Cortex itself
     authors names it** — the task payloads in `src/cli/templates.ts` name `cortex-learn`,
     `cortex-fresh` and `cortex-quality`. Its description exists only so the listing can name
     it, and it makes no attempt to be matched: no trigger phrases, no PROACTIVELY, no
     phrasings. The name is the entire routing signal.
   - **Tier E — typed-only: no ceiling, resident cost zero.** Its frontmatter carries
     `disable-model-invocation: true`, so neither its name nor its description enters the
     listing, and only a typed `/<name>` runs it. It suits a skill run once per project or once
     per migration: `cortex-register-tasks` and `cortex-migrate` (P15). No prompt can dispatch
     a Tier E skill, so anything pointing at one gives the typed command.

   **Why Tier D is not just a smaller Tier B.** Automatic routing is a *cost* for these
   bundles, not a benefit: a skill that runs a scheduled maintenance task should never fire
   because a sentence happened to match. Removing
   the trigger surface is the point, and the token saving is a consequence. A Tier D bundle is
   therefore never promoted to Tier B to "make it easier to find" — being hard to trip is the
   behaviour being bought.

4. **Nothing is deleted, only moved.** Everything a description sheds — mechanism, phase lists,
   flag sequences, bundle membership, sibling boundaries — reappears under a `## When to use`
   section at the top of that bundle's body, where it costs nothing until the skill is invoked.
   The body's original opening prose keeps its own heading so hard invariants continue to read
   as mandatory rather than as advisory context about when to invoke.

5. **Descriptions are single-line quoted scalars.** The `>-` and `>` block scalars are the
   mechanism by which descriptions sprawled in the first place: they impose no visual cost on
   the author for a paragraph that costs every session. A single quoted line makes the length
   legible in the diff.

6. **Every routed bundle carries pinned trigger phrases.** Tiers A and B declare the
   phrases a human would plausibly type to reach them, and the guard fails if a rewrite drops
   one. A description may be rewritten freely; it may not become unreachable. Phrases are
   checked case-insensitively as substrings. **Tiers D and E declare none, and the guard fails
   a bundle of either tier that has any** — a pinned phrase would re-create the automatic
   routing the tier exists to remove, and Tier E has no listing to match.

7. **The guard measures every bundle by default.** It reports `name` + `description` per
   bundle, totals, and a diff against a git ref, and it exits non-zero when any bundle exceeds
   its tier's ceiling, loses a pinned phrase, or has no tier assignment at all. A bundle with
   no declared tier is a failure, not a default — an unclassified bundle is how a new
   description sprawls unnoticed. A Tier E bundle counts as zero in the total. The guard fails
   a Tier E bundle without the header, and a bundle with the header in any other tier.

8. **The two skill trees stay identical.** `skills/` is the source; `.claude/skills/` is this
   repo's own installed mirror. A description edit lands in both, byte-identical, in the same
   change.

9. **The shipped set is ten bundles.** `skills/` holds `FINAL_BUNDLES` (`src/store/migrate/system.ts`)
   and `cortex-migrate`, and no other directory with a `SKILL.md`. No shipped bundle has a name
   in `RETIRED_SKILL_NAMES`. `.claude/skills/` holds the same ten, plus `coordinate-sessions`,
   which this repository keeps for itself and the package does not ship.

## Acceptance Criteria

### SCAFFOLDING-SKILL-LISTING-BUDGET-1: A name-dispatched bundle fits Tier A

- **Given** `skills/verification-before-completion/SKILL.md`, whose name is referenced from other skill bodies
- **When** the guard measures it
- **Then** `name` + `description` is at most 120 characters
- **And** the description still contains its pinned trigger phrases

### SCAFFOLDING-SKILL-LISTING-BUDGET-2: A cold-phrasing entry point keeps its surface

- **Given** `skills/specflow-spec/SKILL.md`, which a developer reaches by describing the work
  rather than by naming it
- **When** the guard measures it
- **Then** `name` + `description` is at most 250 characters
- **And** the description still contains its pinned trigger phrases

### SCAFFOLDING-SKILL-LISTING-BUDGET-3: A callable-only bundle carries no trigger surface

- **Given** `skills/cortex-learn/SKILL.md`, assigned Tier D
- **When** the guard measures it
- **Then** `name` + `description` is at most 60 characters
- **And** the description contains no trigger phrasings, no "PROACTIVELY", and no quoted
  example utterances

### SCAFFOLDING-SKILL-LISTING-BUDGET-4: A Tier D bundle that declares trigger phrases fails the guard

- **Given** a Tier D bundle given a pinned trigger phrase
- **When** the guard runs
- **Then** it exits non-zero and reports that Tier D declares no phrases

### SCAFFOLDING-SKILL-LISTING-BUDGET-5: A typed-only bundle costs nothing and needs its header

- **Given** `skills/cortex-register-tasks/SKILL.md` and `skills/cortex-migrate/SKILL.md`, assigned
  Tier E, each carrying `disable-model-invocation: true`
- **When** the guard measures them
- **Then** each counts as 0 in the total and neither is tested against a ceiling
- **And given** the header removed from one, the guard exits non-zero and names that bundle
- **And given** the header added to a Tier A bundle, the guard exits non-zero and names that bundle

### SCAFFOLDING-SKILL-LISTING-BUDGET-7: The guard covers every bundle without a flag

- **Given** the 10 bundles under `skills/`
- **When** the guard runs with no arguments
- **Then** all of them appear in its output and its total equals the sum of the per-bundle values

### SCAFFOLDING-SKILL-LISTING-BUDGET-8: An unclassified bundle fails the guard

- **Given** a new bundle directory with a valid SKILL.md and no tier assignment
- **When** the guard runs
- **Then** it exits non-zero and names that bundle as missing a tier

### SCAFFOLDING-SKILL-LISTING-BUDGET-9: An over-ceiling description fails the guard

- **Given** a Tier A bundle whose description is edited to 200 characters
- **When** the guard runs
- **Then** it exits non-zero and reports the bundle, its size, and its ceiling

### SCAFFOLDING-SKILL-LISTING-BUDGET-10: A dropped trigger phrase fails the guard

- **Given** a bundle rewritten within its ceiling but with a pinned phrase removed
- **When** the guard runs
- **Then** it exits non-zero and names the lost phrase

### SCAFFOLDING-SKILL-LISTING-BUDGET-11: Shed content survives in the body

- **Given** any bundle whose description was shortened under this spec
- **When** its SKILL.md is read
- **Then** the body contains a `## When to use` section
- **And** the material removed from the description appears there

### SCAFFOLDING-SKILL-LISTING-BUDGET-12: The mirror matches the source

- **Given** every bundle edited under this spec
- **When** `skills/<b>/SKILL.md` and `.claude/skills/<b>/SKILL.md` are compared
- **Then** they are byte-identical

### SCAFFOLDING-SKILL-LISTING-BUDGET-13: The package ships exactly the ten

- **Given** `skills/`
- **When** its directories holding a `SKILL.md` are listed
- **Then** they are `FINAL_BUNDLES` and `cortex-migrate`, and nothing else
- **And** none of them has a name in `RETIRED_SKILL_NAMES`

### SCAFFOLDING-SKILL-LISTING-BUDGET-14: The mirror holds the same ten

- **Given** `.claude/skills/`
- **When** its directories are listed
- **Then** they are the ten shipped bundles and `coordinate-sessions`, and nothing else
- **And** every file in each of the ten is byte-identical to the file in `skills/`, with no strays on either side, `.cortex-installed.json` aside

## Notes

- **Round 2 removal, 2026-11-05 (P12, P15).** The 19 bundles the plan retires left `skills/` and the mirror. Tier C went with `specflow-entry`, its only member, and criterion 6 went with it; ids are not reused. Criteria 1 to 3 moved to bundles that still ship, and Rule 9 and criteria 13 and 14 pin the set. The Intent and the measurements below are the record of the 31-bundle listing.
- **Measured baseline (2026-08-05, pre-change):** `cortex-*` 14 bundles / 1,586 chars ≈ 397
  tok; `specflow-*` + `verification-before-completion` 17 bundles / 14,486 chars ≈ 3,622 tok;
  total 16,071 chars ≈ 4,018 tok. **Measured after implementation: 4,426 chars ≈ 1,107 tok**
  across the same 31 bundles — 11,645 chars ≈ 2,911 tokens saved in every session of every
  project that installs them. Tier census: A=26, B=2, C=1, D=2.
- **Tier assignment evidence.** Inbound name references were counted from every other bundle's
  body: `specflow-bugs` 19, `specflow-plan` 12, `specflow-develop` 11, `specflow-tests` 11,
  `specflow-onboard-codebase` 8, `specflow-spec-editor` 7, `specflow-ingest` 6,
  `specflow-brainstorm` 3, `specflow-lint` 2, `specflow-receive-review` 2,
  `specflow-intent-reconcile` 1, `verification-before-completion` 1 — all Tier A. Zero inbound
  references: `specflow-viewer`, `specflow-new-project`, `specflow-deep-onboard`,
  `specflow-request-review`. Of those four, `specflow-new-project` and
  `specflow-request-review` are Tier B — a developer reaches them by describing a product idea
  or asking for a review, not by naming them — while `specflow-viewer` and
  `specflow-deep-onboard` are Tier D: both are deliberate, expensive, explicitly-chosen runs
  (regenerating a client-facing site; spawning three parallel onboarding passes), and neither
  should ever fire from a sentence that merely resembles its purpose.
- **The goal is our controllable share, not the listing total.** Anthropic's built-in skills
  and any user-level bundles occupy the same budget and cannot be changed from this repo.
  Stating the target as "the listing under 2k" would make a correct outcome read as a failure.
- **Deliberately not done: merging or clustering bundles.** Evaluated and priced during
  planning: collapsing the 17 into ~6 parents would save roughly 330 tokens beyond the tiered
  shrink, against a `SKILL_MIGRATIONS` retirement entry per merge (`core-cli.sync` Rule 6 —
  a merge is a *delete* in every downstream project, prompting wherever the copy was edited),
  and rewrites of every name dispatch in `SCHEDULED_TASKS` and across ~90 cross-references
  between skill bodies. The tiered shrink alone brings this repo's listing under budget, so
  merging cannot justify itself on tokens. If it is wanted on maintenance grounds the natural
  clusters are the review pair and the onboarding pair; that is a separate spec.
- **Why 089b15e's flat 120 is not the contract.** It exempted `cortex-archive-ingest` and
  `cortex-register-tasks` for exactly the reason generalised into Rule 2 — no scheduled bundle
  names them, so the description is their only routing signal. This spec makes that
  discriminator explicit and applies it to both halves of the tree instead of hard-coding two
  exceptions.
- **Specflow batch, 2026-11-04, closed by the G2 sitting.** Rule 1, Rule 3 (Tier E), Rule 6 and Rule 7 change for P15, and `TIERS` in `scripts/measure-skill-descriptions.mjs` changes with them. `cortex-learn`, `cortex-fresh` and `cortex-quality` join at Tier D: dispatched by name from a task payload or typed, the route `loops.cortex-loop-bundle` Rule 3 admitted. `specflow-spec`, `specflow-review` and `specflow-onboard` join at Tier B (`specflow.spec-skill`, `specflow.review-skill`, `specflow.onboard-skill`); `specflow-review`'s pinned phrases include `here is the feedback`, the way into checking a received review. Each skill leaving the package leaves `TIERS` in the same change, since the guard fails a classified bundle not on disk. Three Tier D entries cost more resident characters than the one `cortex-loop` entry they replace, against the 4.0 listing's far smaller set. **10 skills ship, and 8 are in the listing:** Tier B `cortex-remember`, `specflow-spec`, `specflow-review`, `specflow-onboard`; Tier A `verification-before-completion`; Tier D `cortex-learn`, `cortex-fresh`, `cortex-quality`. `cortex-register-tasks` (from Tier A) and `cortex-migrate` (from Tier B) move to Tier E and cost nothing; their pinned phrases go, and `cortex-migrate`'s `>` description becomes a single quoted line (Rule 5).
