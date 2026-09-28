---
kind: insight-observation
updated: 2026-09-22T10:08:00Z
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


**Follow-up, 2026-09-22 (weekly-quality member 3): the largest lag yet, and the first
one where the probe fired before the blessing rather than after.** Waves A and B added
**24 source files** between 2026-09-13 and 2026-09-17. The daily refresh gave every one
an anatomy entry and a ledger row (107/107), and the L4 layer picked up **none** of them:
`graph.json` held 83 `file:` nodes at `built_at_commit: c2de5f6`, a month behind `HEAD`.
That is 12× the 2-file gap this entry opened with, and it accumulated in nine days.

**The collect worklist did not name it, and could not.** `--collect` reported "107 file(s),
0 scope(s), 0 aged edge(s)" and a `stale_references` set of 231 — a number that looks like
the finding but is not. Decomposed: **120 of the 231 were edges the daily pass had already
re-stamped at `HEAD` that same morning**, 94 were edges at older commits, 17 were concept
nodes. Not one entry in the set named a missing file. The 24-file gap was invisible in the
worklist and invisible to `checkInsightGraph`; only the file-node/anatomy bijection found it.
**`stale_references` count is not a proxy for regeneration work** — decompose it against
`confirmed_at_commit` before sizing the pass.

**Two precondition checks worth keeping, both cheap, both nearly changed the plan:**

1. **Rule out significance filtering before calling a gap staleness.** `significance.ts`
   exists, so 83 < 107 could have been deliberate exclusion. It was not: the 24 missing
   split 10 high / 10 medium / 4 low centrality while the graph already carried 15
   low-centrality files. Comparable populations → staleness. Had the missing set been
   uniformly low, adding them would have fought the design.
2. **The shrink guard was never at risk, and knowing that up front licensed the repair.**
   0 file-nodes lacked an anatomy entry, so nothing had been deleted; every dimension could
   only grow. Confirmed in the outcome: nodes 284→308, edges 351→472, assignments 83→107,
   clusters 10→12. No dimension shrank, so `reportFull`'s shrink note never fired.

**Repaired additively, every dimension in one pass** (this entry's own point 1): 24 file
nodes; **imports edges re-derived wholesale from source** rather than patched — 121 added,
123 re-confirmed at `HEAD`, 0 dropped; 108 non-imports edges re-confirmed; 24 tag
assignments from the existing vocabulary (no vocabulary growth — 64
before and after); 17 files added to `claude-hooks`, `pulse-proposals` and
`schema-validator`, plus two new `scope: "global"` clusters, `cluster:recall` and
`cluster:compass-ledger`, for the 3.4 layers that had no home. Writes went through Core's
`serializeGraphV3`/`serializeTagsV3`/`serializeClustersV3`, never hand-rolled JSON, so the
§4.10.6 total ordering is Core's and not this session's approximation.

**The element layer was again left alone, on 2026-09-13's reasoning, and the question it
raised is now overdue.** The 24 new files contributed **zero** `element:` nodes, so the
selectivity this entry documented has widened by a fifth: 180 elements still cover 42 of
107 files, and 65 files have none. The reasoning holds — no contract requires an L3 main
player to have an element node, and deriving `calls` edges by hand is the regeneration
[[insight-full-regen-coherence-check]] warns against — but "recorded so the next pass starts
from the question" has now been recorded three passes running without the question reaching
a spec. It belongs in `insight.storage-format` / `insight.refresh-loops`, not in a fourth
observation.

**Post-repair, all five probes clean:** three-way bijection 107/107/107 (file nodes /
anatomy / `src/**/*.ts` — the first time this entry records it exact), concept bijection
21/21, 110 cluster members with 0 unresolvable and 0 orphaned file-nodes, 107/107 tag
assignments all drawn from vocabulary, and on the edges 0 dangling, 0 empty evidence, 0
duplicate ids, 0 left unstamped. Blessed at `a66041b`: 0 errors, 0 warnings.

**The standing hazard is unchanged and is the reason this entry keeps growing.** `--report`
would have blessed the store *before* any of this work — the 24-file gap produces no
`check.insight-*` error, so "0 error(s), 0 warning(s), ground truth blessed" was available
at the start of the session for free. The blessing step measures internal consistency, not
truth. Until the `file:`-node ↔ `anatomy` coverage probe this entry has now asked for twice
lands in `checkInsightGraph`, the coherence check **must** be run by hand before `--report`,
and a partial pass must skip `--report` entirely rather than stamp a gap as ground truth.

**A near-miss worth more than the repair: the first import extractor deleted 14 live
edges, and every dimension still grew while it did.** A regex of the shape
`(?:import|export)[\s\S]{0,200}?from\s+['"]...['"]` re-derived the imports layer and found
no source support for 14 existing edges, which were therefore dropped as "no longer
supported by the code" — and the pass still blessed clean, because 24 new file nodes and
94 new edges masked the subtraction in every aggregate the shrink guard reads. Checked
individually, **all 14 were false**: eleven were `await import('./x.js')` dispatch edges
(the form has no `from` clause — and `dynamic-import-dispatch` is in this project's own tag
vocabulary, `src/cli/cli.ts` alone carrying 20 of them), and three were static imports whose
named-import list runs past the 200-character bound, e.g. `refresh-daily.ts`'s multi-line
`} from './storage.js';` at line 50. Re-derived with static (unbounded), dynamic, and
side-effect forms all handled: **322 imports edges against the earlier 238**, 121 added,
123 re-confirmed, **0 dropped**.

Three carry-forwards:

- **An additive repair's safety argument does not extend to its deletions.** "Every
  dimension grows, so the shrink guard is satisfied" was true and irrelevant: the guard
  counts totals, so deletions hide inside additions. Any edge a re-derivation *removes*
  needs its own per-edge justification, checked against source, before the pass is blessed.
- **Re-deriving a layer means matching the original extractor's power.** These edges were
  written by an L1 tree-sitter parse; a regex is strictly weaker, so "the source doesn't
  support it" really meant "my parser can't see it". If a re-derivation is not at least as
  capable as what produced the data, it may only *add*, never *remove*.
- **`grep` is not a witness on this codebase.** Four source files — `src/insight/l1.ts`,
  `src/constellation/compile.ts`, `src/hooks/post-read.ts`, `src/loops/test-runner.ts` —
  contain a literal NUL byte as a composite-key separator in a template string
  (`` `${file.path}\0${target}` ``). `file` reports them as `data` and `grep` treats them as
  binary, returning **no matches and exit 1** rather than an error, which is how
  `l1.ts -> l1-triage.ts` was briefly misjudged as genuinely stale — its import sits at
  line 30 in plain sight. Read such files through Node (or `grep -a`) when verifying. Same
  NUL-heuristic family as [[B-007]], from the consuming side rather than the producing one.

**One weakened guard, declared.** Because the first `--report` had already blessed and
cleared the stale set, the corrected pass required a fresh `--collect`, which re-captured
`baseline` from the *already-repaired* store — so `reportFull`'s automated shrink check
compared the final state against itself and could not have fired. The growth claimed above
is measured by hand against the original pre-repair baseline recorded in this entry
(284 nodes / 351 edges / 83 assignments / 10 clusters), not by that guard.

**And one weaker claim than "0 edges left unstamped" suggests.** The 108 non-imports edges
— 87 `implements-concept`, 49 `calls`, 12 `co-clustered`, 2 `semantically-similar-to` —
were re-confirmed by testing that each endpoint still *resolves*: the element's symbol
still appears in the file its id names, the file still exists, the concept still has a
`concepts/<slug>.md`. That is endpoint liveness, not re-derivation. A symbol surviving in a
file does not prove it still implements the concept the edge claims. For a pass of this
size the substitution is defensible, but it is weaker than the reference's "a re-derived
edge is re-confirmed by construction", and the stamp now says `a66041b` for all of them
regardless. Anyone auditing edge confidence should treat `imports` (source-derived) and the
other four types (endpoint-checked) as different grades of evidence.
