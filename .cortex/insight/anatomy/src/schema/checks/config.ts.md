---
path: src/schema/checks/config.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 2
size_lines: 126
size_tokens: 1127
centrality: medium
built_at_commit: "0998c19"
source_sha256: "a2115adada743b5cdd34172f1dc9d8bd5a286726a467ef2c6b43d43cb5de9e28"
---
# src/schema/checks/config.ts

## Purpose
Validates `.cortex/cortex.config.json` (schema §10) and gates the rest of the validator on the result: `checkConfig` confirms the file exists, is valid JSON, and carries a `schemaVersion` string, then compares its major/minor version against the compiled-in `SUPPORTED_MAJOR`/`SUPPORTED_MINOR` constants. A newer major version is a hard error (unsupported, upgrade the validator); an older major version errors too (needs `cortex migrate`); a newer minor version is only a warning (some features unvalidated). New (schema §10.1 v3.3): also validates the optional `profile` key — if present, it must be one of `PROCESS_PROFILES` (`specflow`/`superpowers`, imported from `src/cli/profile.ts`); absent is not a violation (defaults to `specflow`), but a present-and-unrecognised value is an error, not a warning, because a typo'd profile would silently schedule the wrong scheduled-task set rather than surface. It also flags unknown top-level config keys as warnings against a fixed known-keys list (now including `profile`), while explicitly tolerating the legacy v2.0 `anatomy`/`insight` keys with no warning so an unmigrated config doesn't churn on stale-key noise.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.
- src/schema/version.ts: `SUPPORTED_MAJOR`, `SUPPORTED_MINOR`, `SUPPORTED_VERSION` — the version gate this check enforces.
- src/cli/profile.ts: `PROCESS_PROFILES`, `ProcessProfile` — the enum the new `profile` key validation checks against.

Used by:
- src/schema/validate.ts: calls `checkConfig(root)` FIRST, before building the project index or running any other check — a failing major-version check short-circuits the entire validation run (see `validate.ts` lines 63–76).

## Query pointers
If you need to understand the version-gate short-circuit behavior, also read: src/schema/validate.ts (lines 63–76), and src/schema/version.ts (the single source of the supported version numbers — now at 3.3, see that file's own B-014 note). If you need the profile enum itself or how it changes scheduled-task output, also read src/cli/profile.ts and src/cli/templates.ts's `scopeTaskToProfile`.
