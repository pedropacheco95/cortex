---
path: src/schema/version.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 3
size_lines: 35
size_tokens: 446
centrality: medium
built_at_commit: "0998c19"
source_sha256: "74fb930503d7325b4b6e647c7404fc3430d375025026ad18a46e914957a1e942"
---
# src/schema/version.ts

## Purpose
The single source of truth for the schema version this validator implements (schema §10.3, spec `schema.version-3`): `SUPPORTED_MAJOR` (3), `SUPPORTED_MINOR` (now **3**, was 0), and the derived `SUPPORTED_VERSION` string (now `"3.3"`). Pure constants, no I/O, no logic — every version-gate branch elsewhere in the validator reads these three exports rather than hardcoding version numbers. Triage verdict: significant, not cosmetic — the MINOR bump is a real behavioural change (it moves the `check.config` minor-version-ahead warning threshold, §4.10.3) and the file's doc comment grew substantially to explain a real bug (B-014) rather than just restate the constants.

## Main players
- `SUPPORTED_MAJOR` (line 29) — the MAJOR version; unchanged at 3. [critical]
- `SUPPORTED_MINOR` (line 32) — bumped 0 → 3 by this change (B-014 fix). [critical]
- `SUPPORTED_VERSION` (line 35) — derived `${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}` string, now `"3.3"`. [supporting]

## Insights
- **B-014 root cause, documented in the file's own header (lines 10–18):** the schema document (`cortex-schema.md`) advanced through 3.1 (`insight/observations/`), 3.2 (`archive/intent-register.yaml`), and 3.3 (the `profile` config field + the SessionStart entry line) while these constants stayed pinned at 3.0 — so `cortex validate` announced a contract three MINORs older than the one it actually implemented, and `cortex init` scaffolded new projects at a stale declared version. Every one of those three MINOR's checks was already implemented and registered in `validate.ts`; only the *declaration* lagged. This bump is the fix — declaration now matches reality, nothing else in the validator changed.
- A project still declaring `schemaVersion` 3.0/3.1/3.2 continues to validate clean after this bump: `check.config` only warns when the declared minor is *ahead* of `SUPPORTED_MINOR` (§10.2's backward-compatibility guarantee), never when it's behind — so raising `SUPPORTED_MINOR` from 0 to 3 does not retroactively break any already-conformant project; it only tightens what counts as "ahead."
- **Test-pinned coupling:** these three constants, the `SCHEMA_VERSION` new projects are scaffolded with (`src/cli/templates.ts`), and the version `cortex-schema.md` declares in its own header MUST all agree — `tests/atomic/schema/version-agreement.test.ts` pins this three-way invariant, so a future bump to any one of the three without updating the others fails a test rather than silently drifting again the way B-014 did.
- The MAJOR bump to 3 (from 2, in an earlier change) was itself coupled to the `cerebrum`→`compass` rename and the decisions single-home migration (build-order-v3 step 2 / flag F1) — the file's header records this as the precedent for why a MAJOR bump is never a version-number-only change.

## Connections
Uses:
- (none src-internal)

Used by:
- src/schema/checks/config.ts: compares `cortex.config.json`'s declared `schemaVersion` against these constants to gate the entire validation run (major mismatch short-circuits; minor-ahead is a warning only).
- src/schema/validate.ts: uses `SUPPORTED_VERSION` to stamp the returned `ValidationReport.schemaVersion`.
- src/cli/sync.ts: imports `SUPPORTED_MAJOR` for its own Rule 2 major-version gate (refuses sync outright on either-direction MAJOR mismatch, before any other step).

## Query pointers
- If you need to bump the schema version again, also read: src/schema/checks/config.ts (the version-gate logic that consumes these constants), src/cli/templates.ts (`SCHEMA_VERSION`, the value new projects are scaffolded with), `cortex-schema.md`'s own header, and `tests/atomic/schema/version-agreement.test.ts` (the three-way pin that must stay green).
- If you need the full B-014 history (why the declaration lagged for three MINORs), this file's own header comment (lines 1–26) is the primary source — no separate bug-ledger entry is referenced.
