---
path: src/schema/checks/claude-md.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 95
size_tokens: 897
centrality: medium
built_at_commit: "8248c76"
source_sha256: "5cf36c35fd83b5945b0ae0ed2ccd5759ce4f3269856670179dcfee251f435126"
---
# src/schema/checks/claude-md.ts

## Purpose
Validates the schema §8 "managed block" inside the project's root `CLAUDE.md` — the `<!-- cortex:start v1.0 --> ... <!-- cortex:end -->` region Cortex writes/updates during scaffolding. Checks that start/end markers are matched and correctly ordered, that a version is declared (either inline in the start marker or as a legacy `version:` line inside the block), and that the declared version matches `cortex.config.json`'s `schemaVersion`. Exports `readManagedBlockVersion`, a shared parse helper reused outside this file for the same marker/version logic without duplicating the regex.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.

Used by:
- src/loops/onboarding-drift.ts: reuses `readManagedBlockVersion` (not the check itself) to detect scaffolding drift between the on-disk CLAUDE.md and the expected schema version.
- src/schema/validate.ts: calls `checkClaudeMd(root, config)` as part of the full run.

## Query pointers
If you need to understand the managed-block contract end to end, also read: `cortex-schema.md` §8, and src/loops/onboarding-drift.ts (the other consumer of `readManagedBlockVersion`).
