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
