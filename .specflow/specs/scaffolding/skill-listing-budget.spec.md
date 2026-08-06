---
id: scaffolding.skill-listing-budget
status: implemented
depends_on: []
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
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
   characters, with tokens estimated at chars/4 for reporting only.

2. **The ceiling is set by dispatch, not by importance.** A bundle that some other prompt names
   **by name** does not depend on its description to be reached, so its description can be
   minimal. A bundle that nothing names can only be reached by a human's unprompted phrasing
   matching its description, so it must keep trigger surface. The two dispatchers in this
   repo are `SCHEDULED_TASKS` (`src/cli/templates.ts`, which names the eleven loop/pulse
   bundles inline in its prompt bodies) and `specflow-entry`'s routing table (plus sibling
   skill bodies).

3. **Four tiers.**
   - **Tier A — name-dispatched: ≤ 120 chars.** Description says what the skill does plus two
     or three trigger phrases, and nothing else.
   - **Tier B — cold-phrasing entry point: ≤ 250 chars.** Nothing names it; the description is
     the only routing signal, so it carries real trigger surface.
   - **Tier C — `specflow-entry`: exempt.** It is the mandatory gate on *arbitrary* phrasing in
     every spec-managed project, and every Tier A assignment depends on it firing and routing
     by name. Cutting the router to fund the routed is not a saving.
   - **Tier D — callable-only: ≤ 60 chars, no trigger phrases.** A skill nobody should be
     routed *into* by a description matching a sentence. It is reached by one of two explicit
     namings: the developer decides to run it and types `/<name>`, or **a prompt Cortex itself
     authors names it** — the scheduled-task payloads in `src/cli/templates.ts` name
     `cortex-loop` and the reference file for the member they are running
     (`loops.cortex-loop-bundle` Rule 3). Its description exists only so the listing can name
     it, and it makes no attempt to be matched: no trigger phrases, no PROACTIVELY, no
     phrasings. The name is the entire routing signal.

   **Why Tier D is not just a smaller Tier B.** Automatic routing is a *cost* for these
   bundles, not a benefit: a skill that regenerates a client-facing site, that spawns three
   parallel onboarding passes, or that runs a scheduled maintenance loop, should never fire
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

6. **Every routed bundle carries pinned trigger phrases.** Tiers A, B, and C declare the
   phrases a human would plausibly type to reach them, and the guard fails if a rewrite drops
   one. A description may be rewritten freely; it may not become unreachable. Phrases are
   checked case-insensitively as substrings. **Tier D declares none, and the guard fails a
   Tier D bundle that has any** — a pinned phrase would re-create the automatic routing the
   tier exists to remove.

7. **The guard measures every bundle by default.** It reports `name` + `description` per
   bundle, totals, and a diff against a git ref, and it exits non-zero when any bundle exceeds
   its tier's ceiling, loses a pinned phrase, or has no tier assignment at all. A bundle with
   no declared tier is a failure, not a default — an unclassified bundle is how a new
   description sprawls unnoticed.

8. **The two skill trees stay identical.** `skills/` is the source; `.claude/skills/` is this
   repo's own installed mirror. A description edit lands in both, byte-identical, in the same
   change.

## Acceptance Criteria

### A name-dispatched bundle fits Tier A

- **Given** `skills/specflow-bugs/SKILL.md`, whose name is referenced from other skill bodies
- **When** the guard measures it
- **Then** `name` + `description` is at most 120 characters
- **And** the description still contains its pinned trigger phrases

### A cold-phrasing entry point keeps its surface

- **Given** `skills/specflow-new-project/SKILL.md`, whose name no other prompt references and
  which a developer reaches by describing a product idea rather than by naming it
- **When** the guard measures it
- **Then** `name` + `description` is at most 250 characters
- **And** the description still contains its pinned trigger phrases

### A callable-only bundle carries no trigger surface

- **Given** `skills/specflow-viewer/SKILL.md`, assigned Tier D
- **When** the guard measures it
- **Then** `name` + `description` is at most 60 characters
- **And** the description contains no trigger phrasings, no "PROACTIVELY", and no quoted
  example utterances

### A Tier D bundle that declares trigger phrases fails the guard

- **Given** a Tier D bundle given a pinned trigger phrase
- **When** the guard runs
- **Then** it exits non-zero and reports that Tier D declares no phrases

### `specflow-entry` is exempt and is not shrunk

- **Given** `skills/specflow-entry/SKILL.md`
- **When** the guard measures it
- **Then** no ceiling is applied to it
- **And** its description is unchanged from the revision preceding this spec

### The guard covers every bundle without a flag

- **Given** the 31 bundles under `skills/`
- **When** the guard runs with no arguments
- **Then** all 31 appear in its output and its total equals the sum of the per-bundle values

### An unclassified bundle fails the guard

- **Given** a new bundle directory with a valid SKILL.md and no tier assignment
- **When** the guard runs
- **Then** it exits non-zero and names that bundle as missing a tier

### An over-ceiling description fails the guard

- **Given** a Tier A bundle whose description is edited to 200 characters
- **When** the guard runs
- **Then** it exits non-zero and reports the bundle, its size, and its ceiling

### A dropped trigger phrase fails the guard

- **Given** a bundle rewritten within its ceiling but with a pinned phrase removed
- **When** the guard runs
- **Then** it exits non-zero and names the lost phrase

### Shed content survives in the body

- **Given** any bundle whose description was shortened under this spec
- **When** its SKILL.md is read
- **Then** the body contains a `## When to use` section
- **And** the material removed from the description appears there

### The mirror matches the source

- **Given** every bundle edited under this spec
- **When** `skills/<b>/SKILL.md` and `.claude/skills/<b>/SKILL.md` are compared
- **Then** they are byte-identical

## Notes

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
