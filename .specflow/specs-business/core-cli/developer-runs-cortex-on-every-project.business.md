---
id: core-cli.developer-runs-cortex-on-every-project
status: implemented
implemented_by:
  - ../../specs/core-cli/task-scoping.spec.md
---

# A developer runs Cortex on every project without the projects colliding

## Outcome

When this works, the second, fifth, and twentieth Cortex-managed project set up as cleanly as the first. The scheduled upkeep each project registers lives in one shared place per user — so every task now carries its project's name and a unique fingerprint, projects never overwrite each other's schedules, and a glance at the task list shows which upkeep belongs to which project. Projects that registered tasks under the old unscoped names get a one-command rename.

## Who this is for

Developers running Cortex on more than one project — which is the intended normal, not the edge case.

## User Journey

1. A developer sets up Cortex on a second project; its scheduled upkeep registers alongside the first project's without touching it.
2. Two projects with the same folder name coexist — the fingerprint keeps them distinct, the name keeps them readable.
3. Re-running setup on one project recognises only that project's tasks; other projects' schedules are invisible to it.
4. A project from before the scoping change runs one rename command; its tasks move to the scoped names and a report says exactly what moved.

## Business Rules

1. A project only ever creates, overwrites, or counts its own tasks — everyone else's are ignored.
2. Task names stay human-scannable: project name first, fingerprint second, task identity last.
3. The rename is explicit, reported, and idempotent — run twice, the second run moves nothing.
4. Renaming changes registration identity only; what each task actually runs is untouched.

## Success Metrics

- Two projects with identical folder names register their full task sets with zero collisions.
- A user can attribute every Cortex task in their list to its project by reading the name.
- The rename migration moves every legacy task in one command and is safe to re-run.

## Out of Scope

- What the tasks do and when they fire — cadence and content belong to the loops.
- Non-Cortex tasks in the same directory — never touched, never counted.

## Notes

- Surfaced as a real blocker the day a second project was about to adopt Cortex; scoped and fixed before that adoption rather than after.
