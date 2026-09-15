---
kind: insight-observation
updated: 2026-09-13T03:10:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/6269c225-4eb2-4338-8e96-1ac622c1313d
  - claude-sessions/pedropacheco1/48235c09-94b4-4161-80b4-b9bf15253041
  - claude-sessions/pedropacheco1/5bb14cf5-9c83-40e8-b08b-b90d14df7818
---

The insight store's L4 layer (`graph.json` / `clusters.json` / `tags.json`)
can fall behind the L1–L3 layers (`anatomy/`, `ledger.json`) **without any
deterministic check noticing**, and `cortex loop-insight-refresh --full
--report` will still bless the store as ground truth with "0 error(s), 0
warning(s)".

Observed live on 2026-08-20 (weekly-quality member 3, HEAD `c2de5f6`): the
ledger and anatomy layers each covered all 83 `src/**/*.ts` files, but
`graph.json` held only **81** `file:` nodes — `src/cli/profile.ts` and
`src/pulse/usage.ts` had entries and ledger rows but no graph node, and
`src/cli/scaffold.ts` and `src/cli/sync.ts` were in no cluster. Both missing
files were recent additions; the daily refresh had updated their anatomy
entries while the L4 unification, which only the weekly full pass re-runs,
had never picked them up.

**Why nothing caught it:** `checkInsightGraph` (`src/schema/checks/insight.ts`,
§4.10.6) validates only *internal* consistency — duplicate node ids, dangling
edge endpoints within the file, total-ordered serialization, cluster `scope`
validity, tags schema. It never compares the graph against `anatomy/`, the
ledger, or the source tree, so a graph missing entire files is structurally
valid. `reportFull`'s only other guard is the shrink check, and it compares
against a baseline captured from live state at `--collect` time — a store that
was *already* missing nodes when collect ran shows no shrink. The two guards
are blind in exactly the same direction.

**Consequence:** the gap is self-perpetuating. `reverse-index.json` is rebuilt
from the graph, and the refresh loops use it to decide which concepts and edges
a changed file invalidates — so a file absent from the graph is also absent from
the invalidation trail and never becomes dirty on its own.

**The check that finds it** (cheap, and the one worth running before trusting a
full pass) is a four-layer coherence check, not an mtime or count comparison:
`file:` nodes ↔ `anatomy/**/*.md` ↔ `src/**/*.ts` as a three-way bijection;
`concept:` nodes ↔ `concepts/*.md` as a bijection; every cluster member
resolving to a real node *and* every file-node belonging to some cluster; every
tag assignment keyed to a real node and drawn from `vocabulary`. This extends
[[insight-full-regen-coherence-check]] — that entry established coherence-over-
mtime for deciding whether to regenerate; this one records that the coherence
check catches real drift the blessing step will otherwise wave through, and that
the file-node/anatomy bijection is the specific probe that fires.

**Repair is additive, not a regeneration.** Adding the missing nodes, their
verified `imports` edges, tag assignments, and cluster memberships grows every
dimension, so the shrink guard is satisfied and the warning in
[[insight-full-regen-coherence-check]] against hand-rebuilding a large graph
does not apply — that warning is about *rewriting* the store, not about
appending to it. Verify new edges against the actual import statements in
source, not against the anatomy entry's prose.

**Follow-up, 2026-09-06 (weekly-quality member 3):** the 2026-08-20 repair
was **incomplete in one dimension and nothing noticed for 17 days.**
`src/cli/scaffold.ts` and `src/cli/sync.ts` got their graph nodes and their
cluster memberships back, and `src/cli/profile.ts` and `src/pulse/usage.ts`
got tag assignments — but scaffold.ts and sync.ts never got theirs, leaving
`tags.json` at **81 assignments against 83 file nodes**. A full pass ran in
between and blessed the store "0 error(s), 0 warning(s)".

This sharpens the entry's own claim rather than repeating it. The blind spot
is not only *graph* nodes lagging anatomy: **`tags.json` has no file-node
coverage check either**, so partial repair of a multi-dimension gap is itself
undetectable. Worse, the deterministic close's own summary line reports
`64 tag(s)` — the size of the **vocabulary**, not the assignment count — so
the one number a reader would use to spot the gap cannot move when the gap
exists. Two consequences worth carrying:

1. **Repair every dimension in the same pass, and re-run the whole coherence
   check afterwards rather than only the probe that fired.** The probe that
   fires first (file-node bijection) is not the probe that stays broken.
2. The check worth adding to `checkInsightGraph`
   (`src/schema/checks/insight.ts`, §4.10.6) is a `file:`-node ↔
   `assignments` coverage probe, sibling to the cluster-membership one. That
   is a code change, outside any loop's write path — noted here so it is not
   re-derived from scratch a third time.

Repaired this pass, additively: both files assigned
`cli` / `managed-block` / `scheduled-tasks` from the existing vocabulary.


**Follow-up, 2026-09-13 (weekly-quality member 3): there is a third dimension, and
it was never enumerated.** The full coherence check ran clean this pass on every
probe this entry names — file-node/anatomy/src three-way bijection (83/83/83),
concept bijection (21/21), cluster membership (86 members, 0 unresolvable, 0
orphaned file-nodes), tag assignments (83/83, all drawn from vocabulary), 0 dangling
edges, 0 empty evidence. The 2026-09-06 tag repair held.

But `element:` nodes — **180 of the graph's 284 nodes, 63%** — are covered by no
probe in this entry and no check in `checkInsightGraph`. Probing them in both
directions:

- **Outward (element node → source symbol): clean.** All 180 resolve to a symbol
  that still exists in the file their id names. No dead element nodes.
- **Inward (L3 "Main players" → element node): at least five gaps**, in the same
  recently-changed files this entry has been tracking. **Five is a floor, not a total** —
  the probe prefix-matched bullets opening with a backticked name under `## Main players`
  and so caught only 17 declared players across 29 L3 entries, missing multi-symbol lines
  (`- ``parseArchiveMetadata`` / ``parseArchiveTypeDef`` — …` yields one, not two) and any
  player introduced in other prose. The real total is unknown; re-probe rather than
  trusting this figure. `src/archive/formats.ts`, `src/cli/sync.ts`,
  `src/cli/templates.ts` and `src/schema/version.ts` have **no element nodes at all**
  despite L3 entries naming main players for each; `src/cli/scaffold.ts` has four but
  not `SKILL_ADDITIONS`, which its entry marks NEW. Among the missing are
  `sync` (the 190-line twelve-rule orchestrator, `sync.ts:440–629`),
  `SCHEDULED_TASKS` (`templates.ts:457–537` — the definition of this very bundle),
  and `SUPPORTED_MAJOR`, which its entry marks `[critical]`.

**Not repaired this pass, deliberately — and this is the difference from 2026-08-20
and 2026-09-06.** Those repairs closed gaps against a stated contract: every source
file *must* have a file-node. **No contract requires an L3 main player to have an
element node.** Schema §4.10.6 fixes the `element:<relpath>#<name>` id grammar
(Decision 27 / A10-7) and nothing more; element nodes exist where they carry
`calls` edges, so the element layer is selective by construction. Adding the five
would mean deriving their `calls` edges by hand — the large-scale hand-regeneration
[[insight-full-regen-coherence-check]] warns against — to close a gap no rule says
is open.

So the finding is the **undocumented selectivity**, not a defect to patch: element
coverage is thin exactly where files changed most recently, which is the same
recency correlation this entry documents for file-nodes and tags, and it means no
`calls` edge can exist for those symbols and their reverse-index invalidation trail
is correspondingly thin. **Whether element coverage should be complete for L3 files
is a spec question for `insight.storage-format` / `insight.refresh-loops`, not a
loop's call.** Recorded so the next pass starts from the question rather than
rediscovering the five.

This revises point 1 above: "repair every dimension in the same pass" assumed the
dimensions were known. They were not — there were four, and the fourth has no
contract behind it. See also [[edge-confirmation-sha-format]], found in the same
pass: another layer that validates clean while a dependent check cannot fire.
