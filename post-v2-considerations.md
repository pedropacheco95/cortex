# Post-v2 Considerations

v2.1 candidates that surfaced across the v2 design pass (Artefacts 1–2) and were deliberately
NOT folded into the v2 foundation build (`build-order-v2.md`). Same intent as
`post-v1-considerations.md`: capture what would otherwise become a preference, pin, or schema
amendment, and review during the post-v2 reconciliation pass. Each entry: the candidate, why it
was deferred, and what would trigger picking it up.

- **Rationale-sidecar for the inferred JSON (OQ4).** The insight `map/*.json` files are committed
  in full, including the LLM-authored `rationale`/`confidence` free text, which is the part most
  prone to weekly-rebuild diff noise. Deferred because the schema's two mitigations —
  deterministic serialization + carry-over of unchanged text (§4.10.2) — are expected to hold the
  noise down without splitting the artefact. **Trigger:** if, after the refresh loop runs on real
  projects for a few cycles, committed rationale text still produces material diff churn, move the
  free text to a gitignored sidecar and commit only the structural graph. Landing site: revisited
  at insight-refresh spec time (schema Decision 20).

- **Gaps-loop window semantics — contract-level commitment (OQ5).** The "previous 24h" phrasing is
  nominal; the real window is watermark-based ("since the last successful gaps run") to survive
  Desktop catch-up after machine sleep. v2 leaves this to the `insight.gaps-loop` dev spec — the
  schema constrains the loop's *outputs*, not its window. Deferred because it is an implementation
  property, not a file-format contract. **Trigger:** if a second consumer ever needs to reason
  about the window (e.g. a hygiene check for "gaps loop hasn't run in N days"), promote the
  watermark semantics into the schema as a named field. Landing site: `insight.gaps-loop` dev spec
  first; schema only if a cross-consumer need appears.

- **Root SpecFlow artefacts under `.specflow/` (OQ8).** `RULES.md`, `build-order.md`,
  `link-map.md`, `implicit-behaviors.md`, `dead-features.md` stay at the project root in v2 (per
  v1 §8.5's audience rationale — they are human-facing). Deferred because moving them buys little
  in the same round that already moved the trees, and `RULES.md` in particular is referenced from
  many places. **Trigger:** a later MINOR/MAJOR that wants the machine-read ones co-located — most
  concretely `link-map.md`, which `specflow-viewer` reads as the canonical business↔dev mapping;
  if the viewer or a loop starts treating it as tooling state rather than a human doc, move it
  under `.specflow/` then.

- **Skill consumption of insight (the SpecFlow-awareness follow-up pass).** Adding
  `cortex insight query` steps to `specflow-develop`, `specflow-tests`, `specflow-ingest`, and the
  onboarding/new-project scaffolding (v2 design §7.2). Deferred out of the *foundation* by explicit
  decision — it is judgment-bearing skill work that should land once the CLI and loops are stable,
  mirroring v1's step-30 awareness pass. (The mechanical `specs/`→`.specflow/` path rewrite inside
  those skills is NOT deferred — it shipped with the reorg, step 1b.) **Trigger:** v2 foundation
  green and dogfooded; then run the awareness pass at the three calibrated depths, as v1 did.

- **MCP server over insight.** An MCP surface exposing `cortex insight query/neighbors` to other
  tools. An explicit v2 non-goal (v2 design §10 item 3): the CLI is the query surface for both
  Claude and humans. **Trigger:** a user genuinely needs MCP access to the concept map — the
  documented answer stays "add the optional Graphify enhancement per v1 §7.5," so this is picked
  up only if that path proves insufficient and demand is real.

- **Embeddings for insight query.** Vector search over prose/nodes instead of lexical + tag
  matching. An explicit non-goal (v2 design §10 item 2, §3.4): embeddings break explainability
  (no per-edge rationale) and stability across LLM model changes, and drag non-deterministic
  infrastructure into a deliberately deterministic Core. **Trigger:** essentially "never" under
  the current thesis — only reconsider if lexical misses prove costly *and* a way is found to keep
  every result explainable and model-stable. A query miss is currently treated as an honest signal
  to the refresh loop, not a reason to add vectors.

- **Automatic promotion of stabilized insight content.** Auto-graduating insight into the gated
  layers without a human accept once the "stabilized" threshold (§4.10.4) is met. An explicit
  non-goal (v2 design §10 item 4): the human review gate is v1.0's load-bearing property, and
  auto-promotion would collapse the two-layer thesis into one ungated layer. **Trigger:** none
  under the current design — promotion stays human-gated. Recorded only to mark it as consciously
  refused, not overlooked.

- **Curation-loop adoption of the edit-typed proposal.** v2 ships the edit payload shape
  (`current:`/`replacement:`, §4.5.2) because signal-4-gated needs it. The existing curation loops
  (`rule-decay`, `atlas-staleness`) currently emit human-readable reports because accept was
  append-only and their proposals are status *edits* (e.g. rule retirement) — exactly what the new
  edit payload now expresses. This was the recorded post-v1 item "curation-loop proposals through
  the pulse gate for status edits"; v2 unblocked it but did not adopt it. **Trigger:** wire
  `rule-decay`/`atlas-staleness` retirement proposals through the typed gate as edit proposals —
  a clean v2.1 follow-on now that the mechanism exists.

- **Insight query ranking / relevance.** `cortex insight query` returns grouped lexical matches
  with no ranking. Deferred because flat grouped output is sufficient at current project scale and
  keeps the command deterministic and explainable. **Trigger:** result sets on large projects grow
  big enough that unranked output is unusable — add a deterministic, explainable ordering (tag
  overlap count, cluster proximity) before ever reaching for a ranking model.

- **Same-loop double-fire on committed insight files.** v1 accepted last-writer-wins on a
  *transient* pulse report for a same-loop double-fire, with no lock files (v1 §17 item 17). The
  two insight loops are safe *against each other* by disjoint write targets (§4.10.3), but their
  outputs are now **committed durable files**, not transient reports — so a same-loop double-fire
  (two `insight-refresh` runs racing) is a materially different risk than v1's. Deferred because
  Desktop scheduling has not produced real collisions at v1 scale. **Trigger:** any observed race
  corrupting `map/*.json`; the fix is a per-loop lock file scoped to the insight loops (cheaper
  than the general loop-concurrency locking still deferred from v1).

- **Hook-free read-time insight capture.** An analogue of anatomy's `<cortex:purpose>` read-time
  writeback (§5) for insight — letting a session emit a correction or observation that the gaps
  loop picks up, without waiting for the daily transcript pass. Deferred because the daily gaps
  loop already captures session observations and adding a capture tag risks the very hook-injection
  coupling v2 deliberately avoided (§7.4). **Trigger:** the daily latency proves too slow in
  practice — a same-session correction that matters *now* and can't wait for the next gaps run.
