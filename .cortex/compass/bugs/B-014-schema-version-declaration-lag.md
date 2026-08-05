---
id: B-014
title: The validator and init declared schema 3.0 while the contract had advanced to 3.3 — three MINORs of checks shipped under a stale version announcement
type: incomplete-rule
severity: medium
status: resolved
affects:
  - schema.version-2
  - src/schema/version.ts (SUPPORTED_MINOR)
  - src/cli/templates.ts (SCHEMA_VERSION)
  - cortex-schema.md §10.2, §10.3
resolved: 2026-08-05T00:00:00Z
opened: 2026-08-05T00:00:00Z
---

# B-014 — The declared schema version lagged the contract by three MINORs

## Evidence

Observed while reporting the Phase 5 round, verified 2026-08-05:

- `cortex-schema.md` header declared `**Schema version:** 3.3`, and the document
  describes three MINOR bumps in its own words: 3.1 (`insight/observations/`),
  3.2 (`archive/intent-register.yaml`), 3.3 (the `profile` config field plus the
  SessionStart entry line).
- `src/schema/version.ts` declared `SUPPORTED_MAJOR = 3`, `SUPPORTED_MINOR = 0`.
- `src/cli/templates.ts` `SCHEMA_VERSION = '3.0'`.
- `cortex validate` on this repository printed `Schema version: 3.0`.

Every check belonging to those three MINORs is implemented **and registered**:
`check.insight-observations` (3.1), `check.archive-intent-register` (3.2), and
`check.config`'s `profile` enum (3.3) all run today. So the binary enforced 3.3
while announcing 3.0.

**What happens:** `cortex validate` reports a contract version three MINORs
older than the one it implements, and `cortex init` scaffolds new projects with
`schemaVersion: "3.0"` and a `<!-- cortex:start v3.0 -->` CLAUDE.md block —
recording, in every new project, a version that misstates what the tooling does.

**What should happen:** the version the validator declares, the version init
scaffolds, and the version the contract declares are the same number.

**Impact is misreporting, not malfunction** — hence `medium`. No check behaved
incorrectly and no project validated wrongly: `§10.2`'s backward-compatibility
guarantee means a project declaring a MINOR at or below supported validates
clean, and the implementation has no branch on `minor < SUPPORTED_MINOR`. The
damage is to trust in the number: anyone reading `Schema version: 3.0` and
reasoning about which features are enforced reasons wrongly.

## Diagnosis (seven-type classification)

Root-cause investigation before classification (`specflow-bugs` Phase 1):

1. **Read the actual state.** Three declarations, read directly from source
   rather than inferred: doc header `3.3`, `SUPPORTED_MINOR = 0`,
   `SCHEMA_VERSION = '3.0'`.
2. **Reproduce.** `node dist/cli/cli.js validate` → `Schema version: 3.0`.
   Reproduced.
3. **What changed recently.** The 3.1 fold-in (`insight/observations/`), and
   this round's 3.2 and 3.3 bumps. Each edited `cortex-schema.md` and added its
   check; none touched `version.ts`. The lag predates this round — 3.1 shipped
   it — and this round widened it.
4. **Instrument the boundary.** Which side is wrong? `grep` for readers of
   `SUPPORTED_MINOR` shows exactly one behavioural consumer: `check.config`'s
   `minor > SUPPORTED_MINOR` forward-tolerance warning. Nothing reads it to
   decide *which checks run* — the checks are registered unconditionally in
   `validate.ts`. So the constants are a **declaration**, and the declaration
   was the wrong side.

Diagnostic-tree walk:

1. **Dev spec governing this behaviour?** YES — `schema.version-2`
   (`.specflow/specs/schema/version-2.spec.md`) governs `src/schema/version.ts`.
2. **Does the spec have a rule covering this case?** **NO.** Rule 2 pins one
   literal pair for one bump ("the validator declares `supportedMajor = 2`,
   `supportedMinor = 0`"). Nothing in the spec says the declaration must track
   the contract when the contract gains a MINOR, and nothing compares the three
   sources.

First NO at step 2 → **type: incomplete-rule**.

This is why it recurred silently three times: there was no rule to violate.

## Fix (rode this round)

1. `src/schema/version.ts`: `SUPPORTED_MINOR` 0 → 3, with the reason recorded
   in the file header.
2. `src/cli/templates.ts`: `SCHEMA_VERSION` `'3.0'` → `'3.3'`.
3. This project's own `.cortex/cortex.config.json` and its CLAUDE.md managed
   block marker moved to 3.3 — the same pair `cortex sync` moves together.
4. **The rule that was missing:** `schema.version-2` gains Rule 8, requiring the
   three declarations to agree and naming the test that enforces it.
5. **Regression test:** `tests/atomic/schema/version-agreement.test.ts` derives
   the version from `cortex-schema.md`'s header and asserts both constants match
   it, plus that no MINOR the document *describes* exceeds the supported MINOR.
   It contains no version literals, so a legitimate bump never needs to edit it —
   it fires only when the three disagree. Verified by reverting `SUPPORTED_MINOR`
   to 0: two assertions fail.

## Verification

- `pnpm test`: full suite green with the bump in place; the six assertions that
  pinned the declared version as a literal now derive it from the constants, so
  they will not re-break on the next MINOR.
- Backward compatibility confirmed by the existing fixtures: projects declaring
  `schemaVersion: "3.0"` still validate clean under the 3.3 validator, including
  `tests/spec/schema/version-2.spec.test.ts`'s `.specflow/`-rooted fixture.
- `cortex validate` on this repository: 0 errors, and now reports `3.3`.

## Notes

- Deliberately **not** changed: the `major < SUPPORTED_MAJOR` /
  `major > SUPPORTED_MAJOR` short-circuits and the `minor > SUPPORTED_MINOR`
  forward-tolerance warning. All three keep their existing semantics; this bug
  was about the value being declared, not the branches reading it.
- `§10.3`'s branch list omits `MAJOR ==, MINOR < supported` entirely. The
  behaviour is specified in `§10.2` ("a validator for 1.x MUST accept any 1.y
  project where y ≤ x cleanly") and implemented correctly by omission — no
  branch fires. Left as-is: adding the row to §10.3 is an editorial
  reconciliation with no behavioural consequence, and this bug is already
  carrying a version bump.
