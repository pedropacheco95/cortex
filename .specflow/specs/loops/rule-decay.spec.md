---
id: loops.rule-decay
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
implements: ../../specs-business/loops/developer-gets-upkeep-proposals-without-asking.business.md
governed_by:
  - R-001
governs:
  - "src/loops/rule-decay.ts"
  - "skills/cortex-loop-rule-decay/**"
---

# Rule-Decay Loop

## Intent

`cortex loop-rule-decay` (weekly, design §11.4 item 5) reviews every cerebrum rule for obsolescence signals and writes retirement candidates to `pulse/reports/rule-candidates.md`. Propose-don't-mutate: rules are retired by a human editing `status: retired`, never by this loop.

## Entities

- **READS:** `.cortex/cerebrum/rules/R-*.md` (frontmatter + git last-modified age); the filesystem (governs resolution); rule `source:` targets.
- **WRITES:** `.cortex/pulse/reports/rule-candidates.md` only.
- **CREATES:** the report per schema §4.5 (`kind: pulse-rule-candidates`, always-write).

## Rules

1. **Command + bundle.** `cortex loop-rule-decay` + shipped `skills/cortex-loop-rule-decay/SKILL.md` (registers the `rule-decay` task under `--partial`).
2. **Decay signals (v1):** per active rule — (a) every `governs:` glob matches zero on-disk files; (b) any `source:` no longer resolves; (c) the rule file is older than 180 days *and* signal (a) holds. Each candidate lists which signals fired and the evidence (the globs, the dead paths, the age).
3. **Already-retired rules are skipped** — the loop reviews the living.
4. **Always-write (schema §4.5):** no candidates → explicit "No retirement candidates this cycle."
5. **Read-only Core** (R-001): observes and proposes; never edits a rule.

## Acceptance Criteria

### Dead-governs rule proposed with evidence

- **Given** an active rule whose only `governs:` glob matches nothing on disk
- **When** the loop runs
- **Then** the report names the rule, quotes the glob, and states the zero-match signal

### Dead-source rule proposed

- **Given** an active rule whose `source:` names a deleted file
- **When** the loop runs
- **Then** the report names the rule and the unresolvable path

### Healthy rule stays silent

- **Given** a rule whose globs match files and sources resolve
- **When** the loop runs
- **Then** that rule does not appear among candidates

### Retired rules skipped

- **Given** a rule with `status: retired` and dead globs
- **When** the loop runs
- **Then** it does not appear

### Always-writes when clean

- **Given** only healthy rules
- **Then** the report exists with fresh `generated` and "No retirement candidates this cycle."

### Only the report is written

- **Given** any run
- **Then** the only file created or modified is `pulse/reports/rule-candidates.md`

## Notes

- Design's "violated recently without correction" signal needs violation telemetry that doesn't exist yet — deliberately out of v1; noted for when hook-warning history lands.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
