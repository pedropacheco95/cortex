---
kind: insight-observation
updated: 2026-09-13T03:10:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/5bb14cf5-9c83-40e8-b08b-b90d14df7818
---

`graph.json` edges carry `confirmed_at_commit` in **two different formats**, and the
confidence-aging check compares it as an exact string against a set that only ever
holds one of them. Today this is latent; the first `inferred` edge written in the
long form turns it into a permanent false positive.

**Observed 2026-09-13** (weekly-quality member 3, HEAD `c2de5f6`), across 351 edges:
325 carry a 7-char short sha, **26 carry the full 40-char sha**
`0998c197ccdbe798071a90562e3c7140f709c2e2`. That sha's short form, `0998c19`, *is*
in `ledger.json`'s `cycle_commits` (`["c2de5f6","0998c19","c667a9a"]`) — so those
edges are semantically recent while comparing as absent.

**The mechanism.** `agedEdges` (`src/insight/refresh-daily.ts:239`) builds
`new Set(cycles.slice(0, window))` from `cycle_commits` — short shas — and tests
`!recent.has(e.confirmed_at_commit)`. No normalization on either side. An edge
stamped with the long form can never match, so it would be surfaced as aged on
every cycle regardless of how recently it was re-confirmed.

**Why nothing catches it.** The schema specifies only `"confirmed_at_commit": "<sha>"`
(§4.10.6, line 730) with no format constraint, and `src/insight/storage.ts:323`
validates only that the field is a non-empty string. `cortex validate` and the
full pass's deterministic close both reported 0 errors / 0 warnings over this store.

**Why it has not fired yet.** `agedEdges` filters to `inferred`/`ambiguous` before
the membership test, and all 26 long-sha edges are `structural` (25) or `stated` (1).
All 21 `inferred` edges sit at `c2de5f6` — which is why "Aged edges surfaced: 0" on
2026-09-13 is **correct, not a dead check**. Verified explicitly; do not re-investigate
that zero.

**Where the fix belongs: on comparison, not in the store.** Normalize both sides in
`agedEdges` (compare on a common prefix length, or resolve through
`git rev-parse --short`) rather than rewriting the 26 edges. Rewriting normalizes the
symptom out of the evidence while leaving the writer that produced it — the long form
comes from the agentic extraction path using `git rev-parse HEAD`, which no
deterministic check constrains. A format constraint on the field in
`storage.ts`'s edge validation would close it at the writer. Both are code changes
outside any loop's write path — recorded here so they are not re-derived from scratch.

Same family as [[l4-graph-lags-anatomy-silently]] and
[[insight-full-regen-coherence-check]]: a store that validates clean while a check
that depends on it is quietly unable to fire.
