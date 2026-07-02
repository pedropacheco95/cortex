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

## Entities

- **READS:** session transcripts via the session-reading layer; `pulse/.distil-last-run` (timestamp memory); `pulse/dismissed.md` (suppression); cerebrum content (already-covered filter); `cortex.config.json` (`pulse.distilThresholdN`, default 3); `pulse/.suggestion-counter`.
- **WRITES:** `pulse/suggestions.md` (its report + proposal sections), `pulse/.distil-last-run`, `pulse/.suggestion-counter`, and the transient corpus file `pulse/.session-corpus.json` — nothing else.
- **CREATES:** proposals per schema §4.5 (single S-namespace, `**Source:**` provenance citing session ids).

## Rules

1. **Two deterministic halves, three entry modes.** `--collect` extracts messages since last run into `pulse/.session-corpus.json` (shared with skill-suggest, design §11.5). `--propose <candidates.json>` deterministically filters and writes proposals. Bare `cortex pulse-distil` = collect → spawn the Claude CLI headless for pattern judgment (the `core-cli.init` Rule 6 subprocess boundary; same failure semantics: `--no-llm`/absent/timeout → degrade with notice, auth → named) → propose. The scheduled task's skill (`skills/cortex-pulse-distil/SKILL.md`, shipped) runs collect, performs the judgment **itself** (it already is a Claude session — no nested subprocess), then runs propose.
2. **Candidate shape (the judgment output contract):** JSON list of `{pattern, occurrences, sessionIds, proposedTarget, proposedText, confidence}`. Propose validates the shape; malformed candidates are skipped and counted in the report.
3. **Deterministic filters in propose, in order:** (a) `occurrences >= distilThresholdN`; (b) not covered — `proposedText` (normalised) already present in cerebrum → dropped as covered; (c) not suppressed — a pattern whose normalised text matches an unexpired `dismissed.md` entry's recorded text is not re-proposed (design §10.3 rejection memory). Dropped counts appear in the report by reason.
4. **S-id allocation** via `pulse/.suggestion-counter` (schema §4.5): monotonic, never reused, shared with every proposing loop.
5. **Provenance mandatory:** every proposal's `**Source:**` cites `distil` plus the session ids the pattern was seen in; `**Target:**` must satisfy the review CLI's target roots.
6. **Always-write (§4.5):** every run overwrites `suggestions.md` with a fresh header; still-pending prior proposals whose pattern recurs are carried forward **with their original ids** (no id churn for the undecided); a quiet week reads "No new patterns this cycle."
7. **Timestamp memory:** a successful run records its moment in `pulse/.distil-last-run`; the next collect reads from there. First run bounds itself to the last 30 days (engineering call, footer-stated).
8. **Read-only beyond pulse** (design §10.6): never touches cerebrum, atlas, anatomy, or specs — proposals flow through the gate. Core halves are deterministic (R-001).

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

### Only pulse files written

- **Then** any run touches only `suggestions.md`, `.session-corpus.json`, `.distil-last-run`, `.suggestion-counter`

## Notes

- The end-to-end acceptance path (proposal → `pulse-accept` → cerebrum) is covered by `pulse.review-cli`'s tests; this spec owns production of valid §4.5 sections.
- The judgment prompt/skill body instructs conservative extraction (design §10.3: one-offs filtered, evidence cited) — prompt content is pinned by string assertions on the shipped SKILL.md, same convention as `atlas.ingest-skill`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
