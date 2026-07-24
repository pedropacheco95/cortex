---
path: src/schema/validate.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 3
size_lines: 177
size_tokens: 1613
centrality: high
built_at_commit: "bcbda52"
source_sha256: "1aebe6c04a158535eb3514669d83ed56d75da208666a576931556b7a37c14a3b"
---
# src/schema/validate.ts

## Purpose
The top-level orchestrator of the entire schema validator: `validate(target, opts)` finds the project root (walking up from the target until it finds `.cortex/cortex.config.json`), runs `checkConfig` first and short-circuits with config-only violations if the major schema version is unsupported, then builds the shared `ProjectIndex` once and runs all ~21 check functions from the 17 check modules in sequence, concatenating their violations into one flat list. Supports an optional `scope: 'file'` mode that filters the aggregated violations down to only those touching one specific file (plus config errors, which always apply). Returns a `ValidationReport` with counts and a `conformant` flag (true iff zero errors — warnings never block conformance).

## Main players
- `validate` (lines 58–177) — the single orchestration function; calls every check module in a fixed, hardcoded sequence and aggregates results. [critical]
- `findProjectRoot` (lines 36–46) — walks up parent directories from a start path looking for `.cortex/cortex.config.json`, the project-root marker. [critical]
- `countViolations` (lines 48–56) — tallies errors vs warnings from a violations list. [supporting]
- `ValidateOptions` (lines 31–34) — the options interface (`scope`, `root` override).

## Insights
- The config check runs FIRST and can short-circuit the entire function before the project index is even built (lines ~64–77) — an unsupported major schema version means NONE of the other checks run at all, only the config violation is returned. This is a deliberate fail-fast: don't bother validating content against a schema version the validator doesn't understand.
- The check execution order is a flat hardcoded sequence with no dependency-based ordering or plugin registration — adding a new check module means manually inserting both the import and the call site here; there's no dynamic discovery mechanism. `checkInsightObservations` (§4.10.11) was added this way, immediately after `checkInsightGraph` in both the import list and the insight-module call-site block.
- The comment at lines ~98–100 ("Anatomy checks REMOVED at v3.0") documents a check that used to run here and no longer does — this file's comments double as a partial changelog of the v2→v3 schema migration (mirrored by similar removal comments for insight's own retired checks).
- `scope: 'file'` filtering happens AFTER all checks run in full over the whole project — it is not an optimization to skip irrelevant checks, purely a result-filtering convenience for callers like the pre/post-read hooks that only care about one file.

## Connections
Uses:
- src/schema/checks/archive.ts: `checkArchiveLayout`, `checkArchiveMetadata`, `checkArchiveType`.
- src/schema/checks/atlas.ts: `checkAtlas`.
- src/schema/checks/bizspec.ts: `checkBizSpecs`, `checkBusinessStatus`.
- src/schema/checks/claude-md.ts: `checkClaudeMd`.
- src/schema/checks/compass.ts: `checkRules`, `checkBugs`.
- src/schema/checks/config.ts: `checkConfig`.
- src/schema/checks/constellation.ts: `checkConstellation`.
- src/schema/checks/devspec.ts: `checkDevSpecs`.
- src/schema/checks/hooks.ts: `checkHookConfig`.
- src/schema/checks/insight.ts: `checkInsightIndex`, `checkInsightEntry`, `checkInsightScopeRegistry`, `checkInsightLedger`, `checkInsightGraph`, `checkInsightObservations`.
- src/schema/checks/layout.ts: `checkLayout`, `checkIndexPresent`, `checkIndexShape`.
- src/schema/checks/loop-md.ts: `checkLoopMd`.
- src/schema/checks/provenance.ts: `checkProvenance`.
- src/schema/checks/pulse.ts: `checkPulse`.
- src/schema/checks/scenario.ts: `checkScenarios`.
- src/schema/checks/specs.ts: `checkSpecsIndex`, `checkOverviewPresent`, `checkOverviewShape`, `checkIdMatchesPath`.
- src/schema/checks/xref.ts: `checkXrefSymmetry`, `checkXrefUnique`, `checkXrefAcyclic`.
- src/schema/index-build.ts: `buildIndex`.
- src/schema/types.ts: `ValidationReport`, `Violation`.
- src/schema/version.ts: `SUPPORTED_VERSION`.

Used by:
- src/cli/init.ts: calls `validate` as part of project initialization.
- src/cli/sync.ts: calls `validate` as part of Rule 10 self-validation.
- src/loops/lint-scheduled.ts: calls `validate` for the scheduled lint loop.
- src/schema/cli.ts: calls `validate` from the `cortex validate` CLI verb.

## Query pointers
If you need to add a new validator check, also read: src/schema/types.ts (the `Violation` contract every check must return), and pick any existing check module under src/schema/checks/ as a template for the "tolerant of absent module" convention this file's callers all expect. If you need the newest addition's shape, read src/schema/checks/insight.ts's `checkInsightObservations` — the most recent check wired in here.
