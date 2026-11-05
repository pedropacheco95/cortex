---
about: What cortex check leaves open on purpose, for the 2026-11-17 review
permanence: volatile
verified: 2026-11-05 (observed)
origin: session:13ecca9a-2346-4535-8492-95892e9bd065
---

## Gaps in cortex check left for the 2026-11-17 review
until: 2026-11-24

An adversarial review on 2026-11-05 reproduced each of these. The code matches the spec, so they are decisions, not bugs. Read them against what the check actually refused by then.

- Rule (a) accepts weak evidence: a deleted test, `src/mocks/pay.ts` and `src/fixtures/pay.ts` all count as a test change, and code can sit in `cortex/build.sh` or `specflow/run.ts`.
- Three routes around the item rules: a conflict resolution rewriting a rule (Rule 14, deliberate); retire, edit, un-retire on one `#retired` trailer, which never fires (c); a criterion with no id.
- A relative `core.hooksPath` runs no hook on a checkout older than the install. `--range` and `pre-push` are the backstop.
