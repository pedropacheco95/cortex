---
id: loops.lint-scheduled
status: implemented
depends_on:
  - schema.validator
  - core-cli.init
governs:
  - "src/loops/lint-scheduled.ts"
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by:
  - R-001
---

# Scheduled Spec-Lint Loop

## Intent

`cortex loop-specflow-lint` (daily, design §11.4 item 8) is the cadence-and-paper-trail wrapper around structural spec checking: it runs the validator's spec-tree checks and writes `pulse/reports/lint.md`. No new judgment — the existing interactive `specflow-lint` skill remains the deep path; this loop guarantees the daily dated record.

## Entities

- **READS:** the project tree via `schema.validator`'s `validate()` — consumed, not reimplemented.
- **WRITES:** `pulse/reports/lint.md` only.
- **CREATES:** the report per §4.5 (`kind: pulse-lint-report`).

## Rules

1. **Command.** `cortex loop-specflow-lint`. The already-registered `specflow-lint` scheduled task's skill may invoke it for the deterministic pass; the skill's own deeper checks remain its own.
2. **Substance = the validator.** Run `validate(root)`; the report groups spec-tree-relevant violations (checks over `specs/`, `specs-business/`, `tests/scenario/specs/`) by check, with file, clause, and message — plus a one-line pointer to non-spec violations if any exist elsewhere.
3. **Always-write (§4.5):** a conformant tree yields "Spec tree structurally sound." with the counts.
4. **Read-only** (R-001); exit 0 whether clean or dirty — the report is the product, the exit code is not a CI gate (that is `cortex validate`'s job).

## Acceptance Criteria

### Clean tree is a stated clean run

- **Given** a conformant fixture project
- **When** the loop runs
- **Then** the report reads "Spec tree structurally sound." with zero-counts, exit 0

### Violations grouped with location and clause

- **Given** a fixture with a broken `implements:` and a missing `_overview.md`
- **Then** the report groups both under their checks, each naming the file and clause, exit 0

### Only the report is written

- **Then** any run touches only `pulse/reports/lint.md`

## Notes
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
