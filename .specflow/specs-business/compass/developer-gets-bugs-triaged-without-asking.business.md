---
id: compass.developer-gets-bugs-triaged-without-asking
status: implemented
implemented_by:
  - ../../specs/loops/bug-triage.spec.md
---

# Filed problems classify themselves and point at their fix

## Outcome

When this works, filing a problem is enough: a daily pass picks up every open entry in the problem ledger, classifies the unclassified ones against the seven-kinds framework — naming where in the chain the break lives and what kind of fix it needs — and double-checks the already-classified ones, reporting where its judgment differs from the filed one. The ledger stays an active queue, not a graveyard.

## Who this is for

Developers on Cortex-managed projects who file problems as they notice them and want the thinking-about-them to happen on schedule, not when someone remembers.

## User Journey

1. A problem gets filed — sometimes fully classified, sometimes just described.
2. The daily pass classifies what lacks classification and writes its reasoning into the entry itself.
3. For entries a human already classified, the pass compares and reports agreement or divergence — it never overwrites a human's judgment.
4. The developer reads one summary: what got classified, what diverged, what's been open longest.

## Business Rules

1. A human's filed classification is never overwritten — divergent second opinions go to the report.
2. Only missing classification fields are ever filled in; everything else in an entry is untouchable.
3. Every classification names its kind from the shared framework and proposes a concrete fix direction.
4. Every run leaves a fresh, dated summary, even when the ledger is empty or all-agreed.

## Success Metrics

- An unclassified problem is classified within a day of filing.
- Divergence between filed and re-derived classifications is surfaced, never silently resolved.
- Zero human classifications altered by the pass.

## Out of Scope

- Fixing the problems — classification routes the fix; humans (or the change-verified automation) execute it.
- Problems reported conversationally — those flow through the interactive triage path.

## Notes

- The double-check on already-classified entries is deliberate calibration: divergence is signal about the filing or about the pass, and both are worth knowing.
