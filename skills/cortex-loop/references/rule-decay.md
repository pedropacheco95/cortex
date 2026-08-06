# rule-decay

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-loop-rule-decay` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Weekly rule-obsolescence review. Use for the scheduled **weekly-curation**
bundle's rule-decay member, or when the user says "run the rule-decay loop",
"which rules are stale", or "audit the compass rules".

Invokes `cortex loop-rule-decay` and summarises
`.cortex/pulse/reports/rule-candidates.md`.

## Discipline

You are a thin wrapper around the deterministic Core loop. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex loop-rule-decay`.
2. Read `.cortex/pulse/reports/rule-candidates.md`.
3. Summarise the retirement candidates to the user — which rules, which
   signals fired (dead governs, dead sources, age), and the evidence — plus
   the thresholds from the report footer.

**Never mutate anything.** Never edit or retire a rule: retirement is a human
editing `status: retired` (loops.rule-decay, propose-don't-mutate). Your only
output is the summary of the CLI's report.
