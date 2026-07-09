---
id: pulse.distil
status: implemented
depends_on:
  - loops.session-reading
  - pulse.review-cli
  - core-cli.init
governs:
  - "src/pulse/distil.ts"
  - "skills/cortex-pulse-distil/**"
implements: ../../specs-business/loops/developer-benefits-from-what-past-sessions-taught.business.md
governed_by:
  - R-001
---

# Distil Loop

## Intent

`cortex pulse-distil` (weekly, design §10.3) turns what the developer keeps saying in sessions into cerebrum proposals: it reads this project's transcripts since the last run (via `loops.session-reading`), extracts recurring patterns — corrections, preferences, environment facts — and writes threshold-passing candidates as §4.5 proposal sections the pulse gate can accept. Deterministic bookends, agentic middle: Core collects and Core proposes; only the pattern judgment is LLM work.

Distil's judgment carries **two lenses** over the same corpus. The primary **rule lens** mines what the developer *said* (corrections/preferences/facts) into rule- and decision-shaped proposals. The **skill lens** (absorbed from the retired `loops.skill-suggest`, owner decision) mines what was repeatedly *done*: a workflow-shaped (not rule-shaped) pattern re-derived across sessions becomes a `skill-proposal`-typed suggestion. One loop, one corpus, one suggestions file — no second session reader. Distil rides the `weekly-curation` scheduled bundle (schema §9.1).

## Entities

- **READS:** session transcripts via the session-reading layer; `pulse/.distil-last-run` (timestamp memory); `pulse/dismissed.md` (suppression); cerebrum content (already-covered filter); existing `.claude/skills/` and the packaged `skills/` (skill-lens dedup — a workflow already covered by a skill is not re-proposed); `cortex.config.json` (`pulse.distilThresholdN`, default 3); `pulse/.suggestion-counter`.
- **WRITES:** `pulse/suggestions.md` (its report + proposal sections, both rule- and `skill-proposal`-typed), `pulse/.distil-last-run`, `pulse/.suggestion-counter`, and the transient corpus file `pulse/.session-corpus.json` — nothing else.
- **CREATES:** proposals per schema §4.5 (single S-namespace, `**Source:**` provenance citing session ids), including `skill-proposal`-typed suggestions whose `**Target:**` is a **new** `.claude/skills/<name>/SKILL.md`.

## Rules

1. **Two deterministic halves, three entry modes.** `--collect` extracts messages since last run into `pulse/.session-corpus.json` (the single session corpus — formerly shared with the retired `skill-suggest`, now distil's alone; design §11.5). `--propose <candidates.json>` deterministically filters and writes proposals. Bare `cortex pulse-distil` = collect → spawn the Claude CLI headless for pattern judgment (the `core-cli.init` Rule 6 subprocess boundary; same failure semantics: `--no-llm`/absent/timeout → degrade with notice, auth → named) → propose. The scheduled task's skill (`skills/cortex-pulse-distil/SKILL.md`, shipped) runs collect, performs the judgment **itself** (it already is a Claude session — no nested subprocess), then runs propose.
2. **Candidate shape (the judgment output contract):** JSON list of `{pattern, occurrences, sessionIds, proposedTarget, proposedText, confidence}`. Propose validates the shape; malformed candidates are skipped and counted in the report.
3. **Deterministic filters in propose, in order:** (a) `occurrences >= distilThresholdN`; (b) not covered — `proposedText` (normalised) already present in cerebrum → dropped as covered; (c) not suppressed — a pattern whose normalised text matches an unexpired `dismissed.md` entry's recorded text is not re-proposed (design §10.3 rejection memory). Dropped counts appear in the report by reason.
4. **S-id allocation** via `pulse/.suggestion-counter` (schema §4.5): monotonic, never reused, shared with every proposing loop.
5. **Provenance mandatory:** every proposal's `**Source:**` cites `distil` plus the session ids the pattern was seen in; `**Target:**` must satisfy the review CLI's target roots.
6. **Always-write (§4.5):** every run overwrites `suggestions.md` with a fresh header; still-pending prior proposals whose pattern recurs are carried forward **with their original ids** (no id churn for the undecided); a quiet week reads "No new patterns this cycle."
7. **Timestamp memory:** a successful run records its moment in `pulse/.distil-last-run`; the next collect reads from there. First run bounds itself to the last 30 days (engineering call, footer-stated).
8. **Read-only beyond pulse** (design §10.6): never touches cerebrum, atlas, anatomy, or specs — proposals flow through the gate. Core halves are deterministic (R-001).
9. **Skill lens (absorbed from `loops.skill-suggest`, owner decision).** Alongside the rule/decision judgment, distil's judgment classifies each threshold-passing repeated pattern by *shape*: a **rule-shaped** pattern (a correction/preference/fact — something the developer keeps *saying*) yields a rule- or decision-candidate as before; a **workflow-shaped** pattern (a multi-step workflow the assistant keeps re-deriving — something repeatedly *done*) yields a `skill-proposal`-typed suggestion whose fenced block is a complete draft `SKILL.md` (frontmatter + body) and whose `**Target:**` is a **new** `.claude/skills/<name>/SKILL.md`. The skill lens reuses the same threshold (`distilThresholdN`), the same shared S-namespace counter, the same dismissal suppression, and the same always-write output; it adds only the skill-dedup filter (a workflow already covered by an existing or packaged skill dir is dropped as covered). Skill *creation* still happens only via `pulse-accept` (the review CLI's new-skill-only target rule), never by this loop. The judgment proposes a skill-lens suggestion **instead of** a rule-candidate when the pattern is workflow-shaped, or **alongside** rule-candidates in the same run when both shapes appear.

## Acceptance Criteria

### Collect is project-scoped and windowed

- **Given** a fake home with transcripts for this project (2 sessions, one older than `.distil-last-run`) and a sibling project
- **When** `--collect` runs
- **Then** the corpus holds only the newer session's messages from this project

### Threshold filter honours config

- **Given** candidates with occurrences 2 and 3, and `distilThresholdN: 3`
- **When** `--propose` runs
- **Then** only the occurrences-3 candidate becomes a proposal; the report counts one dropped below-threshold

### Covered and dismissed candidates dropped

- **Given** one candidate whose text already sits in `environment.md` and one matching an unexpired dismissal
- **When** `--propose` runs
- **Then** neither becomes a proposal and the report counts each by reason

### Ids allocated from the shared counter, provenance attached

- **Given** `.suggestion-counter` reading 7 and two passing candidates
- **When** `--propose` runs
- **Then** the proposals are `S-008` and `S-009` with `**Source:**` citing distil and their session ids, and the counter reads 9

### Pending proposals keep their ids

- **Given** a pending `S-008` from last run whose pattern recurs in this run's candidates
- **When** `--propose` runs
- **Then** the new file carries the proposal still numbered `S-008`

### Subprocess degradation

- **Given** no claude binary and no `--no-llm`
- **When** bare `cortex pulse-distil` runs
- **Then** exit 0, the report states the judgment pass was skipped and collect output is retained for the scheduled skill run

### Workflow-shaped pattern becomes a skill-proposal, not a rule-candidate

- **Given** a cross-session pattern that is workflow-shaped rather than rule-shaped (a multi-step workflow re-derived in ≥ `distilThresholdN` sessions), with no existing or packaged skill already covering it
- **When** distil's judgment runs and `--propose` writes the results
- **Then** `suggestions.md` carries a `skill-proposal`-typed suggestion — not a rule-candidate — whose `**Target:**` is a **new** `.claude/skills/<name>/SKILL.md`, whose fenced block is a complete draft SKILL.md (`name:` matching the slug, non-empty description and body), drawing its S-id from the shared counter with `**Source:**` citing distil and the session ids
- **And given** a workflow already covered by an existing `.claude/skills/<name>/` (or packaged) skill, that candidate is dropped and counted as covered
- **And given** a run that surfaces both a rule-shaped and a workflow-shaped pattern, both a rule-candidate and a `skill-proposal` appear in the same `suggestions.md`

### Only pulse files written

- **Then** any run touches only `suggestions.md`, `.session-corpus.json`, `.distil-last-run`, `.suggestion-counter`

## Notes

- The end-to-end acceptance path (proposal → `pulse-accept` → cerebrum) is covered by `pulse.review-cli`'s tests; this spec owns production of valid §4.5 sections.
- The judgment prompt/skill body instructs conservative extraction (design §10.3: one-offs filtered, evidence cited) — prompt content is pinned by string assertions on the shipped SKILL.md, same convention as `atlas.ingest-skill`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
