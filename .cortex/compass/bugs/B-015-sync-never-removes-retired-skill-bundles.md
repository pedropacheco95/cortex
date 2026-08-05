---
id: B-015
title: cortex sync never removes retired skill bundles, so a renamed skill leaves both copies installed — after the specflow-entry rename a synced project registers TWO mandatory entry points
type: incomplete-rule
severity: high
status: open
affects:
  - core-cli.sync
  - specflow.entry-gate
  - src/cli/sync.ts (syncSkillBundles, Rule 5)
proposed_fix: Give skill bundles the retirement sweep scheduled tasks already have. Add a RETIRED_SKILL_BUNDLES constant next to RETIRED_CANONICAL_TASK_NAMES (seeded with `specflow-change-router` and the non-bundle `_conventions`), and have syncSkillBundles remove each retired directory from `.claude/skills/` — marker-judged like the upgrade path, so a user-modified retired bundle prompts rather than being deleted silently. Report removals in the Rule 11 summary as their own line. Regression test - a project holding a retired bundle loses it on sync, a user-modified one prompts, and a bundle merely absent from this package version (a partial install) is NOT removed.
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

## Not fixed in this round

Deferred deliberately, per the standing authorities' ride-along rule: the fix
has **design surface**, so it waits rather than riding.

- Which bundles count as retired needs an explicit, curated list — a
  present-in-package check would delete bundles on any partial or older
  install, which is worse than the bug.
- Deleting a *user-modified* retired bundle needs the same marker judgment and
  prompt the upgrade path uses; silently removing someone's edits is not
  acceptable, and "retired" is exactly when they are least expecting it.
- The summary needs a removals line, or the deletion is invisible.

B-002's handling is the template: small-looking fix, real semantics, so it
waits for its own round.

## Workaround until then

Delete the retired directory by hand after syncing:

```sh
rm -rf .claude/skills/specflow-change-router   # renamed to specflow-entry
rm -rf .claude/skills/_conventions             # no longer installed (repo-side authoring material)
```

Nothing else is orphaned by this round.
