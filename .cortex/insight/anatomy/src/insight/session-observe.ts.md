---
path: src/insight/session-observe.ts
extracted_at: 2026-07-15T00:00:00Z
extraction_level: 3
size_lines: 891
size_tokens: 8409
centrality: low
built_at_commit: "9720847"
source_sha256: "fc4f650a4cde22ee72e755480cbbc548185548200a88fe55a7fca2823fce9892"
---
# src/insight/session-observe.ts

## Purpose

Implements `cortex loop-session-observe`, the v3 successor to v2's insight-gaps loop: `--collect` reuses the shared session corpus (`pulse/state/session-corpus.json`, built by `pulse-distil` if absent — one corpus, two readers) and emits a worklist of not-yet-observed sessions (tracked in `pulse/state/session-observe-state.json`). `--apply` audits the skill's ungated per-file entry enrichments — only `## Insights`/`## Query pointers` may differ from the git baseline, every added line must carry a `(claude-sessions/<user>/<id>)` provenance trailer, and no gated path (`compass/`, `atlas/`, `RULES.md`) may be touched directly — then routes gated candidates (rule-candidate / decision-candidate) through dismissal-suppression and shared S-id allocation into typed proposal sections in the always-write `pulse/reports/session-observe.md` report. As of B-010 (commit 9720847) the rule-candidate branch mirrors decision-candidate's shape: it builds a schema-conformant `.cortex/compass/rules/R-NNN-<slug>.md` create-payload via the new `ruleFilePayload`, rather than the old raw-prose "append to a non-existent file" shape that made every rule-candidate proposal fail `cortex pulse-accept`.

## Main players

- `collectObserve` (lines 169–204) — `--collect` bookend: reuses the shared corpus via `readCorpus`/`collectCorpus` (building it only if absent), diffs against the observed-state file, and writes the worklist of unobserved sessions. [critical]
- `auditEnrichments` (lines 334–410) — the enrichment audit: confirms the gated roots (`compass/`, `atlas/`, `RULES.md`) are untouched, re-parses every touched `.cortex/insight/**/anatomy/*.md` entry, and diffs it section-by-section against the HEAD baseline to enforce the extraction-owned/loop-writable boundary and the provenance-trailer requirement. [critical]
- `validateObserveCandidate` (lines 453–482) — shape-validates one raw gated candidate from the skill's proposals JSON; malformed → `null` (skipped + counted, never thrown). `title`/`governedGlobs` on a rule-candidate are tolerantly checked — absent or malformed drops the optional field rather than rejecting the candidate. [critical]
- `nextRuleId` (lines 575–595) — B-010 fix: computes the next unused `R-NNN` by scanning `.cortex/compass/rules/` on disk AND an in-process `allocatedInBatch` set, so two rule-candidates proposed in the same apply run never collide even before either lands on disk. [supporting]
- `ruleFilePayload` (lines 608–648) — the export B-010 added: builds the full schema-conformant proposed rule file (`id`, `title`, `source` pointing at the pulse report, `governs` from `governedGlobs` with a `["**/*"]` fallback, `provenance` with the claude-sessions ref) that `cortex pulse-accept` can write verbatim to `.cortex/compass/rules/R-NNN-<slug>.md`. [critical]
- `decisionFilePayload` (lines 515–539) — the decision-candidate sibling of `ruleFilePayload`, unchanged by B-010; builds the proposed `.cortex/atlas/decisions/<date>-<slug>.md` create-payload. [supporting]
- `candidateSectionText` (lines 650–693) — renders one gated candidate's `## S-NNN: <title>` report section, dispatching to `ruleFilePayload` or `decisionFilePayload` and fencing the payload with `chooseOuterFence`. [supporting]
- `applyObserve` (lines 728–832) — `--apply` bookend: runs the enrichment audit, filters raw candidates through `validateObserveCandidate` → dismissal-suppression → carried-forward dedup, allocates S-ids, advances the observed-state file, and always-writes the report. [critical]
- `runSessionObserve` (lines 847–891) — the CLI entrypoint: validates `--collect`/`--apply`/`--proposals` mutual-exclusivity, dispatches to `collectObserve` or `applyObserve`, and maps the result to a process exit code (violations → 1). [critical]

## Insights

B-010 (commit 9720847, "found on berd, which runs this repo's binary") fixed a cross-project regression: the rule-candidate branch of `candidateSectionText` used to emit an LLM-supplied `proposedTarget` and raw prose under a **Proposed addition:** heading — a shape `cortex pulse-accept` could never turn into a valid rule file, while its decision-candidate sibling worked correctly via `decisionFilePayload`. The fix makes the two branches symmetric: `ObserveCandidate`'s rule-candidate variant drops `proposedTarget` entirely and gains `title?`/`governedGlobs?`, and `ruleFilePayload` now computes the `R-NNN` id, filename, and full frontmatter the same way `decisionFilePayload` always did.

`nextRuleId`'s dedup is two-layered on purpose: scanning `.cortex/compass/rules/` alone would let two candidates in the *same* apply batch both compute the same next id (neither is on disk yet when the second one runs), so `allocatedInBatch` — mutated in place and threaded through the whole batch via `applyObserve`'s `allocatedRuleIds` — is the only thing that prevents that collision.

The B-010 matching-key/display-title split is easy to get backwards: `pattern` (not `title`) stays the untruncated dismissal/carry-forward matching key (`isDismissed`, `pendingNorms` both key off `pattern`/`title` per candidate type — see `applyObserve` lines 763–768), while `title` is purely cosmetic — `ruleTitle` (lines 551–555) falls back to a truncated `pattern` only when `title` is absent, never the reverse.

`ruleFilePayload`'s `sourceRel` is computed via `path.relative` from the *proposed rule file's own directory* to the report file (lines 619–621) — the `source:` frontmatter embedded in a not-yet-written rule file is relative to where that file will land on accept, not to the current working directory, which matters if `resolveRelativePath()`-style consumers ever change how they join it.

`auditEnrichments`'s boundary is stricter than "only two sections changed": frontmatter and all four `EXTRACTION_OWNED_SECTIONS` (`Purpose`, `Main players`, `File map`, `Connections`) must be byte-identical to the HEAD baseline (`splitEntrySections` is a byte-preserving split precisely so this comparison is exact), and every line *added* to `Insights`/`Query pointers` must independently match `PROVENANCE_TRAILER_RE` — one unfenced correction line fails that whole entry as a violation, not just that line.

`collectObserve` never rebuilds the session corpus if one already exists on disk (`readCorpus` before `collectCorpus`) — this is the "one corpus, two readers" contract shared with `pulse-distil`; a session already scanned by `pulse-distil --collect` in the same run is not re-scanned here.

The pulse reorg split what used to be one `pulseDir` helper into `stateDir` (worklist, observed-state, corpus — under `pulse/state/`) and `reportsDir` (the report — under `pulse/reports/`); it's a pure path change with no behavioural difference, but easy to miss when diffing against an older version of this file.

## File map

- Lines 1–30: module doc — the two deterministic bookends and what the agentic skill does in between.
- Lines 31–75: imports, exported constants (`SESSION_OBSERVE_*`, `EXTRACTION_OWNED_SECTIONS`, `LOOP_WRITABLE_SECTIONS`, `PROVENANCE_TRAILER_RE`), and the `stateDir`/`reportsDir` path helpers.
- Lines 76–104: observed-state file (`readObserveState`, `writeObserveState`).
- Lines 106–204: `--collect` — worklist types and `collectObserve`.
- Lines 206–251: entry section-boundary parsing (`splitEntrySections`, `addedLines`) used by the audit.
- Lines 253–312: git working-tree inspection helpers (`isGitRepo`, `gitStatus`, `gitShowHead`, `isEntryPath`).
- Lines 314–410: the enrichment audit (`auditEnrichments`).
- Lines 412–648: gated candidates → typed proposals — `ObserveCandidate` type, `validateObserveCandidate`, `decisionSlug`/`provenanceUser`/`decisionFilePayload`, `ruleTitle`/`ruleSlug`/`nextRuleId`/`ruleFilePayload` (the B-010 additions).
- Lines 650–701: `candidateSectionText` and `ObserveProposeCounts`.
- Lines 703–832: `--apply` — `applyObserve`, including the always-write report body assembly.
- Lines 834–891: `runSessionObserve`, the mode-dispatching entrypoint.

## Connections

Uses:
- src/insight/entry.ts: `parseEntry` to confirm a touched entry still conforms to §4.10.2 after enrichment.
- src/loops/report.ts: `writePulseReport` for the always-write session-observe report.
- src/pulse/distil.ts: `collectCorpus`, `CORPUS_FILE`, `readPendingSections`, `readUnexpiredDismissals`, `isDismissed`, `normaliseText` — reuses the shared session corpus and dismissal machinery rather than rebuilding either.
- src/pulse/fences.ts: `chooseOuterFence` to safely fence proposed rule text / decision file payloads in the report.
- src/pulse/suggestion-ids.ts: `allocateSuggestionIds` for S-ids on fresh proposals.

Used by:
- (none src-internal via static import)

Semantically related (not imports):
- src/cli/cli.ts: dynamically imports this module (`await import('../insight/session-observe.js')`) inside its `loop-session-observe` handler — a real runtime dependency that a static/L1 import graph cannot see, since it is a dynamic `import()` rather than a top-level `import`.

## Query pointers

If you need to change what counts as a valid gated candidate, read `validateObserveCandidate` here directly — Core only shape-validates, it never runs the judgment (R-001). If you need to change how rule ids are allocated across a batch, read `nextRuleId` (B-010) before touching `ruleFilePayload` — the two are coupled via the mutable `allocatedRuleIds` set threaded from `applyObserve`. If you need to change which entry sections a loop-write may touch, read `EXTRACTION_OWNED_SECTIONS`/`LOOP_WRITABLE_SECTIONS` at the top together with `auditEnrichments` and `src/insight/entry.ts`'s §4.10.2 parser. If you need to see where this loop is actually invoked, read `src/cli/cli.ts`'s `loop-session-observe` handler — it is a dynamic import, not a static edge.
