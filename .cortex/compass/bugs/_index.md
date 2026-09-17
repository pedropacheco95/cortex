# Bug ledger — index

**Read this when:** triaging a reported problem, or checking whether a failure mode has been seen before.

**What's here:** twenty bugs, `B-001`–`B-020`, one file each, seven-type classified. Filenames carry the slug — scan the directory before opening anything.

**Open (7)** — none blocking work:

| Bug | Type | Sev | |
|---|---|---|---|
| B-004 | incomplete-rule | low | onboarding scratch homes unredirected |
| B-005 | missing-criterion | low | `--force` clobbers localised indexes |
| B-007 | incomplete-rule | medium | L1's NUL heuristic reads `.ts` sources as binary |
| B-017 | incomplete-rule | medium | a tier that failed to run reads as a clean tier |
| B-018 | incomplete-rule | high | unmatched verb falls through to `init` |
| B-019 | incomplete-rule | high | duplicate rule and bug ids pass `validate` |
| B-020 | wrong-rule | high | archive promotions refused at `pulse-accept` |

**Resolved (13):** B-001–B-003, B-006, B-008–B-016. Each keeps its Resolution as history; all were caught by the system itself.

**How to navigate:** `type:` routes the fix — types 1–6 are a spec change, type 7 a test or skill fix. `affects:` names the spec IDs and files involved. The daily bug-triage loop fills absent classifications and reports divergences; it never overwrites a field already set.

**Keep this a pointer.** Per-bug narrative belongs in the bug file; this index is read every session under a <300-token budget (RULES 11).
