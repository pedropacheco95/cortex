---
id: loops.verify-scheduled
status: implemented
depends_on:
  - schema.validator
  - core-cli.init
governs:
  - "src/loops/verify-scheduled.ts"
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by:
  - R-001
---

# Scheduled Test-Coverage Verification Loop

## Intent

`cortex loop-specflow-verify` (daily, design §11.4 item 9) checks that every spec has the tests it is owed — by the schema §3 path conventions — and writes `pulse/reports/verification.md`. Existence and coverage only; running tests is the test-runner's job.

## Entities

- **READS:** dev specs, business specs, scenario specs (`covers:` lists), and the `tests/` tree paths per schema §3.
- **WRITES:** `pulse/reports/verification.md` only.
- **CREATES:** the report per §4.5 (`kind: pulse-verification-report`).

## Rules

1. **Command.** `cortex loop-specflow-verify`, invokable by the registered `specflow-verify` task's skill.
2. **Coverage checks (schema §3 conventions):** (a) every dev leaf spec has an atomic-layer and a spec-layer test file at its conventional path (domain/leaf match; capability level optional per §2.1); (b) every business spec has a journey-layer test; (c) every business spec appears in ≥1 scenario's `covers:` (the §8.2 completeness constraint, deliberately owned here, not by the validator — schema Decision 4).
3. **Deferrals are distinguished (business Rule 2).** A gap whose spec Notes declare deferral (the "deferred to v1.1" convention) is reported under "Deferred by decision", separate from genuine gaps.
4. **Always-write (§4.5)**; read-only (R-001); exit 0 regardless — the report is the product.

## Acceptance Criteria

### Covered spec is silent, uncovered is named

- **Given** a fixture where dev spec `a.b` has atomic+spec tests and `c.d` has neither
- **When** the loop runs
- **Then** the report names `c.d`'s two missing paths and not `a.b`

### Journey and scenario coverage checked per business spec

- **Given** a business spec with no journey test and absent from every `covers:`
- **Then** both gaps are reported against it

### Declared deferrals separated

- **Given** a dev spec whose Notes carry the journey-deferral convention
- **Then** its journey gap appears under "Deferred by decision", not under gaps

### Clean fixture is a stated clean run

- **Then** full coverage yields "All specs carry their owed tests.", exit 0

### Only the report is written

- **Then** any run touches only `pulse/reports/verification.md`
