---
path: src/schema/checks/config.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 3
size_lines: 224
size_tokens: 2261
centrality: medium
built_at_commit: "a66041b"
source_sha256: "fd4445d4e975deb72c0e8c991c922a5ce20e4e8cdd8ba97f7f453ee980886f57"
---
# src/schema/checks/config.ts

## Purpose
Validates `.cortex/cortex.config.json` (schema §10) and gates the rest of the validator on the result: `checkConfig` confirms the file exists, is valid JSON, and carries a `schemaVersion` string, then compares its major/minor version against the compiled-in `SUPPORTED_MAJOR`/`SUPPORTED_MINOR` constants (newer major = hard error/unsupported; older major = hard error/needs `cortex migrate`; newer minor = warning only, some features unvalidated). Also validates several optional §10.1 blocks, each following the same "absent is default, malformed is error" pattern: `profile` (must be in `PROCESS_PROFILES` when present — a typo'd profile would otherwise silently schedule the wrong task set); `hooks.readDefer` (must be boolean; `true` alongside `hooks.preRead: false` is a warning, since the Read pair entry `readDefer` modes into is itself removed by that flag); `visibility` (`{repo, allow}` — `repo` in `public|private|unknown`, `allow` a list of glob strings); `placement` (`{localNotesDir}` — a string). Unknown top-level keys are warnings against a fixed known-keys list, while the legacy v2.0 `anatomy`/`insight` keys are explicitly tolerated with no warning so an unmigrated config doesn't churn on stale-key noise.

## Main players
- `checkConfig` (lines 13–223) — the single exported function; returns a `ConfigResult` combining violations, the parsed config (or null), and a `majorOk` gate flag. [critical]
- `ConfigResult` interface (lines 7–11) — `{ violations, config, majorOk }`, the return shape callers use to decide whether to proceed with the rest of validation. [supporting]

## Insights
- This check runs before the project index is built and before any other check — a failing major-version check is designed to short-circuit the entire validation run via the `majorOk` flag on the returned `ConfigResult` (see src/schema/validate.ts for the actual short-circuit wiring).
- `hooks.readDefer: true` combined with `hooks.preRead: false` is only a WARNING, not an error — it's a dead-but-harmless flag combination (the mode lives inside the Read-pair entry that `preRead: false` removes), distinguished from a genuinely malformed `readDefer` value, which IS an error.
- The `visibility`/`placement` blocks are validated strictly (malformed = error) specifically because a typo'd nested key would otherwise silently leave a whole check (`check.visibility`) off with no signal — this is a stricter posture than the softer "unknown top-level key = warning" treatment given to the rest of the config.
- Legacy `anatomy`/`insight` keys are the ONLY two keys silently tolerated with zero violation (not even a warning) — every other unrecognized key warns; this asymmetry exists purely to avoid churn on an unmigrated v2 config while its real problems still surface.

## Connections
Uses:
- src/cli/profile.ts: `PROCESS_PROFILES`, `ProcessProfile` — the enum the `profile` key validates against.
- src/schema/types.ts: `Violation` type.
- src/schema/version.ts: `SUPPORTED_MAJOR`, `SUPPORTED_MINOR`, `SUPPORTED_VERSION` — the version gate this check enforces.

Used by:
- src/schema/validate.ts: calls `checkConfig(root)`.
- tests/atomic/schema/config-check.test.ts: the dedicated atomic-layer test.
- tests/spec/hooks/pre-read.test.ts: exercises the `hooks.readDefer`/`hooks.preRead` interaction specifically.

## Query pointers
If you need the version-gate short-circuit behavior itself, also read: src/schema/validate.ts and src/schema/version.ts (the single source of the supported version numbers). If you need the profile enum or how it changes scheduled-task output, also read src/cli/profile.ts and src/cli/templates.ts's `scopeTaskToProfile`. If you need the hook-registration side of `hooks.readDefer`/`hooks.preRead`, also read: src/schema/checks/hooks.ts (which validates the corresponding `.claude/settings.json` entries).
