---
id: loops.atlas-staleness
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
implements: ../../specs-business/loops/developer-gets-upkeep-proposals-without-asking.business.md
governed_by:
  - R-001
governs:
  - "src/loops/atlas-staleness.ts"
  - "skills/cortex-loop/references/atlas-staleness.md"
---

# Atlas-Staleness Loop

## Intent

`cortex loop-atlas-staleness` (monthly, design §11.4 item 6) reviews project memory for age and orphanhood and writes `pulse/reports/atlas-review.md`: old decisions the project still leans on get re-verification flags; sources nothing references get archival candidates. Propose-don't-mutate.

## Entities

- **READS:** `.cortex/atlas/**` artefacts (frontmatter dates, cross-refs); cerebrum rules' `source:` fields (who cites which atlas entries).
- **WRITES:** `.cortex/pulse/reports/atlas-review.md` only.
- **CREATES:** the report per schema §4.5 (`kind: pulse-atlas-review`, always-write).

## Rules

1. **Command + bundle.** `cortex loop-atlas-staleness` + shipped `skills/cortex-loop/references/atlas-staleness.md` (registers the `atlas-staleness` task under `--partial`).
2. **Staleness signals (v1):** (a) decisions older than 180 days that are still cited (by a rule's `source:` or another atlas entry) → **re-verify** candidates ("the project still leans on this — is it still true?"); (b) sources older than 180 days referenced by nothing → **archive** candidates; (c) atlas entries whose own cross-refs (`sources:`, `cerebrum_rules:`, `supersedes:`) no longer resolve → **dead-link** findings.
3. **An empty atlas is a clean run**, not an error: the report states it plainly.
4. **Always-write (schema §4.5):** explicit "No candidates this cycle." when quiet.
5. **Read-only Core** (R-001).

## Acceptance Criteria

### Old cited decision → re-verify with the citer named

- **Given** an atlas decision dated 200 days ago cited by a rule's `source:`
- **When** the loop runs
- **Then** the report flags it for re-verification and names the citing rule

### Old orphan source → archive candidate

- **Given** a 200-day-old source referenced by nothing
- **When** the loop runs
- **Then** the report lists it as an archive candidate

### Fresh entries stay silent

- **Given** a decision dated 10 days ago
- **Then** it does not appear

### Dead atlas cross-ref caught

- **Given** an atlas decision whose `sources:` names a deleted file
- **Then** the dead-link section names both ends

### Empty atlas is a stated clean run

- **Given** an atlas with only `_index.md` files
- **Then** the report says the atlas is empty and no candidates exist, exit 0

### Only the report is written

- **Then** the only file created or modified is `pulse/reports/atlas-review.md`

## Notes

- 180-day thresholds are engineering-call constants stated in the report footer.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
