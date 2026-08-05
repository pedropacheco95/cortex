---
id: B-015
title: cortex sync never removes retired skill bundles, so a renamed skill leaves both copies installed — after the specflow-entry rename a synced project registers TWO mandatory entry points
type: incomplete-rule
severity: high
status: resolved
affects:
  - core-cli.sync
  - specflow.entry-gate
  - src/cli/sync.ts (syncSkillBundles, Rule 5)
proposed_fix: Record retirement as a migration chain (SKILL_MIGRATIONS) — one appended entry per release that drops a bundle, naming the version, the bundles and the reason — and have sync enforce every entry in force at the installed version, gated by the same marker judgment the upgrade path uses.
resolved: 2026-08-05T00:00:00Z
opened: 2026-08-05T00:00:00Z
---

# B-015 — `cortex sync` leaves retired skill bundles behind

## Evidence

Reproduced 2026-08-05 on a throwaway project doctored to look like a
pre-upgrade install (schema 3.0, `specflow-change-router` present,
`_conventions/` present, the seven new bundles absent), then upgraded with
`cortex sync --yes`:

```
Skill bundles: 7 installed, 0 upgraded, 25 already current, 0 skipped (user-modified).
  Installed: specflow-brainstorm, specflow-entry, specflow-intent-reconcile,
             specflow-plan, specflow-receive-review, specflow-request-review,
             verification-before-completion.
Self-validation: conformant.
```

Everything sync claims it did, it did. What it does not claim — and does not do
— is remove anything:

```
BEFORE: 27 bundle directories
AFTER:  34 bundle directories
still present: specflow-change-router, _conventions
```

Both `specflow-change-router/SKILL.md` and `specflow-entry/SKILL.md` exist, so
Claude Code registers **both**. Their descriptions both end with the same
claim — *"If the project has specs, this skill runs first — no exceptions."*

**What happens:** after any rename, a synced project runs two skills that each
declare themselves the mandatory entry point. Which one an agent picks is
undefined.
**What should happen:** a bundle Cortex has retired is removed on sync, the way
a retired scheduled task already is.

`_conventions/` is the benign half of the same defect: it carries no `SKILL.md`
so nothing registers it, but a project initialised before the
`listSkillBundles` filter keeps a stale copy forever.

## Diagnosis (seven-type classification)

Root-cause investigation before classification (`specflow-bugs` Phase 1):

1. **Read the actual behaviour.** `syncSkillBundles` (`src/cli/sync.ts`) opens
   with `const bundles = listSkillBundles(srcDir)` and loops over **shipped**
   bundles only. Every branch inside is install / upgrade / already-current /
   skip. Nothing enumerates `.claude/skills/` itself.
2. **Reproduce.** Above — 27 → 34 directories, orphans intact.
3. **What changed recently.** The `specflow-change-router` → `specflow-entry`
   rename (`specflow.entry-gate`, this round) is what turned a latent gap into
   a live one. The gap predates it: no rename had happened before, so nothing
   had ever been orphaned.
4. **Instrument the boundary.** Compare against the sibling mechanism:
   scheduled tasks DO get swept — `writeScheduledTasks` walks
   `RETIRED_CANONICAL_TASK_NAMES` and `fs.rmSync`s each retired directory,
   scoped to the owning project. So the pattern exists and is proven in this
   codebase; skill bundles simply never got it. The asymmetry is the defect,
   and it sits on the sync side, not the install side (`installSkills` is for
   fresh projects, which have nothing to retire).

Diagnostic-tree walk:

1. **Dev spec governing this behaviour?** YES — `core-cli.sync` owns Rule 5
   (skill-bundle upgrade).
2. **Does the spec have a rule covering this case?** **NO.** Rule 5 specifies
   install, upgrade, and preserve-user-modified. Retirement is unspecified —
   for tasks it is Rule 8's business and is implemented; for bundles nobody
   ever wrote it down.

First NO at step 2 → **type: incomplete-rule**.

## Severity

`high`. It is not cosmetic: the orphan is a *skill*, it is registered, and the
specific orphan created by this round's rename claims mandatory-entry-point
status. `specflow.entry-gate` Rule 1 refused to leave a redirect stub on
exactly this reasoning — "a stub would be a second entry point, which is
exactly what a gate must not have" — and sync then recreates the second entry
point by omission.

## Resolution

Fixed the same day, at Pedro's direction — the deferral below was overruled,
and the design changed twice under review before it was right.

**Shape: a migration chain, not a flat list.** `SKILL_MIGRATIONS` in
`src/cli/scaffold.ts` holds one entry per release that retires a bundle —
version, the names removed, and why. Appending an entry is the checklist item
for retiring a bundle, the same way a contract change gets a schema bump. The
audit trail is the point: you can read what each version dropped and for what
reason.

**Declarative, not cursor-based — the correction that mattered.** The first
implementation applied only the entries in the window between the project's old
and new `schemaVersion`, which is how a database migration usually works. Its
own test caught the flaw: sync rewrites `schemaVersion` whether or not a
removal happened, so a developer who declined the prompt (because they had
edited the bundle) would have the cursor advance past the entry and never be
offered it again — the orphan becomes permanent, which is the bug this fixes.
Entries are therefore statements of state — "no project at or past version X
should have these" — enforced on every run. A declined removal is re-offered
next sync; a run with nothing to remove is a silent no-op.

An earlier draft also carried a second mechanism, a per-project manifest of
what was installed, to derive retirement automatically. It was dropped: two
sources of truth for one decision, and the migration chain alone is both
sufficient and auditable.

**Safety invariants**, in force order:
(a) only migration-named bundles are candidates, so a developer's own skill is
never at risk; (b) a currently-shipped bundle is never removed whatever an
entry says, pinned by a test asserting no entry names a shipped bundle;
(c) removal obeys sync Rule 13 with Rule 5's judgment — marker matches, remove
silently; edited or unknown provenance, prompt first (`--yes` accepts,
declining preserves and reports).

**Verified end-to-end** on a reconstruction of the reported scenario — a 3.0
project holding `specflow-change-router`, `_conventions`, a developer's own
skill, and missing the new bundles:

```
Schema version: 3.0 -> 3.3.
Skill bundles: 3 installed, 0 upgraded, 29 already current, 0 skipped.
  Installed: specflow-brainstorm, specflow-entry, specflow-plan.
  Removed (retired by Cortex): _conventions, specflow-change-router.
Self-validation: conformant.
```

`my-own-skill` intact and byte-identical; a second sync removes nothing.

Spec: `core-cli.sync` Rule 6 plus five ACs. Tests:
`tests/atomic/core-cli/retired-bundles.test.ts` (chain well-formedness and the
two invariants) and `tests/spec/core-cli/sync-retirement.spec.test.ts` (removal,
preservation, the declined-then-re-offered case, idempotence) — 25 assertions.

## Superseded: why it was first deferred


The original call — overruled by Pedro, and correctly so. The reasoning is kept
because the three concerns it names all turned out to be real, and all three are
answered by the design above rather than avoided by delay.

- Which bundles count as retired needs an explicit, curated list — a
  present-in-package check would delete bundles on any partial or older
  install, which is worse than the bug.
- Deleting a *user-modified* retired bundle needs the same marker judgment and
  prompt the upgrade path uses; silently removing someone's edits is not
  acceptable, and "retired" is exactly when they are least expecting it.
- The summary needs a removals line, or the deletion is invisible.

B-002's handling is the template: small-looking fix, real semantics, so it
waits for its own round.

No workaround is needed: `cortex sync` now does it.
