---
id: B-021
title: The session-end lexicon fallback records any prose sentence holding the word "measured" and an unrelated digit as a measurement finding
type: wrong-rule
severity: low
status: open
affects:
  - hooks.session-end
  - src/hooks/session-end.ts
  - pulse.threads
proposed_fix: >-
  Tighten hooks.session-end Rule 7c: `measured` (and `median`) qualify only when a number
  with a unit or ratio sits in the same clause, not when any digit (a rule number, a commit
  sha, a date) appears anywhere in the sentence; add the T-002 shape as a negative criterion.
opened: 2026-09-24T09:21:02Z
found_at_commit: a66041b
---

# B-021 — The lexicon fallback records "measured" plus any digit as a measurement

**Source:** human report (2026-09-23 Jev investigation of the hook heuristics), reproduced
against the built hook.

**What happens:** Rule 7c's lexicon fallback accepts a sentence when it contains *any* digit
**and** matches `MEASUREMENT_RE` (`\bover \d+ sessions\b|\d+(\.\d+)?[x×] (cheaper|faster)|\bmedian\b|\bmeasured\b`).
The `measured` and `median` alternatives need no number of their own, so the digit can come
from anywhere in the sentence. Thread T-002 is a changelog bullet: "RULES 6 now names that gate
as the one measured exception to warn-never-block; CLAUDE.md mirrors it (3847f28)." It became
a `finding` thread because "measured" is an adjective there and the digits come from "6" and
a commit sha.

**What should happen:** a lexicon finding is a sentence that *reports a number*, as in
"fired 15, followed 0 over 55 sessions" or "median 239 ms". A sentence that merely uses the
word "measured" next to an identifier should not qualify.

**Evidence (Phase 1):**
- Reproduced on 2026-09-24 against `dist/hooks/session-end.js` (built 2026-09-21, after
  1a0174c) by calling `extractFindings([], [{role:'assistant', text}], 'interactive')`.
  T-001's text now gives 0 findings: 1a0174c's `STATUS_LADDER_RE` fixed that half. T-002's
  text still gives **1**. So does "The readDefer experiment is ON since 2026-09-16, re-measure
  ~2026-09-23 per the measured plan." A real measurement ("fired 15, followed 0 over 55
  sessions") gives 1, as it should.
- Session record `9a121da9…` (2026-09-16) carries both lexicon findings, and `threads_opened`
  lists T-001 and T-002.
- Git history: 1a0174c (2026-09-17, "lexicon precision") added the status-ladder filter and
  named T-001/T-002 as its motivating case in the spec text. It never changed
  `MEASUREMENT_RE`, so T-002's shape was never covered.
- Downstream: T-001 is still `open` and is still served as a `Recall: thread` pointer. The
  2026-09-23 search-annotate probe with the pattern `done when grep schema` returned it. Nothing
  retroactively closes threads opened by the pre-fix hook; both expire on 2026-10-16.

**Root cause:** the rule is wrong, not missing. hooks.session-end Rule 7c defines a
measurement as `/\d/` anywhere plus a lexicon word. For `measured` and `median` that
conjunction does not tie the number to the word.

**Affected specs:**
- Dev: .specflow/specs/hooks/session-end.spec.md (Rule 7c, the `MEASUREMENT_RE` clause)
- Business: .specflow/specs-business/insight/assistant-learns-from-sessions.business.md.
  No drift: the business spec asks for measurements to be captured, and this is a precision
  defect below it.

### Change Plan

**Spec to modify:** .specflow/specs/hooks/session-end.spec.md
**Change type:** Correct existing rule + add criterion (Type 3, needs human approval)

**Change Rule 7c's qualifying test from:**
"any remaining sentence … that contains a digit **and** matches `MEASUREMENT_RE`"

**To (proposed):**
"any remaining sentence in which a `MEASUREMENT_RE` alternative is satisfied *by its own
number*. `over N sessions` and `Nx cheaper|faster` already carry one. `median` and `measured`
qualify only when a number followed by a unit or ratio (`ms`, `s`, `%`, `x`, `/`, `of N`, or a
`N → M` / `N vs M` pair) occurs within the same clause (no intervening `;` or `—`). Identifiers
never count as the number: a rule/bug/thread id, a 7+ character hex sha, or an ISO date."

**Add criterion:**
### A changelog line using "measured" as an adjective is not a finding
- **Given** an interactive tail with the assistant sentence
  `RULES 6 now names that gate as the one measured exception to warn-never-block; CLAUDE.md mirrors it (3847f28).`
- **When** the hook extracts findings
- **Then** `findings` is empty

**Then:**
1. Atomic test for the new criterion in tests/atomic/hooks/session-end.test.ts. It must fail
   against the current `MEASUREMENT_RE`.
2. Re-run the existing "Untagged measurements fall back to the lexicon" criteria so the real
   measurements still qualify.
3. Fix `MEASUREMENT_RE` or `extractFindings` in src/hooks/session-end.ts.
4. Operational cleanup, outside the fix and needing the developer's say-so: close T-001 and
   T-002 with the thread verbs, or let them expire on 2026-10-16.

### Resolution

