---
id: B-003
title: §4.5 proposal fence grammar cannot carry payloads containing code fences
type: incomplete-rule
severity: medium
status: open
affects:
  - pulse.review-cli
  - pulse.distil
  - loops.skill-suggest
  - src/pulse/review.ts
proposed_fix: Amend schema §4.5 to specify CommonMark longer-fence wrapping — a proposal block whose payload contains triple-backtick fences MUST be wrapped in a longer outer fence (four or more backticks); writers (distil, skill-suggest) emit the longer fence automatically when the payload needs it; the review parser matches the opening fence length. Add ACs to review-cli (accept a skill draft containing fenced code, applied byte-exact) and to skill-suggest (draft with fences wrapped correctly).
opened: 2026-07-02T20:33:12Z
---

# B-003 — §4.5 fence grammar cannot nest payload fences

## Evidence

Flagged by the distil-round implementation agent as a known limitation: the review parser's fence scanner closes at the first triple-backtick line, so a `**Proposed addition:**` payload that itself contains ```-fenced code — which is the NORMAL case for skill-suggest's draft SKILL.md payloads — truncates at the inner fence. Skill drafts routinely include fenced examples; the first real skill-suggest proposal with a code sample would be silently mangled on accept.

## Diagnosis (seven-type classification)

Schema §4.5 states "a fenced block holding the exact text to apply" without covering payloads that contain fences. The rule exists but doesn't cover the observed case → **type: incomplete-rule**.

## Intended semantics

CommonMark already solves this: outer fences longer than any inner fence. Writers choose fence length by payload inspection; the parser honours the opening fence's length. Grammar decision belongs in the schema, hence filed rather than ridden (design surface, per standing authorities).
