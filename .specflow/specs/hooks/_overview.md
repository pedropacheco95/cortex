# Hooks — Overview

## What this is

Claude Code hooks plus the git post-commit hook — runtime reinforcement at decision points. All pure Node.js file I/O, no network, and WARN-NEVER-BLOCK — with the single measured exception RULES.md rule 6 names: `hooks.pre-read-writeback` Rule 7's default-off read-deferral gate.

## What it covers

**Specs written:**

- `hooks.session-start` — minimal pointer injection + fresh-hygiene one-liner, `additionalContext` envelope, <100 tokens.
- `hooks.pre-write` — the high-value hook: compass rule matching (`governs` globs + regex/grep `check:` predicates) with allow-plus-warn envelope; never blocks by construction.
- `hooks.post-write` — fast-tier anatomy row refresh (tokens/sha/last_seen + `needs_purpose_refresh`), always silent.

All three share: `cortex hook <name>` command signature as the ownership marker in `.claude/settings.json`, exit-0-always failure model, degradation logged to `pulse/reports/hook-errors.md`, atomic + spec test layers only (journey deferred to v1.1 pending the test-runner loop).

- `hooks.pre-read-writeback` / `hooks.post-read` — the refine-during-use pair (opt-out via `hooks.preRead`): anatomy summary + conditional writeback invitation before a read; silent transcript sweep and `purpose_source: read-time` capture after.

- `hooks.session-end` — the session record (recall work, step 1): at `SessionEnd`, one bounded deterministic read of the transcript writes `pulse/sessions/<id>.json` (open question or offer, approvals, findings, scratchpad artefact copies) and opens or answers `pulse/threads/` entries via `pulse.threads`. Injects nothing, ever; capture only.

- `hooks.search-annotate` — the search-time pointer (recall work, step 3): `PreToolUse` on `Grep|Bash`, reads `.cortex/recall-index.json` only, matches the search's target path and pattern tokens against the index's subjects and keywords, and injects at most two pointer lines (`Recall:` / `Decided:` — names, ids, dates, paths; never a body, never an instruction), ≤60 tokens, silent on no match and on every failure. Owns the shared query module (`src/recall/query.ts`) the other three consumers use. `hooks.pre-read-writeback` Rule 6 carries the sibling PreRead marker.

- `hooks.prompt-route` — open-thread prompt routing (recall work, step 4): `UserPromptSubmit`, no matcher, reads `pulse/threads/` (never the recall index) and surfaces open `question | offer | approval` threads as at most two `Open:` pointer lines — on a session's first prompt, the previous interactive session's hanging question (resumption); on any prompt, a thread it names by id or shares two words with (mention). Shares the search hook's per-session fired memory; harness-injected and scheduled prompts never fire; silent on every failure.

- `hooks.pre-read-writeback` Rule 7 — the read-deferral gate (step 4): behind `hooks.readDefer` (default off), the first Read of a source file with an insight entry may be answered with `permissionDecision: deny` carrying the entry's Purpose and Connections; the second Read always proceeds; never gated files, never scheduled sessions, 25-per-session circuit breaker, fail-open. Shipped for measurement (`pulse.usage` Rule 13), not as policy.

_Planned coverage (not yet written):_

- The git post-commit hook — anatomy-refresh-fast (belongs to the loops build phase)

## Why it's grouped this way

Hooks are runtime reinforcement that fires at decision points, not the primary scaffolding. The primary scaffolding — CLAUDE.md and `_index.md` — lives in `scaffolding/`. Hooks deliberately never block and never touch the network; they only warn and refresh, so a hook failure can never stop work. The one carve-out (the read-deferral gate) is default-off, denies at most once per file per session, and exists to measure whether a summary can stand in for a read — a hook *failure* still never stops work, because every failure path in that rule falls through to the ordinary payload.

The `PreToolUse` Write/Edit hook reads compass rules but does not own them; it is the enforcement *trigger*, while the rules themselves live in `compass/`.

## Related groups

- Business outcomes for this domain: `../../specs-business/hooks/`
- Primary scaffolding (templates): `../scaffolding/`
- Rules checked at write time: `../compass/`
- Anatomy refresh target: `../anatomy/`
