---
kind: insight-observation
updated: 2026-07-26T01:10:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/9c6cdd6d-65db-46dd-998f-2232f2b016bb
  - claude-sessions/pedropacheco1/67da915c-1080-40a7-a0a8-ece57da80042
  - claude-sessions/pedropacheco1/09124a88-f17c-456b-9005-164bc9d793d7
---

In the daily bundle, `cortex-loop-session-observe`'s (member 5) enrichment
audit diffs the working tree against git HEAD to confirm it only touched
what it was allowed to. When `cortex-loop-insight-refresh-daily`
(member 4) has legitimately re-extracted `.cortex/insight/anatomy/*.md`
files earlier in the same run and those writes are still uncommitted,
member 5's audit misattributes member 4's diffs to itself and reports
spurious violations with a non-zero exit code — even when session-observe
made zero writes of its own that cycle. This is a recurring false
positive caused by bundle-member ordering against an uncommitted working
tree, not a real boundary violation; confirm by checking that the only
diffs are the files the insight-refresh member named, and that
compass/atlas remain untouched. Committing `.cortex/` state between daily
bundle runs would clear the noise, but nothing has been lost when this
fires.
