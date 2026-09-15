---
id: insight.assistant-learns-from-sessions
status: implemented
implemented_by:
  - ../../specs/insight/session-observe.spec.md
  - ../../specs/hooks/session-end.spec.md
---

# The assistant gets better at working here, because it learns from every session

## Outcome

When this works, working with the assistant in this project stops being groundhog day. Every day, a background pass reads back the conversations the developer actually had with it and commits what they taught to the project's own memory — automatically, with no per-item approval. Project context stated in passing ("this is meant for about a thousand users"), working knowledge, corrections, the way things are done here — all of it lands in the unreviewed knowledge layer, marked for what it is: heard in a session, taken with a grain of salt, never re-confirmed as official. The next session starts already knowing it. Only the small minority of learnings that genuinely *bind* future work — a hard convention, a real decision — pause for the developer's review; everything else just sticks.

## Who this is for

The developer who talks to the assistant every day and is tired of re-explaining the same context session after session — and, through them, the assistant itself, which stops interacting with the project like a stranger who was introduced yesterday.

## User Journey

1. The developer works with the assistant in ordinary sessions — explaining intent, mentioning constraints in passing, correcting course, establishing how things are done here.
2. Every day, a background pass reads the sessions since it last looked and asks one question of each thing it learned: does this merely *inform* future work, or must it *bind* future work?
3. What informs is committed automatically to the unreviewed layer — project context not tied to any one file lands in a dedicated home of its own; knowledge about a specific file enriches that file's entry — every item traceable to the session that taught it. No proposal, no approval, no waiting.
4. What binds — a convention that should constrain future work, a decision whose reasoning must be preserved — becomes a proposal in the usual review queue, and only the developer's approval makes it official.
5. Next session, the assistant already knows what the last sessions taught — and knows how much to trust it: session-learned context is a useful hint, never a trump card over the project's reviewed rules, decisions, or specs.
6. When later sessions contradict something learned earlier, the learning is corrected in place; when a learning hardens into something that should bind, it reaches the review gate as a proposal — never by silent graduation.

## Business Rules

1. Learnings are inferred and grain-of-salt: something said once in conversation is context, not law — never authoritative over the reviewed layers, and where they disagree, the reviewed rule, decision, or spec wins, always.
2. Automatic means automatic: session-learned context and working knowledge commit with no per-item approval — the whole point is that learning happens without adding a review chore to the developer's day.
3. Binding candidates are still gated: anything that would constrain or direct future work — a rule, a decision — reaches official status only through the developer's review, with no exception.
4. When in doubt between the two, the learning stays ungated: the gate is for knowledge confirmed to bind, not for anything that merely sounds important.
5. Every learning is traceable to the session that taught it — the developer can always ask "where did you get that?" and get a real answer.

## Success Metrics

- Context the developer stated once in conversation — audience, scale, intent — is known to the assistant in a later session without the developer restating it or having approved anything.
- The review queue stays small: a daily pass produces mostly automatic learnings and only occasionally a proposal — never a queue of trivia awaiting approval.
- When session-learned context conflicts with a reviewed rule or spec, the assistant follows the reviewed layer — and can name the session-learned item it discounted.
- A learning that later proves wrong is corrected by newer sessions, in place, without human bookkeeping.

## Out of Scope

- Claude Code's own auto-memory system — untouched and explicitly not the vehicle here; this learning lives in Cortex's insight layer, owned by the project, not by the tool.
- Overruling compass, atlas, or the spec trees — session-learned knowledge never edits, shadows, or outranks the reviewed layers; changing those remains the review gate's job.
- Mining cross-session repetition into rule candidates over a wider window — that is the weekly distillation's job, not this outcome's; this one is about what each day's sessions teach in context.
- Understanding the source code itself — what files are for and how they connect is the codebase-understanding outcome (`assistant-understands-codebase.business.md`); this one is about what conversations teach.

## Notes

- This outcome is the separate re-specification the codebase-understanding outcome's notes anticipated: the sessions-teach-us half, now stated on its own terms with automatic, ungated learning as the headline and the review gate demoted to the binding minority.
- The daily session pass still enriches per-file understanding in service of the sibling codebase-understanding outcome (`assistant-understands-codebase.business.md`) — a deliberate cross-reference, not a link: its dev spec's `implements:` points at exactly this outcome, because automatic learning is its primary promise.
- Capture at the moment a session ends (`hooks/session-end.spec.md`, added 2026-09-15) is the second implementer: it records, deterministically and without judgment, what the session left hanging — an unanswered question, an offer, an approval, a measurement, a scratchpad file — so the daily pass and later recall work have evidence that survives transcript pruning. It is capture only; it learns nothing, injects nothing, and never touches the reviewed layers, so business rules 1–5 hold unchanged.
- The next-session payoff (journey step 5) rides on the existing SessionStart hook — a compact digest of what qualifies as worth surfacing (stated forcefully, or repeated enough) appears alongside the hook's other one-liners. That hook's own dev spec (`hooks/session-start.spec.md`) still `implements:` the guardrails outcome it was built for, single-valued as the schema requires — this is a cross-reference, not a second `implemented_by:` entry, the same convention used above for the codebase-understanding outcome.
