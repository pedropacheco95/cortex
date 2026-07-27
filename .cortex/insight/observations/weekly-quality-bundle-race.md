---
kind: insight-observation
updated: 2026-07-26T01:10:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/c14202de-0606-4be2-ba4c-3b1df3205bb1
---

The weekly-quality bundle's members are meant to run in listed order
(specflow-lint, then specflow-verify, then insight-refresh-full), but on
2026-07-20 member 3 (insight-refresh-full) observed member 1's
(specflow-lint) sanctioned mechanical fixes land on disk mid-run,
attributed them to `cortex validate --json` mutating the gated spec
tree, and reverted all 6 edits — then filed a background task chip for a
validator-mutation bug that does not exist. The orchestrating session
caught the discrepancy (member 1's report claimed 7 fixes but only 1 was
on disk), manually re-applied the 6 reverted edits, and confirmed no such
validator bug exists. Treat any future report of "the validator is
mutating gated specs" during this bundle with suspicion first — check
whether it coincides with specflow-lint's own sanctioned fixes landing in
the same window before treating it as a real defect.
