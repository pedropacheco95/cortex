---
path: src/cli/profile.ts
extracted_at: 2026-08-06T00:00:00Z
extraction_level: 2
size_lines: 39
size_tokens: 393
centrality: medium
built_at_commit: "0998c19"
source_sha256: "8de6a5c0cb4804c4a5ca1516160072842a90af44ef755b57665292bddcae8315"
---
# src/cli/profile.ts

## Purpose
The single source of truth for the project's process profile (schema §10.1, spec `core-cli.init-profile`) — NEW file. Cortex Core is process-agnostic: the profile (`specflow` or `superpowers`) is recorded in `cortex.config.json` but never enforced by Core logic itself; its one consumer is scheduled-task scoping, which drops Bucket-3 spec-loop members (bug-triage, spec-drift, specflow-lint/verify, the whole test-runner bundle) when the profile is not `specflow`, while Bucket-1 knowledge loops (hygiene, insight-refresh, session-observe, distil, rule-decay, atlas-staleness, onboarding-drift) run under every profile. Exports `PROCESS_PROFILES` (the two-value enum), the `ProcessProfile` type, `DEFAULT_PROFILE` (`'specflow'`, used when the config predates the field or omits it), the `isProcessProfile` type guard, and `readProfile(root)` — a never-throws reader that degrades to the default on any unreadable/malformed config (`check.config` is what reports the malformation, not this reader). Pure constants and one lookup; no I/O beyond the one `readFileSync`, no LLM (RULES 3).

## Connections
Uses:
- (none src-internal — imports only `fs`/`path`)

Used by:
- src/cli/cli.ts: `PROCESS_PROFILES`, `isProcessProfile`, `ProcessProfile` — validates the `--profile <name>` CLI flag before passing it to `init()`
- src/cli/init.ts: `DEFAULT_PROFILE`, `ProcessProfile` — `freshConfig()` stamps the chosen (or default) profile into a new project's `cortex.config.json`
- src/cli/templates.ts: `ProcessProfile` (type only) — `ScheduledTask.profiles` and `scopeTaskToProfile()`'s parameter type
- src/cli/scaffold.ts: `readProfile` — `writeScheduledTasks` reads the project's profile to scope `SCHEDULED_TASKS` before writing payloads
- src/cli/sync.ts: `readProfile` — `syncScheduledTaskPayloads` reads the profile for the same scoping, plus removing orphaned payloads a profile switch excludes
- src/schema/checks/config.ts: `PROCESS_PROFILES`, `ProcessProfile` — validates `cortex.config.json`'s optional `profile` key is one of the two enum values
- src/hooks/session-start.ts: `readProfile` — `entryLineFor` only emits the `specflow-entry` re-arm line under the `specflow` profile

## Query pointers
- If you need to trace how the profile actually changes runtime behaviour (not just where it's read), read src/cli/templates.ts's `scopeTaskToProfile` — the one place a profile value changes what gets written.
- If you need the config-level validation contract, also read src/schema/checks/config.ts (the `profile` key's error/warning rules).
