---
path: src/schema/checks/pulse.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 167
size_tokens: 1763
centrality: medium
built_at_commit: "a66041b"
source_sha256: "0c31227e36b1d848f93907b98a16cd2017cd8c1bd1a0d31c5458a59a817f0d40"
---
# src/schema/checks/pulse.ts

## Purpose
Validates `.cortex/pulse/` artefacts (schema §4.5/.1/.2) in two layers: a v1 layer checking frontmatter header presence (`kind`/`generated`/`loop`, all warnings — pulse is transient proposal data, not held to artefact-grade rigor), and a v2 layer parsing each `## S-NNN: …` suggestion section within a file's body (via the internal `parseSuggestionSections`) and validating its typed-pulse gate: `**Type:**` must be present (absent defaults to `rule-candidate` with a warning, v1-era tolerance) and in the shared `SUGGESTION_TYPES` enum, which at 3.0 includes `decision-candidate` (outside the enum is an error); `**Target:**` must be within the permitted root for that type (error if not, via `isTargetPermitted`); exactly one payload shape among `**Proposed addition:**`/`**Proposed edit:**`/`**Proposed file:**` must be present (zero or more than one is an error); and (3.4) for a `CREATE_ONLY_TYPES` type, that one payload shape must specifically be `**Proposed file:**`, not `addition`/`edit`. `pulse-dismissed.md`-kind files are exempt from the per-section checks, and `threads/**` is skipped entirely since the thread ledger has its own dedicated check (`check.threads`, §4.5.3) — the two checks partition `.cortex/pulse/` so no file is validated twice.

## Connections
Uses:
- src/pulse/types.ts: `SUGGESTION_TYPES`, `PAYLOAD_SHAPES`, `CREATE_ONLY_TYPES`, `isTargetPermitted`, `permittedRootsLabel`, `SuggestionType` — the entire typed-suggestion contract this check enforces lives there, not here.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkPulse(root)`.
- tests/atomic/insight/session-observe.test.ts, tests/atomic/schema/evidence-check.test.ts, tests/atomic/schema/threads-check.test.ts: exercise this check as part of broader schema/session-observe coverage.
- tests/spec/insight/session-observe.spec.test.ts: integrated-slice coverage.

Semantically related (not imports):
- src/schema/checks/threads.ts is this file's explicit partner via the `threads/**` skip — together they cover the whole `.cortex/pulse/` tree with no overlap.

## Query pointers
If you need to understand the full typed-suggestion contract (enum values, permitted targets per type, create-only types), also read: src/pulse/types.ts. If you need the thread-ledger side of `.cortex/pulse/`, also read: src/schema/checks/threads.ts.
