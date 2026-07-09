---
path: src/schema/checks/hooks.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 63
size_tokens: 642
centrality: medium
built_at_commit: "8248c76"
source_sha256: "4b4aae360a570c971919a0ee012a5ec9230c4a4ced69b25b0dace4116f38d5cb"
---
# src/schema/checks/hooks.ts

## Purpose
Validates `check.hook-config` (schema §5): that the Read-pair hook entries (`cortex hook pre-read` / `cortex hook post-read`) are present together in `.claude/settings.json` if and only if `cortex.config.json`'s `hooks.preRead` is true — which defaults to true per §10.1, so an explicit `false` is required to opt out. Detection is string-based (`hooksJson.includes('cortex hook pre-read')`), keyed on the `cortex hook ` command-ownership marker so user-owned custom Read hooks in the same settings file are never misidentified as Cortex's.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkHookConfig(root, config)`.

## Query pointers
If you need to understand the pre-read/post-read hook pair's actual behavior (not just its config-presence check), also read the hook implementation registered under `cortex hook pre-read` / `cortex hook post-read` (outside this scope) and `cortex-schema.md` §5.
