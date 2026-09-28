---
path: src/schema/checks/hooks.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 3
size_lines: 98
size_tokens: 1174
centrality: low
built_at_commit: "a66041b"
source_sha256: "65f5d7e11d23dc77d644ed94442eddbb4e07d4f977342dadd2ddda7cfa1e70aa"
---
# src/schema/checks/hooks.ts

## Purpose
Implements `check.hook-config` (schema §5): validates that `.claude/settings.json` carries the hook entries Cortex's own `cortex sync` is expected to have written. The Read pair (`cortex hook pre-read` / `cortex hook post-read`) must be present TOGETHER if and only if `cortex.config.json`'s `hooks.preRead` is true, which is the §10.1 default (so an explicit `false` is required to opt out; if `preRead` is false but either Read-pair entry is still present, that's also an error — the pair is removed together with the flag). Independently, whenever settings.json carries ANY Cortex-owned hook entry at all (detected via the shared `cortex hook ` string marker), the whole required set must be present together: `SessionEnd` (`cortex hook session-end`), `Stop` (`cortex hook stop`), the `PreToolUse` `Grep|Bash` row (`cortex hook search-annotate`), and the `UserPromptSubmit` row (`cortex hook prompt-route`, no matcher) — none of these four are gated by `hooks.preRead` or `hooks.readDefer`. Detection throughout is string-based (`JSON.stringify(settings['hooks']).includes(...)`) rather than structural JSON parsing, keyed on the `cortex hook ` command-ownership marker so user-owned custom hooks sharing the same settings file are never misidentified as Cortex's.

## Main players
- `checkHookConfig` (lines 22–97) — the single exported function; takes the already-parsed `cortex.config.json` object alongside `root`, reads `.claude/settings.json` itself, and returns all violations. [critical]

## Insights
- Detection is deliberately string-based rather than a structural walk of the hooks JSON — per the file's own docstring, this is so a `timeout` field or other extra keys on a hook entry are neither required nor rejected, and so user-owned hooks sharing the file are never misidentified as Cortex's just because they happen to share a matcher.
- The four-entry "whole set" requirement (SessionEnd, Stop, search-annotate, prompt-route) accreted across three separate schema revisions — SessionEnd+Stop at 3.3 third revision, search-annotate at 3.4 second revision, prompt-route at 3.4 third revision — each simply appended to the same `required` array (lines 78–83) rather than triggering a redesign; this file's growth from ~63 to 98 lines directly traces that append-only history, which is why it was promoted from extraction level 2 to level 3 this cycle.
- `hooks.readDefer` registers NO separate hook entry of its own — it's purely a mode flag read by the existing pre-read hook implementation, so it never appears in this file's `required` list or its Read-pair detection; only `hooks.preRead` and the presence of any `cortex hook ` string gate anything here.
- A syntactically broken `.claude/settings.json` produces ZERO violations from this check (the `try/catch` around `JSON.parse` just returns the accumulated-so-far `violations` array, silently) — a corrupt settings file's own JSON error would need to surface elsewhere, not from this check.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.
(No other project-internal imports — reads `.claude/settings.json` directly via `fs`.)

Used by:
- src/schema/validate.ts: calls `checkHookConfig(root, config)`, passing the config object `checkConfig` already parsed.
- tests/atomic/schema/hook-config.test.ts: the dedicated atomic-layer test.

## Query pointers
If you need to understand what `cortex sync` actually writes into `.claude/settings.json` (this file only detects presence, never registers anything itself), also read: the `cortex sync` command implementation and `cortex-schema.md` §5. If you need to modify which hook entries are required together, read the `required` array here (lines 78–83) alongside src/schema/checks/config.ts's `hooks.preRead`/`hooks.readDefer` validation, since those two flags gate a subset of this same entry set.
