---
kind: insight-observation
updated: 2026-07-26T01:10:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/9c6cdd6d-65db-46dd-998f-2232f2b016bb
  - claude-sessions/pedropacheco1/797a3f69-2c76-4d6a-86b4-3a9dd6910913
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
