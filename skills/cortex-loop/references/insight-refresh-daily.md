# insight-refresh-daily

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-loop-insight-refresh-daily` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Daily insight-refresh loop. Use for the scheduled **daily** bundle's
insight-refresh-daily member, or when the user says "run the daily insight
refresh", "refresh the insight layer", or "re-extract what changed".

Runs `cortex loop-insight-refresh --daily --collect`, triages the uncertain
files in-session, re-extracts L2/L3 via `cortex-extract-insight` in dirty-only
mode, re-verifies stale references and aged edges, runs `cortex
loop-insight-refresh --daily --apply`, and summarises
`.cortex/pulse/reports/insight-refresh.md`.

## Discipline

You are the judgment middle between two deterministic Core halves (spec
insight.refresh-loops Rule 7). The CLI collects the worklist and reconciles
the result; you — this session — do the significance triage and drive the
re-extraction. You already ARE a Claude session: **never spawn a nested
`claude` subprocess.**

This loop maintains machine-owned ungated insight directly and proposes
NOTHING (RULES 7, schema Decision 13): every write lands under
`.cortex/insight/`; never touch compass, atlas, `RULES.md`, the spec trees,
or write any `pulse/` proposal. The pulse report the apply half writes is a
report, not a proposal.

1. From the project root, run `cortex loop-insight-refresh --daily --collect`.
   If it errors with "no ledger", stop and tell the user to run the initial
   extraction (`cortex-extract-insight`) first — the daily loop refreshes; it
   never bootstraps.
2. Read `.cortex/pulse/state/insight-daily-worklist.json`. The Core structural
   filter has already ruled out formatting-only / comment-only / whitespace /
   import-reordering changes (`dropped`) and pre-classified the obvious cases:
   - `l2` — real change: L2 (Purpose + Connections) re-extraction due.
   - `l3` — significant change (new/removed exports, size delta, large
     change): L3 re-extraction due.
   - `triage` — the filter could not decide. **Triage these now, in-session**
     (this is the Haiku-tier judgment — quick, per-file, diff-level; design
     §5.9): read each file's diff against its existing insight entry
     (`cortex insight file <path>`) and classify it **significant** (move to
     your L3 set), **real-but-cosmetic-in-meaning** (L2 only), or **cosmetic**
     (drop). Do not deep-read the whole codebase — this is triage, not
     extraction.
3. Re-extract via the **`cortex-extract-insight` skill in dirty-only mode**
   (its "Scheduled dirty-only refresh" entry point): hand it the final
   worklist — the `l2` files at level 2 (keep an existing L3 file at level 3;
   never downgrade a level), the `l3` + triaged-significant files at level 3,
   grouped by their `scope`. Re-extract ONLY worklist files — which files are
   dirty is this loop's call, already made.
4. Re-verify the anti-silent-drift surfacings (design §5.9 DIFFERENTLY):
   - `stale_references` — concepts/edges invalidated because a file they
     reference changed in an earlier cycle. For each: check it still holds
     against the current code. A still-true edge gets its
     `confirmed_at_commit` set to the current short HEAD sha in
     `.cortex/insight/graph.json`; a no-longer-true edge is removed; a stale
     concept doc is corrected in place.
   - `aged_edges` — inferred/ambiguous edges not re-confirmed across the
     aging window. Re-confirm (stamp `confirmed_at_commit`) or drop each.
   - `cross_scope_edges` — the cross-scope edges touching the changed scopes.
     Verify these while re-extracting; leave untouched scopes' entries and
     edges byte-identical (spec Rule 5 — scope-scoped invalidation).
   Every edge you keep MUST carry a non-empty `evidence` string; confidence is
   the 4-tier enum (`structural | stated | inferred | ambiguous`) — never a
   float, never an embedding (schema §4.10.6).
5. Run `cortex loop-insight-refresh --daily --apply`. The deterministic close
   validates the re-extracted entries against the §4.10.2 contract,
   reconciles `ledger.json`, neighbourhood-updates L4 confirmations around
   the L3 re-extractions, marks newly-invalidated references stale for the
   next cycle, rebuilds `reverse-index.json`, prunes the fast worklist, and
   writes `.cortex/pulse/reports/insight-refresh.md`.
6. Read the report and summarise to the user: refreshed / pending / invalid
   counts, edges re-confirmed, stale marked vs cleared, and any invalid
   entries that need attention.

**Never shrink the store.** The daily loop only refreshes and
neighbourhood-updates — if your changes would remove nodes/edges wholesale,
stop; wholesale regeneration belongs to `cortex-loop-insight-refresh-full`
(the crashed-refresh shrink guard, schema §4.10.6, stays armed here).
