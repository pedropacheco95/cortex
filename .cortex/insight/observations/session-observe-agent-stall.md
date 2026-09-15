---
kind: insight-observation
updated: 2026-08-25T01:07:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/60aec2dc-3645-4d54-ae41-6379a249cb09
  - claude-sessions/pedropacheco1/404c5c16-c646-447a-87b8-90337d260425
---

`cortex-loop-session-observe`'s in-session reading step (mining the
unobserved-session worklist for durable knowledge) has been driven two
different ways across runs: dispatching parallel Agent-tool subagents to
read batches of sessions, and reading the sessions directly in-session
(e.g. loading `.cortex/pulse/state/session-corpus.json` and walking the
messages inline). The subagent approach has stalled at least once — a
4-way parallel dispatch over 28 unobserved sessions produced "Agent
stalled: no progress for 60[s]" and required user interruption
(2026-08-12). A later run using 3 parallel subagents over the same-shaped
worklist completed without stalling (2026-08-20), so the failure isn't
deterministic — but the skill's own discipline already says "you — this
session — do the observation... never spawn a nested `claude`
subprocess," which reads as a direct instruction to do this step inline
rather than fan it out. Reading sessions directly (no subagents) avoids
the stall risk entirely and matches that discipline more literally; prefer
it over parallel dispatch for this step.
