---
id: store.agent-has-knowledge-when-it-needs-it
status: implementing
implemented_by:
  - ../../impl/store/layout.spec.md
  - ../../impl/store/validate.spec.md
  - ../../impl/store/map.spec.md
  - ../../impl/store/rules.spec.md
  - ../../impl/store/freshness.spec.md
  - ../../impl/store/managed-block.spec.md
  - ../../impl/store/migrate.spec.md
  - ../../impl/store/remember-skill.spec.md
  - ../../impl/store/migrate-skill.spec.md
---

# The agent has the project's knowledge and rules when it needs them, and keeps them current

## Outcome

When this works, an agent in this project knows what it can't learn by reading the code or the specs: why things are the way they are, who is involved, the environment, past mistakes, rejected options, and how the user wants work done. Finding that knowledge costs less than reading code. The agent records new facts as it learns them, in a place the next session will look. A person can open the same folder, read it as plain notes, and correct it. Knowledge that has gone stale says so instead of misleading quietly.

## Who this is for

The developer who owns the project, and every agent session working in it: interactive sessions, reviewers, and unattended loops. Also anyone adopting the project later, who should be able to read its memory without learning a tool.

## User Journey

1. A session starts. The agent sees a short map: what the store holds, where to look for a term, a person, an error or a "why", how to file a new fact, and the few rules that always apply.
2. The agent meets an unfamiliar term. It opens one file named after the term and has the answer.
3. The agent is about to do something the user has a rule about. The rule is a file of its own, which says when it applies. The agent finds it from the map.
4. The user explains something that isn't written down. The agent files it in the one file where it belongs, and says so in one visible line: "Filing: <fact> → <path> (origin: <session>)". The user can correct it on the spot, and anyone can later trace the fact back to the conversation it came from. A document handed over is kept as a digest, and every ask in it is filed as a request for a spec, so no ask rests unread. A bug is filed the same way, as an open item in the code area it affects, and moves to the project's history when it is fixed.
5. A week later, the code a fact depends on has changed. The project's self-check says the fact may be stale. A "until Friday" note expires on its own date and moves to history.
6. A project on the old hidden layout migrates. The migration shows, before anything is written, where every old fact will go, and nothing is lost or silently dropped. The old inferred code summaries are dropped openly: the report counts them and prints the command that removes them. Working files that may hold knowledge (reports, onboarding notes, open questions) are never retired silently: an agent reads them and decides rescue, digest or retire, and a person sees every decision before anything is written. Accepting the migration also retires the old hooks and loops around the store, without deleting anything.

## Business Rules

1. Knowledge lives in a visible folder of plain files, one subject per file, named the way a reader would search for it.
2. Every fact lives in exactly one file.
3. Only a short map is always loaded, plus, in a project with specs, a short section on how they work. Everything else is read when needed.
4. The user's rules are first-class: each one says, in words, the situation it applies to.
5. Every fact records where it came from (a session, an ingested document, a commit, a report, or the old store) and when it was last confirmed and how (seen, told or inferred). What can go stale says what it depends on, and anything time-bound carries an end date.
6. History is never rewritten, only appended to.
7. Moving to the new layout never loses a fact, and never leaves a project's own skills pointing at something gone: they are listed, adjusted where a replacement exists, and every edit is reported. Every old item is accounted for, and the old store stays until the user accepts the move. The old inferred code summaries (insight anatomy, concepts and graph) are not facts anyone gave the project: they are dropped by a recorded decision (2026-10-14), counted in the report, and left on disk for the user to remove.
8. Nothing here needs a model call to work. Judgement belongs to the agent and the user; the tool validates, generates, expires and reports.

## Success Metrics

- This repository's own store migrates with 100% of its entries accounted for, and 0 dropped other than the inferred code summaries dropped by decision.
- The always-loaded map stays at or under about 60 lines.
- The project's self-check flags every expired time-bound item and every fact whose dependencies changed after it was last confirmed.
- Every fact a session files is announced with a visible "Filing:" line that names its origin.
- Every file in the store has an origin a reader can follow.
