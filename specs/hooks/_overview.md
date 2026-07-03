# Hooks — Overview

## What this is

Claude Code hooks plus the git post-commit hook — runtime reinforcement at decision points. All pure Node.js file I/O, no network, and WARN-NEVER-BLOCK.

## What it covers

**Specs written:**

- `hooks.session-start` — minimal pointer injection + fresh-hygiene one-liner, `additionalContext` envelope, <100 tokens.
- `hooks.pre-write` — the high-value hook: cerebrum rule matching (`governs` globs + regex/grep `check:` predicates) with allow-plus-warn envelope; never blocks by construction.
- `hooks.post-write` — fast-tier anatomy row refresh (tokens/sha/last_seen + `needs_purpose_refresh`), always silent.

All three share: `cortex hook <name>` command signature as the ownership marker in `.claude/settings.json`, exit-0-always failure model, degradation logged to `pulse/hook-errors.md`, atomic + spec test layers only (journey deferred to v1.1 pending the test-runner loop).

- `hooks.pre-read-writeback` / `hooks.post-read` — the refine-during-use pair (opt-out via `hooks.preRead`): anatomy summary + conditional writeback invitation before a read; silent transcript sweep and `purpose_source: read-time` capture after.

_Planned coverage (not yet written):_

- The git post-commit hook — anatomy-refresh-fast (belongs to the loops build phase)

## Why it's grouped this way

Hooks are runtime reinforcement that fires at decision points, not the primary scaffolding. The primary scaffolding — CLAUDE.md and `_index.md` — lives in `scaffolding/`. Hooks deliberately never block and never touch the network; they only warn and refresh, so a hook failure can never stop work.

The `PreToolUse` Write/Edit hook reads cerebrum rules but does not own them; it is the enforcement *trigger*, while the rules themselves live in `cerebrum/`.

## Related groups

- Business outcomes for this domain: `../../specs-business/hooks/`
- Primary scaffolding (templates): `../scaffolding/`
- Rules checked at write time: `../cerebrum/`
- Anatomy refresh target: `../anatomy/`
