---
id: B-016
title: cortex sync ignored the process profile, resurrecting the Bucket-3 scheduled-task payloads a superpowers project deliberately does not schedule
type: missing-criterion
severity: high
status: resolved
affects:
  - core-cli.init-profile
  - core-cli.sync
  - src/cli/sync.ts (syncScheduledTaskPayloads)
proposed_fix: Apply scopeTaskToProfile in syncScheduledTaskPayloads exactly as writeScheduledTasks does, and remove the payload directory of a bundle the profile excludes so a profile switch cannot orphan one.
resolved: 2026-08-05T00:00:00Z
opened: 2026-08-05T00:00:00Z
---

# B-016 — `cortex sync` ignored the process profile

## Evidence

Found while answering "is sync correctly updating the scheduled tasks?" and
reproduced with an injected fake home, 2026-08-05:

```
after init --profile superpowers : 4 task dirs | test-runner? false | daily scoped? true
after sync                       : 5 task dirs | test-runner? TRUE  | daily scoped? FALSE
```

`cortex init --profile superpowers` correctly omits the `test-runner` bundle
(Bucket-3 in its entirety) and scopes the mixed `daily` and `weekly-quality`
payloads. The very next `cortex sync` wrote the `test-runner` payload back and
replaced the scoped `daily` payload with the unscoped one.

**What happens:** a project on the `superpowers` profile silently regains the
spec-first loops on its first sync, and the scoping instruction disappears from
the mixed bundles. The profile is recorded in the config and honoured by init,
then quietly undone.
**What should happen:** sync applies the same scoping init does.

## Diagnosis (seven-type classification)

Root-cause investigation before classification (`specflow-bugs` Phase 1):

1. **Read the actual behaviour.** `syncScheduledTaskPayloads` (`src/cli/sync.ts`)
   opens its write loop with `for (const task of SCHEDULED_TASKS)` — the raw
   roster. `readProfile`/`scopeTaskToProfile` appear nowhere in the file.
2. **Reproduce.** Above, with `home` injected so nothing touched the real
   `~/.claude`.
3. **What changed recently.** `core-cli.init-profile` (this round) added
   `scopeTaskToProfile` and wired it into `writeScheduledTasks` — init's path.
   Sync has its own payload writer and was never wired.
4. **Instrument the boundary.** Which side is wrong? `writeScheduledTasks` and
   `syncScheduledTaskPayloads` are two implementations of one contract
   ("materialise this project's task payloads"), and they already diverge in
   other small ways (marker judgment, localisation). Profile scoping belongs to
   the contract, not to one caller, so the sync side is the wrong one.

Diagnostic-tree walk:

1. **Dev spec governing this behaviour?** YES — `core-cli.init-profile` owns
   profile scoping; `core-cli.sync` Rule 9 owns payload refresh.
2. **Rule covering the case?** YES — `core-cli.init-profile` Rule 4 says
   Bucket-3 scheduling is scoped by profile, without limiting that to init.
3. **Is the rule correct?** YES.
4. **Does the rule have an acceptance criterion?** **NO.** Every AC on
   `core-cli.init-profile` is phrased "Given `cortex init --profile …`". None
   covers sync, so nothing tested the second code path.

First NO at step 4 → **type: missing-criterion**.

This is the same shape as B-015 — two code paths sharing one contract, one
updated — and it was found the same way: by checking the sibling path instead
of trusting that "scheduling is scoped" meant every writer scoped it.

## Fix (rode this round)

1. `syncScheduledTaskPayloads` reads the profile and maps each task through
   `scopeTaskToProfile`, skipping those the profile excludes.
2. A bundle the profile excludes also has its existing payload directory
   **removed**, project-scoped by the same ownership check the retired-canonical
   sweep uses. Without this, switching profiles orphans a payload — precisely
   the B-015 failure, one artefact type over.
3. Four ACs added to `core-cli.init-profile`, all sync-side: no resurrection,
   mixed bundles stay scoped, switching to `specflow` restores the excluded
   bundle, switching to `superpowers` removes it rather than orphaning it.

## Verification

Round-trips both directions with an injected fake home:

```
after init (superpowers) : 4 dirs | test-runner? false
after sync               : 4 dirs | test-runner? false | daily scoped? true
after switch to specflow : 5 dirs | test-runner? true
```

Sensitivity checked: reverting the scoping in `syncScheduledTaskPayloads` fails
3 of the 4 new tests.

## Notes

- **A real side effect during investigation, disclosed.** The first
  reproduction attempt invoked the CLI without a `--home` override, so it wrote
  four scheduled-task directories for a temp project into the *real*
  `~/.claude/scheduled-tasks/`. They were identified by mtime, confirmed to
  point at a deleted temp path, and removed; the re-run used an injected home.
  This is B-011's failure mode recurring in a manual check rather than in a
  test — the lesson there ("no scheduled-task work without an injectable home")
  applies to ad-hoc verification too, not just to the suite.
- That directory holds **706** entries, nearly all leaked by earlier test runs
  before B-011 was fixed. Cleaning them is a separate, user-facing decision and
  is not part of this fix.
