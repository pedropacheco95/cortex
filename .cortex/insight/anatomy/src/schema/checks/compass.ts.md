---
path: src/schema/checks/compass.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 3
size_lines: 254
size_tokens: 3274
centrality: high
built_at_commit: "a66041b"
source_sha256: "9120ec8bdb560fb93ed385787ecc1b4c710d56e94638ed08e7e26e7a2165809e"
---
# src/schema/checks/compass.ts

## Purpose
Validates the two compass ledgers plus their id/H1 hygiene: `checkRules` for `.cortex/compass/rules/R-NNN[-slug].md` (schema §4.2 — `id` matches the `R-NNN` pattern and the filename, `title`, `source` list resolves, `governs` glob list where a zero-match glob is a warning via the shared `globMatchesNothing` helper, optional `check.kind` in a fixed enum requiring a `pattern` unless `kind: none`); `checkBugs` for `.cortex/compass/bugs/B-NNN[-slug].md` (schema §4.3 — `id`/`title`/`type` (seven-type bug taxonomy enum)/`severity`/`status`/`affects` list, plus (3.4 fifth revision, compass.bug-currency Rule 3) three optional currency fields `owner`, `fix_in_flight`, `found_at_commit` — shape-checked only, no cross-field rule, absent means unknown rather than a finding); and `checkCompassHeading` (validator Rule 13, wave follow-up A) — the body's first H1, when it begins with an `R-NNN`/`B-NNN` token, must agree with the frontmatter `id`; disagreement is a warning (H1 is prose the schema doesn't shape) while filename↔id mismatch stays `checkRule`/`checkBug`'s error. `globMatchesNothing` is exported and reused by dev-spec `governs` validation elsewhere.

## Main players
- `checkRules` (lines 35–110) — validates every `R-NNN` rule file's frontmatter against schema §4.2. [critical]
- `checkBugs` (lines 112–180) — validates every `B-NNN` bug ledger entry against schema §4.3's seven-type taxonomy plus the three 3.4 currency fields. [critical]
- `checkCompassHeading` (lines 201–238) — new since the prior extraction: cross-checks the body's first H1 token against frontmatter `id` for both rules and bugs. [critical]
- `globMatchesNothing` (lines 10–16) — shared "does this glob match zero files on disk" helper, exported for reuse by dev-spec checks. [supporting]
- `describeType` (lines 185–187) — small helper producing a human-readable type name (`"null"`/`"a list"`/`typeof`) for currency-field type-mismatch error messages. [supporting]
- `firstH1` (lines 241–253) — locates the body's first `# …` line after any leading `---` frontmatter block, with its 1-based line number. [supporting]

## Insights
- The bug-type enum (`missing-criterion`, `incomplete-rule`, `wrong-rule`, `missing-dev-spec`, `missing-business-spec`, `layer-drift`, `test-defect`) is the concrete list backing "design §2's seven-type bug taxonomy" referenced elsewhere in the codebase — this file is the enum's canonical source, not just a consumer.
- A zero-match `governs` glob is a warning, not an error — rules/dev-specs are allowed to govern files that don't exist yet, a deliberate tolerance rather than an oversight.
- The three bug-currency fields (`owner`, `fix_in_flight`, `found_at_commit`) are shape-only with explicitly no cross-field rule — a bug marked `status: triaged` with no `owner` set is not flagged here; that judgment call belongs to the triage loop, not this validator.
- `FOUND_AT_COMMIT_PATTERN` (`/^[0-9a-f]{7,40}$/`) accepts an abbreviated (7+ char) lowercase-hex sha, not only a full 40-char one — worth knowing before tightening it, since abbreviated shas are the common case in practice.
- `checkCompassHeading`'s disagreement-is-a-warning choice creates two different severities for what reads like the same "id mismatch" concern: filename↔id staying an error (checkRule/checkBug) versus H1-text↔id being only a warning — the split is deliberate (frontmatter `id` is the schema-authoritative field; H1 prose is not), not an inconsistency to "fix".

## Connections
Uses:
- src/schema/index-build.ts: `ProjectIndex`, `resolveId`, `resolveRelativePath`.
- src/schema/types.ts: `Violation` type.

Used by:
- src/loops/rule-decay.ts: reuses this module for the weekly rule-obsolescence loop.
- src/pulse/hygiene.ts: reuses compass validation logic in the deterministic hygiene sweep.
- src/schema/checks/devspec.ts: imports `globMatchesNothing` to validate dev-spec `governs` globs with the same zero-match-is-warning rule.
- src/schema/validate.ts: calls `checkRules`, `checkBugs`, and `checkCompassHeading`.
- tests/atomic/insight/session-observe.test.ts, tests/atomic/schema/bug-currency-check.test.ts, tests/atomic/schema/compass-heading.test.ts: dedicated and cross-cutting atomic coverage.
- tests/spec/insight/session-observe.spec.test.ts, tests/spec/pulse/thread-cli.spec.test.ts: integrated-slice coverage.

## Query pointers
If you need to understand the bug taxonomy or rule schema end to end, also read: `cortex-schema.md` §4.2/§4.3, src/schema/checks/devspec.ts (governs glob reuse), and the specflow-bugs skill (which files bugs into this ledger). If you need the bug-currency field contract specifically, also read: tests/atomic/schema/bug-currency-check.test.ts and spec `compass.bug-currency`.
