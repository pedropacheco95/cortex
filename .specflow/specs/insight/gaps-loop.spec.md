---
id: insight.gaps-loop
status: implemented
depends_on:
  - insight.module-contract
  - schema.validator-insight-checks
  - insight.promotion-mechanism
  - insight.cli
  - loops.session-reading
  - pulse.distil
implements: ../../specs-business/insight/corrections-and-memory-reach-persistence.business.md
governed_by:
  - R-001
---

# Insight Gaps Loop — the session-observation capturer

> **SUPERSEDED at v3 (build-order-v3 step 5e; design §8.3, §9).** The v2
> mechanism this spec describes — the five-gap-signal classification writing
> `insight/map/*.md` prose — is retired: `src/insight/gaps.ts` and
> `skills/cortex-loop-insight-gaps/` are deleted and the scheduled task is
> deregistered (the former `governs:` targets no longer exist, so the list is
> removed). The session-observation ROLE survives and re-homes to
> `cortex-loop-session-observe` (build-order-v3 step 6), which will carry its
> own spec. Retained for lineage.

## Intent

`cortex-loop-insight-gaps` reads the previous window's session transcripts (via `loops.session-reading`) and classifies the evidence against exactly five gap signals (schema §4.10, v2 design §5), routing each to its destination: signals 1–3 and 4-in-insight are the loop's own observations landing in the loop's own ungated layer (direct prose writes to `insight/map/*.md`); signals 4-gated and 5 touch the gate (typed pulse proposals through `insight.promotion-mechanism`). It writes only `.md` in `map/` (plus the one file-list line in `insight/_index.md` on new-file creation) and never mutates gated content directly. It coordinates with distil so the two session readers never double-propose. Same deterministic-bookends idiom as distil; Core halves deterministic (R-001).

## Entities

- **READS:** session transcripts via `loops.session-reading` (this project only, daily window); `insight/map/*.md` (existing prose, for append-vs-create and signal-4 target location); `insight/_index.md` (file list); `pulse/dismissed.md` (suppression); `pulse/.suggestion-counter`; `cortex.config.json`.
- **WRITES:** `insight/map/*.md` (prose appends and signal-4 rewrites-in-place with `## Corrections` entries); the single new-file line in `insight/_index.md` when it creates a new prose file; `pulse/insight-gaps.md` (its report + `gated-layer-update`/`user-directed-capture` proposal sections); `pulse/.suggestion-counter`; the transient corpus. Never `.json`, never gated content directly.
- **CREATES:** new `map/<topic>.md` prose files (subject to §4.10.3 discipline); typed proposals per schema §4.5.1.

## Rules

1. **Two deterministic halves, three entry modes.** `--collect` gathers the transcript corpus (distil's corpus machinery, daily window). `--propose` (deterministic close) writes the prose appends/rewrites and routes gated material into `pulse/insight-gaps.md` proposal sections with S-ids from the shared counter. Bare `cortex loop-insight-gaps` = collect → headless-claude five-signal judgment (`core-cli.init` Rule 6 subprocess boundary; degrade with notice on `--no-llm`/absent/timeout, auth → named) → propose. The shipped `skills/cortex-loop-insight-gaps/SKILL.md` does the judgment in-session, then `--propose`.
2. **The five signals and their routes (schema §4.10, v2 design §5).** Signal 1 (investigation load), 2 (misjudgment), 3 (user explanation) → **direct prose append** to the appropriate `map/` file with a provenance trailer. Signal 4 (correction to existing knowledge) is **split by where the corrected content lives**: 4-in-insight → direct **rewrite-in-place** of the contradicted prose plus a `## Corrections` log entry; 4-in-gated (cerebrum/atlas/`RULES.md`) → a `gated-layer-update` **edit-typed** proposal (never a direct gated write). Signal 5 (memory-commit request) → a `user-directed-capture` proposal carrying the user's own words plus the loop's best-guess landing layer (human-editable). Evidence matching none of the five is reported and produces no write.
3. **Rewrite-in-place with the Corrections log (schema §4.10.1, Decision 16/OQ7).** For a signal-4-in-insight correction, the loop rewrites the contradicted text in place (so the file is currently-right) and, in the same write, appends one `## Corrections` entry preserving `**<iso-date>**`, `_was:_` (the exact prior assertion), `_now:_`, `_why:_`, and the session ids. This is the most autonomous write in the system; the log is the non-negotiable counterweight.
4. **Writes only `.md` in `map/` (schema §4.10.3, the coordination rule).** The write-target set is disjoint from the refresh loop's `.json` lane; `--propose` refuses any `.json` path (defence in depth). The one permitted write outside `map/` is the single file-list line in `insight/_index.md` when a new prose file is created.
5. **File-creation discipline (v2 design §4.2).** Before creating a new prose file for a new category, the loop reads the existing `map/*.md` list and `insight/_index.md` and prefers **appending to an existing file** over creating a near-duplicate (`setup.md` vs `environment-setup.md`). On creating a new file it adds the one line to `insight/_index.md`'s "What's here" list — bounded and mechanical.
6. **Gated material never written directly.** Signals 4-gated and 5 flow through `insight.promotion-mechanism`'s typed gate: `gated-layer-update` uses the edit payload (a correction to an existing rule/decision is an edit, not an append); `user-directed-capture` carries the user's words and a human-editable landing field. S-ids come from `pulse/.suggestion-counter` (shared, monotonic, never reused); provenance cites the sessions.
7. **Distil coordination (v2 design §6).** Two mechanisms prevent double-proposing: (a) the shipped distil skill is amended to **skip explicit memory-commit utterances** (signal-5 territory, already routed same-day by this loop); (b) distil's already-covered filter **extends to `insight/map/` prose** — a pattern already captured in insight is proposed by distil as a **`promotion`** of the existing insight content (referencing the insight file), not as fresh cerebrum text. This is the natural graduation path: gaps captures once, distil later detects repetition and proposes promotion.
8. **Deterministic Core bookends** (R-001): collect and propose are pure file I/O; only the five-signal classification is LLM work, never inside Core.

## Acceptance Criteria

### Signals 1–3 append prose autonomously

- **Given** a session where the user explained a deploy step not in any persistent layer (signal 3)
- **When** `--propose` runs
- **Then** the explanation is appended to `map/deploy.md` (or a new file, per §4.10.3 discipline) with a trailer `_(observed 2026-07-06, signal 3, sessions: sess-a1)_`, and no pulse proposal is written for it

### Signal 4-in-insight rewrites in place and logs

- **Given** `map/testing.md` asserting "tests run with npm test" and a session where the user corrects it to "tests run with pnpm test" (signal 4, content in insight)
- **When** `--propose` runs
- **Then** the asserting line is rewritten in place to the corrected text
- **And** a `## Corrections` entry is appended: `**2026-07-06** — _was:_ "tests run with npm test" · _now:_ "tests run with pnpm test" · _why:_ <user's words> · sessions: sess-b2`
- **And** no gated file and no `pulse/` proposal is touched

### Signal 4-in-gated becomes an edit-typed proposal, never a direct write

- **Given** a session where the user contradicts `rule:R-014` ("no camelCase columns") content Claude quoted (signal 4, content in cerebrum)
- **When** `--propose` runs
- **Then** `pulse/insight-gaps.md` gains an `S-060 **Type:** gated-layer-update` targeting `.cortex/cerebrum/rules/R-014-no-camelcase-columns.md` with a `**Proposed edit:**` (`current:`/`replacement:`)
- **And** the cerebrum rule file itself is unchanged (the gate applies it, not this loop)

### Signal 5 becomes a user-directed-capture with the user's words

- **Given** a session where the user says "remember this: we always deploy on Fridays" (signal 5)
- **When** `--propose` runs
- **Then** `pulse/insight-gaps.md` gains an `S-061 **Type:** user-directed-capture` whose proposed content is the user's own words and whose `**Target:**` is the loop's best-guess landing layer, human-editable before accept

### --propose refuses a JSON path (write-lane enforcement)

- **Given** the loop attempting to write `insight/map/graph.json`
- **When** `--propose` runs
- **Then** the `.json` write is refused (out-of-lane) — the gaps loop writes only `.md`

### New-file creation maintains the index

- **Given** no existing `map/` file fits a new "observability" category and the discipline permits a new file
- **When** `--propose` creates `map/observability.md`
- **Then** the single line for it is added to `insight/_index.md`'s "What's here" list, and no other file outside `map/` is touched

### Distil does not double-propose covered insight content

- **Given** a pattern already captured in `map/conventions.md` and distil's weekly run detecting its repetition
- **When** distil's already-covered filter runs
- **Then** distil proposes a `promotion` of the existing `map/conventions.md` content (referencing that file), not a fresh `rule-candidate`
- **And** an explicit memory-commit utterance in the same corpus is skipped by distil (routed by this loop's signal 5)

## Notes

- The asymmetry is the design: signals 1–3 and 4-insight are autonomous (the loop's own ungated layer); signals 4-gated and 5 touch the gate (proposals). One review queue, one S-namespace, one `dismissed.md` — no new gate (v2 design §5).
- The five-signal judgment prompt is pinned by string assertions on the shipped SKILL.md, same convention as distil; the distil-coordination amendments (Rule 7) are a change to the shipped distil skill, verified there.
- **OPEN:** gaps-loop window semantics (watermark vs wall-clock, schema Decision 20 / OQ5) are locked in this spec's implementation — the contract constrains only the outputs, not the window; the recommended disposition is watermark-based ("since the last successful gaps run"), with "previous 24h" describing the nominal cadence.
- Build-order §7 splits this into 7a (collect + five-signal judgment + prose writes + `_index.md` maintenance) and 7b (pulse routing + distil-coordination amendments); 7b depends on `insight.promotion-mechanism` being green.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
