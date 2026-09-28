---
id: B-024
title: Two project-generic tokens such as "cortex", "file", "index" or "schema" qualify a keyword pointer, so broad-titled entries fire on unrelated searches
type: wrong-rule
severity: medium
status: open
affects:
  - hooks.search-annotate
  - recall.recall-index
  - src/recall/query.ts
  - src/recall/index.ts
proposed_fix: >-
  Make hooks.search-annotate Rule 6 ignore tokens that occur in a large share of index
  entries (a deterministic document-frequency cutoff computed at index build), and have
  recall-index Rule 8 drop stop-list tokens from keywords, so two ubiquitous words no longer
  qualify an entry.
opened: 2026-09-24T09:21:02Z
found_at_commit: a66041b
---

# B-024 — Generic title tokens qualify keyword pointers

**Source:** human report (2026-09-23 Jev investigation), reproduced with the built hook.

**What happens:** hooks.search-annotate Rule 6 qualifies an index entry when **two or more**
distinct search tokens (3+ characters, minus a 12-word English stop-list) occur in its
`keywords`. recall-index Rule 8 builds those keywords from the entry's title tokens. In this
project, words like `cortex`, `compass`, `spec`, `file`, `index`, `schema`, `check`, `grep`
and `open` appear in many titles and in many searches. The effect is pointers keyed to broad
titles, not to what is being searched:
- B-019's title yields 29 keywords, including `cortex`, `compass`, `file`, `index`, `spec`,
  `only`, `project`, `and` and `the`.
- B-019 was injected 15 times across this project's session transcripts, the single most
  frequent pointer.
- T-001, a status-ladder junk thread (see [[B-021]]), fires on `done`, `when`, `grep` and
  `schema`.

**What should happen:** a keyword hit should mean the search shares *distinguishing* words
with an entry, not the project's vocabulary.

**Evidence (Phase 1)**, from probes on 2026-09-24 with fresh session ids and no path:
- Pattern `cortex file index` → `Recall: bug … B-019 Two compass rules (or two bugs) carrying
  the same id pass…`. That pattern has nothing to do with duplicate ids.
- Pattern `done when grep schema` → `Recall: thread … T-001 0% ░░░░░░░░░░ done…` plus
  `Recall: compass-doc Preferences — DRAFT…`.
- Patterns `spec only check` and `compass rules` → silent. The pointer depends on which two
  generic words happen to co-occur, which also makes it look arbitrary.
- In the live 2026-09-24 session, an `ls`/`rm` over `.cortex/pulse/state/` drew `Recall: bug
  … B-008 check.index-present …`, which was unrelated to the task.
- pulse usage report (2026-09-22): **15 fired, 0 followed** over 55 sessions.

**Root cause:** Rule 6's qualifying test counts raw token overlap with no weighting. Its
stop-list holds English function words only, and recall-index Rule 8's keywords keep every
title token, including stop-list words, which is harmless but wasteful. The rule is wrong
for a corpus whose titles share one domain vocabulary.

**Affected specs:**
- Dev: .specflow/specs/hooks/search-annotate.spec.md (Rules 4 and 6, and the criterion "Two
  keyword hits qualify an entry; one plain hit does not");
  .specflow/specs/recall/recall-index.spec.md (Rule 8, keywords)
- Business: .specflow/specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md.
  Its Out of Scope section forbids per-moment relevance guessing, so the fix must stay
  deterministic and exact. A build-time document-frequency cutoff is a set operation over the
  index, not a guess, and needs no model call (Jev and similar were considered on 2026-09-23
  and excluded by RULES 3 and 6).

### Change Plan

**Specs to modify:** recall.recall-index Rule 8 (the index records `common_tokens`),
hooks.search-annotate Rule 6
**Change type:** Correct existing rule + update criteria (Type 3, needs human approval)

**Proposed rule:** at index build, record as `common_tokens` every keyword token that occurs
in ≥ 10% of `entries` (at least 3 entries), sorted. In search-annotate Rule 6, tokens in
`common_tokens` never count toward the two-hit threshold. Ref-shaped single hits are
unchanged. Keywords also drop `STOP_TOKENS`.

**Add criterion:**
### Two common tokens do not qualify an entry
- **Given** an index where `cortex` and `index` each occur in ≥10% of entries, and B-019's
  keywords contain both
- **When** a Grep with pattern `cortex file index` and no path runs
- **Then** no `Recall:` line names B-019

**Then:**
1. Run a coherence check with recall.why and prompt-route. prompt-route Rule 7's "≥2 distinct
   tokens" mention test uses the same tokeniser and should take the same cutoff.
2. Update tests/atomic/recall/query.test.ts and the search-annotate tests, and regenerate the
   index fixture.
3. Fix src/recall/index.ts and src/recall/query.ts.
4. Re-read the pulse usage follow rate after a week, together with [[B-023]].

### Resolution

