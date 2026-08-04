---
id: specflow.nothing-is-built-before-it-is-agreed
status: implemented
implemented_by:
  - ../../specs/specflow/brainstorm-skill.spec.md
  - ../../specs/specflow/plan-skill.spec.md
  - ../../specs/specflow/develop-split.spec.md
---

# Nothing is built before it is agreed, and nothing broken is called done

## Outcome

When this works, the developer's half-formed idea becomes a spec, the spec becomes a plan
someone else could execute, and the plan becomes code — with a stop at each boundary rather
than a single long slide from "let's build X" to a pile of code nobody agreed to.

The first stop is agreement: an idea is explored one question at a time, two or three real
approaches are put up with a recommendation, and nothing is implemented until a design is
agreed and written down as a spec. The second stop is a plan the developer can read and hand
to a fresh agent — bite-sized tasks, exact paths, the criterion each task satisfies, and the
command that proves it. The third is the honest ending: when a defect resists five rounds of
fixing, the work stops and says so instead of thrashing or shipping it broken.

## Who this is for

Developers running spec-first projects with agentic implementation, where the expensive
failures are building the wrong thing confidently and calling a broken thing finished.

## User Journey

1. The developer says "let's build X". Instead of code, they get one question at a time —
   scope first, then the decisions that actually fork the design.
2. They are shown two or three approaches with a recommendation and the trade-offs, and they
   choose. The agreed design becomes a spec, not a design document in a drawer.
3. From the agreed spec comes a plan: small tasks, each naming the criterion it satisfies and
   the command that verifies it, ordered so each one leaves the project working.
4. Implementation executes the plan and verifies by test. Along the way, untested edge cases
   are handled and written down rather than becoming blocking questions.
5. When something is found broken after implementation, it gets up to five rounds of fixing —
   escalating as it goes — and if a load-bearing defect still stands, the work stops and the
   developer is told, plainly, what is broken and what was tried.

## Business Rules

1. No implementation begins before the design is agreed and a spec exists.
2. A plan is only a plan if a fresh agent with no memory of the conversation could execute it.
3. Questions are asked one at a time. A wall of questions is a way of not deciding.
4. An untested edge case found while implementing is handled and recorded — it does not stop
   the work. A known defect that resists five rounds of fixing does stop the work. These are
   different situations and both rules hold.
5. Stopping with an honest "blocked" is a success, not a failure of the run.

## Success Metrics

- Zero implementations that started before an agreed spec existed.
- A plan can be handed to a fresh session and executed without asking the author anything.
- Defects that survive five fix rounds are reported as blocked, never silently shipped.
- The number of "that's not what I asked for" reversals falls.

## Out of Scope

- Judging craft or style — that is the review pair's outcome, and it never gates correctness.
- Writing the tests. Tests come from the specs before implementation runs.
- Choosing what the project should do next; this is about how one agreed thing gets built.

## Notes

- The spine is `brainstorm → plan → develop`, grafted from the Superpowers mechanisms during
  the 2026-08 absorption round (`plans_and_handoffs/plans/2026-08-03.md` §3 Phase 3) into
  spec-first skins. `develop` keeps its name; its planning half moved into `plan`.
