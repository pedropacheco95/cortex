# Discipline — Overview

## What this is

The outcomes that hold regardless of which build process a project runs. Cortex offers a
process profile (spec-first Specflow today, a workflow-first alternative later), but a small
set of promises must be true under either: an agent does not claim work is done without
evidence, and the rules an agent is given actually bind it when the work gets hard.

## What it covers

**Outcomes written:**

- **The developer can trust "done" without re-checking it** — completion claims carry fresh
  evidence, and the disciplines that produce that evidence survive the pressure to skip them.

_Planned outcomes (not yet written):_

- **A defect that resists fixing stops instead of shipping** — the review ladder's outcome,
  currently expressed inside the spec-first develop flow.
- **The craft review and the correctness gate stay separate** — quality feedback never
  substitutes for a passing test.

## Why it's grouped this way

These outcomes are process-agnostic on purpose. Putting them under `specflow/` would tie them
to one build process and make them disappear the moment a project chooses another; putting
them under `core-cli/` would imply the deterministic binary enforces them, which it cannot —
they are agent disciplines, enforced by skill instructions. They belong in their own group so
both process profiles can point at the same promises.

What does not belong here is anything specific to how a spec tree is written or how a plan is
staged — that is the process profile's business.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/discipline/`
- The spec-first process that invokes them: `../specflow/`
- The knowledge layer the disciplines read: `../insight/`, `../compass/`
