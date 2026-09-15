---
kind: insight-observation
updated: 2026-09-06T01:20:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/9c6cdd6d-65db-46dd-998f-2232f2b016bb
  - claude-sessions/pedropacheco1/67da915c-1080-40a7-a0a8-ece57da80042
  - claude-sessions/pedropacheco1/09124a88-f17c-456b-9005-164bc9d793d7
  - claude-sessions/pedropacheco1/c564d673-033f-4801-879c-f8bc6628e43c
  - claude-sessions/pedropacheco1/d97506f5-d147-4dd2-829c-1131fb83ed23
  - claude-sessions/pedropacheco1/ae5057ae-3fe3-45c6-9754-8d06a4d6ac47
  - claude-sessions/pedropacheco1/d868fb89-e74c-487e-ad98-0c63eae7aed9
  - claude-sessions/pedropacheco1/2e498599-40da-4415-bd91-93d104ffac1b
---

`cortex-loop-session-observe`'s (member 5) enrichment audit diffs the
working tree against git HEAD to confirm it only touched what it was
allowed to. The audit misattributes *any* pre-existing uncommitted diff
under the paths it checks to itself and reports spurious violations with
a non-zero exit code — this is not limited to same-run ordering against
`cortex-loop-insight-refresh-daily` (member 4). Confirmed on 2026-09-04:
member 4 reconciled zero entries that cycle (nothing was in scope to
re-extract), yet member 5 still reported 16 violations — 14 against
`.cortex/insight/anatomy/src/cli/{scaffold,templates}.ts.md` (frontmatter
and extraction-owned sections changed, unlabelled `## Insights` lines)
left uncommitted from an unrelated earlier session, plus 2 against gated
compass paths (`.cortex/compass/bugs/_index.md` modified,
`B-017-*.md` untracked) that member 5 never touches. The true root cause
is this dogfood repo going for weeks without a commit of `.cortex/`
(HEAD was 2026-08-06 at the time of this observation) while every loop
that legitimately writes `.cortex/` keeps piling uncommitted diffs onto
the working tree; the audit then attributes ALL of it, gated or not, to
whichever loop ran last. This is a recurring false positive from stale
uncommitted `.cortex/` state, not a real boundary violation and not
specific to the member-4-then-5 pairing; confirm by checking whether the
flagged diffs pre-date this run (`git log`/`git diff` timestamps on the
named files) before treating a violation count as real. Nothing is lost
when this fires, and applyObserve still lands proposals and advances
observed-state regardless. Committing `.cortex/` state regularly (ideally
every bundle run, per this dogfood repo's own convention of tracking
`.cortex/`) would clear the noise at the source.
