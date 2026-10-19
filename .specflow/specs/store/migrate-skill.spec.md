---
id: store.migrate-skill
status: implemented
depends_on:
  - store.migrate
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "skills/cortex-migrate/SKILL.md"
  - ".claude/skills/cortex-migrate/SKILL.md"
---

# `cortex-migrate`: the agentic half of a 3.x → 4.0 migration

## Intent

`cortex migrate` is deterministic, so it cannot judge whether a 3.x working file holds knowledge. The rule for migrations is that no information is lost (approved 2026-10-19). A real store showed what that costs: 6% of its 917 retired working files held knowledge kept nowhere else, including unanswered questions for people and pending proposals that existed only in a report. This skill reads what Core cannot judge and decides each file: rescue it, digest it, or retire it. It records its decisions as the plan file that `store.migrate` Rule 3 defines. Core then applies them deterministically. The skill never applies.

## Entities

- **READS:** the `cortex migrate --json` report, the `.cortex/` files it names, and `cortex/MAP.md` when it exists (for the kind → folder table).
- **WRITES:** under `.cortex-migrate/` only: `report.json`, `plan.json`, `decisions.md`, and `digests/*.md`. It adds `.cortex-migrate/` to the repository's exclude file (`git rev-parse --git-path info/exclude`), never to `.gitignore`.
- **NEVER WRITES:** `.cortex/`, `cortex/`, `.gitignore`, `CLAUDE.md`, or any commit.

## Rules

1. **Bundle.** The bundle is `skills/cortex-migrate/SKILL.md`, mirrored byte for byte to `.claude/skills/cortex-migrate/SKILL.md`. Its description fits the skill-listing budget. It is 4.0-only: it is listed in `STORE_V4_BUNDLES`, so the 3.x `init` and `sync` never install it. It is not installed into projects at all. A migration needs it before anything is applied, so the `cortex migrate` dry run prints the packaged path (`store.migrate` Rule 3), and the session reads the skill from there. This repository has it in `.claude/skills/` as the mirror.
2. **Steps, in order:**
   1. run `cortex migrate --json --report .cortex-migrate/report.json` (adding `--visibility` when the person states it); if it prints usage text, or the report has no `noLoss` field, the installed `cortex` predates 4.0, so stop and say so;
   2. read every entry that is `retired` with reason `unpromoted work` or `not a store folder`, every entry flagged `review`, and every concept under `concept definitions`, opening the files as needed and working in folder groups;
   3. decide each one, with a one-line reason;
   4. write `.cortex-migrate/plan.json` and `.cortex-migrate/decisions.md` (a table of ref, decision, target and reason);
   5. re-run the dry run with `--plan .cortex-migrate/plan.json`;
   6. stop when both no-loss lines show `undecided: 0`, then show the person those two lines and the decisions file.
3. **Deciding.**
   - **Rescue** a file verbatim when it is small and self-contained, and holds knowledge kept nowhere else.
   - **Digest** it when that knowledge sits in a large or raw work file. Write the body to `.cortex-migrate/digests/<slug>.md`, with no frontmatter.
   - **Retire** it when it is regenerable, superseded (name what supersedes it in the reason), or scaffolding.
   - Use a folder key (`<prefix>/**`) when a whole folder retires for one reason, and exact refs for the files that it keeps.
   - Keep one consolidated copy when several files hold the same thing (passes and their merge).
4. **Knowledge that is never retired:**
   - an unanswered question for a person, which goes to `now/` or is rescued;
   - a pending proposal, which is digested to `now/proposals.md` as `## <id>: <title>` items (the 3.x id where it had one, else `P-<report stem>-<n>`);
   - a recorded reason for a dismissal or a rejection.
5. **Non-markdown work** (tests, scripts) is rescued only as raw (`history/sources/raw/<folder>/…`) or as a digest, never into `world/` or `code/`. For a set of passes, keep the latest suite and retire the others.
6. **Disagreement.** When two kept files disagree, the digest records both statements with their refs, and never picks one.
7. **Never:**
   - run `cortex migrate --apply` or `--accept`;
   - write under `.cortex/` or `cortex/`;
   - commit.

   A person runs `--apply` after reading the decisions.

## Acceptance Criteria

### The bundle exists, is mirrored, and fits the budget

- **Given** the repository
- **When** the skill bundles are listed and the budget script runs
- **Then** `skills/cortex-migrate/SKILL.md` and its `.claude/skills/` mirror are byte-identical, and the budget check passes

### The steps appear in order

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names, in this order: `--json`, reading the unpromoted, review and concept entries, deciding with a reason, `plan.json` with `decisions.md`, re-running with `--plan`, and the stop condition `undecided: 0`

### The plan forms and the knowledge rules are stated

- **Given** the SKILL.md text
- **When** it is read
- **Then** it shows the four value forms and the folder key, says that unanswered questions and pending proposals are never retired, that tests go only to raw or a digest, and that a disagreement records both statements

### The Never list

- **Given** the SKILL.md text
- **When** it is read
- **Then** its Never section names `--apply`, `--accept`, `.cortex/`, `cortex/` and committing

### 3.x init and sync never install it

- **Given** the skills source directory
- **When** `listSkillBundles` runs
- **Then** neither `cortex-migrate` nor `cortex-remember` is listed
