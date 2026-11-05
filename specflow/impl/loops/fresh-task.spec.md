---
id: loops.fresh-task
status: draft
depends_on:
  - store.freshness
  - store.validate
  - store.rules
  - store.remember-skill
  - core-cli.tasks-register
implements: ../../promises/loops/developer-gets-upkeep-proposals-without-asking.business.md
governed_by: []
governs:
  - "src/tasks/collect-fresh.ts"
  - "skills/cortex-fresh/SKILL.md"
  - ".claude/skills/cortex-fresh/SKILL.md"
---

# `cortex-fresh`: the weekly task that keeps the store from going stale

## Intent

Knowledge rots in a different way per module (schema S1). Core already detects the mechanical part: expired `now/` items, `code/` files whose dependencies moved, near-duplicate subjects. Once a week `cortex-fresh` runs those, adds the age signals, then does the part that needs judgement: it re-reads what a stale file describes and says whether the file still holds. It replaces the 3.x curation reviewers (rule-decay, atlas-staleness, onboarding-drift) for a 4.0 store. It fixes what it finds: it may edit, merge and retire any file in `cortex/` (P11, Pedro at the G2 sitting), following the MAP filing rules. Specs stay out of reach: anything that would change a spec is a proposal. It writes no code.

## Entities

- **READS:** `cortex/**`; git history through `cortex store stale`; the code a stale file depends on; `cortex/now/proposals.md`.
- **WRITES:** any file under `cortex/`, by Rules 4 to 8; `cortex/now/proposals.md` is appended to only. Never a spec.
- **CREATES:** `cortex tasks collect fresh`, the constants `WORLD_REVERIFY_DAYS`, `DECISION_REVERIFY_DAYS`, `PITFALL_AGE_DAYS`, the skill bundle `cortex-fresh`.

## Rules

1. **The bundle.** `skills/cortex-fresh/SKILL.md`, mirrored byte for byte to `.claude/skills/cortex-fresh/SKILL.md`, Tier D and 4.0-only (as `loops.learn-task` Rule 1). The skill never spawns a nested `claude` process.
2. **`cortex tasks collect fresh [--json] [--today YYYY-MM-DD]`** is read-only and exits 0 whatever it finds. JSON shape, all eight keys always present:
   - `expired`: `[{ file, until, item }]`, what `cortex store expire` lists, without `--apply`;
   - `stale`: `[{ file, dependency, commit: { sha, date } }]`, what `cortex store stale --json` lists;
   - `validate`: `{ errors, warnings }` from `cortex store validate`, each `{ check, path, message }`;
   - `nearDuplicates`: the `check.near-duplicate` pairs;
   - `aged`: files under `world/people/`, `world/orgs/`, `world/systems/` and `world/agreements/` whose `verified` date is more than `WORLD_REVERIFY_DAYS` (90) before `today`, and files under `world/decisions/` more than `DECISION_REVERIFY_DAYS` (180) before it. Each entry is `{ file, verified, citedBy }`; `citedBy` lists the store files with a link that resolves to it by `check.links`' resolution (S2);
   - `deadRules`: files in `world/rules/` with a non-empty `match.paths` of which no glob matches a file on disk;
   - `scaffolding`: the `check.map-fresh` and `check.map-size` findings, and a managed block that is missing or whose version differs from `schemaVersion`;
   - `openPitfalls`: `{ count, aged: [<file>] }`: every file under `code/` with `status: open`, and those whose `verified` date is more than `PITFALL_AGE_DAYS` (30) before `today`.
3. **The skill's steps, in order:**
   - (1) the write gate of `store.remember-skill`;
   - (2) run `cortex store expire --apply` and keep its output;
   - (3) run `cortex tasks collect fresh --json`;
   - (4) act on each finding by Rules 4 to 7;
   - (5) write the record (Rule 9);
   - (6) run `cortex store validate` and fix any error in a file this run wrote;
   - (7) run `cortex tasks heartbeat fresh`.
4. **How a store file is changed.** Every edit follows the MAP filing rules: `verified` set to `<today> (observed)` only after reading the evidence, the run's `session:<id>` added to the file's `origin` list, one fact in one file. **Retiring** a file removes it and repoints or removes links to it; the record names it with its `about` line, and git keeps the text. **Merging** two files keeps one, adds the other's name and aliases to its `aliases`, joins the `origin` lists, repoints links, and removes the other. A file under `history/` is never edited (S7).
5. **Stale `code/` files.** For each `stale` file the skill reads the file and the code its `depends_on` names. If the file still holds, it updates `verified`. If not, it corrects the text. If the subject is gone, it retires the file.
6. **Aged, dead and duplicate.** An `aged` file is updated when the repository, the store or a session shows it still holds, or corrected when they show otherwise. When nothing the task can read confirms it, the file is left alone, counted as `unconfirmed`, and one proposal asks a person; the proposal names `citedBy`, and a file nobody cites says so. A `deadRules` file is retired when the code its globs named is gone, and corrected when the code moved; its dead globs go in the record. A near-duplicate pair is read, and merged only if the two files hold one subject; otherwise it is counted as `not a duplicate`. A `scaffolding` finding is fixed with `cortex store map`. A `validate` error is fixed. `openPitfalls.aged` files are read against the code. A pitfall is closed by `store.remember-skill` Rule 12 only on observed evidence that the fix landed: a commit or a change that shows it. A missing file or symbol is not evidence, because the code may have moved. Without that evidence, one proposal asks a person, and the file is named in the record.
7. **Proposals and the boundary.** A finding that would change a spec, or that needs a person, is one item appended to `now/proposals.md` by `store.remember-skill` Rule 8, with the id `P-<today>-fresh-<slug of the file's path>` and its evidence: the commit, the age, the dead glob. If a pending item already names the same file, no new item is written and the finding is counted as `already proposed`. `now/proposals.md` is only ever appended to; the skill never rewrites or reorders it.
8. **Reach.** The skill writes nothing outside `cortex/`, never a spec, and neither stages nor commits (`loops.learn-task` Notes).
9. **The record.** Each run writes one new `history/changes/<today>-fresh.md` (first free name by `store.freshness` Rule 6), also when nothing was found: `kind: other`, `status: done`, `origin: session:<id>`, and one body line each with a count, followed by the paths: `expired`, `re-verified`, `corrected`, `retired`, `merged`, `not a duplicate`, `unconfirmed`, `scaffolding`, `open pitfalls`, `open pitfalls aged`, `proposed`, `already proposed`. A quiet run says `Nothing went stale this cycle.` as the last line.
10. **Bounded commands**, as `loops.learn-task` Rule 11.

## Acceptance Criteria

### LOOPS-FRESH-TASK-1: Collect reports every section, even when empty

- **Given** a clean 4.0 store with a current managed block and MAP
- **When** `cortex tasks collect fresh --json` runs
- **Then** all eight keys are present, `validate` is `{ errors: [], warnings: [] }`, `openPitfalls` is `{ count: 0, aged: [] }` and the others are `[]`, exit 0, and no file changes

### LOOPS-FRESH-TASK-2: An old person file is aged, a recent one is not

- **Given** `world/people/rui.md` with `verified: 2026-07-01 (told)`, `world/people/ana.md` with `verified: 2026-10-20 (told)`, and today 2026-11-04
- **When** collect runs
- **Then** `aged` holds `rui.md` and not `ana.md`

### LOOPS-FRESH-TASK-3: Decisions use the longer window and name who cites them

- **Given** `world/decisions/a.md` verified 200 days ago and linked from `code/repo/b.md`, and `world/decisions/c.md` verified 100 days ago
- **When** collect runs
- **Then** `aged` holds `a.md` with `citedBy: [code/repo/b.md]`, and not `c.md`

### LOOPS-FRESH-TASK-4: A rule whose paths match nothing is dead

- **Given** a rule with `match: { paths: ["src/gone/**"] }` and no such file, and a rule with no `match.paths`
- **When** collect runs
- **Then** `deadRules` holds the first with its glob, and not the second

### LOOPS-FRESH-TASK-5: A lagging managed block is reported

- **Given** a managed block whose version differs from `schemaVersion`
- **When** collect runs
- **Then** `scaffolding` names the mismatch

### LOOPS-FRESH-TASK-6: Open pitfalls are counted and aged

- **Given** `code/hooks/a.md` with `status: open` and `verified: 2026-09-01 (observed)`, `code/hooks/b.md` with `status: open` and `verified: 2026-10-20 (observed)`, `code/hooks/c.md` with no `status`, and today 2026-11-04
- **When** collect runs
- **Then** `openPitfalls` is `{ count: 2, aged: ["code/hooks/a.md"] }`

### LOOPS-FRESH-TASK-7: Collect does not expire anything

- **Given** an expired `now/` item
- **When** collect runs
- **Then** `expired` lists it and the file is byte-identical

### LOOPS-FRESH-TASK-8: The bundle is mirrored and Tier D

- **Given** the repository
- **Then** `.claude/skills/cortex-fresh/SKILL.md` is byte-identical to `skills/cortex-fresh/SKILL.md`, and `scripts/measure-skill-descriptions.mjs` reports it as tier `D`

### LOOPS-FRESH-TASK-9: The skill carries its steps in order

- **Given** the SKILL.md text
- **Then** it names, in this order: the write gate, `cortex store expire --apply`, `cortex tasks collect fresh --json`, the record `history/changes/<today>-fresh.md`, `cortex store validate`, `cortex tasks heartbeat fresh`

### LOOPS-FRESH-TASK-10: The skill fixes the store by the filing rules

- **Given** the SKILL.md text
- **Then** it says `verified` is updated only after reading the evidence, adds `session:<id>` to `origin`, states what retiring and merging do to links, aliases and `origin`, and forbids editing `history/`

### LOOPS-FRESH-TASK-11: The skill leaves what it cannot confirm

- **Given** the SKILL.md text
- **Then** it says an `aged` file nothing confirms is left alone, counted as `unconfirmed`, and proposed

### LOOPS-FRESH-TASK-12: The skill closes a pitfall only on evidence

- **Given** the SKILL.md text
- **Then** it closes a pitfall only on observed evidence that the fix landed, says a missing file or symbol is not evidence, and sends the rest to a proposal

### LOOPS-FRESH-TASK-13: Specs stay proposals

- **Given** the SKILL.md text
- **Then** it forbids writing a spec and staging or committing, sends a finding that would change one to `now/proposals.md` with the id `P-<today>-fresh-<slug>`, says that file is only appended to, and skips a file already proposed, counted as `already proposed`

### LOOPS-FRESH-TASK-14: The skill specifies the record

- **Given** the SKILL.md text
- **Then** it names the twelve counted lines of Rule 9 and the line `Nothing went stale this cycle.`

### LOOPS-FRESH-TASK-15: `aged` covers orgs, systems and agreements, not terms

- **Given** old files in `world/orgs/`, `world/systems/`, `world/agreements/` and `world/terms/`
- **When** collect runs
- **Then** `aged` holds the first three and not the term

### LOOPS-FRESH-TASK-16: A missing managed block is reported

- **Given** a store with no `CLAUDE.md`
- **When** collect runs
- **Then** `scaffolding` names the block as missing

### LOOPS-FRESH-TASK-17: Two files on one subject are reported as a pair

- **Given** `world/terms/fare.md` and `world/systems/fare.md`
- **When** collect runs
- **Then** `nearDuplicates` holds one entry naming both

### LOOPS-FRESH-TASK-18: Outside git nothing is stale

- **Given** a store in a folder that is not a git repository
- **When** collect runs
- **Then** `stale` is `[]`

### LOOPS-FRESH-TASK-19: The skill bounds its commands

- **Given** the `cortex-fresh` SKILL.md
- **When** it is read
- **Then** it says a command runs in the background and is polled with a 10-minute limit, and forbids a nested `claude` process

## Notes

- **What it inherits.** rule-decay's dead-`governs` signal is `deadRules`; atlas-staleness's old-cited-decision signal is `aged` with `citedBy`, and its dead links are `check.links` under `validate`; onboarding-drift's version lag is `scaffolding`. The full mapping, including what is dropped, is `.specflow/specs/loops/_retirements.md`.
- **`WORLD_REVERIFY_DAYS`, `DECISION_REVERIFY_DAYS` and `PITFALL_AGE_DAYS`** are engineering calls. The 180 and 30 days are carried over from atlas-staleness and bug-triage. The draft left the people, orgs and systems window as "N days".
- **Pedro verifies when he chooses.** The record names every file changed, and git shows each edit.
- Model: Sonnet (`core-cli.tasks-register` Rule 7).
