---
id: specflow.nothing-is-built-before-it-is-agreed
status: implemented
implemented_by:
  - ../../impl/specflow/brainstorm-skill.spec.md
  - ../../impl/specflow/plan-skill.spec.md
  - ../../impl/specflow/develop-split.spec.md
  - ../../impl/specflow/entry-gate.spec.md
  - ../../impl/specflow/spec-skill.spec.md
  - ../../impl/specflow/review-skill.spec.md
---

# Nothing big is built before it is agreed, and a recorded decision is never built past

## Outcome

When this works, big work starts as a spec, not as code. A session with no code to write reads what the project does today, turns the request into criteria with a named test each, and cuts them into waves. Fresh reviewers who never saw the conversation then read that spec against the code, and the developer resolves what they find. Only then does the main session develop, wave by wave. Small work skips all of this and is held honest by the commit check.

Whichever path runs, a request that contradicts a rule, a "not this spec" line or a decision the owner recorded does not get built: the conflict is written down and the work stops, even in a run where nobody can answer.

## Who this is for

Developers running spec-first projects with agentic implementation, where the expensive failures are building the wrong thing confidently and overriding a decision nobody remembered.

## User Journey

1. The developer asks for something no criterion covers, or that touches more than one spec. Instead of code, they get a spec session.
2. That session finds what produces the behaviour today and what depends on it, writes the criteria and their tests, and asks about what the request leaves open.
3. Every ask the request quotes ends up as a criterion or as an open question, so a specific ask is not generalised away in silence.
4. Fresh agents review the spec, one per concern and angle, and the developer gets one merged list of findings.
5. The developer resolves the findings, and the main session develops the spec wave by wave, each wave an ordinary change.
6. If the request conflicts with a recorded decision, the developer gets the conflict as an open question and no build.

## Business Rules

1. Big work does not begin before a spec exists and has had a fresh review.
2. A reviewer counts only if it never saw the conversation.
3. A conflict with a recorded owner decision always stops the work, in every kind of run.
4. In a run told the user can't answer, an open question does not stop the work: it is decided, and the decision and its reason are written down.
5. Stopping with an honest open question is a success, not a failure of the run.
6. Every ask quoted in a request maps to a criterion or is listed as an open question.
7. A spec session starts from what the project already holds: its rules, its promises, its recorded decisions and the code that produces the behaviour today.
8. Tests decide correctness. A review never overrides a passing test or stands in for a missing one.
9. A finding names its criterion or section, a place and a proposed change, or it is not a finding.
10. A review received from someone else is checked against the spec, a rule or the code before it is applied, and a disagreement is settled by one of those, never by who said it.

## Success Metrics

- Zero big changes that started before a spec existed.
- Every owner-decision stop was right when the owner reads it.
- Goldfish findings are acted on, and the count is reported at each review.
- The number of "that's not what I asked for" reversals falls.

## Out of Scope

- Judging craft or style: a reviewer finds gaps between spec and code, and correctness belongs to the tests.
- Writing the code or the tests in the spec session. Tests are named there and written with each wave.
- Choosing what the project should do next; this is about how one agreed thing gets built.

## Notes

- The earlier spine was `brainstorm → plan → develop` (2026-08). The owner's 2026-11-03 decisions replaced it with two paths, a quick default and this big path; the spec is now the design document and waves replace the plan file.
- Business Rules 7 to 10 are folded in from `developer-gets-spec-work-grounded-in-project-memory` and `craft-review-never-substitutes-for-a-test` (sitting item 31, 2026-11-05).
