---
id: loops.developer-gets-upkeep-proposals-without-asking
status: implementing
implemented_by:
  - ../../specs/loops/rule-decay.spec.md
  - ../../specs/loops/atlas-staleness.spec.md
  - ../../specs/loops/onboarding-drift.spec.md
  - ../../specs/loops/spec-drift.spec.md
  - ../../specs/loops/cortex-loop-bundle.spec.md
  - ../../specs/loops/fresh-task.spec.md
---

# The knowledge layer proposes its own upkeep — the developer just decides

## Outcome

When this works, the curated knowledge — rules, project memory, the assistant's orientation files, the specifications — stops silently going stale. On their own cadences, four reviewers each check one kind of rot: rules that no longer govern anything, memory nobody references, orientation that lags the current conventions, and specifications the code has drifted away from. Each writes a dated report of retirement and refresh candidates with its reasoning. The developer's role shrinks to reading and deciding.

## Who this is for

Developers maintaining a Cortex-managed project over months — the timescale where curated knowledge quietly diverges from reality.

## User Journey

1. The reviewers run on their own schedules — weekly for rules, monthly for memory and orientation, daily for specification drift.
2. Each writes its report: candidates, evidence, suggested action — or an explicit "nothing this cycle".
3. The developer reads a report when its housekeeping line surfaces it, and acts on what convinces them.
4. Nothing is retired, archived, or rewritten by the reviewers themselves — ever.

## Business Rules

1. Reviewers observe and propose; only the developer disposes.
2. Every proposal carries its evidence — the dead reference, the age, the divergence — so it can be challenged.
3. Every run leaves a fresh, dated report, including explicit "nothing found" runs.
4. Each reviewer reads only what it reviews and writes only its own report.

## Success Metrics

- A rule whose files vanished is proposed for retirement within its review cycle.
- Every proposal names evidence the developer can check in one hop.
- Zero knowledge mutations attributable to any reviewer.

## Out of Scope

- Applying the proposals — the developer, or later the review gate, does that.
- Judging spec *content* quality — only structural and temporal drift signals.

## Notes

- **On a 4.0 store this promise changes (P11).** One weekly task, `loops.fresh-task`, does the work of the reviewers and fixes what it finds in the store: it edits, merges and retires knowledge files itself, and each run leaves one dated record naming every change, for the developer to verify when they choose. Business Rule 1, journey step 4 and the "zero knowledge mutations" metric above describe a 3.x store. Specs are the boundary: a change to a spec is still only proposed.

- These four compose with the health sweep: it reports what is broken now; these report what is quietly going stale.
