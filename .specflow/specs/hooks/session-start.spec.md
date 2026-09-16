---
id: hooks.session-start
status: implemented
depends_on:
  - core-cli.init
implements: ../../specs-business/hooks/assistant-gets-timely-guardrails.business.md
governed_by: []
governs:
  - "src/hooks/session-start.ts"
---

# SessionStart Hook

## Intent

The SessionStart hook primes Claude with the *existence and location* of Cortex — a minimal pointer, never contents (design §5.1) — plus a one-line surface of the latest hygiene findings when a fresh report exists. It is the entry-point reinforcement of the CLAUDE.md scaffolding: cheap, every session, under 100 tokens.

## Entities

- **READS:** `.cortex/cortex.config.json` (schema version, `pulse.hygieneFreshnessHours`); `.cortex/_index.md` (presence only); the `.cortex/` module directories (presence, for `{{PRESENT_MODULES}}`); `.cortex/pulse/reports/hygiene.md` (frontmatter `generated` + a one-line summary); `.cortex/insight/observations/*.md` (new at 3.1, `hooks.session-start` Rule 4) — each entry's `kind`/`salient`/`sessions`/`updated` frontmatter plus the first line of body prose for the gist; tolerant of the directory being entirely absent. It never runs hygiene, and it never runs the session-observe loop — it only reads what each has already produced (design §10.4).
- **WRITES:** `.cortex/pulse/reports/hook-errors.md` (append, only on internal error).
- **CREATES:** nothing.

## Rules

1. **Invocation.** Registered by `cortex init` as `{"type": "command", "command": "cortex hook session-start", "timeout": 10}` under the `SessionStart` event. The exact command prefix `cortex hook ` is the **Cortex-ownership marker** (the JSON transposition of the CLAUDE.md marker idiom): tooling that manages hook entries touches only entries whose command starts with that signature, never user entries.
2. **Envelope (pinned to the Claude Code hooks API).** Output is exit 0 + stdout JSON `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "<payload>"}}`. The payload text is schema §5's SessionStart block, under 100 tokens for the pointer-plus-hygiene portion (Rule 3); the observations digest (Rule 4) is a **separately-budgeted** addition to the same payload, not counted against that 100-token figure (schema §4.10.11, §5). Two pools, no more — the 3.3 coverage map and rationalization table (Rules 10 and 11) were retired unbuilt at the 3.4 fourth revision. No other envelope form; never plain-stdout injection (deterministic shape beats the raw-stdout fallback).
3. **Hygiene line.** Included iff `.cortex/pulse/reports/hygiene.md` exists and its `generated` is within `pulse.hygieneFreshnessHours` (default 48) of now. Stale or missing report → pointer block only, no hygiene line.
4. **Observations digest (schema §4.10.11, new at 3.1).** When `.cortex/insight/observations/` exists, an entry **qualifies** for the digest when `salient: true` OR its `sessions:` count is ≥ 3. Qualifying entries render as compact one-liners (theme + gist, not full prose) inside a hard **≤150-token** budget, followed by one line pointing at `.cortex/insight/observations/` for the tail of non-qualifying entries. The directory being absent, or present with no qualifying entry, omits the digest line entirely — the same zero-overhead convention as the hygiene line (Rule 3) and the rule-warning hooks. The hook only reads existing entry files; it never runs `cortex-loop-session-observe` and never derives or stores an importance score of its own — qualification is read directly off each entry's own frontmatter.
5. **All session sources.** The hook injects on every `source` (`startup`, `resume`, `clear`, `compact`) — the payload is cheap and `clear`/`compact` wipe or shrink prior context.
6. **Silent when Cortex is absent.** No `.cortex/cortex.config.json` in `cwd` → exit 0, empty stdout, no pulse write (the project simply isn't initialised).
7. **Warn-never-block, self-applied.** Any internal error (malformed config, unreadable report, unparseable observation frontmatter) degrades: inject whatever part of the payload is still derivable (at minimum the pointer line), append a structured entry to `.cortex/pulse/reports/hook-errors.md`, and exit 0. The hook never exits 2, never exits non-zero, never throws to the runner.
8. **Deterministic and offline.** Pure Node file I/O; no network, no LLM, no subprocess.
9. **Entry line (schema §5, new at 3.3).** The pointer block carries one additional line that re-arms the process gate — `Entry: run \`specflow-entry\` first — classify the request, then run the skill it routes to.` — emitted **only** when `cortex.config.json` `profile` is `specflow` (§10.1, `core-cli.init-profile`) **and** `.claude/skills/specflow-entry/` exists. A `superpowers` project, or one that never installed the bundle, sees nothing: pointing at a skill the project does not have is noise, and a project on the other profile has no spec-first gate to re-arm. It rides inside the same <100-token pointer budget (Rule 3), never a second pool, and it is a **pointer, not enforcement** — Rule 7's warn-never-block is unchanged by it (`specflow.entry-gate`).

10. **Retired (2026-09-16; schema 3.4 fourth revision) — coverage map.** The 3.3 revision specified a generated, separately-budgeted (≤1,800 tok) map of what the knowledge layer holds in this payload (`scaffolding.coverage-map`). It was never implemented and is retired by `.cortex/atlas/decisions/2026-09-16-session-start-coverage-injection-retired.md`: coverage is delivered at the moment of need by the PreRead recall marker (`hooks.pre-read-writeback` Rule 6), the search-time pointer (`hooks.search-annotate`), the generated atlas index blocks (`recall.index-blocks`) and the prompt router (`hooks.prompt-route`). This hook emits no such section; the number is kept so cross-references resolve.

11. **Retired (2026-09-16; schema 3.4 fourth revision) — rationalization table.** The 3.3 revision specified a static ≤250-tok table answering the reasons a session skips Cortex, shipping only alongside Rule 10's map (`scaffolding.rationalization-table`). Retired unbuilt with the map, by the same decision; this hook emits no such section. The number is kept so cross-references resolve.

## Acceptance Criteria

### Fresh hygiene report → pointer plus one-line summary

- **Given** an initialised project whose `pulse/reports/hygiene.md` has `generated` 3 hours ago
- **When** the hook runs with stdin `{"hook_event_name": "SessionStart", "source": "startup", "cwd": <project>}`
- **Then** stdout is exit-0 JSON with `hookSpecificOutput.hookEventName` = `"SessionStart"`
- **And** `additionalContext` contains the Cortex pointer, the present modules, and a hygiene line referencing `.cortex/pulse/reports/hygiene.md`

### Stale report → pointer only

- **Given** the same project but `generated` 80 hours ago (freshness window 48)
- **When** the hook runs
- **Then** `additionalContext` contains the pointer block and no hygiene line

### Uninitialised project → fully silent

- **Given** a `cwd` with no `.cortex/` directory
- **When** the hook runs
- **Then** the exit code is 0 and stdout is empty

### Malformed hygiene report degrades to pointer

- **Given** a `reports/hygiene.md` whose frontmatter is unparseable
- **When** the hook runs
- **Then** `additionalContext` still carries the pointer block, exit code 0
- **And** `.cortex/pulse/reports/hook-errors.md` gains an entry naming the hook, the file, and the parse failure

### Payload respects the token budget

- **Given** any initialised project
- **When** the hook runs
- **Then** the pointer-plus-hygiene portion of `additionalContext` is under 100 tokens (chars/4 estimate), per schema §5, and the observations digest (when present) adds no more than 150 tokens of its own, per schema §4.10.11

### Qualifying observations render as a compact digest

- **Given** `.cortex/insight/observations/` holding `deployment.md` (`salient: true`) and `working-style.md` (`sessions:` with 3 entries), plus `audience.md` (`sessions:` with 1 entry, `salient: false`)
- **When** the hook runs
- **Then** `additionalContext` gains a compact one-liner each for `deployment.md` and `working-style.md` (theme + gist, not full prose), a single pointer line to `.cortex/insight/observations/` covering `audience.md` and any other non-qualifying entry, and the digest addition stays within its 150-token budget

### No qualifying observations omits the digest entirely

- **Given** `.cortex/insight/observations/` exists but every entry has `salient: false` and a `sessions:` count under 3
- **When** the hook runs
- **Then** `additionalContext` carries the pointer block (and hygiene line, if fresh) with no observations digest line at all

### The entry line is injected under the specflow profile

- **Given** a project whose config records `profile: specflow` and whose `.claude/skills/specflow-entry/` exists
- **When** the hook runs
- **Then** the payload contains the entry line naming `specflow-entry`, alongside the pointer and modules lines

### The entry line is omitted under another profile

- **Given** the same project recorded as `profile: superpowers`
- **When** the hook runs
- **Then** the payload contains no entry line, and the pointer and modules lines are unaffected

### The entry line is omitted when the skill is not installed

- **Given** a `specflow` project with no `.claude/skills/specflow-entry/`
- **When** the hook runs
- **Then** the payload contains no entry line — the hook never points at a skill that is absent

### Absent observations directory is silent, not an error

- **Given** a project with no `.cortex/insight/observations/` directory (the loop has never produced a project-context observation)
- **When** the hook runs
- **Then** `additionalContext` omits the digest entirely, no `hook-errors.md` entry is written for it, and the exit code is 0

### The payload carries no coverage map and no rationalization table (Rules 10 and 11 retired)

- **Given** a project with a populated `.cortex/` — rules, decisions, domain terms, insight concepts
- **When** the hook runs
- **Then** `additionalContext` carries the pointer block, any hygiene line and any observations digest, and no `## What Cortex holds here` or `## Before you grep for it` section
- **And** the payload's only separately-budgeted section is the observations digest

## Notes

- Envelope pinned against the Claude Code hooks API as documented 2026-07-02 (SessionStart JSON `additionalContext`). Plain stdout also injects for SessionStart, but the JSON form is pinned for shape-stability.
- The observations digest (Rule 4) is the one addition schema 3.1 makes to this hook (§4.10.11); the business outcome it serves — `insight.assistant-learns-from-sessions` — belongs to `insight.session-observe`, whose loop is the digest's sole content producer. This hook's own `implements:` stays pointed at `hooks.assistant-gets-timely-guardrails` (single-valued, unchanged) — the digest is one more whisper-only nudge in that outcome's existing terms, so no business-spec change was needed on this side of the addition.
- Rules 10 and 11 and their three acceptance criteria (map budget independence, map freshness, table presence) were specified in the 3.3 second revision and retired unbuilt on 2026-09-16 — see `.cortex/atlas/decisions/2026-09-16-session-start-coverage-injection-retired.md`. The criterion above replaces them; it asserts the payload shape the hook has always had.
- Journey-layer tests deferred to v1.1 — exercising a real Claude Code session is heavy without the test-runner loop; atomic + spec layers cover this hook now (deliberate deferral).
