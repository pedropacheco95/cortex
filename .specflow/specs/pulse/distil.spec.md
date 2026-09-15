---
id: pulse.distil
status: implemented
depends_on:
  - loops.session-reading
  - pulse.review-cli
  - core-cli.init
governs:
  - "src/pulse/distil.ts"
  - "skills/cortex-loop/references/distil.md"
implements: ../../specs-business/loops/developer-benefits-from-what-past-sessions-taught.business.md
governed_by:
  - R-001
---

# Distil Loop

## Intent

`cortex pulse-distil` (weekly, design §10.3) turns what the developer keeps saying in sessions into cerebrum proposals: it reads this project's transcripts since the last run (via `loops.session-reading`), extracts recurring patterns — corrections, preferences, environment facts — and writes threshold-passing candidates as §4.5 proposal sections the pulse gate can accept. Deterministic bookends, agentic middle: Core collects and Core proposes; only the pattern judgment is LLM work.

Alongside its own corpus scan, distil's judgment now also reads `.cortex/insight/observations/` (new at schema 3.1, §4.10.11) — the session-learned project-context surface `insight.session-observe` writes ungated, one entry per theme. Each entry's `sessions:` field is a provenance trail of every session that stated or re-confirmed it, and that trail *is* the recurrence signal distil's rule lens already looks for elsewhere in the corpus. This is the resolved boundary between the two loops (`insight.session-observe` Rule 8): session-observe captures in-context, per-session; distil reads the same evidence trail for cross-session recurrence and proposes graduation through the same gate — no second mechanism, no separate already-covered index for this case.

Distil's judgment carries **two lenses** over the same corpus. The primary **rule lens** mines what the developer *said* (corrections/preferences/facts) into rule- and decision-shaped proposals. The **skill lens** (absorbed from the retired `loops.skill-suggest`, owner decision) mines what was repeatedly *done*: a workflow-shaped (not rule-shaped) pattern re-derived across sessions becomes a `skill-proposal`-typed suggestion. One loop, one corpus, one suggestions file — no second session reader. Distil rides the `weekly-curation` scheduled bundle (schema §9.1).

## Entities

- **READS:** session transcripts via the session-reading layer; `.cortex/insight/observations/*.md` (the `sessions:` provenance trail on each entry — the shared evidence surface with `insight.session-observe`, schema §4.10.11; tolerant of the directory being absent); `pulse/state/distil-last-run` (timestamp memory); `pulse/dismissed.md` (suppression); compass content (already-covered filter); existing `.claude/skills/` and the packaged `skills/` (skill-lens dedup — a workflow already covered by a skill is not re-proposed); `cortex.config.json` (`pulse.distilThresholdN`, default 3); `pulse/state/suggestion-counter`.
- **WRITES:** `pulse/suggestions.md` (its report + proposal sections, both rule- and `skill-proposal`-typed), `pulse/state/distil-last-run`, `pulse/state/suggestion-counter`, and the transient corpus file `pulse/state/session-corpus.json` — nothing else.
- **CREATES:** proposals per schema §4.5 (single S-namespace, `**Source:**` provenance citing session ids), including `skill-proposal`-typed suggestions whose `**Target:**` is a **new** `.claude/skills/<name>/SKILL.md`.

## Rules

1. **Two deterministic halves, three entry modes.** `--collect` extracts messages since last run into `pulse/state/session-corpus.json` (the single session corpus — formerly shared with the retired `skill-suggest`, now distil's alone; design §11.5). `--propose <candidates.json>` deterministically filters and writes proposals. Bare `cortex pulse-distil` = collect → spawn the Claude CLI headless for pattern judgment (the `core-cli.init` Rule 6 subprocess boundary; same failure semantics: `--no-llm`/absent/timeout → degrade with notice, auth → named) → propose. The scheduled task's skill (`skills/cortex-loop/references/distil.md`, shipped) runs collect, performs the judgment **itself** (it already is a Claude session — no nested subprocess), then runs propose.
2. **Candidate shape (the judgment output contract):** JSON list of `{pattern, occurrences, sessionIds, proposedTarget, proposedText, confidence}`. Propose validates the shape; malformed candidates are skipped and counted in the report.
3. **Deterministic filters in propose, in order:** (a) `occurrences >= distilThresholdN`; (b) not covered — `proposedText` (normalised) already present in cerebrum → dropped as covered; (c) not suppressed — a pattern whose normalised text matches an unexpired `dismissed.md` entry's recorded text is not re-proposed (design §10.3 rejection memory). Dropped counts appear in the report by reason.
4. **S-id allocation** via `pulse/state/suggestion-counter` (schema §4.5): monotonic, never reused, shared with every proposing loop.
5. **Provenance mandatory:** every proposal's `**Source:**` cites `distil` plus the session ids the pattern was seen in; `**Target:**` must satisfy the review CLI's target roots.
6. **Always-write (§4.5):** every run overwrites `suggestions.md` with a fresh header; still-pending prior proposals whose pattern recurs are carried forward **with their original ids** (no id churn for the undecided); a quiet week reads "No new patterns this cycle."
7. **Timestamp memory:** a successful run records its moment in `pulse/state/distil-last-run`; the next collect reads from there. First run bounds itself to the last 30 days (engineering call, footer-stated).
8. **Read-only beyond pulse** (design §10.6): never touches cerebrum, atlas, anatomy, or specs — proposals flow through the gate. Core halves are deterministic (R-001).
9. **Observations-trail lens (schema §4.10.11).** Alongside the corpus-derived candidates, the judgment also considers each `.cortex/insight/observations/*.md` entry's `sessions:` trail as a distinct evidence source, reusing the **same** `distilThresholdN` this spec already applies to corpus occurrences (no separate config key introduced for this — the entry count against `sessions:` is compared against the identical threshold as any other recurring pattern, engineering call, footer-stated). An entry whose `sessions:` count meets or exceeds `distilThresholdN` yields a `rule-candidate` (or `decision-candidate`, by the same rule/decision judgment applied elsewhere) citing that entry's own `sessions:` list as `**Source:**` evidence, rather than distil re-deriving the pattern from a fresh corpus scan. An entry below threshold is left untouched — read as evidence, not proposed. This lens shares the rule lens's covered/dismissed/id-allocation machinery (Rules 3–4) unchanged; it adds only where the recurrence signal comes from.
10. **Skill lens (absorbed from `loops.skill-suggest`, owner decision).** Alongside the rule/decision judgment, distil's judgment classifies each threshold-passing repeated pattern by *shape*: a **rule-shaped** pattern (a correction/preference/fact — something the developer keeps *saying*) yields a rule- or decision-candidate as before; a **workflow-shaped** pattern (a multi-step workflow the assistant keeps re-deriving — something repeatedly *done*) yields a `skill-proposal`-typed suggestion whose fenced block is a complete draft `SKILL.md` (frontmatter + body) and whose `**Target:**` is a **new** `.claude/skills/<name>/SKILL.md`. The skill lens reuses the same threshold (`distilThresholdN`), the same shared S-namespace counter, the same dismissal suppression, and the same always-write output; it adds only the skill-dedup filter (a workflow already covered by an existing or packaged skill dir is dropped as covered). Skill *creation* still happens only via `pulse-accept` (the review CLI's new-skill-only target rule), never by this loop. The judgment proposes a skill-lens suggestion **instead of** a rule-candidate when the pattern is workflow-shaped, or **alongside** rule-candidates in the same run when both shapes appear.
11. **Shared corpus refresh and kind tagging (consumed by `insight.session-observe` Rules 11–12).** Two additions to the corpus machinery, neither of which changes Rule 1's since-window or Rule 7's `distil-last-run` memory: (a) every `CorpusSession` written by collect carries `kind: 'scheduled' | 'interactive'`, detected from the session's first `user` message (`scheduled` when it starts with `Base directory for this skill:` or contains `<scheduled-task`, else `interactive`); a corpus without `kind` still loads with each session read as `interactive`. (b) An exported `refreshCorpus` helper appends to an existing corpus every session whose transcript mtime is at-or-after the corpus's `generated` stamp (upsert by id, fresher messages replace older), re-stamps `generated`, and leaves `since` and `distil-last-run` alone. Distil's own `--collect` keeps rebuilding the corpus wholesale from `distil-last-run`; `refreshCorpus` exists so a more frequent reader (the daily session-observe loop) sees fresh sessions between distil's weekly rebuilds.

## Acceptance Criteria

### Collect is project-scoped and windowed

- **Given** a fake home with transcripts for this project (2 sessions, one older than `state/distil-last-run`) and a sibling project
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

- **Given** `state/suggestion-counter` reading 7 and two passing candidates
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

### An observations entry meeting the threshold graduates through the same gate

- **Given** an `.cortex/insight/observations/working-style.md` entry whose `sessions:` list holds `distilThresholdN` (default 3) or more distinct session ids, not yet reflected in any pending proposal
- **When** distil's judgment runs and `--propose` writes the results
- **Then** `suggestions.md` gains a `rule-candidate` (or `decision-candidate`, if the content is decision-shaped) whose `**Source:**` cites the entry's own `sessions:` ids
- **And** a sibling entry whose `sessions:` count is below `distilThresholdN` produces no proposal and is not counted as dropped-below-threshold noise — it simply isn't considered yet

### Workflow-shaped pattern becomes a skill-proposal, not a rule-candidate

- **Given** a cross-session pattern that is workflow-shaped rather than rule-shaped (a multi-step workflow re-derived in ≥ `distilThresholdN` sessions), with no existing or packaged skill already covering it
- **When** distil's judgment runs and `--propose` writes the results
- **Then** `suggestions.md` carries a `skill-proposal`-typed suggestion — not a rule-candidate — whose `**Target:**` is a **new** `.claude/skills/<name>/SKILL.md`, whose fenced block is a complete draft SKILL.md (`name:` matching the slug, non-empty description and body), drawing its S-id from the shared counter with `**Source:**` citing distil and the session ids
- **And given** a workflow already covered by an existing `.claude/skills/<name>/` (or packaged) skill, that candidate is dropped and counted as covered
- **And given** a run that surfaces both a rule-shaped and a workflow-shaped pattern, both a rule-candidate and a `skill-proposal` appear in the same `suggestions.md`

### Corpus refresh appends newer sessions without moving distil's window

- **Given** a corpus generated at T (`since` S, `state/distil-last-run` reading L) and a transcript directory holding one session with mtime before T and one with mtime after T
- **When** `refreshCorpus` runs
- **Then** the corpus gains only the newer session (one entry per id), `generated` advances past T, `since` still reads S, and `state/distil-last-run` still reads L
- **And** every session in the corpus — collected or refreshed — carries `kind`, read as `interactive` when a pre-existing corpus omitted it

### Only pulse files written

- **Then** any run touches only `suggestions.md`, `state/session-corpus.json`, `state/distil-last-run`, `state/suggestion-counter`

## Notes

- The end-to-end acceptance path (proposal → `pulse-accept` → cerebrum) is covered by `pulse.review-cli`'s tests; this spec owns production of valid §4.5 sections.
- The judgment prompt/skill body instructs conservative extraction (design §10.3: one-offs filtered, evidence cited) — prompt content is pinned by string assertions on the shipped SKILL.md, same convention as `atlas.ingest-skill`.
- **Judgment call:** Rule 9's observations-trail lens reuses `distilThresholdN` rather than introducing a second threshold config key. Schema §4.10.11 explicitly leaves the exact recurrence number to this spec ("may differ from the digest's display threshold") without mandating a new key exist — reusing the existing, already-tunable threshold keeps one number instead of two doing the same job (both are "how much recurrence counts as real"), and avoids a config key whose only difference from `distilThresholdN` would need its own justification.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
