---
id: loops.quality-task
status: draft
depends_on:
  - loops.session-reading
  - loops.learn-task
  - store.remember-skill
  - specflow.index
  - specflow.lint
  - specflow.review-skill
  - core-cli.tasks-register
implements: ../../promises/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "src/tasks/collect-quality.ts"
  - "src/tasks/name-flags.ts"
  - "skills/cortex-quality/SKILL.md"
  - ".claude/skills/cortex-quality/SKILL.md"
---

# `cortex-quality`: the weekly task that finds drift and measures use

## Intent

Drift between specs and code is found at rest, not at commit. Once a week `cortex-quality` checks the spec tree, reads coverage, runs the suite, and files failures. It then runs the two Specflow jobs: a fresh reviewer over a rotation of specs, and the silent-spec job, which finds working behaviour no spec describes. Finally it measures how the store is used. Its output is what the 2026-11-17 review reads. It reports and proposes; it fixes nothing. Fixing is an ordinary session.

The silent-spec job is adopted in three steps, because the name flag alone is not a signal (test 6, PH-v3-15): a nothing-agent chain, then name flags, then one fresh reviewer classifying each flag against the spec text. It cannot see a behaviour nobody edits; the rotation covers those.

It may write anywhere in `cortex/` (P11), but its two spec jobs only propose: specs need Pedro's approval. The draft of 2026-10-20 filed failures as bug files in `code/`; this spec files them in `now/`, because a failing test comes and goes week to week and its item clears itself. A person or `cortex-remember` files the bug once it is understood.

## Entities

- **READS:** `cortex specs index --json` and `cortex specs lint --json`; `cortex/cortex.json` (`specflow.testCommand`, `specflow.tests`); `cortex/history/measurements/*-quality.md`; `cortex/history/sources/*-session-*.md`; this project's transcripts through `loops.session-reading`; spec text and code.
- **WRITES:** `cortex/now/quality-failures.md`, `cortex/now/quality-findings.md`, `cortex/now/proposals.md` (appended only), `cortex/history/measurements/<today>-quality.md`. Code changes only in a throwaway worktree that is deleted in the same run (Rule 9).
- **CREATES:** `cortex tasks collect quality`, the name-flag function, the constants in Rules 2, 3, 5 and 9, the skill bundle `cortex-quality`.

## Rules

1. **The bundle.** `skills/cortex-quality/SKILL.md`, mirrored byte for byte to `.claude/skills/cortex-quality/SKILL.md`, Tier D and 4.0-only (as `loops.learn-task` Rule 1). The skill never spawns a nested `claude` process.
2. **`cortex tasks collect quality [--json] [--today YYYY-MM-DD]`** is read-only and exits 0 whatever it finds. Every key is always present:
   - `ported`: true when `specflow/INDEX.md` exists;
   - `lint`: `{ exit, errors, warnings }` from `cortex specs lint --json`, or null when not ported; when lint gives no result in that shape, `errors` and `warnings` are null and `notRun` says so, because an empty count must not read as a pass;
   - `coverage`: `{ criteria, tagged, unverified: [<criterion id>], untaggedTests }` from `cortex specs index --json`, or null when not ported;
   - `rotation`: Rule 3's spec ids, `[]` when not ported;
   - `area`: the folder under `specflow/impl/` of the first spec in `rotation`, or null;
   - `testCommand`: `specflow.testCommand`, or null;
   - `usage`: Rule 4's counts;
   - `store`: `{ filesPerFolder, filesNeverRead, filesWithoutVerified }`, where `filesPerFolder` keys are `code`, `world/<folder>`, `history/<folder>` and `now`.
3. **The rotation.** `ROTATION_SIZE` (5) spec ids from `specflow/impl/`, skipping specs with `status: retired`. A spec's last review is the newest date it has in a `## Reviewed specs` section of `history/measurements/*-quality.md`, one line `- <spec id> <YYYY-MM-DD>` each. That section is the rotation's only state. Order: never reviewed first, then oldest review; on a tie, a spec with a `governs:` file committed after the spec's own last commit comes first; then by spec id.
4. **Usage counts.** Over the 7 days before `today`, on the sessions `loops.learn-task` Rule 2 would enumerate (root and worktree slugs, scheduled sessions excluded, no digest or quiet filter): `sessions`; `cortexReads`, `Read` tool uses whose `filePath` resolves to `<root or listed worktree>/cortex/<store-relative path>`; `readbacks`, assistant lines starting `Filing:`, `Updated:` or `Proposed:`; `sessionsWithReadback`; and, from learn digests dated in the window, `digests`, `filed`, `alreadyThere`, `skipped`, counting list items under each heading. `sessionsWithReadback` is the number of sessions with at least one readback. `filesNeverRead` is the count of store files whose store-relative path no `cortexReads` entry has in the window.
5. **The name flags: `cortex tasks collect quality --flags <dir> --base <sha> [--json]`**, deterministic, run from the project root. Changed files are the tracked and untracked changes in `<dir>` against `<sha>`. A file is **governed** unless it is under `specflow/`, `.specflow/`, `cortex/`, `.claude/`, `.githooks/`, or ends in `.md`, or matches a `specflow.tests` include. The tokens of a file are its repo-relative path, its basename, its stem when that holds `_` or `-` or is at least 8 characters, and for `.py` its dotted module path. A governed file is **flagged** when no token appears, delimited by non-word characters, in any criterion block in the project root's `specflow/impl/` or in any test file holding a criterion tag. Output `{ base, governed: [...], flagged: [...], named: [{ file, by }] }`, where `by` holds at most 3 criterion ids or test files. No path is hardcoded; project layout comes from `specflow.tests` only (A8).
6. **The skill's steps, in order:**
   - (1) the write gate of `store.remember-skill`;
   - (2) run `cortex tasks collect quality --json`;
   - (3) run the suite (Rule 7);
   - (4) the at-rest review (Rule 8);
   - (5) the silent-spec job (Rule 9);
   - (6) write the measurement (Rule 11);
   - (7) run `cortex store validate` and fix any error in a file this run wrote;
   - (8) run `cortex tasks heartbeat quality`.

   When `ported` is false, steps (4) and (5) are skipped and the measurement says `not ported`. A step that fails is recorded in the measurement and the next step runs.
7. **The suite.** With a null `testCommand` the measurement says `no test command configured` and the step is skipped. Otherwise it runs once from the project root, bounded by `SUITE_LIMIT_MINUTES` (30). Each failing test is one `##` item in `now/quality-failures.md`: heading `## <test file> › <test name>`, then `until: <today + 14>`, `first seen: <date>`, the criterion its tag names, and at most 20 lines of failure output with no secret. A test already there keeps its `first seen`, and its other lines are refreshed. An item whose test now passes is removed. The skill changes no code and no test. After the run, tracked files outside `cortex/` that the suite changed are named in the measurement.
8. **The at-rest review.** For each spec in `rotation`, one fresh agent runs **spec mode** of `specflow.review-skill`, given the spec path and the repository root and nothing else: never this session's conversation, and a fork does not count (B7d). Findings keep that skill's format and go to `now/quality-findings.md` as one `##` item per spec, heading `## <spec id> <today>`, with `until: <today + 14>`. A finding that would change a spec or a rule also becomes one item in `now/proposals.md` by `store.remember-skill` Rule 8, id `P-<today>-quality-<slug>`.
9. **The silent-spec job.** On `area`, in this order:
   - (a) **Tickets.** One fresh agent sees only `specflow/INDEX.md` and that area's spec files, no code, and writes `SILENT_TICKETS` (5) change requests as JSON `[{ slug, prompt }]`: one to three sentences each, from the user's point of view, each on a different part of the area, with no spec id, rule number, file name or technical term, nothing the specs forbid, at least one changing a limit, one changing what a person sees, one adding a small behaviour.
   - (b) **The nothing-agent.** For each ticket, `git worktree add --detach <os tmpdir>/cortex-quality-<today>/<slug> HEAD`, then delete `specflow/`, `.specflow/`, `cortex/`, `.claude/`, `CLAUDE.md` and `AGENTS.md` inside it. One fresh agent gets only the ticket text and that folder, and implements the ticket there without committing.
   - (c) **Flags.** Run Rule 5 on that folder. At most `SILENT_MAX_FLAGS` (10) flags per ticket go on; the rest are counted.
   - (d) **Classifier.** One fresh agent per ticket gets the flagged files, their diff and the area's spec text, and classifies each flag `described` or `not described`, quoting the spec line for `described`. Each `not described` becomes an item in `now/proposals.md` proposing a missing criterion, id `P-<today>-silent-<slug>`.
   - (e) **Discard.** Every throwaway worktree is removed and pruned, also after a failure, and the measurement says so. No edit from the job reaches any branch.

   A ticket on which the agent edits nothing is counted as `blind`: it is the method's known limit.
10. **Every fresh agent runs in the foreground, or is awaited before the next step, and writes its output to a file under `<os tmpdir>/cortex-quality-<today>/`, which the skill reads.** A headless session can end while a background agent runs, and its work is lost (D5). A hand-back can also fail after the agent has finished, as every one did in the ported run of 2026-11-05, so the file is the delivery and the reply is not.
11. **The measurement.** One new `history/measurements/<today>-quality.md` per run (first free name by the `-2` rule): `about`, `permanence: stable`, `verified: <today> (observed)`, `origin: session:<id>`. Headings in this order, each with its numbers, never omitted:
    - `## Specs`: lint errors and warnings, criteria, tagged, unverified, untagged tests;
    - `## Tests`: passed, failed, new failures, failures open more than 7 days, or the skip reason;
    - `## At-rest review`: specs reviewed, findings by severity, proposals written;
    - `## Reviewed specs`: Rule 3's lines;
    - `## Silent-spec job`: tickets, blind, flags, flags over the limit, `described`, `not described`, worktrees removed;
    - `## Store use`: Rule 4's counts, and `filed` against `alreadyThere` as a ratio;
    - `## Store shape`: the `store` key.
12. **Bounded commands**, as `loops.learn-task` Rule 11, except the suite (Rule 7). The task writes nothing outside `cortex/` and the throwaway worktrees, never a spec, and neither stages nor commits (`loops.learn-task` Notes).

## Acceptance Criteria

### LOOPS-QUALITY-TASK-1: Collect on an unported repository states it

- **Given** a 4.0 store with no `specflow/INDEX.md`
- **When** `cortex tasks collect quality --json` runs
- **Then** `ported` is false, `lint` and `coverage` are null, `rotation` is empty, `usage` and `store` are filled, and exit is 0

### LOOPS-QUALITY-TASK-2: Lint that did not run does not read as a pass

- **Given** `cortex specs lint --json` printing nothing, or text that is not its JSON shape
- **When** collect runs on a ported repository
- **Then** `lint` has its `exit`, null `errors` and `warnings`, and a `notRun` line
- **And** real counts are kept, a failing lint included

### LOOPS-QUALITY-TASK-3: Coverage comes from the index

- **Given** a ported fixture with 4 criteria, 3 of them tagged
- **When** collect runs
- **Then** `coverage` has `criteria: 4`, `tagged: 3`, and `unverified` names the fourth

### LOOPS-QUALITY-TASK-4: The rotation prefers the never-reviewed, then the oldest

- **Given** seven specs `a` to `g`, and a measurement listing `a` to `e` with dates, `a` the oldest
- **When** collect runs
- **Then** `rotation` is `f`, `g`, then `a` and the next two oldest

### LOOPS-QUALITY-TASK-5: A drifted spec wins a tie

- **Given** two never-reviewed specs `b` and `c`, where a `governs:` file of `c` has a commit newer than `c`'s last commit, and `b` has none
- **When** collect runs
- **Then** `c` comes before `b`

### LOOPS-QUALITY-TASK-6: Retired specs are not reviewed

- **Given** a spec with `status: retired`
- **When** collect runs
- **Then** it is not in `rotation`

### LOOPS-QUALITY-TASK-7: Usage counts come from the week's sessions

- **Given** a session within the window with two `Read` uses under `cortex/`, one line `Filing: x → y (origin: z)`, a scheduled session with the same content, and a session 10 days old
- **When** collect runs with that `today`
- **Then** `sessions` is 1, `cortexReads` is 2, `readbacks` is 1

### LOOPS-QUALITY-TASK-8: Digests are counted

- **Given** a digest in the window with two items under `## Filed`, three under `## Already there` and one under `## Skipped`, and a digest older than the window
- **Then** `digests` is 1, `filed` is 2, `alreadyThere` is 3, `skipped` is 1

### LOOPS-QUALITY-TASK-9: Readback sessions are counted once each

- **Given** one session with three `Filing:` lines and one with none
- **Then** `readbacks` is 3 and `sessionsWithReadback` is 1

### LOOPS-QUALITY-TASK-10: A worktree read counts as a store read

- **Given** a `Read` of `<listed worktree>/cortex/world/terms/a.md` and of `<root>/src/x.ts`
- **Then** `cortexReads` is 1, and `world/terms/a.md` is not counted in `filesNeverRead`

### LOOPS-QUALITY-TASK-11: Store shape is counted per folder

- **Given** a store with two files in `world/people/`, one in `code/hooks/`, one in `now/` and one in `history/changes/`
- **Then** `filesPerFolder` is `{ code: 1, "world/people": 2, "history/changes": 1, now: 1 }`, folders with no file absent

### LOOPS-QUALITY-TASK-12: Area and test command are reported

- **Given** a rotation starting with `billing.refunds` at `specflow/impl/billing/refunds.spec.md`, and `specflow.testCommand` set to `pnpm test`
- **Then** `area` is `billing` and `testCommand` is `pnpm test`
- **And** with no `testCommand` key it is null

### LOOPS-QUALITY-TASK-13: Collect writes nothing

- **Given** any run
- **Then** no file under the project root changes

### LOOPS-QUALITY-TASK-14: A file no criterion names is flagged

- **Given** a throwaway folder changing `src/auth/session_store.py`, `src/api/users.py`, `tests/test_a.py` and `README.md`; `specflow.tests` including `tests/**`; a criterion block naming `users.py`
- **When** `--flags <dir> --base <sha>` runs
- **Then** `governed` holds the two source files, `flagged` holds only `src/auth/session_store.py`, and `named` gives `src/api/users.py` with that criterion id

### LOOPS-QUALITY-TASK-15: A tagged test naming the file clears the flag

- **Given** a test file holding a criterion tag and the text `session_store`
- **Then** `src/auth/session_store.py` is not flagged

### LOOPS-QUALITY-TASK-16: A short stem is not a token

- **Given** a changed file `src/db.py` and a criterion block containing the word `db` but neither `db.py` nor its path
- **Then** `src/db.py` is flagged

### LOOPS-QUALITY-TASK-17: Untracked files count as changed

- **Given** a new untracked `src/new_thing.ts` in the folder
- **Then** it is in `governed`

### LOOPS-QUALITY-TASK-18: The bundle is mirrored and Tier D

- **Given** the repository
- **Then** `.claude/skills/cortex-quality/SKILL.md` is byte-identical to `skills/cortex-quality/SKILL.md`, and `scripts/measure-skill-descriptions.mjs` reports it as tier `D`

### LOOPS-QUALITY-TASK-19: The skill carries its steps in order

- **Given** the SKILL.md text
- **Then** it names, in this order: the write gate, `cortex tasks collect quality --json`, the suite, the at-rest review, the silent-spec job, the measurement, `cortex store validate`, `cortex tasks heartbeat quality`

### LOOPS-QUALITY-TASK-20: The skill handles the unported and unconfigured cases

- **Given** the SKILL.md text
- **Then** it contains the phrases `not ported`, `no test command configured` and `lint not run`, and says a failed step is recorded and the next step runs

### LOOPS-QUALITY-TASK-21: The skill fixes nothing

- **Given** the SKILL.md text
- **Then** it forbids changing code or tests, and names `now/quality-failures.md`, the heading `## <test file> › <test name>`, `first seen`, and removing an item whose test passes

### LOOPS-QUALITY-TASK-22: The skill's review is spec mode with a fresh agent

- **Given** the SKILL.md text
- **Then** it names spec mode of `specflow-review`, gives the agent only the spec path and the repository root, excludes forks, and names `now/quality-findings.md` and `P-<today>-quality-<slug>`

### LOOPS-QUALITY-TASK-23: The silent-spec job runs its steps in order

- **Given** the SKILL.md text
- **Then** it names, in this order: tickets written with no code in view, the throwaway `git worktree add --detach`, the six deleted paths, `--flags`, the classifier with `described` and `not described`, and the removal of every worktree

### LOOPS-QUALITY-TASK-24: The skill keeps every agent in the foreground

- **Given** the SKILL.md text
- **Then** it says every agent runs in the foreground or is awaited before the next step, and writes its output to a file under `<os tmpdir>/cortex-quality-<today>/` that the skill reads

### LOOPS-QUALITY-TASK-25: The skill specifies the measurement

- **Given** the SKILL.md text
- **Then** it names `history/measurements/<today>-quality.md` and the seven headings of Rule 11 in order

### LOOPS-QUALITY-TASK-26: The job leaves no trace (journey)

- **Given** a fixture repository with a stub agent that edits a file in its folder, run through steps (b) to (e)
- **When** the job ends, including when the stub fails midway
- **Then** `git worktree list` shows only the main checkout, no branch was added, and `git status` shows no change outside `cortex/`

### LOOPS-QUALITY-TASK-27: A spec's last review is its newest date across measurements

- **Given** `x.a` reviewed 2026-09-01 in one measurement and 2026-10-01 in a later one, and `x.b` reviewed 2026-09-15
- **When** collect runs
- **Then** `rotation` is `x.b`, then `x.a`

### LOOPS-QUALITY-TASK-28: The name flags skip what the job itself deletes

- **Given** a throwaway folder with `specflow/` and `cortex/` deleted
- **When** `--flags` runs
- **Then** `governed` is `[]`

### LOOPS-QUALITY-TASK-29: `--flags` needs `--base` and has one shape

- **Given** `cortex tasks collect quality --flags <dir>`
- **When** it runs without `--base`, then with `--base <sha> --json`
- **Then** the first exits 2, and the second exits 0 and prints the keys `base`, `flagged`, `governed` and `named`

### LOOPS-QUALITY-TASK-30: The skill forbids staging

- **Given** the `cortex-quality` SKILL.md
- **When** it is read
- **Then** it says `` do not stage or commit: no `git rm`, no `git add` ``

## Notes

- **"None writes code" (A9) holds in substance.** The nothing-agent edits code, but only in a folder deleted in the same run. Nothing reaches a branch. It is stated here so it is not read as a breach.
- **The nothing-agent's purity is weaker than the bench's.** The bench ran it as a separate process with user instructions excluded. A scheduled skill spawns it with the Agent tool, and nested `claude` is forbidden, so user-level instructions may still reach it. What is guaranteed is that no spec, store or project instruction file exists in its folder. Noted for the review.
- **Not ported from `t6/flags.mjs`:** changed-key flags for locale files, whose paths named a client. Test 6's real finding was also flagged at file level. Reinstating keys needs a config key; not done.
- **The 7-day reading.** Dropping the code-writing test-runner carries the condition that it comes back if failures sit unfixed for more than a week. `## Tests` reports that number.
- **`remember` runs are not counted.** `extractToolUses` keeps no skill name (`loops.session-reading` Rule 7), so the draft's "remember runs" is measured as `sessionsWithReadback`.
- **Cost.** Test 6 cost $0.96 on Sonnet for 5 tickets on a small area, and it ran on a subscription here. Five at-rest reviews add to that; the first runs give the number.
- **Engineering calls, stated for G2:** `ROTATION_SIZE`, `SILENT_TICKETS` and `SILENT_MAX_FLAGS` (test 6's values), `SUITE_LIMIT_MINUTES`, the 14-day `until:`.
- `specflow.testCommand` is requested from `specflow.index`'s config section (schema Part II, A8).
- Model: Sonnet (`core-cli.tasks-register` Rule 7).
