---
id: insight.refresh-loops
status: draft
depends_on:
  - insight.storage-format
  - insight.extract-skill
implements: ../../specs-business/insight/assistant-understands-codebase.business.md
governed_by:
  - R-001
governs:
  - "src/insight/refresh-fast.ts"
  - "src/insight/refresh-daily.ts"
  - "src/insight/refresh-full.ts"
  - "skills/cortex-loop-insight-refresh-daily/**"
  - "skills/cortex-loop-insight-refresh-full/**"
---

# Insight Refresh Loops — fast, daily, and full maintenance of the codebase-understanding layer

## Intent

Three loops keep `.cortex/insight/` current after `insight.extract-skill` has produced it, scaling with *meaningful* change rather than commit volume (v3 design §5.9). `cortex-loop-insight-refresh-fast` is the git post-commit deterministic tier (no LLM). `cortex-loop-insight-refresh-daily` runs hybrid significance triage and re-extracts L2/L3 where warranted, neighbourhood-updating L4 as a byproduct. `cortex-loop-insight-refresh-full` runs the periodic ground-truth L4 regeneration. All three are the machine-owned-ungated maintainer class (schema Decision 13 carried into v3): they maintain insight state directly and propose nothing (RULES 7). Where the Graphify study's DIFFERENTLY verdicts say v3 must go beyond Graphify — reverse-dependency invalidation, confidence-aging, scope-scoped invalidation — these loops are exactly where that machinery lives (design §5.9).

## Entities

- **READS:** `insight/ledger.json` (per-file `source_sha256`/`built_at_commit` for the fast tier's hash compare); `insight/reverse-index.json` (entity → referencing concept/edge lookup for invalidation); `insight/graph.json` edges' `confidence` and `confirmed_at_commit` (for confidence-aging); the changed-file set (git diff, fast tier); existing per-file entries and `scope-registry.yaml` (for scope-scoped invalidation and L2/L3 re-extraction targets); `cortex.config.json` for the full-loop cadence and confidence-aging window `N`.
- **WRITES:** `insight/ledger.json`, `insight/reverse-index.json`, per-file entries under `anatomy/`/`scopes/<scope>/anatomy/` (L2/L3 re-extraction), `insight/graph.json`/`tags.json`/`clusters.json` (L4 neighbourhood updates or full regeneration). **Never** gated content (`compass/`, `atlas/`, `RULES.md`) — these loops write only insight.
- **CREATES:** nothing structurally new beyond what extraction created; refreshes existing entries and graph state. The fast tier creates no new artefact beyond flag state consumed by the daily loop.

## Rules

1. **Three loops, three cadences (design §5.9, §9; addendum A7.1).** `cortex-loop-insight-refresh-fast` runs as the **git post-commit hook**, deterministic, no LLM: it flags changed files by comparing current body hashes against `ledger.json`. `cortex-loop-insight-refresh-daily` runs once per day: significance triage on flagged files, L2 re-extraction on any real change, L3 re-extraction only on significant change, and L4 neighbourhood updates around the L3 re-extractions. `cortex-loop-insight-refresh-full` runs weekly (configurable): a full L4 regeneration as the ground-truth pass, independent of what the daily loop flagged.
2. **Hybrid significance detection (design §5.9).** A **structural filter runs first, in Core** (RULES 3): deterministic skip-lists and no-op detectors rule out formatting-only, comment-only, whitespace-only, and import-reordering changes — these never reach L2/L3. An **LLM triage runs second**: a **Haiku** pass looks at the diff and the existing insight entry and classifies the remainder as "significant" (warrants L3) or "cosmetic" (L2 only, or no re-extraction) for cases the structural filter cannot decide deterministically.
3. **Reverse-dependency index invalidation (design §5.9 DIFFERENTLY #1; addendum A4.5).** When a file changes, the daily loop looks up every entity the file defines in `reverse-index.json` and re-verifies (or flags for re-verification) every concept and edge that references one of those entities — not just the changed file's own entry. This is the fix for Graphify's confirmed gap: source-keyed-only invalidation lets cross-file semantic drift accumulate silently.
4. **Confidence-aging on un-revisited edges (design §5.9 DIFFERENTLY #2; addendum A4.6).** An edge whose `confidence` is `inferred` or `ambiguous` and whose `confirmed_at_commit` has not advanced across `N` refresh cycles (config, loop-owned) is surfaced by the daily or full loop for re-verification rather than silently retained. `N` and the exact surfacing mechanism (flag in the progress-equivalent report vs. re-running L4 unconditionally on it) are this spec's implementation detail.
5. **Scope-scoped invalidation (design §5.9 DIFFERENTLY #3).** A changed file re-plans only its owning scope(s) — re-extraction and L4 neighbourhood updates touch only that scope and the cross-scope edges referencing it. Scopes with no changed files and no invalidated cross-scope edges remain untouched and their cached entries are not re-derived.
6. **Loop-write invariant (RULES 7, schema Decision 13).** All three loops maintain machine-owned ungated insight state directly. None of the three ever writes to `compass/`, `atlas/`, or `RULES.md`, and none emits a `pulse/` proposal — there is nothing to gate here, unlike `insight.session-observe`.
7. **Deterministic Core bookends (R-001).** The fast tier is entirely Core: hashing and flagging are pure file I/O, no LLM SDK import anywhere in its code path. The daily and full loops follow the two-deterministic-halves idiom: `--collect` (or equivalent) assembles the worklist in Core; the significance-triage/L2/L3/L4 judgment is the LLM half, run by the shipped skill; `--apply` (or equivalent) validates and writes in Core. The judgment step never runs inside Core.
8. **Weekly full regeneration is deterministic modulo `generated`.** Re-running the full loop over an unchanged project reproduces byte-identical `graph.json`/`tags.json`/`clusters.json` except the `generated` timestamp — the same determinism-plus-carry-over discipline as v2's insight-refresh loop, now over the v3 node grammar (`file:`/`element:`/`concept:`).

## Acceptance Criteria

### The fast tier flags a changed file with no LLM involved

- **Given** a committed change to `src/auth/session.ts` whose body hash no longer matches `ledger.json`'s `entries["src/auth/session.ts"].source_sha256`
- **When** the post-commit hook runs `cortex-loop-insight-refresh-fast`
- **Then** the file is flagged for the daily loop, `ledger.json` is not yet updated (that happens on successful re-extraction), and no LLM call occurs anywhere in the fast tier's execution path

### The structural filter rules out a cosmetic change before any LLM triage

- **Given** a flagged file whose diff is whitespace-reformatting only
- **When** the daily loop's significance triage runs
- **Then** the Core structural filter classifies it as a no-op and no Haiku call is made, and no L2 or L3 re-extraction runs for that file

### Haiku triage escalates an ambiguous diff to significant

- **Given** a flagged file whose diff adds a new exported function and changes a return type, which the structural filter cannot classify deterministically
- **When** the daily loop's Haiku triage runs
- **Then** it classifies the change as significant, and L3 re-extraction runs for that file (not merely L2)

### A real but non-significant change gets L2 only

- **Given** a flagged file with a genuine content change (e.g., a renamed local variable and an updated comment) that Haiku triage classifies as cosmetic-but-real
- **When** the daily loop processes it
- **Then** L2 (purpose + connections) is re-extracted but L3 (main players / insights / file map) is not

### Reverse-dependency invalidation reaches referencing concepts, not just the changed file

- **Given** `reverse-index.json` records that concept `concept:billing-retry` and edge `edge:file:src/billing/retry.ts→file:src/notifications/email.ts` both reference entity `element:src/notifications/email.ts#send`, and `src/notifications/email.ts` changes significantly
- **When** the daily loop's invalidation step runs
- **Then** both `concept:billing-retry` and the referencing edge are re-verified (or flagged for re-verification) even though neither `billing/` nor its files changed

### Confidence-aging surfaces a stale inferred edge

- **Given** an edge with `confidence: inferred` whose `confirmed_at_commit` has not advanced across the configured `N` refresh cycles
- **When** the daily or full loop runs its aging check
- **Then** the edge is surfaced for re-verification rather than left untouched and implicitly trusted

### Scope-scoped invalidation leaves untouched scopes cached

- **Given** a change confined to files inside scope `billing`, with no cross-scope edges from `auth` referencing anything in `billing`
- **When** the daily loop re-plans invalidation
- **Then** `scopes/billing/` entries are re-extracted as warranted, and `scopes/auth/` entries and `graph.json` edges are left byte-identical to before the run

### A second full run over an unchanged project is byte-identical but for `generated`

- **Given** an unchanged project and existing `graph.json`/`tags.json`/`clusters.json`
- **When** `cortex-loop-insight-refresh-full` runs a second time
- **Then** the three files are byte-identical to the prior run except the `generated` timestamp

### None of the three loops ever writes gated content or emits a proposal

- **Given** any of the three loops completing a run that includes re-extraction and invalidation
- **When** the run's write set is inspected
- **Then** every write lands under `.cortex/insight/`, no write touches `compass/`, `atlas/`, or `RULES.md`, and no `pulse/*.md` proposal section is emitted by these loops

### Scheduled-task registration matches the fast/daily/full split

- **Given** a fresh v3 project registering its scheduled tasks
- **When** registration runs
- **Then** `cortex-loop-insight-refresh-daily` and `cortex-loop-insight-refresh-full` register as scheduled tasks, `cortex-loop-insight-refresh-fast` registers as the git post-commit hook (not a scheduled task), and no `cortex-loop-anatomy-refresh` or v2 `cortex-loop-insight-refresh`/`cortex-loop-insight-gaps` task is registered

## Notes

- This is the anatomy-refresh-loop pattern (v2) and the v2 insight-refresh loop's machine-owned-ungated class, pointed at the v3 leveled per-file insight layer instead of the curated-artefact concept map (design §5.9 note, §8; addendum A7.3). It supersedes v2's `cortex-loop-insight-refresh` wholesale (design §8.3) — there is no `map/`-to-`scopes/` migration to perform.
- The reverse-dependency index, confidence-aging, and scope-scoped invalidation are **Cortex-original**: the Graphify study confirms Graphify invalidates on file-change-only and re-clusters globally every time, with no analogue for any of the three (study Axis 5 DIFFERENTLY; design §5.9).
- **OPEN:** the exact value and config key for the confidence-aging window `N`, and whether daily or full is the loop that performs the aging pass (or both, at different tiers), are not fixed by the design/addendum pass — deferred to this spec's implementation.
- **OPEN:** the precise mechanism for "surfacing" an aged edge (a dedicated pulse-adjacent report, a flag field on the edge itself, or folding into the daily loop's own status output) is left open by design §5.9/addendum A4.6 beyond naming the requirement; this draft assumes it is *not* a `pulse/` proposal (no gate involved — RULES 7 governs proposals to gated layers, and aging is a within-insight re-verification signal, not a gated-layer change).
- Journey-layer tests are expected to defer to v1.1 pending the test-runner loop, per the project-wide convention established for the two v2 loops this draft supersedes.
