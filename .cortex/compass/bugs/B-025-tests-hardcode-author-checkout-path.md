---
id: B-025
title: Validator tests hardcode the author's checkout path, so 15 tests fail on any other checkout
type: test-defect
severity: medium
status: resolved
affects:
  - schema.validator
  - tests/fixtures/validator-tmp.ts
  - tests/spec/schema/validator.test.ts
  - tests/atomic/schema/validator.test.ts
  - tests/atomic/schema/business-status.test.ts
proposed_fix: >-
  Derive VALID_FIXTURE and REPO_ROOT from the test file's own location
  (fileURLToPath(import.meta.url)), the idiom tests/spec/core-cli already uses, instead of
  the literal /Users/pedropacheco1/Documents/Projetos/cortex.
opened: 2026-09-28T17:47:00Z
found_at_commit: d7ed910
resolved: 2026-09-28T17:56:00Z
---

# B-025 — Validator tests hardcode the author's checkout path

**Source:** test failure. `pnpm test` on a fresh clone at `/Users/pedropacheco/Documents/Projetos/cortex`
(new machine, 2026-09-28) gave 15 failed / 2735 passed across 8 files.

**What happens:** four files pin the validator fixture to an absolute path on the original
machine:

- `tests/fixtures/validator-tmp.ts:12-13` — `VALID_FIXTURE` and `REPO_ROOT`
- `tests/spec/schema/validator.test.ts:6`
- `tests/atomic/schema/validator.test.ts:7`
- `tests/atomic/schema/business-status.test.ts:14`

`compass-heading`, `index-completeness`, `xref-unique`, `id-registry.spec` and
`visibility.spec` import them from `validator-tmp.ts`. On any other checkout path each one
fails with `ENOENT: no such file or directory, scandir|lstat|stat
'/Users/pedropacheco1/Documents/Projetos/cortex/tests/fixtures/valid'`, or with a
`TypeError` downstream of the missing copy.

**What should happen:** the suite passes wherever the repository is checked out.

**Evidence:** reproduced with `pnpm vitest run tests/atomic/schema/business-status.test.ts`,
which fails with the same ENOENT. The path is wrong where it is declared. No component
between the constant and the `fs` call changes it. `git log -S` puts the literal in
`84ca2bd` (foundation, 2026-07-02), then `d8ca421` and `1a0174c`. It went unnoticed because
every run so far was on the checkout it names.

**Root cause:** Type 7, a test defect. `schema.validator`, its rules and its criteria are
correct, and the tests assert the right things. They just locate their fixture from the
wrong base. No business drift: `schema/contributor-trusts-project-knowledge` is unaffected.

**Affected specs:**
- Dev: `.specflow/specs/schema/validator.spec.md` (the criteria these tests encode; no change)
- Business: none

### Change Plan

**Spec:** `.specflow/specs/schema/validator.spec.md`, no change.
**Test files:** the four above.
**Issue:** the tests locate the fixture from an absolute path instead of their own location.

1. Replace each literal with a path derived from `fileURLToPath(import.meta.url)`, as
   `tests/spec/core-cli/init-rule4-and-validate.test.ts` does.
2. Run the 8 failing files. They should pass, because the code was never wrong.
3. Run the full suite as a regression check.

### Resolution

- Spec changes: none.
- Tests modified: `tests/fixtures/validator-tmp.ts`, `tests/spec/schema/validator.test.ts`,
  `tests/atomic/schema/validator.test.ts` and `tests/atomic/schema/business-status.test.ts`
  now derive the fixture from `import.meta.url`.
- Code changes: none.
- Resolved: 2026-09-28.
