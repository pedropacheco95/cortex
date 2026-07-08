---
name: cortex-loop-rule-decay
description: >-
  Weekly rule-obsolescence review for a Cortex project. Use for the scheduled
  rule-decay task, or when the user says "run the rule-decay loop", "which
  rules are stale", or "audit the compass rules". Invokes
  `cortex loop-rule-decay` and summarises .cortex/pulse/rule-candidates.md.
---

# cortex-loop-rule-decay

You are a thin wrapper around the deterministic Core loop. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex loop-rule-decay`.
2. Read `.cortex/pulse/rule-candidates.md`.
3. Summarise the retirement candidates to the user — which rules, which
   signals fired (dead governs, dead sources, age), and the evidence — plus
   the thresholds from the report footer.

**Never mutate anything.** Never edit or retire a rule: retirement is a human
editing `status: retired` (loops.rule-decay, propose-don't-mutate). Your only
output is the summary of the CLI's report.
