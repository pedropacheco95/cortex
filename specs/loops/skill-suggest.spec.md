---
id: loops.skill-suggest
status: implemented
depends_on:
  - loops.session-reading
  - pulse.review-cli
  - pulse.distil
governs:
  - "src/loops/skill-suggest.ts"
  - "skills/cortex-loop-skill-suggest/**"
implements: ../../specs-business/loops/developer-benefits-from-what-past-sessions-taught.business.md
governed_by:
  - R-001
---

# Skill-Suggest Loop

## Intent

`cortex loop-skill-suggest` (weekly, design §11.4 item 12) is distil's workflow-mining sibling: where distil mines what the user *said*, skill-suggest mines what Claude *did* repeatedly — multi-step workflows re-derived across sessions that deserve to become one-invocation skills. Accepted proposals create a draft `SKILL.md` via the pulse gate. This is the loop that turns use into infrastructure.

## Entities

- **READS:** the shared session corpus (`pulse/.session-corpus.json`, produced by distil's collect — reused, not re-collected, design §11.5); existing `.claude/skills/` (dedup); `pulse/dismissed.md`; `pulse/.suggestion-counter`; `cortex.config.json` (`pulse.distilThresholdN` reused as the recurrence threshold).
- **WRITES:** `pulse/skill-suggestions.md`, `.suggestion-counter` — nothing else.
- **CREATES:** proposals per §4.5 whose `**Target:**` is a **new** `.claude/skills/<name>/SKILL.md` and whose fenced block is a complete draft SKILL.md (frontmatter + body).

## Rules

1. **Command + bundle.** `cortex loop-skill-suggest [--propose <candidates.json>]` + shipped `skills/cortex-loop-skill-suggest/SKILL.md` (registers the `skill-suggest` task under `--partial`). Same three entry modes and subprocess semantics as `pulse.distil` Rule 1; when the corpus file is absent, it invokes the shared collect first.
2. **Candidate shape:** `{workflowName, occurrences, sessionIds, draftSkillMd}`. Propose validates: `workflowName` is a valid skill dir slug; `draftSkillMd` parses with `name:` matching the slug and a non-empty description and body.
3. **Deterministic filters:** (a) `occurrences >=` threshold; (b) dedup — a skill dir of that name already existing in `.claude/skills/` (or shipping in the package `skills/`) drops the candidate as covered; (c) dismissal suppression as distil Rule 3(c). Counts reported by reason.
4. **S-ids from the shared counter; provenance mandatory** (`**Source:**` = skill-suggest + session ids).
5. **Always-write; pending ids carried forward** — identical conventions to distil Rules 6.
6. **Read-only beyond its pulse outputs**; Core halves deterministic (R-001). Skill *creation* happens only via `pulse-accept` (review CLI target rule), never by this loop.

## Acceptance Criteria

### Reuses the shared corpus

- **Given** a fresh `.session-corpus.json` from distil's collect
- **When** the loop runs
- **Then** it does not re-read transcripts (session-reading not invoked) and mines the corpus

### Valid skill draft proposed with new-file target

- **Given** a passing candidate `deploy-preview` with a well-formed draft
- **When** `--propose` runs
- **Then** `skill-suggestions.md` carries an S-section targeting `.claude/skills/deploy-preview/SKILL.md` whose fenced block is the complete draft

### Existing skill name dropped as covered

- **Given** a candidate named `cortex-ingest`
- **When** `--propose` runs
- **Then** it is dropped and counted as covered

### Malformed draft rejected

- **Given** a candidate whose draft lacks a `name:` or whose name mismatches the slug
- **Then** it is skipped and counted as malformed

### Drafts containing fences get a longer outer fence (B-003 regression)

- **Given** a passing candidate whose `draftSkillMd` contains a triple-backtick code example
- **When** `--propose` runs
- **Then** the emitted section wraps the payload in a fence longer than three backticks, per §4.5

### Shared counter, no collisions with distil

- **Given** distil proposals ending at `S-009`
- **When** skill-suggest proposes two
- **Then** they are `S-010` and `S-011`

### Only its own pulse files written

- **Then** any run touches only `skill-suggestions.md` and `.suggestion-counter`

## Notes

- The accept-side behaviour (new-skill-only creation) is `pulse.review-cli`'s Rule 4, tested there.
- Design question 16 (which namespace an accepted skill lands in) resolves as: wherever the proposal's target says — the drafting judgment picks project-local by default; the human can edit the target before accepting by editing the section (a human edit, sanctioned).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
