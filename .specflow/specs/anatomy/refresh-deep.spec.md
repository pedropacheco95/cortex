---
id: anatomy.refresh-deep
status: implemented
depends_on:
  - anatomy.scanner
  - anatomy.refresh-fast
  - core-cli.init
implements: ../../specs-business/anatomy/contributor-gets-a-legible-codebase.business.md
governed_by:
  - R-001
---

# Anatomy Refresh — Deep Tier

> **SUPERSEDED at v3 (build-order-v3 step 7; design §5.10, §8.3).** The
> anatomy module this spec describes is retired: `.cortex/anatomy/` no longer
> exists and its role is absorbed into `insight/` — the file listing and
> structural graph are insight **L1** output, purpose lines are **L2** per-file
> entries, `spec_links`/`governs:` resolution lives in the entries' Connections
> section, and `purpose_source` became insight extraction metadata (read-time
> purpose capture now writes read-time-tagged provenance into the entries).
> The deep purpose-filler is replaced by the daily/full insight refresh loops
> (insight.refresh-loops); the `anatomy-refresh-deep` scheduled task is
> deregistered (schema §9.1 — fourteen tasks) and the
> `cortex-loop-anatomy-refresh` skill bundle deleted. The former `governs:`
> targets no longer exist, so the list is removed. Retained for lineage.

## Intent

`cortex loop-anatomy-refresh --deep` (daily, design §11.4 item 4) is the purpose-filler: it gathers every row flagged `needs_purpose_refresh: true`, batches them (~25 files with head excerpts), obtains one-line purposes from the agentic layer, and writes them back — clearing flags, atomically with `last_seen`. It is the Skill that `cortex init`'s inline pass invokes (`core-cli.init` Rule 6), finally closing the day-1 "every file has a purpose" promise. Same deterministic-bookends shape as distil.

## Entities

- **READS:** `.cortex/anatomy/files.md` (flagged rows); the flagged files' head content (first ~60 lines per file, excerpt budgeted); results JSON.
- **WRITES:** `.cortex/anatomy/files.md` (flagged rows only); `pulse/.purpose-worklist.json`. Nothing curated, ever (see refresh-fast Notes).
- **CREATES:** the worklist batches.

## Rules

1. **Bookends + bundle.** `--collect` writes batched worklist entries `{path, tokens, excerpt}` (~25 per batch, design §7.2); `--apply <results.json>` writes purposes back. Bare `cortex loop-anatomy-refresh --deep` = collect → headless-claude judgment (init Rule 6 semantics: `--no-llm`/absent/timeout degrade with flags intact, auth → exit 3 named) → apply. The shipped `skills/cortex-loop-anatomy-refresh/SKILL.md` (satisfying the `anatomy-refresh-deep` task's `requiredSkills`, and the skill init's subprocess prompt names) does judgment in-session over the worklist, then `--apply`.
2. **Result shape:** `{path, purpose}` per file. Apply validates: purpose non-empty, single line, sanitized to the row grammar, capped ~120 chars (scanner Rule 5 conventions); invalid results skipped and counted; unknown paths skipped and counted.
3. **Apply semantics.** Only rows still flagged AND whose `sha256` still matches the collect-time hash are written (a file changed mid-flight keeps its flag for the next cycle); written rows get the purpose, `needs_purpose_refresh: false`, and `last_seen` — **atomically, per the coordination pin** (refresh-fast Rule 4 applies identically here).
4. **One pass per run** regardless of backlog: collect takes everything currently flagged; apply consumes what the judgment returned; remainder stays flagged for the next cadence (design §11.4: one pass per day regardless of commit volume).
5. **Deterministic Core bookends** (R-001); emitted `files.md` still passes `check.anatomy-files`; a run's writes are confined to `.cortex/anatomy/files.md` + the worklist.
6. **Nothing flagged → stated no-op:** collect writes an empty worklist and bare mode exits 0 without spawning the subprocess.

## Acceptance Criteria

### Collect batches flagged rows with excerpts

- **Given** 60 flagged rows
- **When** `--collect` runs
- **Then** the worklist holds 3 batches of ≤25, each entry carrying path and a head excerpt

### Apply fills, clears, and stamps atomically

- **Given** a flagged row and a valid result
- **When** `--apply` runs
- **Then** the row carries the purpose, `needs_purpose_refresh: false`, fresh `last_seen`, unchanged `sha256` — one coherent row write

### Mid-flight change keeps the flag

- **Given** a file whose content changed after collect (hash mismatch)
- **When** `--apply` runs with a result for it
- **Then** the row is untouched and still flagged, counted as deferred

### Invalid results skipped

- **Given** results with an empty purpose, a multi-line purpose, and an unknown path
- **Then** all three are skipped and counted; valid siblings still applied

### Nothing flagged → no subprocess

- **Given** zero flagged rows
- **When** bare mode runs
- **Then** exit 0, no claude invocation, a stated empty worklist

### Degradation preserves flags

- **Given** no claude binary
- **When** bare mode runs
- **Then** exit 0 with notice; every flag intact for the scheduled skill run

## Notes

- This Skill is what `core-cli.init` Rule 6 spawns inline — after this round, a fresh `cortex init` (without `--no-llm`) delivers complete day-1 purposes end-to-end for the first time.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
