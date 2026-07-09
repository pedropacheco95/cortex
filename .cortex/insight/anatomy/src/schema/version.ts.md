---
path: src/schema/version.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 20
size_tokens: 211
centrality: medium
built_at_commit: "8248c76"
source_sha256: "661389d294b27569bb8c14851d5a6ea19c77d2d41d8ccb5cd93cee5dd93749a4"
---
# src/schema/version.ts

## Purpose
The single source of truth for the schema version this validator implements (schema §10.3, spec `schema.version-3`): `SUPPORTED_MAJOR` (currently 3), `SUPPORTED_MINOR` (currently 0), and the derived `SUPPORTED_VERSION` string (`"3.0"`). Pure constants, no I/O, no logic — every version-gate branch elsewhere in the validator reads these three exports rather than hardcoding version numbers.

## Connections
Uses:
- (none src-internal)

Used by:
- src/schema/checks/config.ts: compares `cortex.config.json`'s declared `schemaVersion` against these constants to gate the entire validation run.
- src/schema/validate.ts: uses `SUPPORTED_VERSION` to stamp the returned `ValidationReport.schemaVersion`.

## Query pointers
If you need to bump the schema version, also read: src/schema/checks/config.ts (the version-gate logic that consumes these constants) and the migration/build-order docs referenced in this file's own header comment (the "cerebrum→compass rename" bump was coupled to build-order-v3 step 2 / flag F1).
