# Cortex v2 — Build Order (foundation)

**Status:** v2 implementation sequence. Separate from `build-order.md` and design §16.2 — v1.0's shipped record stays frozen. Same discipline as §16.2: shared substrate before the pieces that depend on it, one dev spec (or a small coordinated set) per step, each independently verified and dogfooded on this repository before the next begins.

**Scope: v2 FOUNDATION ONLY.** The `insight/` module, the `.specflow/` reorganization, the two producer loops, the four-command query CLI, the typed pulse gate / promotion mechanism, the constellation insight preset, the validator's new checks, and the schema-version wiring. Skill *consumption* of insight (insight-query workflow steps) is out of scope — it is the separate SpecFlow-awareness follow-up pass (see Out-of-scope notes). The **mechanical** `specs/`→`.specflow/` path rewrite *inside* the skills is the one exception: per v2 design flag-F4 it ships **with the reorg** (step 1b), not with the consumption pass.

Depends on: `cortex-schema.md` v2.0 (the contract, already drafted — Artefact 2) and `cortex-v2-design.md` (Artefact 1). Both reviewed and signed off.

---

## The sequencing spine

The load-bearing sequencing fact: **the `.specflow/` reorg + version bump is step 1 and everything else depends on it.** Every piece with a hardcoded `specs/` path (validator, compiler, loops, skills) and every re-rooted validator check assumes the trees already sit under `.specflow/`. There is one apparent circularity, resolved below.

**The reorg / validator ordering (flagged sequencing conflict, resolved).** The re-rooted validator checks (`check.layout`, `check.id-matches-path`, `check.specs-index`, `check.overview-present`) can only pass once the trees are at `.specflow/`; but the validator is *also* the tool used to verify the reorg landed correctly. The resolution is that these are the **same** coordinated change, sequenced internally (the §16.3 idiom — "schema first, then parser, then writer, then a round-trip regression"): within step 1, (a) move the trees and rewrite the path constants in validator/compiler/loops, (b) bump the project config to `2.0` and the validator's `supportedMajor` to `2` in the same commit, (c) run the re-rooted validator against the moved trees as the round-trip regression. The version bump and the path rewrite MUST land together — bumping the config to 2.0 activates the re-rooted checks, so a bump before the move (or a move before the bump) leaves the repo failing its own validation mid-step. The insight-specific checks do **not** gate this step: `check.layout` tolerates an absent module (§1, "when its module is present"), so the validator passes at 2.0 before `insight/` exists.

---

## Steps

### 1. `.specflow/` reorganization + schema-version wiring
**Builds:** the physical tree move (`specs/`→`.specflow/specs/`, `specs-business/`→`.specflow/specs-business/`; `tests/` stays at root), the path-constant rewrite across Core (validator discovery roots, `check.id-matches-path` base, constellation spec-node scan, the spec-drift/lint/verify loop inputs, `specflow-change-router`'s "has a `specs/` dir" trigger), the CLAUDE.md template + `loop.md` text, and the version-gate wiring (project `cortex.config.json` → `2.0`; validator `supportedMajor`=2, `supportedMinor`=0). Sub-step 1b is the mechanical `specs/`→`.specflow/` rewrite inside the specflow skill bundles (find-and-replace grade, per F4).
**Implements:** `specflow.reorg`, `schema.version-2`.
**depends_on:** — (first).
**Done when:** the repo's trees live under `.specflow/`, `cortex validate` passes at `schemaVersion 2.0` against the moved trees with zero errors, and no `specs/`/`specs-business/` project-root path constant remains in Core or skill text (grep-clean, excluding `tests/scenario/specs/` and relative `../../specs*` cross-refs, which are correctly unchanged).
**Split:** **YES — likely two sub-batches.** 1a = tree move + Core path constants + version bump + regression; 1b = skill-bundle path rewrite. Keep them as separate Light batches so 1a's validator regression is green before touching skills.

### 2. Insight module contract
**Builds:** the `.cortex/insight/` skeleton and formats — `insight/_index.md` (the ungated-trust-model active prompt, schema §7.4), the flat `insight/map/` directory (no nested `_index.md`), the prose file format (`kind: insight-prose`, `updated`, provenance trailer, `## Corrections` log — §4.10.1), the three JSON file shapes (`graph.json`/`tags.json`/`clusters.json`, §4.10.2), the `cortex.config.json` `insight` block (`clusterCarryOverJaccard`, `promotionMinAgeDays`, `promotionMinObservations`), and `cortex init` scaffolding of the module (committed, not gitignored).
**Implements:** `insight.module-contract`.
**depends_on:** 1.
**Done when:** `cortex init` on a fresh project scaffolds `insight/` + `insight/_index.md` (committed), the config carries the `insight` block with defaults, and a hand-authored prose file + minimal JSON trio validate clean once step 3 lands (until then: structurally present and `cortex insight list` — step 5 — enumerates them).
**Split:** probably one Light batch; split init-wiring out if it fights the format work.

### 3. Validator: insight checks + extended pulse check
**Builds:** the four new Appendix A checks — `check.insight-index`, `check.insight-prose`, `check.insight-graph`, `check.insight-ownership` — and the error-severity clauses added to `check.pulse` (typed `**Type:**` present + in enum; `**Target:**` root permitted per type; exactly one payload shape). Contract-first: the checks precede the producers that must satisfy them (steps 4, 6, 7).
**Implements:** `schema.validator-insight-checks`.
**depends_on:** 2 (formats to check must be defined).
**Done when:** the 28-check catalogue is implemented; the checks flag a malformed insight artefact (bad node-id, empty `rationale`, wrong extension under `map/`, missing `## Corrections` markers) and pass a well-formed one; `check.pulse` rejects an untyped/wrong-target/multi-payload suggestion section and accepts a conforming one.
**Split:** one batch (four small checks + one extension); no sub-agent depth needed.

### 4. Typed pulse gate + promotion mechanism
**Builds:** the runtime for typed suggestions (schema §4.5.1/§4.5.2): the pulse writer/parser handling the five `**Type:**` values, the three payload operation shapes including the new **edit** shape (`current:`/`replacement:` blocks, byte-exact-or-refuse, ambiguous-or-stale refusal), and typed `cortex pulse-accept` semantics per type — append/create as before, edit for `gated-layer-update`, and `promotion` (apply to gated target + inject `source:` back-reference + mark the insight original promoted, §4.10.4). Extended `Target:` roots (`.cortex/atlas/`, `.cortex/insight/map/`, `RULES.md`). Transactional accept (refusal applies nothing, leaves `pending`).
**Implements:** `insight.promotion-mechanism`.
**depends_on:** 2, 3.
**Done when:** a round-trip test proves each of the five types accepts to the right target with the right operation; an edit proposal against drifted content refuses cleanly; a `promotion` accept lands the gated write, writes the `source:` lineage, and stamps the insight original's promoted trailer; the shared S-namespace counter and `dismissed.md` still govern all of it.
**Split:** **YES — likely two sub-batches** (coordinated-change idiom, §16.3): 4a = parser/writer for typed sections + edit payload shape; 4b = typed accept semantics + promotion side-effects. Ship 4a's round-trip regression green before 4b.

### 5. Insight query CLI
**Builds:** the four deterministic commands — `cortex insight query <topic>` (lexical over prose + tags + cluster labels), `cortex insight get <file>`, `cortex insight neighbors <node-id>` (`--kind`, `--depth`), `cortex insight list`; all with `--json`. Deliberately built before the producer loops (consumers-before-producers, v2 design §13): the CLI is testable against hand-authored `map/` fixtures and becomes the verification surface the loops use.
**Implements:** `insight.cli`.
**depends_on:** 2.
**Done when:** all four commands run against a hand-authored fixture `map/` (prose + JSON trio), `query` returns grouped hits across both content types, `neighbors` walks by edge kind to the requested depth, and `--json` emits stable structured output.
**Split:** one Light batch (four thin read-only commands over defined formats).

### 6. `cortex-loop-insight-refresh` (the JSON producer)
**Builds:** the weekly-full/daily-incremental loop that writes `map/graph.json`, `tags.json`, `clusters.json` and nothing else. Deterministic bookends idiom: `--collect` (assemble the node set via the constellation compiler's node-emission path; own-watermark change detection for incremental), in-session tag/edge/cluster judgment, `--apply` (validate shape, apply cluster-id carry-over §4.10.2, deterministic sort, carry-over of unchanged `rationale`/`confidence` text, atomic three-file write, refuse out-of-lane paths). One daily Desktop scheduled task deciding full-vs-incremental internally.
**Implements:** `insight.refresh-loop`.
**depends_on:** 2, 3, 5.
**Done when:** a run produces schema-valid JSON (green under `check.insight-graph`), a second full run over unchanged input is byte-identical except `generated` (determinism + carry-over hold), incremental touches only changed nodes, and `--apply` refuses a `.md` path (write-lane enforcement).
**Split:** one Light batch; split `--collect`/`--apply` if the judgment scaffolding crowds the batch.

### 7. `cortex-loop-insight-gaps` (the prose + pulse-proposal producer)
**Builds:** the daily loop that reads the previous window's transcripts (shared session-reading layer) and classifies against the five gap signals (schema §4.10 / v2 design §5): signals 1–3 and 4-in-insight → direct prose appends/rewrites with provenance + `## Corrections` log (rewrite-in-place, §4.10.1); signals 4-gated and 5 → `gated-layer-update` / `user-directed-capture` pulse proposals via step 4's gate. Writes only `.md` in `map/` plus the single new-file line in `insight/_index.md`. Includes the distil-coordination amendments (v2 design §6): distil skips explicit memory-commit utterances; distil's already-covered filter extends to `insight/map/` and converts covered patterns into `promotion` proposals.
**Implements:** `insight.gaps-loop`.
**depends_on:** 2, 3, 4, 5.
**Done when:** each signal routes to the right destination (prose vs typed proposal), a signal-4-in-insight correction rewrites in place and logs the audit entry, gated corrections surface as edit-typed proposals (never direct gated writes), `--apply` refuses `.json` paths, and the distil skip/already-covered amendments are proven not to double-propose.
**Split:** **YES — likely two sub-batches:** 7a = collect + five-signal judgment + prose writes (signals 1–3, 4-insight) + `_index.md` file-list maintenance; 7b = pulse routing (signals 4-gated, 5) + distil-coordination amendments. 7b depends on step 4 being green.

### 8. Constellation insight preset (serve-time overlay)
**Builds:** the sixth view preset in the constellation renderer (schema §4.9): reads `map/graph.json` + `clusters.json` at serve time (never compiled into `constellation.json`, which stays curated-only), renders inferred edges dashed (optional confidence-weighted opacity) and tag clusters as background colour regions over the shared node set. Default view stays curated-only; the preset is opt-in per session.
**Implements:** `constellation.insight-preset`.
**depends_on:** 6 (needs the refresh loop's graph/clusters to overlay).
**Done when:** requesting the `insight` preset overlays dashed inferred edges + cluster regions on the curated graph, the default preset is byte-unchanged from v1, and `constellation.json` still validates as curated-only (no inferred content compiled in).
**Split:** one batch (renderer-side, single lens over defined data).

---

## Dependency summary

```
1 (reorg + version) ─┬─> 2 (module contract) ─┬─> 3 (validator checks) ─┬─> 4 (pulse gate) ─┐
                     │                         ├─> 5 (CLI) ──────────────┤                  │
                     │                         │                         ├─> 6 (refresh) ──> 8 (preset)
                     │                         │                         └─> 7 (gaps) <─────┘ (7 also deps 4)
```

Strictly by dependency: **1 → 2 → {3, 5} → 4 → 6 → 7 → 8** (5 may land any time after 2; 7 needs 3+4+5; 8 needs 6). Eight steps — honest to the work; the reorg and validator each earned their own step rather than being folded, and steps 1, 4, and 7 are flagged for sub-batch splitting under the depth constraint.

## Orchestration-depth constraint

Every `/goal` batch runs `specflow-develop` at **Minimal or Light depth** — no sub-agent-spawns-sub-agent. Steps whose scope exceeds one Light batch MUST be split into sequential sub-batches (each its own shallow develop run), not delegated deeper. Flagged above: **step 1** (1a Core + move + bump; 1b skill path rewrite), **step 4** (4a parser/writer + edit payload; 4b typed accept + promotion), **step 7** (7a judgment + prose; 7b pulse routing + distil coordination). Steps 2, 5, 6, 8 are expected to fit a single Light batch; step 3 is small. If any nominally-single step overruns mid-build, split it the same way rather than deepening the orchestration.

---

## Out-of-scope notes (NOT steps)

- **Skill consumption of insight (the SpecFlow-awareness follow-up pass).** Adding `cortex insight query` workflow steps to `specflow-develop` (before implementing), `specflow-tests` (before running/generating), `specflow-ingest` (when routing new content), and the onboarding/new-project scaffolding — v2 design §7.2. This is a **separate pass after the foundation ships**, mirroring v1's step-30 awareness pass landing after the substrate. **Exception:** the mechanical `specs/`→`.specflow/` path rewrite inside those same skills is NOT deferred — it ships in step 1b (F4).
- **v2.1 candidates** — captured in `post-v2-considerations.md` (Deliverable B), not sequenced here: OQ4 rationale-sidecar, OQ5 window-semantics contract commitment, OQ8 root artefacts under `.specflow/`, MCP-over-insight, embeddings, automatic promotion, curation-loop adoption of the edit payload, insight-query ranking, and same-loop double-fire on committed insight files.
- **Constellation Level-0 galaxy view** — still deferred (design §12.3), unaffected by the insight preset.

---

**End of v2 foundation build order.** On completion: an `insight/` module scaffolded and validated, both producer loops maintaining it, the query CLI serving Claude and humans, the typed pulse gate graduating stabilized content into the gated layers, the constellation able to overlay inference on comprehension, and the whole tree re-rooted under `.specflow/` at schema 2.0. The skill-consumption pass follows.
