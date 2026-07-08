---
id: pulse.developer-sees-project-health-without-asking
status: implemented
implemented_by:
  - ../../specs/pulse/hygiene.spec.md
---

# A developer sees the project's health without asking for it

## Outcome

When this works, the slow rot every project accumulates — abandoned branches, a code map that's fallen behind, knowledge pointing at things that no longer exist, ageing to-dos — stops being invisible. A daily sweep writes one plain report of what's unfinished or broken, and the next working session opens with a one-line pointer to it. The developer never runs an audit; the audit finds them.

## Who this is for

Developers on Cortex-managed projects — especially returning after time away, when accumulated drift is largest and memory of it smallest.

## User Journey

1. The daily sweep runs on its own and writes its report; nothing else is touched.
2. The developer opens a session; one line says what housekeeping found, and where.
3. They read the report when they choose: each finding names the thing, the problem, and the suggested next step.
4. A quiet project produces a report that plainly says nothing needs attention — silence is stated, never assumed.

## Business Rules

1. The sweep only ever observes and reports — it never fixes, deletes, or changes anything itself.
2. Every run leaves a fresh, dated report, even when there is nothing to say.
3. Findings name concrete things with concrete next steps — no vague health scores.
4. The report is surfaced, not pushed: one line at session start, full detail one file away.

## Success Metrics

- Drift is surfaced within a day of appearing, without anyone asking.
- A returning developer knows the project's loose ends from one file.
- Zero mutations ever attributable to the sweep.

## Out of Scope

- Fixing what it finds — every fix flows through the developer or the review gate.
- Learning from session content — that is the pattern-extraction outcome.

## Notes

- The session-start pointer already exists; this outcome supplies the report it points at.
