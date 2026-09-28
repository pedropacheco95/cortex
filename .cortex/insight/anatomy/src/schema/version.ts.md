---
path: src/schema/version.ts
extracted_at: 2026-09-22T09:54:56Z
extraction_level: 3
size_lines: 43
size_tokens: 559
centrality: high
built_at_commit: "a66041b"
source_sha256: "7a3ec56afa848ec4263348630158c396809e8fa8a71aeced4f61c6102c5c78d0"
---
# src/schema/version.ts

## Purpose
The single source of truth for the schema version this validator implements (schema §10.3, spec `schema.version-3`): `SUPPORTED_MAJOR` (3), `SUPPORTED_MINOR` (now **4**, was 3), and the derived `SUPPORTED_VERSION` string (now `"3.4"`). Pure constants, no I/O, no logic — every version-gate branch elsewhere in the validator reads these three exports rather than hardcoding version numbers. The 3→4 MINOR bump is recall step 2: `bears_on` (schema §6, the first forward edge), addressable clauses `schema:§N[.M[.K]]` (§6.2), `atlas/evidence/` (§4.3), the `evidence-candidate` suggestion type (§4.5.1), and the compiled `recall-index.json` (§4.11).

## Main players
- `SUPPORTED_MAJOR` (line 36) — the MAJOR version; unchanged at 3. [critical]
- `SUPPORTED_MINOR` (line 39) — bumped 3 → 4 this revision, so the validator now declares and enforces schema 3.4. [critical]
- `SUPPORTED_VERSION` (line 42) — derived `${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}` string, now `"3.4"`. [supporting]

## Insights
- **This bump is purely additive**, per the file's own header: a project still declaring `schemaVersion` 3.3 (or earlier, back through 3.0) continues to validate clean untouched — `check.config` only warns when the declared minor is *ahead* of `SUPPORTED_MINOR`, never behind — and `cortex sync` is the whole upgrade path (§10.4); there is no migration script and no skill-bundle chain entry for this bump.
- **Historical context (B-014, now resolved):** MINOR was previously pinned at 0 for three schema revisions (3.1–3.3) while the checks for those revisions were already implemented and registered in `validate.ts` — so the validator under-declared its own contract. That bug is what the file's much longer header comment documents; the fix pattern (bump on the same change that adds the checks) is what this 3→4 bump follows correctly.
- **Test-pinned three-way coupling still applies:** these constants, the `SCHEMA_VERSION` new projects are scaffolded with (`src/cli/templates.ts`), and the version `cortex-schema.md` declares in its own header must all agree — `tests/atomic/schema/version-agreement.test.ts` pins this invariant, so a future bump to any one of the three without updating the others fails a test rather than silently drifting the way B-014 did.
- The MAJOR bump to 3 (from 2, in an earlier change) was itself coupled to the `cerebrum`→`compass` rename and the decisions single-home migration (build-order-v3 step 2 / flag F1) — precedent recorded in the file's header for why a MAJOR bump is never a version-number-only change.

## Connections
Uses:
- (none src-internal)

Used by:
- src/schema/checks/config.ts: compares `cortex.config.json`'s declared `schemaVersion` against these constants to gate the entire validation run (major mismatch short-circuits; minor-ahead is a warning only).
- src/schema/validate.ts: uses `SUPPORTED_VERSION` to stamp the returned `ValidationReport.schemaVersion`.
- src/cli/sync.ts: imports `SUPPORTED_MAJOR` for its own Rule 2 major-version gate (refuses sync outright on either-direction MAJOR mismatch, before any other step).
- src/recall/index.ts: reads these constants when compiling/stamping `recall-index.json` (§4.11, new at 3.4) with a schema version.
- tests/atomic/recall/index.test.ts, tests/atomic/schema/version-agreement.test.ts, tests/spec/schema/validator.test.ts, tests/spec/schema/version-2.spec.test.ts: pin the version constants directly or exercise version-gate behaviour end-to-end.

## Query pointers
- If you need to bump the schema version again, also read: src/schema/checks/config.ts (the version-gate logic that consumes these constants), src/cli/templates.ts (`SCHEMA_VERSION`, the value new projects are scaffolded with), `cortex-schema.md`'s own header, and `tests/atomic/schema/version-agreement.test.ts` (the three-way pin that must stay green).
- If you need the full B-014 history (why the declaration lagged for three MINORs before this fix pattern was established), this file's own header comment is the primary source — no separate bug-ledger entry is referenced.
