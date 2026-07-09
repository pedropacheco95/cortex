---
path: src/schema/checks/compass.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 168
size_tokens: 2255
centrality: medium
built_at_commit: "8248c76"
source_sha256: "d0ea4269427616b4068f4a7f91baa3d2a3f97b18ba12e6e6956372977430dc4f"
---
# src/schema/checks/compass.ts

## Purpose
Validates the two compass ledgers: `checkRules` for `.cortex/compass/rules/R-NNN[-slug].md` (schema §4.2 — `id` matches the `R-NNN` pattern and the filename, `title`, `source` list resolves, `governs` glob list where a zero-match glob is a warning via the shared `globMatchesNothing` helper, optional `check.kind` in a fixed enum requiring a `pattern` unless `kind: none`); `checkBugs` for `.cortex/compass/bugs/B-NNN[-slug].md` (schema §4.3 — `id`/`title`/`type` (seven-type bug taxonomy enum)/`severity`/`status`/`affects` list, each validated against its own enum or resolution rule). `globMatchesNothing` is exported and reused by other checks that also validate glob-shaped fields (e.g. dev-spec `governs`).

## Main players
- `checkRules` (lines 35–110) — validates every `R-NNN` rule file's frontmatter against schema §4.2. [critical]
- `checkBugs` (lines 112–167) — validates every `B-NNN` bug ledger entry against schema §4.3's seven-type taxonomy. [critical]
- `globMatchesNothing` (lines 10–16) — shared "does this glob match zero files on disk" helper, exported for reuse. [supporting]

## Insights
- The bug-type enum (`missing-criterion`, `incomplete-rule`, `wrong-rule`, `missing-dev-spec`, `missing-business-spec`, `layer-drift`, `test-defect`) is the concrete list backing "design §2's seven-type bug taxonomy" referenced elsewhere in the codebase — this file is the enum's canonical source, not just a consumer.
- A zero-match `governs` glob is a warning, not an error — rules/dev-specs are allowed to govern files that don't exist yet (e.g. planned but unimplemented code), which is a deliberate tolerance rather than an oversight.

## Connections
Uses:
- src/schema/index-build.ts: `ProjectIndex`, `resolveId`, `resolveRelativePath`.
- src/schema/types.ts: `Violation` type.

Used by:
- src/loops/rule-decay.ts: reuses this module (likely `checkRules` or shared helpers) for the weekly rule-obsolescence loop.
- src/pulse/hygiene.ts: reuses compass validation logic in the deterministic hygiene sweep.
- src/schema/checks/devspec.ts: imports `globMatchesNothing` to validate dev-spec `governs` globs with the same zero-match-is-warning rule.
- src/schema/validate.ts: calls both `checkRules` and `checkBugs`.

## Query pointers
If you need to understand the bug taxonomy or rule schema end to end, also read: `cortex-schema.md` §4.2/§4.3, src/schema/checks/devspec.ts (governs glob reuse), and the specflow-bugs skill (which files bugs into this ledger).
