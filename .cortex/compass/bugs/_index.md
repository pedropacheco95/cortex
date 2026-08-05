# Bug ledger — index

**Read this when:** triaging a reported problem, or checking whether a failure mode has been seen before.

**What's here:** sixteen bugs, `B-001`–`B-016`, one file each, seven-type classified. Filenames carry the slug — scan the directory before opening anything.

**Open (3)** — found by reconciliation and dogfooding; none blocking:

| Bug | Type | Sev | |
|---|---|---|---|
| B-004 | incomplete-rule | low | onboarding scratch homes unredirected |
| B-005 | missing-criterion | low | `--force` clobbers localised indexes |
| B-007 | incomplete-rule | medium | L1's NUL heuristic reads `.ts` sources as binary |

**Resolved (13):** B-001–B-003, B-006, B-008–B-016. Each carries a Resolution section and is kept deliberately as design-refinement history, not cleared. Every one was caught by the system's own mechanisms.

**How to navigate:** `type:` routes the fix — types 1–6 are a spec change, type 7 a test or skill fix. `affects:` names the spec IDs and files involved. Resolved entries record what was tried, so a recurrence is recognisable. The daily bug-triage loop fills absent classifications and reports divergences; it never overwrites a field already set.

**Keep this a pointer.** Per-bug narrative belongs in the bug file. This index is read every session and has a <300-token budget (RULES 11) — it hit 1131 on 2026-08-05 by absorbing summaries that already existed one file away.
