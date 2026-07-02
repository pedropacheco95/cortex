---
id: pulse.review-cli
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
implements: ../../specs-business/pulse/developer-approves-what-the-system-proposes.business.md
governed_by:
  - R-001
governs:
  - "src/pulse/review.ts"
---

# Pulse Review CLI

## Intent

The pulse review CLI is the human gate of the propose-don't-mutate convention (design §10.3, §11.5): `cortex pulse-list` shows pending suggestions, `cortex pulse-accept <id>` applies one exactly as proposed, `cortex pulse-reject <id>` records a dismissal that suppresses re-proposal for the configured window. It is shared infrastructure — every current and future loop's suggestions flow through this one gate. Deterministic Core; no LLM.

## Entities

- **READS:** `.cortex/pulse/suggestions.md` (schema §4.5 suggestion format: `## S-NNN` sections with `**Target:**` and a fenced `**Proposed addition:**`); `.cortex/pulse/dismissed.md`; `.cortex/cortex.config.json` (`pulse.dismissedWindowDays`, default 90).
- **WRITES:** the accepted suggestion's `**Target:**` file (append the fenced block verbatim); `suggestions.md` (status annotation only); `dismissed.md` (rejection records). Nothing else, ever.
- **CREATES:** `dismissed.md` if absent (with its §4.5 header).

## Rules

1. **Commands.** `cortex pulse-list`, `cortex pulse-accept <S-NNN>`, `cortex pulse-reject <S-NNN>`. Exit codes: 0 success (including "nothing pending" and idempotent no-ops); 1 unknown id, malformed suggestion entry, or refused target.
2. **`pulse-list`** prints each **pending** suggestion — id, title, target, and the proposed block — excluding: entries with `**Status:** accepted|rejected`, and ids present in `dismissed.md` whose `**Expires:**` is in the future. An expired dismissal no longer suppresses (design §10.3: snooze, not ban).
3. **`pulse-accept`** appends the suggestion's fenced block **verbatim** (with a separating blank line) to its `**Target:**` file and annotates the entry `**Status:** accepted`. No reinterpretation, no reformatting — what was shown is what lands.
4. **Cerebrum-only targets.** A `**Target:**` outside `.cortex/cerebrum/` is refused (exit 1, naming the path) — the pulse pipeline may only ever grow curated knowledge (design §11.3 property 2; business Rule 3). The target file must already exist except for the cerebrum core files, which are created if absent.
5. **`pulse-reject`** annotates `**Status:** rejected` and appends a `dismissed.md` section (`**Dismissed:**` now, `**Expires:**` now + `pulse.dismissedWindowDays`).
6. **Idempotence.** Accept or reject on an already-decided id → notice + exit 0, no further change. Accept on a rejected id (or vice versa) → error exit 1 (a decision reversal is a human edit, not a CLI path).
7. **Blast radius.** A run touches at most: the one target file, `suggestions.md`, `dismissed.md`. Malformed entries are reported (exit 1 for the addressed id; skipped-with-notice in `pulse-list`) — never half-applied.
8. **Deterministic Core.** No LLM, no network, no subprocess (governed by R-001).

## Acceptance Criteria

### pulse-list shows pending only

- **Given** `suggestions.md` with `S-001` (pending), `S-002` (`**Status:** accepted`), and `S-003` pending but dismissed with `**Expires:**` tomorrow
- **When** `cortex pulse-list` runs
- **Then** the output contains `S-001` with its title, target, and proposed block, and neither `S-002` nor `S-003`

### Expired dismissal resurfaces

- **Given** `S-003`'s dismissal has `**Expires:**` yesterday
- **When** `cortex pulse-list` runs
- **Then** `S-003` appears as pending

### Accept applies the block verbatim

- **Given** `S-001` targeting `.cortex/cerebrum/environment.md` with a fenced block `Chrome profile: profile-X`
- **When** `cortex pulse-accept S-001` runs
- **Then** `environment.md` ends with exactly that text (separated by a blank line)
- **And** the `S-001` entry now carries `**Status:** accepted`
- **And** no other file changed

### Non-cerebrum target refused

- **Given** a suggestion targeting `src/schema/validate.ts`
- **When** `cortex pulse-accept` addresses it
- **Then** exit code 1, the message names the refused path, and no file changed

### Reject records the window

- **Given** config `pulse.dismissedWindowDays: 30`
- **When** `cortex pulse-reject S-001` runs
- **Then** `dismissed.md` gains an `S-001` section whose `**Expires:**` is 30 days after `**Dismissed:**`

### Deciding twice is safe

- **Given** `S-001` already accepted
- **When** `cortex pulse-accept S-001` runs again
- **Then** exit 0 with an "already accepted" notice and zero file changes
- **And** `cortex pulse-reject S-001` exits 1 (reversal is not a CLI path)

### Unknown id errors

- **When** `cortex pulse-accept S-999` runs against a suggestions file without it
- **Then** exit code 1 naming `S-999`

## Notes

- The suggestion entry format this CLI parses was locked in schema §4.5 as part of this round (standing authority: schema addition unblocking the current spec) — `**Target:**` + fenced `**Proposed addition:**` + optional `**Status:**`.
- v1 is accept-as-is or reject; editing-before-accept is deliberately out (business Out of Scope).
- Also supports: every loop that writes suggestions (`pulse.*`, future `cortex-loop-*`). Primary parent remains `pulse.developer-approves-what-the-system-proposes`.
