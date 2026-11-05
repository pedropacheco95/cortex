---
about: Two tests that failed once under machine load
permanence: volatile
verified: 2026-11-05 (observed)
origin: session:6d81a7e0-cbf4-4a06-8bed-1437fd6077f0
---

## Tests that fail under heavy machine load
until: 2026-12-05

To fix after go-live. Both failed once in a full `pnpm test` at a load of about 44, passed alone, and passed in every full run after. Three sessions saw the same kind of failure. The cause is not proven.

- `tests/atomic/pulse/review-cli.test.ts`: Accept registers a new rule file, and refuses a taken id (Rule 7b), the case of a registry already carrying `R-004 other`
- `tests/atomic/schema/constellation.test.ts`: check.constellation violation classes, the case of a module outside the §4.9 enum
