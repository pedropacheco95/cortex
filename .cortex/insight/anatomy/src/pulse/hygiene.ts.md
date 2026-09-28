---
path: src/pulse/hygiene.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 3
size_lines: 607
size_tokens: 6317
centrality: high
built_at_commit: "a66041b"
source_sha256: "6c6e3e1ce91fc4d31c902a0bf7fd0a92f29b86e29b27ac14d844b7d12f794809"
---
# src/pulse/hygiene.ts

## Purpose

Implements `runHygiene`, the deterministic Core logic behind `cortex pulse-hygiene` (spec `pulse.hygiene`, design §10.2) — the daily sweep that surveys the project for unfinished or broken state and always writes exactly one report, `.cortex/pulse/reports/hygiene.md` (Rule 6 / design §11.3 property 2). It runs six independent checks — orphan local git branches, stale open PRs via `gh`, insight drift (staleness-ledger entries whose source file vanished from disk), compass dead references (`source:`/`governs:` fields that no longer resolve, reusing the validator's own resolution logic), spec orphans (dev specs whose `governs:` glob matches nothing), and aged TODO/FIXME comments (aged by the file's last git-commit date) — each rendered as a report section that is a skip notice, "No findings this cycle," or a bulleted findings list with a suggested next step. Beyond the checks, every sweep also performs three sanctioned in-place housekeeping passes that ride along with the read-only survey (Rules 7 and 8, schema §4.5.3): pruning aged per-session read ledgers, expiring open threads whose TTL has passed (a one-line frontmatter rewrite, never a delete — `pulse.threads` Rule 10), and deleting aged session records together with their scratch copies and orphaned Stop-companion files. Mid-conversation drop-off detection is explicitly deferred to the agentic layer and named as skipped in the footer. Deterministic Core (R-001): no LLM; git and gh are queried read-only via `execFile`.

## Main players

- `runHygiene` (lines 554–606) — critical. Orchestrates the six checks, the read-ledger retention pass, thread expiry, and session-record retention; renders the full report body and performs the sweep's single always-write via `writePulseReport`.
- `checkOrphanBranches` (lines 84–117) — supporting. Flags unmerged local git branches with no commits in `ORPHAN_BRANCH_DAYS`; skips gracefully outside a git repo.
- `checkStalePrs` (lines 136–162), via `runBin` (lines 123–134) — supporting. Flags open PRs (via `gh pr list --json`) with no update in `STALE_PR_DAYS`; skips with a stated reason when `gh` is missing, errors, or returns unparseable JSON.
- `checkInsightDrift` (lines 171–197) — supporting. Flags `.cortex/insight/ledger.json` entries whose source file no longer exists on disk; skips (not errors) when the ledger is absent, unreadable, or schema-invalid — re-pointed from the retired v1/v2 anatomy drift check (build-order-v3 step 7); the forward direction (unextracted/changed files) is deliberately left to the insight refresh loops.
- `checkCompassDeadRefs` (lines 204–246) — supporting. Reuses `index-build.ts`'s `buildIndex`/`resolveId`/`resolveRelativePath` and `globMatchesNothing` to flag a compass rule's `source:` entries that don't resolve and `governs:` globs that match nothing.
- `checkSpecOrphans` (lines 252–282) — supporting. Flags dev specs under `specsRoot` whose every `governs:` glob matches nothing on disk (a spec with no `governs:` declared is not treated as an orphan).
- `checkAgedTodos` (lines 290–332) — supporting. Scans every project file (via `listProjectFiles`, capped at `MAX_TODO_FILE_BYTES`, binary-skipped) for `TODO`/`FIXME` markers, then ages each hit by the file's last git-commit date (untracked or non-git files are never "aged" — age unknown, not stale).
- `cleanStaleReadLedgers` (lines 344–367) — critical. Deletes `pulse/state/reads/<session-id>` ledger files older than `READS_RETENTION_DAYS`; best-effort, tolerates a missing directory and per-file stat/unlink errors.
- `expireThreads` (lines 397–436), via `rewriteFrontmatterStatus` (lines 380–388) — critical. Rewrites only the `status:` line inside a thread file's YAML frontmatter block to `expired` for every `open` thread past its `expires` timestamp — every other byte of the file, including the body, is left untouched; a file whose frontmatter doesn't parse or carries no `status:` line is skipped and counted, never deleted.
- `cleanStaleSessionRecords` (lines 458–513) — critical. Deletes (b) `pulse/sessions/<id>.json` records older than `SESSION_RECORD_RETENTION_DAYS` together with their `pulse/scratch/<id>/` copies, any scratch dir past the window on its own mtime, and (c) orphaned `pulse/state/sessions/<id>.last.json` Stop companions past the window — nothing else under `pulse/` is touched.
- `renderRetentionSection` (lines 516–535) — supporting. Renders the "Threads and session records" report section from the four retention counts.
- `listProjectFiles` (lines 74–78) — supporting. Shared file listing (same scope as insight's L1 walk: `dot:false`, hard excludes, `.gitignore` + config excludes via `insight/exclude.ts`) feeding the TODO/FIXME check.

## Insights

- **The six survey checks and the three housekeeping passes are architecturally distinct but share one report**: the checks are pure read-only surveys returning `HygieneSection`s; `cleanStaleReadLedgers`, `expireThreads`, and `cleanStaleSessionRecords` are the only functions in this file that mutate the filesystem outside of `hygiene.md` itself, and they are called unconditionally on every sweep (not gated behind a flag) — this is the file's one sanctioned exception to "hygiene never mutates anything but its own report" (Rule 6/7/8 are named exceptions in the header comment, not the general rule).
- **Thread expiry is edit-in-place, never delete**: `expireThreads`/`rewriteFrontmatterStatus` regex-match only the `status:` line inside the `---`-delimited frontmatter block and splice the replacement in without touching anything else — this preserves `pulse.threads` Rule 10's invariant that no thread file is ever deleted, only its lifecycle field advanced.
- **`checkInsightDrift` deliberately covers only one direction**: it flags ledger entries whose source vanished, but NOT files that changed or were never extracted — that forward-drift detection belongs to the insight refresh loops (session-observe / extract-insight), so duplicating it here would create two sources of truth for the same signal.
- **`checkAgedTodos` treats "no git history" as "unknown," not "stale"**: untracked and non-git-repo files never age into a finding, which avoids false positives for files a session is mid-editing or for projects without git.
- **Retention constants are still marked as engineering-call stopgaps**: `READS_RETENTION_DAYS` (14) carries a `TODO: promote to cortex.config.json as pulse.readsRetentionDays`; `SESSION_RECORD_RETENTION_DAYS` (30) sits beside it in-code "pending the same cortex.config.json promotion" — both are load-bearing deletion windows that currently cannot be tuned without a code change.
- **`checkCompassDeadRefs` and `checkSpecOrphans` deliberately reuse validator logic rather than reimplementing it**: both call into `src/schema/checks/compass.ts`'s `globMatchesNothing` and `src/schema/index-build.ts`'s resolution functions, keeping the "does this reference resolve" definition in exactly one place shared with `cortex validate`.
- **`cleanStaleSessionRecords`'s scratch-dir deletion has two independent triggers**: a scratch dir for an id whose session record was just deleted in the same sweep (`deletedIds.has`), OR a scratch dir past the retention window on its own mtime even if its record survives — so scratch data doesn't outlive a manually-lingering record indefinitely.
- Every check and every housekeeping pass swallows its own per-item errors (stat/unlink/readFile failures) rather than throwing — reinforcing the file's design principle that housekeeping must degrade gracefully rather than fail the whole daily sweep.

## File map

- Lines 1–35: module doc comment (spec references, write-scope statement, check inventory, Rules 7/8 housekeeping note) and imports.
- Lines 37–52: engineering-call retention/threshold constants (`ORPHAN_BRANCH_DAYS`, `STALE_PR_DAYS`, `AGED_TODO_DAYS`, `READS_RETENTION_DAYS`, `SESSION_RECORD_RETENTION_DAYS`, `DAY_MS`, `MAX_TODO_FILE_BYTES`).
- Lines 54–78: `HygieneSection`/`HygieneOptions` types and `listProjectFiles`.
- Lines 80–117: (a) orphan local branches — `checkOrphanBranches`.
- Lines 119–162: (b) stale open PRs — `runBin`, `checkStalePrs`.
- Lines 164–197: (c) insight drift — `checkInsightDrift`.
- Lines 199–246: (d) compass dead references — `checkCompassDeadRefs`.
- Lines 248–282: (e) spec orphans — `checkSpecOrphans`.
- Lines 284–332: (f) aged TODO/FIXME comments — `checkAgedTodos`.
- Lines 334–367: read-ledger retention — `cleanStaleReadLedgers`.
- Lines 369–436: Rule 8(a) thread expiry in place — `rewriteFrontmatterStatus`, `expireThreads`.
- Lines 438–513: Rule 8(b)+(c) session-record/scratch/Stop-companion retention — `listDirEntries`, `cleanStaleSessionRecords`.
- Lines 515–552: report rendering — `renderRetentionSection`, `renderSection`.
- Lines 554–606: the sweep entry — `runHygiene`.

## Connections

Uses:
- src/insight/exclude.ts — `hasExcludedSegment`, `buildIgnoreFilter` scope the project file listing for the TODO/FIXME check to the same walk as insight's L1.
- src/insight/storage.ts — `parseLedger` reads and schema-validates `.cortex/insight/ledger.json` for the insight-drift check.
- src/loops/git-info.ts — `gitExec`, `isGitRepo`, `gitLastCommitEpoch` back the orphan-branch scan and the TODO/FIXME aging logic.
- src/loops/report.ts — `writePulseReport` performs the single always-write of `hygiene.md` under `reports/` with its schema §4.5 header.
- src/paths.ts — `specsRoot`, `SPECS_GLOB` locate and glob the dev spec tree for the spec-orphans check.
- src/pulse/threads.ts — `parseThreadFile`, `THREADS_DIR`, `THREAD_TTL_DAYS` back the thread-expiry pass; this file reads and rewrites thread frontmatter without importing any write helper from `threads.ts` (its own `writeThread` is not used — the frontmatter is hand-spliced to preserve every other byte).
- src/schema/checks/compass.ts — `globMatchesNothing` is reused (not reimplemented) to test whether a rule's or spec's `governs:` glob matches any on-disk file.
- src/schema/index-build.ts — `buildIndex`, `resolveId`, `resolveRelativePath` reuse the validator's id/path resolution to detect dead compass rule `source:` references.

Used by:
- (none src-internal — reached only via `src/cli/cli.ts`'s dynamic import of the `pulse-hygiene` verb, not tracked as an in-tree edge)

## Query pointers

- If you need to understand how `hygiene.md`'s findings surface to a human, also read: `src/pulse/review.ts`'s `discoverSuggestions`, which scans `.cortex/pulse/reports/` for `## S-NNN` sections (hygiene itself never emits suggestion sections, only findings — cross-check whether a given check's output is meant to feed the S-namespace before assuming it does).
- If you need to change a retention or threshold constant, note several are explicitly flagged in-code as stopgaps pending a `cortex.config.json` override (`READS_RETENTION_DAYS`, `SESSION_RECORD_RETENTION_DAYS`) — check `cortex.config.json` conventions first.
- If you need to understand the thread lifecycle this file's expiry pass participates in, also read: `src/pulse/threads.ts`, `src/pulse/thread-cli.ts`.
