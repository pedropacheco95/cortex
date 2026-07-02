---
id: schema.contributor-trusts-project-knowledge
status: implemented
implemented_by:
  - ../../specs/schema/validator.spec.md
---

# A contributor can trust the project's knowledge is consistent

## Outcome

When this works, anyone adding to the project's knowledge can trust it actually follows the agreed shape. Mistakes — a broken link between an outcome and the work that delivers it, a folder missing its summary, a description pointing at something that no longer exists — get caught and named the moment they appear, instead of quietly piling up until the knowledge can no longer be trusted.

## Who this is for

Contributors maintaining a Cortex-managed project — and the AI assistant working alongside them, which depends on the knowledge being consistent to give grounded, citable answers.

## User Journey

1. A contributor adds or changes a piece of project knowledge.
2. They ask Cortex to check the project's knowledge for consistency.
3. Cortex reports back: either everything fits the agreed shape, or a precise list of what doesn't — each problem named with where it is and which agreement it breaks.
4. The contributor fixes the flagged problems, re-checks, and gets a clean result before the rest of the system relies on the change.

## Business Rules

1. A check never changes the knowledge it inspects — it only reports.
2. Every reported problem says where it is and which agreement it breaks, in plain terms.
3. Problems are separated into ones that must be fixed and ones merely worth a second look.
4. If a piece of knowledge claims to follow a version of the agreement the checker doesn't recognise, that is reported rather than guessed at.

## Success Metrics

- A contributor can tell whether the whole project's knowledge is consistent in a single check, in seconds.
- Inconsistencies are caught at the moment they are introduced, not discovered later.

## Out of Scope

- Judging whether the knowledge is *correct* or *complete* — only whether it is *consistent with the agreed shape*. Test-coverage completeness and spec correctness are separate outcomes.
- Defining the agreed shape itself — that contract is a separate outcome (see the rest of this folder).

## Notes

- OPEN: whether "every outcome is exercised by at least one end-to-end scenario" is reported by this same consistency check or by a separate verification step.
