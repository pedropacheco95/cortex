# always-write-pulse-report

Every loop always writes its pulse report via the shared writePulseReport helper regardless of whether the run found anything, degraded, or failed — the report is the product, not the exit code.

## Files

- src/loops/atlas-staleness.ts
- src/loops/bug-triage.ts
- src/loops/lint-scheduled.ts
- src/loops/onboarding-drift.ts
- src/loops/report.ts
- src/loops/rule-decay.ts
- src/loops/spec-drift.ts
- src/loops/verify-scheduled.ts
- src/pulse/distil.ts
- src/pulse/hygiene.ts

## Related concepts

- llm-judgment-subprocess — co-members of cluster:scheduled-loops: every LLM-judgment loop still writes its pulse report on every outcome
