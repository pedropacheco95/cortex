# scan-and-report

A deterministic scan function walks project state, produces typed findings (no side effects on gated layers), and writes exactly one pulse report — the recurring shape of every non-LLM loop in this scope.

## Files

- src/loops/atlas-staleness.ts
- src/loops/lint-scheduled.ts
- src/loops/onboarding-drift.ts
- src/loops/rule-decay.ts
- src/loops/spec-drift.ts
- src/loops/verify-scheduled.ts
- src/pulse/hygiene.ts
