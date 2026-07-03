# Post-v1 Considerations

Patterns and refinements deliberately NOT added mid-build (per the 2026-07-03 recalibration:
strict design-doc execution through v1.0 internal; this file captures what would otherwise
have become preferences, pins, or spec amendments). Review during the post-v1 design-doc
reconciliation pass.

- **Purpose-line sentence trimming clips dotted identifiers.** The scanner/deep-tier
  "trim to first sentence" rule treats the period in `loops.writer-verifier` as a sentence
  boundary ("Writer/verifier sub-agent harness (spec loops."). Candidate: trim only at
  period-followed-by-space. (Observed on the first real deep pass, 2026-07-03.)
- **PostWrite-time `_index.md` staleness nudge** — noted in `loops.onboarding-drift` Notes;
  candidate for the §16.2 step 28 pass or v1.x.
- **Curation-loop proposals through the pulse gate for status *edits*** (e.g. rule retirement
  needs a frontmatter edit, not an append) — accept currently only appends; an edit-typed
  proposal is a v1.x design question.
- **Scenario `covers:` deferral convention** — verify-scheduled distinguishes journey
  deferrals but scenario-coverage gaps have no deferral mechanism; all 16 business specs
  show as scenario-uncovered until scenario specs exist (test-runner round may absorb this).
- **Orphaned scheduled-task detection (v1.1 candidate, Pedro).** The task-scoping migration
  moved 11 tasks where the plan expected 8 — accumulation from earlier re-inits. A
  hygiene-adjacent check could catch this class autonomously: "scheduled tasks matching
  Cortex naming that don't correspond to loops in the plan."
- **Bug-triage type-7 → test-runner wiring.** Triage classifies test-defect bugs but does
  not hand them to the test-runner; the runner discovers failures on its own cadence. A
  direct routing (triaged type-7 → targeted runner invocation) is a v1.x candidate.
- **Design-doc drift loop (Pedro, reconciliation round).** A loop that catches
  design-doc-vs-schema-vs-code inconsistency — exactly what the manual reconciliation pass
  does — onboarding-drift's bigger sibling. v1.x candidate.
- **Extend init's migration step to the full §8.5 list.** As shipped it migrates only the
  legacy root `bugs.md`; pre-existing `gaps.md`/`verification-report.md`/onboarding scratch
  files on old projects are not auto-moved (new runs no longer produce them).
- **Loop concurrency locking (design §17 item 17).** No lock files shipped; a same-loop
  double-fire is last-writer-wins on a transient always-write report — accepted risk at
  v1 scale. Revisit if Desktop scheduling produces real collisions.
- **`update_scheduled_task` self-adapting cadence (design §17 item 18)** — e.g. distil
  increasing frequency when accept rate is high. v1.x candidate, unchanged.
- **`cortex pulse-reset-dismissed` (design §17 item 12)** — a command to reset the
  dismissal memory; manual `dismissed.md` editing suffices at current volumes.
