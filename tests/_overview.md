# Tests — Overview

Cortex tests are organised into a **four-layer taxonomy**. Each layer has a distinct scope, infrastructure cost, and verification target. Higher layers exercise progressively more of the real system; lower layers isolate single behaviours.

| Layer | Scope | Infrastructure | Count | Verifies |
|-------|-------|----------------|-------|----------|
| **Atomic** | 1 criterion | Mocked | 1 per Given/When/Then | Single behaviour in isolation |
| **Spec** | 1 dev spec | Integrated slice | 1 per dev leaf spec | Rule interactions, entity write accuracy, implementation completeness (NOT criteria replay) |
| **Journey** | 1 business spec | Real containers | 1 per business spec | End-to-end user journey with real infrastructure |
| **Scenario** | Multiple business specs | Full sandbox | Enough to cover all business specs | Cross-journey realistic workflows |

## Directory layout

```
tests/
├── setup/          # harness, DB/container setup, smoke tests
├── fixtures/       # factories + seeds
├── atomic/         # atomic layer: 1 per Given/When/Then, mocked
├── spec/           # spec layer: 1 per dev leaf spec, integrated slice
├── journey/        # journey layer: 1 per business spec, real infra
└── scenario/
    └── specs/      # scenario specs (name + covers:) + scenario test files
```

## Coverage constraint

Every business spec must appear in at least one scenario's `covers:` list. A business spec absent from all `covers:` lists is a coverage gap, not an accepted omission.

## Notes

- The test results artefact `verification-report.md` lives in `.cortex/pulse/`, **not** here.
- This tree is **scaffolded only** — no tests have been written yet.
- Test files use the `.test.ts` extension.
