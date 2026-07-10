---
path: src/hooks/pre-write.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 200
size_tokens: 1964
centrality: medium
built_at_commit: "8248c76"
source_sha256: "cbe69958f67544a50ae5d36fc8d9436eee0b48bdf72a85602a2fa75a435d9156"
---
# src/hooks/pre-write.ts

## Purpose
The PreToolUse Write|Edit hook — warns (never blocks) when a proposed write matches a compass rule. Predicate-bearing rules (`check.kind` regex/grep) warn only when the pattern actually fires on the proposed content within their `applies_to` scope (a governed path whose content passes is a silent pass, per the B-001 fix); predicateless rules fall back to the conservative `governs` path-match. Emits one formatted warning line per matching rule inside the pinned allow-envelope, and skips (while logging) any rule file it can't parse.

## Connections
Uses:
- src/hooks/errors.ts: `appendHookError` — logs malformed rule files and invalid check patterns
- src/hooks/session-start.ts: `HookRunResult`, `HookRunOptions` types only

Used by:
- src/hooks/cli.ts: dispatches `case 'pre-write'` to this module's `run`

## Insights

- Rule 4 warning is two-stage (fix for bug B-001): a rule with an evaluable `check:` predicate (regex/grep kind) warns only when that predicate actually fires on the proposed content within its `applies_to` scope; a predicateless rule (`check` absent, or kind `none`/`ast`) falls back to warning on bare path match. Path-match-always was the project's first dogfooding bug — it broke "silence is the normal case". (claude-sessions/pedropacheco1/75ef81a0-97bd-4fa1-8c2a-72ddb2d98405)
