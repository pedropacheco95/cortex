---
id: B-023
title: A compass rule whose governs glob covers a whole tree becomes a subject for that tree's root, so every search anywhere under it gets the same rule pointer regardless of pattern
type: wrong-rule
severity: medium
status: open
affects:
  - recall.recall-index
  - hooks.search-annotate
  - src/recall/index.ts
  - src/recall/query.ts
proposed_fix: >-
  Stop turning a rule's governs-glob directory prefix into a parent-walk subject. Either drop
  Rule 15(a)'s directory-prefix subject, or have search-annotate Rule 5(b) not match a `rules`
  member reached through a parent directory; keep rule pointers on exact-file and id matches.
opened: 2026-09-24T09:21:02Z
found_at_commit: a66041b
---

# B-023 — Rule governs-glob prefixes make tree-wide subjects that match every search

**Source:** human report (2026-09-23 Jev investigation), reproduced with the built hook.

**What happens:** recall.recall-index Rule 15(a) turns each rule's `governs` glob into a
subject for the glob's literal directory prefix. R-003 governs `.specflow/specs/**`, so the
whole `.specflow/specs` tree becomes one subject. R-002 does the same for
`.cortex/compass/bugs`. hooks.search-annotate Rule 5(b) then walks every search target's
parents up to `.specflow/<tree>` or `.cortex/<module>`, and a subject match is the strong
signal that ignores the pattern. As a result, **any** Grep or Bash search anywhere under
`.specflow/specs` points at R-003 ("Dev spec `implements:` is singular"), whatever is being
searched for. The once-per-session memory limits this to once per session, but that is also
the most common first search in a spec-managed project.

**What should happen:** the business outcome promises a pointer that "matches the subject the
assistant is *already* searching for … and is wrong visibly". A grep for `lexicon|open
question` in `.specflow/specs/hooks` is not searching for R-003's subject.

**Evidence (Phase 1):**
- Probe on 2026-09-24 with a fresh session id, running `node dist/hooks/cli.js
  search-annotate` with `{"tool_name":"Grep","tool_input":{"pattern":"lexicon|open
  question","path":".specflow/specs/hooks"}}`. Output: `Recall: rule R-003 Dev spec
  \`implements:\` is singular, never a list`.
- `.cortex/recall-index.json`: `subjects[".specflow/specs"].rules = ["R-003"]` and
  `subjects[".cortex/compass/bugs"].rules = ["R-002"]`, plus 20 per-file subjects each (the
  Rule 15(b) cap).
- The 2026-09-23 session got `Recall: rule R-002 …` when it searched `.cortex/compass/bugs`
  for unrelated terms, and `Recall: rule R-003 …` when it grepped `.specflow/specs/hooks`.
  Neither was relevant to the search.
- In transcripts across this project's sessions, R-003 is among the most frequently injected
  pointers (9 occurrences).
- pulse usage report (2026-09-22): pointer follow-through was **15 fired, 0 followed** across
  55 sessions, against the business metric "followed more often than not".

**Root cause:** Rule 15(a) (3.4 fifth revision) treats a rule's directory prefix like a
`bears_on` subject. A rule that governs *every file in a tree* is a constraint on writing
those files, not knowledge about a subject being searched. Combined with Rule 5(b)'s parent
walk, the strong signal fires on location alone. The rule is wrong for tree-wide globs.
The per-file subjects from Rule 15(b) are pattern-blind too, but they fire only on a search of
that exact file.

**Affected specs:**
- Dev: .specflow/specs/recall/recall-index.spec.md (Rule 15a);
  .specflow/specs/hooks/search-annotate.spec.md (Rules 5b and 8)
- Business: .specflow/specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md.
  Partial drift: the dev rules satisfy the letter of "matches the subject" (the tree is a
  parent) but not the outcome's success metric. The business promise is right, and the dev
  layer should move toward it.

### Change Plan

**Specs to modify:** recall.recall-index Rule 15 and/or hooks.search-annotate Rule 5
**Change type:** Correct existing rule + update criteria (Type 3, needs human approval)

**Options (developer chooses):**
- **(a) Recommended:** Rule 15(a) drops the directory-prefix subject. Rules then reach
  searches through (b) exact files, (c) related spec ids, and keywords. pre-write already
  warns at write time, which is where a governs-glob rule binds.
- (b) Keep the prefix subject, but in search-annotate Rule 5 a `rules` member counts as a
  subject match only for the exact path or (c)/(d) candidates, never via a parent walk (b).
- (c) Cap the prefix: a prefix of depth ≤ 2 (`.specflow/specs`, `.cortex/compass`, `src`)
  contributes no subject.

**Criteria:** add a criterion stating that a Grep under `.specflow/specs/hooks` for a pattern
unrelated to R-003 emits no R-003 line, and update the compass-carriers criteria that assert
the prefix subject.

**Then:**
1. Run a coherence check against recall.index-blocks and recall.why. They read the same
   subjects, so `cortex why .specflow/specs` changes too.
2. Update tests/atomic/recall/compass-carriers.test.ts and the search-annotate atomic and
   spec tests.
3. Fix src/recall/index.ts (subject derivation) or src/recall/query.ts (candidate matching).
4. Re-read the pulse usage follow rate after a week.

### Resolution

