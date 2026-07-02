---
id: hooks.assistant-gets-timely-guardrails
status: draft
implemented_by:
  - ../../specs/hooks/session-start.spec.md
  - ../../specs/hooks/pre-write.spec.md
  - ../../specs/hooks/post-write.spec.md
---

# The assistant gets the right nudge at the right moment — without blocking the work

## Outcome

When this works, the assistant is quietly kept honest at the three moments that matter: it starts every session knowing the project's knowledge layer exists and where to look; it gets warned — before a change lands — when that change would break a known project rule, with the reason and its source attached; and the map of the code updates itself the moment a file changes. None of it interrupts the work: a nudge is a whisper, never a roadblock.

## Who this is for

Developers working with the assistant on a Cortex-managed project — and the assistant itself, which gets the context it needs exactly when it needs it instead of having to remember to ask.

## User Journey

1. The developer opens a new session; the assistant is briefed in one line that the knowledge layer is active, plus a note if the latest housekeeping report found anything worth seeing.
2. Mid-session, the assistant proposes a change that collides with a recorded project rule; a short warning appears naming the rule and where it came from, before the change lands.
3. The assistant (or the developer) decides what to do with the warning — the change itself is never held hostage.
4. The change lands; the code map silently refreshes its entry for that file, so the next question about it gets a current answer.
5. If a nudge itself ever misfires, the work continues untouched — the misfire is noted where the housekeeping process will surface it.

## Business Rules

1. A nudge never blocks or delays the work it comments on — it informs, the work proceeds.
2. Every rule warning names the rule and its origin, so it can be challenged, not just obeyed.
3. Warnings appear only when a rule actually applies — silence is the normal case.
4. A misbehaving nudge is itself just a nudge: it fails quietly, the operation continues, and the failure is recorded for review.
5. Nudges spend the assistant's attention frugally — a line or two, never a page.

## Success Metrics

- A recorded rule violation is warned about before the change lands, every time, with its source attached.
- Sessions where nothing applies see near-zero added noise.
- No developer ever loses work, or waits, because of a nudge — including a broken one.

## Out of Scope

- What the rules themselves say and how they are curated — that is the conventions outcome.
- The housekeeping that produces the session-start findings — that is the self-maintenance outcome.
- Reading guidance before the assistant opens a file — a possible later refinement, deliberately not part of this promise.

## Notes

- The "never blocks" promise is absolute by design: a guardrail that can halt work will eventually halt the wrong work and get disabled. Whisper-only keeps the guardrails trusted and therefore on.
