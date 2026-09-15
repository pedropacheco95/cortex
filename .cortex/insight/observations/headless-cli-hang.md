---
kind: insight-observation
updated: 2026-08-20T16:40:02Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/9c6cdd6d-65db-46dd-998f-2232f2b016bb
  - claude-sessions/pedropacheco1/797a3f69-2c76-4d6a-86b4-3a9dd6910913
  - claude-sessions/pedropacheco1/738a8033-6a3e-4ac5-9063-23ab51cb5024
---

In scheduled/unattended contexts, some headless `cortex` invocations
(`cortex pulse-hygiene`, the insight extraction `runL1` path, and other
long-running Core commands) are known to hang rather than exit —
observed at near-zero CPU with no progress. macOS also lacks a
`timeout` command, so the working mitigation is to run the command in
the background via the Bash tool's own `run_in_background`/timeout
parameter (never a shell `timeout` wrapper) and poll for completion
rather than waiting synchronously. This is a standing operational
gotcha for any loop or bundle member that shells out to `cortex`
headlessly, not a one-off.

A second, distinct instance class: the `cortex hook session-start`
*hook itself* (invoked synchronously by the harness at session start,
never manually) was measured across 31 runs at a healthy 807ms median,
but with 3 outlier runs at ~930-934s each, across three separate
projects (cortex, berd, padelleague). The tight clustering near ~930s
reads as a fixed ceiling/timeout being hit rather than an indefinite
hang. Unlike the loop-invoked-command case above, there is no
background-and-poll mitigation available here — nobody invokes
SessionStart manually, the harness does. This is also a direct
violation-in-production of this project's own hard constraint (CLAUDE.md
"What NOT to Do": "Never let a hook block — hooks warn-never-block, are
pure Node file I/O, and make no network calls") and is worth flagging to
a human as a rule-violation signal if it recurs, not just filed away as
an operational gotcha.
