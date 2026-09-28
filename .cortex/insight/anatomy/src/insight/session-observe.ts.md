---
path: src/insight/session-observe.ts
extracted_at: 2026-09-22T09:55:19Z
extraction_level: 3
size_lines: 1060
size_tokens: 10458
centrality: high
built_at_commit: "a66041b"
source_sha256: "eaa46d8296a17054f195491a9c6eef0626fd31cc700006440edf0ff4865bbf68"
---
# src/insight/session-observe.ts

## Purpose

Implements `cortex loop-session-observe`, the v3 successor to v2's insight-gaps loop: `--collect` reuses the shared session corpus (`pulse/state/session-corpus.json`, built by `pulse-distil` if absent — one corpus, two readers) and emits a worklist of not-yet-observed sessions (tracked in `pulse/state/session-observe-state.json`). `--apply` audits the skill's ungated per-file entry enrichments — only `## Insights`/`## Query pointers` may differ from the git baseline, every added line must carry a `(claude-sessions/<user>/<id>)` provenance trailer, every `insight/observations/` entry file touched this run must still satisfy the §4.10.11 frontmatter shape, and no gated path (`compass/`, `atlas/`, `RULES.md`) may be touched directly — then routes gated candidates (rule-candidate / decision-candidate) through dismissal-suppression and shared S-id allocation into typed proposal sections in the always-write `pulse/reports/session-observe.md` report. Both bookends are deterministic Core (no LLM here, ever, R-001); the agentic judgment in between is the shipped `cortex-loop-session-observe` skill bundle, outside this file entirely.

## Main players

- `collectObserve` (lines 192–233) — `--collect` bookend: refreshes/reuses the shared corpus via `refreshCorpus`/`readCorpus`/`collectCorpus` (building it only if absent), diffs against the observed-state file, and writes the worklist of unobserved sessions, interactive-first. [critical]
- `auditEnrichments` (lines 366–451) — the enrichment audit: confirms the gated roots (`compass/`, `atlas/`, `RULES.md`) are untouched, runs `checkInsightObservations` over `.cortex/insight/observations/` and folds any error-severity violation into the audit's own violations list, re-parses every touched `.cortex/insight/**/anatomy/*.md` entry, and diffs it section-by-section against the HEAD baseline to enforce the extraction-owned/loop-writable boundary and the provenance-trailer requirement. [critical]
- `validateObserveCandidate` (lines 494–523) — shape-validates one raw gated candidate from the skill's proposals JSON; malformed → `null` (skipped + counted, never thrown). `title`/`governedGlobs` on a rule-candidate are tolerantly checked — absent or malformed drops the optional field rather than rejecting the candidate. [critical]
- `nextRuleId` (lines 660–690) — B-010 fix: computes the next unused `R-NNN` by scanning `.cortex/compass/rules/` on disk, an in-process `allocatedInBatch` set, AND (schema.id-registry Rule 4, 3.4 fifth revision) the id registry floor via `readRegistry`, so two rule-candidates in the same apply run — or a candidate racing an already-registered but not-yet-on-disk id — never collide. [supporting]
- `ruleFilePayload` (lines 703–743) — the export B-010 added: builds the full schema-conformant proposed rule file (`id`, `title`, `source` pointing at the pulse report, `governs` from `governedGlobs` with a `["**/*"]` fallback, `provenance` with the claude-sessions ref) that `cortex pulse-accept` can write verbatim to `.cortex/compass/rules/R-NNN-<slug>.md`. [critical]
- `decisionFilePayload` (lines 597–624) — the decision-candidate sibling of `ruleFilePayload`; since 3.4 also embeds an optional `bears_on` seed (`readLedgerSeed`) between `date` and `provenance`. [supporting]
- `readLedgerSeed` (lines 569–586) — 3.4 addition: Core-computed `bears_on` seed for a decision-candidate, reading each originating session's PreRead ledger under `pulse/state/reads/<session-id>`, keeping only `.cortex/`/`.specflow/` lines, deduplicated and capped at `DECISION_SEED_CAP` (12). [supporting]
- `candidateSectionText` (lines 745–790) — renders one gated candidate's `## S-NNN: <title>` report section, dispatching to `ruleFilePayload` or `decisionFilePayload` and fencing the payload with `chooseOuterFence`. [supporting]
- `applyObserve` (lines 859–997) — `--apply` bookend: runs the enrichment audit, filters raw candidates through `validateObserveCandidate` → dismissal-suppression → carried-forward dedup, allocates S-ids, advances the observed-state file, and always-writes the report. [critical]
- `runSessionObserve` (lines 1012–1059) — the CLI entrypoint: validates `--collect`/`--apply`/`--proposals` mutual-exclusivity, dispatches to `collectObserve` or `applyObserve`, and maps the result to a process exit code (violations → 1). [critical]

## Insights

`auditEnrichments`'s gated-path check runs in two independent halves before it even looks at entry diffs: the git-status scan of `compass/`, `atlas/`, `RULES.md`, and a full pass of `checkInsightObservations(absRoot)` whose error-severity violations are converted to audit violations. A malformed `insight/observations/<theme>.md` entry (bad `kind`, missing `sessions`, malformed claude-sessions ref) fails the WHOLE apply run, not just that theme file — the same contract the standalone `cortex validate` enforces is also a hard gate on session-observe's own apply path, never re-implemented with looser rules.

`nextRuleId`'s dedup is now three-layered: scanning `.cortex/compass/rules/` on disk would miss both a same-batch collision (neither candidate is written yet) and a registry-only id (accepted elsewhere but not yet a file on disk), so `allocatedInBatch` (threaded through the whole apply batch as `applyObserve`'s `allocatedRuleIds`) and the `readRegistry` floor are both consulted — read-only here; the registry line itself is written only when a proposal is accepted (RULES.md rule 7).

The B-010 matching-key/display-title split is easy to get backwards: `pattern` (not `title`) stays the untruncated dismissal/carry-forward matching key (`isDismissed`, `pendingNorms` both key off `pattern`/`title` per candidate type in `applyObserve`), while `title` is purely cosmetic — `ruleTitle` falls back to a truncated `pattern` only when `title` is absent, never the reverse.

`ruleFilePayload`'s `sourceRel` is computed via `path.relative` from the *proposed rule file's own directory* to the report file — the `source:` frontmatter embedded in a not-yet-written rule file is relative to where that file will land on accept, not to the current working directory.

`auditEnrichments`'s per-entry boundary is stricter than "only two sections changed": frontmatter and all four `EXTRACTION_OWNED_SECTIONS` (`Purpose`, `Main players`, `File map`, `Connections`) must be byte-identical to the HEAD baseline (`splitEntrySections` is a byte-preserving split precisely so this comparison is exact), and every line *added* to `Insights`/`Query pointers` must independently match `PROVENANCE_TRAILER_RE` — one unfenced correction line fails that whole entry as a violation, not just that line.

`collectObserve` now calls `refreshCorpus` before falling back to `collectCorpus` (a change from the pre-3.4 shape where it only checked `readCorpus`): an existing corpus is refreshed with every session newer than its `generated` stamp (spec Rule 11) rather than either fully reused untouched or fully rebuilt — `corpus_appended` in the worklist records how many sessions the refresh added.

The pulse reorg split what used to be one `pulseDir` helper into `stateDir` (worklist, observed-state, corpus — under `pulse/state/`) and `reportsDir` (the report — under `pulse/reports/`); a pure path change with no behavioural difference, but easy to miss when diffing against an older version of this file.

## File map

- Lines 1–30: module doc — the two deterministic bookends and what the agentic skill does in between.
- Lines 31–63: imports and exported constants (`SESSION_OBSERVE_*`, `EXTRACTION_OWNED_SECTIONS`, `LOOP_WRITABLE_SECTIONS`, `PROVENANCE_TRAILER_RE`).
- Lines 74–79: `stateDir`/`reportsDir` path helpers.
- Lines 86–130: observed-state file (`ObserveState`, `readObserveState`, `writeObserveState`).
- Lines 136–233: `--collect` — worklist types and `collectObserve`.
- Lines 239–280: entry section-boundary parsing (`splitEntrySections`, `addedLines`) used by the audit.
- Lines 286–341: git working-tree inspection helpers (`isGitRepo`, `gitStatus`, `gitShowHead`, `isEntryPath`).
- Lines 347–451: the enrichment audit (`auditEnrichments`), including the `checkInsightObservations` pass.
- Lines 457–598: gated candidates → typed proposals — `ObserveCandidate` type, `validateObserveCandidate`, `decisionSlug`/`provenanceUser`, the 3.4 `readLedgerSeed`, `decisionFilePayload`.
- Lines 626–743: `ruleTitle`/`ruleSlug`/`nextRuleId`/`ruleFilePayload` (the B-010 additions, now with the registry-floor check).
- Lines 745–798: `candidateSectionText` and `ObserveProposeCounts`.
- Lines 804–997: `--apply` — `applyObserve`, including the always-write report body assembly.
- Lines 1003–1059: `SessionObserveOptions`/`runSessionObserve`, the mode-dispatching entrypoint.

## Connections

Uses:
- src/compass/registry.ts: `readRegistry` — the id-registry floor `nextRuleId` consults so a rule id already claimed in the registry (but not yet a file) is never reissued.
- src/insight/entry.ts: `parseEntry` to confirm a touched entry still conforms to §4.10.2 after enrichment.
- src/loops/report.ts: `writePulseReport` for the always-write session-observe report.
- src/pulse/distil.ts: `collectCorpus`, `CORPUS_FILE`, `readCorpus`, `refreshCorpus`, `readPendingSections`, `readUnexpiredDismissals`, `isDismissed`, `normaliseText` — reuses the shared session corpus and dismissal machinery rather than rebuilding either.
- src/pulse/fences.ts: `chooseOuterFence` to safely fence proposed rule text / decision file payloads in the report.
- src/pulse/suggestion-ids.ts: `allocateSuggestionIds` for S-ids on fresh proposals.
- src/schema/checks/insight.ts: `checkInsightObservations` — reused wholesale (not re-derived) to audit `insight/observations/` entry frontmatter as part of the enrichment audit.

Used by:
- src/hooks/session-end.ts: imports `provenanceUser` to stamp the same OS-username provenance convention at session end (outside this scope).
- src/pulse/threads.ts: imports `decisionSlug` to derive thread-promotion filenames the same way a decision-candidate would.
- src/pulse/thread-cli.ts: imports `decisionFilePayload`, `decisionSlug`, and `provenanceUser` to build a `thread promote` decision file with the exact same shape `applyObserve` writes.

Semantically related (not imports):
- src/cli/cli.ts: dynamically imports this module (`await import('../insight/session-observe.js')`) inside its `loop-session-observe` handler — a real runtime dependency that a static/L1 import graph cannot see, since it is a dynamic `import()` rather than a top-level `import`.

## Query pointers

If you need to change what counts as a valid gated candidate, read `validateObserveCandidate` here directly — Core only shape-validates, it never runs the judgment (R-001). If you need to change how rule ids are allocated across a batch, read `nextRuleId` (B-010, now registry-aware) before touching `ruleFilePayload` — the two are coupled via the mutable `allocatedRuleIds` set threaded from `applyObserve`. If you need to change which entry sections a loop-write may touch, read `EXTRACTION_OWNED_SECTIONS`/`LOOP_WRITABLE_SECTIONS` at the top together with `auditEnrichments` and `src/insight/entry.ts`'s §4.10.2 parser. If you need to change the `insight/observations/` frontmatter contract this loop's audit enforces, read `src/schema/checks/insight.ts`'s `checkInsightObservations` directly — this file only consumes it. If you need to change the decision `bears_on` seed, read `readLedgerSeed` here together with `src/pulse/threads.ts`'s `ledgerBearsOn` (the same filter, intentionally not imported). If you need to see where this loop is actually invoked, read `src/cli/cli.ts`'s `loop-session-observe` handler — it is a dynamic import, not a static edge.
