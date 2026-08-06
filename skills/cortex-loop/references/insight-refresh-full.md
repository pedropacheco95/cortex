# insight-refresh-full

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-loop-insight-refresh-full` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Weekly ground-truth insight regeneration. Use for the scheduled
**weekly-quality** bundle's insight-refresh-full member, or when the user says
"run the full insight refresh", "regenerate the insight graph", or "rebuild L4".

Runs `cortex loop-insight-refresh --full --collect`, re-runs cross-scope L4
unification via `cortex-extract-insight` over all scopes, runs `cortex
loop-insight-refresh --full --report`, and summarises
`.cortex/pulse/reports/insight-refresh.md`.

## Discipline

You are the regeneration middle between two deterministic Core halves (spec
insight.refresh-loops Rules 1, 8). The CLI collects the ground set and
validates/blesses the result; you — this session — re-derive the L4 layer.
You already ARE a Claude session: **never spawn a nested `claude`
subprocess.**

This loop maintains machine-owned ungated insight directly and proposes
NOTHING (RULES 7, schema Decision 13): every write lands under
`.cortex/insight/`; never touch compass, atlas, `RULES.md`, the spec trees,
or write any `pulse/` proposal.

1. From the project root, run `cortex loop-insight-refresh --full --collect`.
   If it errors with "no ledger", stop and tell the user to run the initial
   extraction (`cortex-extract-insight`) first.
2. Read `.cortex/pulse/state/insight-full-worklist.json` — the full regeneration
   ground set: every extracted file with its level, every scope, the current
   store counts (`baseline`), the carried `stale_references`, and the
   `aged_edges` the aging check surfaced.
3. Re-run **Phase-4 cross-scope L4 unification via the
   `cortex-extract-insight` skill** over ALL scopes: regenerate
   `graph.json`, `tags.json`, and `clusters.json` from the current per-file
   entries and concepts as the ground-truth pass, independent of what the
   daily loop flagged. While regenerating, resolve every `stale_references`
   and `aged_edges` item — a re-derived edge is re-confirmed by construction
   (stamp `confirmed_at_commit` with the current short HEAD sha); anything no
   longer supported by the code simply does not reappear.
4. **Deterministic regeneration discipline (spec Rule 8):** stable path-derived
   ids (`file:` / `element:` / `concept:`, edge ids derived from
   (source, target, edge_type)), total-ordered serialization, cluster-id
   carry-over — re-running over an unchanged project must reproduce
   byte-identical files but for `generated`/`built_at_commit`. Every edge
   carries non-empty `evidence`; confidence is the 4-tier enum, never a
   float, never an embedding.
5. **The shrink guard on this pass:** full regeneration is the sanctioned
   ground-truth pass — a store that shrinks because files/scopes were deleted
   is legitimate here, and the writer-side confirmation flow
   (cortex-extract-insight's shrink discipline / `--force`-equivalent
   acknowledgment) may be exercised **after you verify the shrink is
   explained by the worklist** (deleted files, removed scopes). An
   unexplained shrink means a crashed or partial regeneration — stop and
   investigate instead of forcing.
6. Run `cortex loop-insight-refresh --full --report`. The deterministic close
   validates the regenerated store against the §4.10 checks; when clean it
   blesses the pass (module-wide `built_at_commit` advances, the stale set
   clears, `reverse-index.json` is rebuilt) and writes
   `.cortex/pulse/reports/insight-refresh.md` — including a shrink note when counts
   dropped. Validation errors → nothing is blessed; fix the store and re-run.
7. Read the report and summarise to the user: blessed or not, error/warning
   counts, store counts vs baseline, and any shrink note.
