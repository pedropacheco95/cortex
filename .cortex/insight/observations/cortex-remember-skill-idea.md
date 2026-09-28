---
kind: insight-observation
updated: 2026-09-24T00:42:09Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/f5195b8d-87a6-4558-a516-bef9db1ffda6
---

Pedro raised the idea of a `cortex-remember` skill (mid-session "save
this fact into Cortex" without knowing where it belongs) paired with a
fetch-side improvement, to make Cortex more usable in the moment rather
than only through loops and ingestion. As of this session it is an idea
under discussion, not an agreed spec — no `specflow-brainstorm` pass has
run on it yet.

The gap it would fill: today the only write paths into Cortex are
`cortex-archive-ingest` (whole documents), `specflow-bugs` (bug filing
only), and the loops (propose-only, via `.cortex/pulse/`) — there is no
"remember this one fact right now" path, and `atlas/stakeholders/`
having only its index file with no stakeholder entries was raised as a
live symptom of the gap.

Design constraints already identified, worth carrying into any future
spec pass: (1) RULES.md rules 12 and 20 mean the skill could save
*where* a machine-local value lives ("FOO in .env.local", "1Password →
X"), never the value itself — compass holds pointers, never secrets,
and this repo is public; (2) it should default to writing (not
proposing) only when the user explicitly asked to save something,
falling back to a `.cortex/pulse/` suggestion otherwise, mirroring
RULES.md rule 7's propose-don't-mutate split the loops already use; (3)
the boundary between a Cortex-worthy project fact and a Claude-personal
preference is still blurry and unresolved — Claude's own memory system
already carries some entries that just point back into Cortex.
