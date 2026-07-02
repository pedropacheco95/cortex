---
id: hooks.session-start
status: implemented
depends_on:
  - core-cli.init
implements: ../../specs-business/hooks/assistant-gets-timely-guardrails.business.md
governed_by: []
---

# SessionStart Hook

## Intent

The SessionStart hook primes Claude with the *existence and location* of Cortex — a minimal pointer, never contents (design §5.1) — plus a one-line surface of the latest hygiene findings when a fresh report exists. It is the entry-point reinforcement of the CLAUDE.md scaffolding: cheap, every session, under 100 tokens.

## Entities

- **READS:** `.cortex/cortex.config.json` (schema version, `pulse.hygieneFreshnessHours`); `.cortex/_index.md` (presence only); the `.cortex/` module directories (presence, for `{{PRESENT_MODULES}}`); `.cortex/pulse/hygiene-report.md` (frontmatter `generated` + a one-line summary). It never runs hygiene — it reads the existing report (design §10.4).
- **WRITES:** `.cortex/pulse/hook-errors.md` (append, only on internal error).
- **CREATES:** nothing.

## Rules

1. **Invocation.** Registered by `cortex init` as `{"type": "command", "command": "cortex hook session-start", "timeout": 10}` under the `SessionStart` event. The exact command prefix `cortex hook ` is the **Cortex-ownership marker** (the JSON transposition of the CLAUDE.md marker idiom): tooling that manages hook entries touches only entries whose command starts with that signature, never user entries.
2. **Envelope (pinned to the Claude Code hooks API).** Output is exit 0 + stdout JSON `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "<payload>"}}`. The payload text is schema §5's SessionStart block, under 100 tokens. No other envelope form; never plain-stdout injection (deterministic shape beats the raw-stdout fallback).
3. **Hygiene line.** Included iff `.cortex/pulse/hygiene-report.md` exists and its `generated` is within `pulse.hygieneFreshnessHours` (default 48) of now. Stale or missing report → pointer block only, no hygiene line.
4. **All session sources.** The hook injects on every `source` (`startup`, `resume`, `clear`, `compact`) — the payload is cheap and `clear`/`compact` wipe or shrink prior context.
5. **Silent when Cortex is absent.** No `.cortex/cortex.config.json` in `cwd` → exit 0, empty stdout, no pulse write (the project simply isn't initialised).
6. **Warn-never-block, self-applied.** Any internal error (malformed config, unreadable report) degrades: inject whatever part of the payload is still derivable (at minimum the pointer line), append a structured entry to `.cortex/pulse/hook-errors.md`, and exit 0. The hook never exits 2, never exits non-zero, never throws to the runner.
7. **Deterministic and offline.** Pure Node file I/O; no network, no LLM, no subprocess.

## Acceptance Criteria

### Fresh hygiene report → pointer plus one-line summary

- **Given** an initialised project whose `pulse/hygiene-report.md` has `generated` 3 hours ago
- **When** the hook runs with stdin `{"hook_event_name": "SessionStart", "source": "startup", "cwd": <project>}`
- **Then** stdout is exit-0 JSON with `hookSpecificOutput.hookEventName` = `"SessionStart"`
- **And** `additionalContext` contains the Cortex pointer, the present modules, and a hygiene line referencing `.cortex/pulse/hygiene-report.md`

### Stale report → pointer only

- **Given** the same project but `generated` 80 hours ago (freshness window 48)
- **When** the hook runs
- **Then** `additionalContext` contains the pointer block and no hygiene line

### Uninitialised project → fully silent

- **Given** a `cwd` with no `.cortex/` directory
- **When** the hook runs
- **Then** the exit code is 0 and stdout is empty

### Malformed hygiene report degrades to pointer

- **Given** a `hygiene-report.md` whose frontmatter is unparseable
- **When** the hook runs
- **Then** `additionalContext` still carries the pointer block, exit code 0
- **And** `.cortex/pulse/hook-errors.md` gains an entry naming the hook, the file, and the parse failure

### Payload respects the token budget

- **Given** any initialised project
- **When** the hook runs
- **Then** `additionalContext` is under 100 tokens (chars/4 estimate), per schema §5

## Notes

- Envelope pinned against the Claude Code hooks API as documented 2026-07-02 (SessionStart JSON `additionalContext`). Plain stdout also injects for SessionStart, but the JSON form is pinned for shape-stability.
- Journey-layer tests deferred to v1.1 — exercising a real Claude Code session is heavy without the test-runner loop; atomic + spec layers cover this hook now (deliberate deferral).
