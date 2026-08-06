---
id: loops.cortex-loop-bundle
status: implemented
depends_on:
  - core-cli.task-scoping
  - core-cli.init-profile
  - core-cli.sync
  - scaffolding.skill-listing-budget
implements: ../../specs-business/loops/developer-gets-upkeep-proposals-without-asking.business.md
governed_by:
  - R-001
governs:
  - "skills/cortex-loop/**"
  - "src/cli/templates.ts"
  - "src/cli/scaffold.ts"
---

# One `cortex-loop` Bundle — eleven loop skills become one callable-only skill

## Intent

The eleven loop/pulse skill bundles (`cortex-pulse-hygiene`, `cortex-loop-bug-triage`,
`cortex-loop-spec-drift`, `cortex-loop-rule-decay`, `cortex-loop-onboarding-drift`,
`cortex-loop-atlas-staleness`, `cortex-pulse-distil`, `cortex-loop-session-observe`,
`cortex-loop-test-runner`, `cortex-loop-insight-refresh-daily`,
`cortex-loop-insight-refresh-full`) spend 1,249 chars ≈ 312 tokens of the permanently-resident
skill listing in every session of every consuming project — and almost all of it is trigger
surface for ad-hoc phrasing ("run the hygiene loop", "which rules are stale") that the loops
are not, in practice, reached by. They are reached by the five scheduled-task payloads, whose
prose Cortex writes itself in `src/cli/templates.ts`.

This spec collapses them into **one `cortex-loop` bundle** whose body dispatches to a reference
file per loop, and assigns it **Tier D** (`scaffolding.skill-listing-budget` Rule 3) — a
description that names the skill and advertises nothing. Guaranteed name-dispatch from a
payload Cortex authors is a stronger routing guarantee than a description hoping to match a
sentence, so the trigger surface is not merely affordable to lose: it was never what made these
loops reachable.

**1,249 → 47 chars. Measured after implementation: the listing falls 4,426 → 3,224 chars,
1,107 → 806 tokens — 301 saved per session, in every project that installs Cortex**, and
4,018 → 806 across this whole round of work.

**This is a packaging change, not a behavioural one.** Every loop's CLI verb, report path,
cadence, model, failure isolation, and write-scope is untouched. What changes is which
directory the agent reads its instructions from.

## Entities

- **READS:** the eleven `skills/cortex-{loop,pulse}-*/SKILL.md` bodies (the material that
  becomes reference files); `SCHEDULED_TASKS` and `scopeTaskToProfile` (`src/cli/templates.ts`);
  `SKILL_MIGRATIONS` and `missingRequiredSkills` (`src/cli/scaffold.ts`).
- **WRITES:** `src/cli/templates.ts` (each bundle's `requiredSkills`, `specflowOnlySkills`, and
  prompt-body member instructions); `src/cli/scaffold.ts` (`SKILL_MIGRATIONS` entry);
  `cortex-schema.md` §9.1 (prose only — the payload-invokes-each-skill-by-name sentence; no
  version header or changelog change, per Rule 7); the guard's `TIERS`, `REQUIRED_TRIGGERS`,
  and `TIER_CEILING` docblock (`scripts/measure-skill-descriptions.mjs`);
  `.specflow/specs/scaffolding/skill-listing-budget.spec.md` (Rule 3's Tier D rationale);
  `tests/spec/scaffolding/skill-listing-budget.test.ts` (its Tier D membership assertion
  pins exactly two bundles today and fails on a third by design);
  `.specflow/specs/loops/_overview.md` (the individually-invocable claim).
- **CREATES:** `skills/cortex-loop/SKILL.md` and `skills/cortex-loop/references/<loop>.md` ×11,
  plus their `.claude/skills/` mirror.
- **DELETES:** the eleven merged bundle directories, from `skills/` and `.claude/skills/` alike.

## Rules

1. **One bundle, eleven reference files.** `skills/cortex-loop/SKILL.md` holds only what is
   common — the loop-write invariant (RULES 7), the never-spawn-a-nested-`claude` rule, the
   propose-don't-mutate discipline, and a dispatch table mapping each loop's short id
   (`hygiene`, `bug-triage`, `spec-drift`, `rule-decay`, `onboarding-drift`, `atlas-staleness`,
   `distil`, `session-observe`, `test-runner`, `insight-refresh-daily`,
   `insight-refresh-full`) to `references/<short-id>.md`. Each reference file carries that
   loop's discipline **verbatim** from the bundle it replaces. Reference files are lazy-loaded
   and cost nothing resident.

2. **Behaviour is preserved exactly.** Every loop keeps its CLI verb (`cortex loop-spec-drift`,
   `cortex pulse-hygiene`, …), its report path under `.cortex/pulse/reports/`, its
   `--collect`/`--report`/`--apply` sequence, its write scope, and its place in a bundle's
   member order. The five bundles keep their names, cadences, models, and per-member failure
   isolation. A reader of a reference file must reach the same actions as a reader of the
   bundle it replaces; this is a move, not a rewrite.

3. **`cortex-loop` is Tier D, and Tier D admits payload dispatch.** Its description names the
   skill and carries no trigger phrases, no PROACTIVELY, and no example utterances
   (`scaffolding.skill-listing-budget` Rule 3, guard-enforced). That spec's Tier D rationale —
   "the developer decides to run it and types `/<name>`" — is **widened here to admit a second
   qualifying route: dispatch by name from a payload Cortex itself authors.** Both routes share
   the property that qualifies the tier: the bundle is named explicitly by something that knows
   it exists, so a description matching a sentence is never how it is reached.

   **The sibling spec is amended in this same change, not silently redefined.**
   `scaffolding.skill-listing-budget` Rule 3 currently reads "the developer decides to run it
   and types `/<name>`", and `TIER_CEILING`'s docblock in the guard says "Never routed into:
   the developer types `/<name>`". Both become inaccurate the moment `cortex-loop` is Tier D,
   so both are updated here. A new spec that leaves an old spec's rule wrong is drift, which
   this project treats as a bug.

4. **The payload names `cortex-loop` and the reference file.** Each member instruction in a
   bundle body changes from invoking `cortex-loop-<x>` to invoking `cortex-loop` and reading
   `references/<short-id>.md`. Schema §9.1's sentence — "the prompt body invokes each *member
   loop's underlying skill* by its real name (`cortex-pulse-hygiene`, `specflow-lint`, …)" —
   is amended: a member is invoked by its **owning skill** plus its reference file, and skills
   that were never merged (`specflow-lint`, `specflow-tests`, `specflow-bugs`,
   `cortex-extract-insight`) are still named directly. Registration identity is unaffected —
   the five canonical task names never mentioned a loop skill (`core-cli.task-scoping` Rule 2).

5. **`requiredSkills` collapses to the surviving directories.** Every merged member contributes
   `cortex-loop` in place of its own name, deduplicated. `--partial`'s gate
   (`missingRequiredSkills`, `core-cli.init` Rule 17) is unchanged in mechanism: a bundle is
   still skipped unless every named directory exists — there are simply fewer names.

6. **Profile scoping moves from directory-dropping to in-skill dispatch.** `specflowOnlySkills`
   works by removing a skill directory from `requiredSkills` under a non-`specflow` profile.
   `cortex-loop` can never be dropped — the daily bundle's Bucket-1 members need it — so the
   merged loops leave `specflowOnlySkills`, which retains only genuinely droppable non-merged
   **skill directories** (`specflow-bugs`, `specflow-lint`). Note the two lists are different
   kinds: `specflowOnlyMembers` holds *member* names (`bug-triage`, `spec-drift`,
   `specflow-lint`, `specflow-verify` — the last being a CLI verb,
   `cortex loop-specflow-verify`, with no skill bundle of its own), while `specflowOnlySkills`
   holds skill directory names. Only the latter is affected by this merge.
   **`specflowOnlyMembers` is unchanged and remains the actual mechanism:**
   `scopeTaskToProfile` already prepends a worded "SKIP **bug-triage** and **spec-drift**"
   instruction to the body, and that instruction — not the missing directory — is what stops a
   spec loop running on a non-Specflow project. The consequence to accept explicitly: under a
   non-`specflow` profile, `--partial` no longer skips the daily bundle on account of an absent
   spec-loop directory. It never should have been load-bearing; the worded instruction was
   always the contract.

7. **Retirement is a migration entry at the CURRENT schema version — no bump.**
   `SKILL_MIGRATIONS` (`src/cli/scaffold.ts`) gains an entry at **3.3**, the version the
   package already ships, naming all eleven bundles and the reason. This works because
   `core-cli.sync` Rule 6 makes entries **declarative, not cursor-based**: `retiredBundles` is
   called with `toVersion = SCHEMA_VERSION` and `applicableSkillMigrations` selects every entry
   whose version is ≤ that, so a 3.3 entry is in force for every project at or past 3.3 on the
   very next sync — including projects already on 3.3. The two safety invariants hold
   unchanged: a currently-shipped bundle is never removed, and a directory no migration names
   is never a candidate.

   **This is why no MINOR bump ships.** A bump would ripple into `schema.validator`'s
   `supportedMinor`, `cortex-schema.md`'s version header and changelog, the CLAUDE.md
   managed-block template, and the version-agreement tests that exist to pin all of those
   together — for no behavioural gain, since the declarative entry already removes the
   bundles. Nothing about the on-disk contract changes: no artefact is added, removed, or
   renamed in `.cortex/`. Only §9.1's *prose description* of how a payload names its member
   skills becomes inaccurate, and prose accuracy is a documentation fix, not a contract
   version event.

8. **An existing project needs `cortex sync` and nothing else.** Payloads refresh under
   `core-cli.sync` Rule 9 (unmodified → silently; user-modified → preserved and reported), the
   eleven directories are removed under Rule 6 (marker-clean → silently; edited → prompted,
   and a declined removal is reported as retired-but-preserved), and **registration is never
   touched**: the task names do not change, so no re-registration and no `cortex tasks rename`.

9. **Individual invocability survives, in a changed form.** A developer reaches any loop by
   `/cortex-loop` plus the loop's name, or by its CLI verb directly — the deterministic path,
   and unaffected by any of this. What is deliberately given up is reaching a loop by
   unprompted sentence. `loops/_overview.md`'s claim that each loop skill stays "individually
   invocable (from a session or by name)" is updated in the same change to say how.

## Acceptance Criteria

### The listing cost falls to one Tier D entry

- **Given** the merged tree
- **When** `scripts/measure-skill-descriptions.mjs` runs
- **Then** `cortex-loop` appears with tier `D` and `name` + `description` at most 60 characters
- **And** none of the eleven merged bundle names appears in the output
- **And** the reported total is at least 1,100 characters lower than before the merge

### The merged skill advertises nothing

- **Given** `skills/cortex-loop/SKILL.md`
- **When** its description is read
- **Then** it contains no quoted example utterance, no "PROACTIVELY", and no trigger phrasing
- **And** the guard's `REQUIRED_TRIGGERS` entry for it is empty

### Every loop has a reference file carrying its discipline

- **Given** the eleven loop short ids
- **When** `skills/cortex-loop/references/` is listed
- **Then** there is one file per short id
- **And** each contains the CLI verb and the output path of the loop it replaces — for ten
  loops a `.cortex/pulse/reports/<name>.md` report, and for `distil`
  `.cortex/pulse/suggestions.md`, which is a pulse *proposal* surface rather than a report

### The dispatch table names every reference file

- **Given** `skills/cortex-loop/SKILL.md`
- **When** its dispatch table is read
- **Then** every one of the eleven short ids appears, each pointing at its reference file

### Each payload invokes `cortex-loop` and names the reference file

- **Given** the five bundles in `SCHEDULED_TASKS`
- **When** each body is read
- **Then** no body **invokes** a merged bundle — no member instruction carries the invocation
  form `` (`cortex-loop-bug-triage` `` , `` (`cortex-pulse-hygiene` ``, …
- **And** every member instruction names `cortex-loop` and its reference file
- **But** a *prose mention* of a loop is not an invocation and stays correct: the loops
  themselves still exist, and `weekly-curation`'s body legitimately names
  `cortex-loop-session-observe` as the writer of the `insight/observations/` surface it
  reads — the same role `cortex-schema.md` §4.10.11 gives it as sole writer
- **And** the non-merged skills (`specflow-bugs`, `specflow-lint`, `specflow-tests`,
  `cortex-extract-insight`) are still named directly

### Cadence, model, order, and failure isolation are unchanged

- **Given** the five bundles before and after the merge
- **When** their names, cron cadences, models, member order, and failure-isolation instruction
  are compared
- **Then** they are identical

### `requiredSkills` names only directories that exist

- **Given** each bundle after the merge
- **When** `requiredSkills` is compared against `skills/`
- **Then** every entry is a shipped directory
- **And** `cortex-loop` appears exactly once per bundle that has a merged member

### A non-`specflow` profile still skips the spec loops, by instruction

- **Given** the daily bundle and `profile: plain`
- **When** `scopeTaskToProfile` is applied
- **Then** the body still instructs SKIP for **bug-triage** and **spec-drift**
- **And** `cortex-loop` is still present in `requiredSkills`
- **And** `specflow-bugs` is dropped from `requiredSkills`

### `--partial` still gates on the surviving directories

- **Given** a project whose `.claude/skills/` lacks `cortex-loop`
- **When** `cortex init --partial` runs
- **Then** every bundle with a merged member is skipped with a notice naming `cortex-loop`

### Sync removes the eleven and refreshes the payloads

- **Given** a project holding all eleven bundles with markers matching their installed content,
  and unmodified task payloads
- **When** `cortex sync` runs against the merged package
- **Then** the eleven directories are gone and named as removed in the summary
- **And** `cortex-loop` is installed
- **And** each payload names `cortex-loop` rather than a merged bundle
- **And** no registration state is written

### An edited merged bundle is preserved, not deleted

- **Given** the same project, with `cortex-pulse-hygiene/SKILL.md` edited since install
- **When** `cortex sync` runs
- **Then** that directory is still present and reported as retired-but-preserved

### The migration entry names all eleven at the current version

- **Given** `SKILL_MIGRATIONS`
- **When** the new entry is read
- **Then** it names all eleven bundles, carries version `3.3`, and states the reason
- **And** no entry names a currently-shipped bundle
- **And** `SCHEMA_VERSION` is unchanged

### The sibling tier rule is amended, not left contradicting

- **Given** `scaffolding.skill-listing-budget` Rule 3 and the guard's `TIER_CEILING` docblock
- **When** either is read after this change
- **Then** each describes Tier D as admitting both `/<name>` invocation and payload dispatch
- **And** neither claims Tier D members are reached only by a developer typing `/<name>`

## Notes

- **Why the trigger surface is affordable to lose.** These eleven descriptions were 1,249 of
  the listing's 4,426 characters, essentially all of it phrasings for ad-hoc invocation. The
  scheduled payloads — which Cortex authors — are the actual dispatcher, and `core-cli.sync`
  Rule 9 keeps them current. The CLI verbs remain the better ad-hoc path anyway: `cortex
  loop-spec-drift` is deterministic and needs no routing at all.
- **Deliberately not done: the coverage-map line.** A one-line loop roster in the SessionStart
  payload would restore discoverability at ~10% of the listing cost, and was considered and
  declined for this round — the loops are not needed anywhere but the scheduled tasks for now.
  It remains available if ad-hoc reachability turns out to matter.
- **The thick members are still moves, not rewrites.** `cortex-loop-session-observe` (167
  lines), `cortex-pulse-distil` (92), and `cortex-loop-insight-refresh-daily` (85) carry real
  judgment, unlike the five thin wrappers (30–33 lines each). Rule 2's verbatim requirement
  exists for them: a reference file that summarises a thick loop is a behaviour change wearing
  a packaging change's clothes.
- **Schema surface touched.** §9.1's payload/registration split is amended by Rule 4. The
  loop *names* themselves are unchanged everywhere else in the schema (§4.5.1, §4.10, Decision
  13 name `cortex-loop-session-observe` as a producer and sole writer) — those refer to the
  loop, which still exists; only the skill directory that houses its instructions changes.
  This is additive-compatible in the §10.2 sense and ships as a MINOR.
- **Guard coupling.** `scaffolding.skill-listing-budget` shipped a `TIERS` map that fails any
  bundle it does not classify and any classified bundle not on disk. Both halves of that check
  fire on this change, which is the intended behaviour: the merge cannot land without updating
  the map.
