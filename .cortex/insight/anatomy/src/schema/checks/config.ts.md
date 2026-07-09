---
path: src/schema/checks/config.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 110
size_tokens: 930
centrality: medium
built_at_commit: "8248c76"
source_sha256: "b8a22181fc9152ed7d9254ba244cd8dab59946e180d8c3a6fc5f07017fe353bd"
---
# src/schema/checks/config.ts

## Purpose
Validates `.cortex/cortex.config.json` (schema §10) and gates the rest of the validator on the result: `checkConfig` confirms the file exists, is valid JSON, and carries a `schemaVersion` string, then compares its major/minor version against the compiled-in `SUPPORTED_MAJOR`/`SUPPORTED_MINOR` constants. A newer major version is a hard error (unsupported, upgrade the validator); an older major version errors too (needs `cortex migrate`); a newer minor version is only a warning (some features unvalidated). It also flags unknown top-level config keys as warnings against a fixed known-keys list, while explicitly tolerating the legacy v2.0 `anatomy`/`insight` keys with no warning so an unmigrated config doesn't churn on stale-key noise.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.
- src/schema/version.ts: `SUPPORTED_MAJOR`, `SUPPORTED_MINOR`, `SUPPORTED_VERSION` — the version gate this check enforces.

Used by:
- src/schema/validate.ts: calls `checkConfig(root)` FIRST, before building the project index or running any other check — a failing major-version check short-circuits the entire validation run (see `validate.ts` lines 63–76).

## Query pointers
If you need to understand the version-gate short-circuit behavior, also read: src/schema/validate.ts (lines 63–76), and src/schema/version.ts (the single source of the supported version numbers).
