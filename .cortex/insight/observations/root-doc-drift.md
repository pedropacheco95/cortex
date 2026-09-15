---
kind: insight-observation
updated: 2026-08-20T16:40:02Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/f2a2b32d-7342-4527-99e4-a7716db566b6
  - claude-sessions/pedropacheco1/738a8033-6a3e-4ac5-9063-23ab51cb5024
---

The root `CLAUDE.md` describes a project state that no longer exists.
Verified live on 2026-08-20: it still says "the spec trees are currently
SCAFFOLDED STRUCTURE ONLY — no specs have been written yet" and, under
Commands, "No code exists yet — placeholders" — while the actual counts
that day were 68 developer specs (`.specflow/specs/**/*.spec.md`), 32
business specs, 83 `src/**/*.ts` files, and 104 `tests/**/*.test.ts`
files. Every session in this repo (including autonomous scheduled runs)
is currently primed by its own root CLAUDE.md with an inaccurate picture
of project maturity. A `/doctor` session on 2026-08-04 already proposed
the correction but it was never applied by hand, and 16 days later the
stale text is still live — this is not self-healing and needs a human or
a future session to actually edit CLAUDE.md's text (out of scope for
this ungated loop, which only observes).

Separately, `cortex-schema.md` (line 5, "Depends on:") names both
`cortex-design.md` ("the v1 design doc, frozen") and
`cortex-v2-design.md` ("the v2 design doc, frozen"), and CLAUDE.md's own
Project Structure listing (line 39) lists `cortex-design.md` as an
expected repo file — but neither file exists anywhere in the tree; only
`cortex-v3-design.md` is present. This is a genuinely dead citation trail
for whichever rules trace their "why" back to the frozen v1 or v2 docs
specifically, distinct from the many live `design §N` citations that
resolve to `cortex-v3-design.md`.
