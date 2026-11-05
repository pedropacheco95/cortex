---
id: store.migrate-skill
status: draft
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

- **READS:** the `cortex migrate --json` report, the output of `cortex sync --dry-run` in the skill-adjust step, the `.cortex/` files it names, and `cortex/MAP.md` when it exists (for the kind → folder table).
- **WRITES:** under `.cortex-migrate/` only: `report.json`, `plan.json`, `decisions.md`, and `digests/*.md`. It adds `.cortex-migrate/` to the repository's exclude file (`git rev-parse --git-path info/exclude`), never to `.gitignore`.
- **WRITES, in the skill-adjust step only:** the files `store.migrate` Rule 18 step 5 lists under `.claude/skills/`, and `.cortex-migrate/skill-edits.md`.
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
8. **The skill-adjust step** (2026-11-04; owner decision). Every other skill in a project that names a retired skill or the old store is checked and adjusted if needed. This step runs after a person has run `cortex migrate --accept`, and it comes after the plan steps in the SKILL.md. If `migration.accepted` is not set, the skill stops and says so.
9. **Steps, in order:**
   1. run `cortex sync --dry-run`, which writes nothing, and read its `project skills to adjust` section and its `is retired but has local edits` lines;
   2. read each listed file in full, and every mention in it;
   3. decide each mention by Rule 10, using Rule 11's table;
   4. make the edits, changing only the words the decision needs;
   5. write `.cortex-migrate/skill-edits.md`: one row per mention, with file, line, term, decision, the text before and after, and a one-line reason;
   6. show the person the counts and the file. A person commits, and `cortex sync --dry-run` should then list only the mentions decided `left` or `open`.
10. **Deciding a mention.** Each gets exactly one decision:
    - **edited**: the skill told an agent to use the retired name or path, and Rule 11 gives a replacement that exists;
    - **left**: the mention needs no change, such as history or a changelog, with the reason;
    - **open**: Rule 11 gives no usable replacement, or the step's meaning would change. The file stays as it is and the row says what the person must decide.

    A mention is never silently skipped. A skill is never deleted, and no step of a project's own process is removed by the skill: dropping one is an `open`.
11. **Replacements.**

    | Named | Becomes |
    |---|---|
    | `specflow-brainstorm`, `specflow-plan`, `specflow-spec-editor`, `specflow-tests`, `specflow-new-project`, `specflow-ingest`, `specflow-intent-reconcile` | `specflow-spec` |
    | `specflow-request-review`, `specflow-receive-review` | `specflow-review` |
    | `specflow-onboard-codebase`, `specflow-deep-onboard` | `specflow-onboard` |
    | `specflow-lint` | `cortex specs lint` |
    | `specflow-viewer` | `cortex specs view` |
    | `specflow-entry`, `specflow-develop`, `specflow-bugs` | none: `open`, noting that the `## Specs` block's rules now do this work |
    | `cortex-archive-ingest`, `cortex-ingest` | `cortex-remember` (its source digest) |
    | `cortex-extract-insight`, `cortex-loop`, `cortex-loop-*`, `cortex-pulse-*` | none: `open` |
    | `.cortex/<path>` | the target `.cortex-migrate/report.json` gives that path, else the S9.3 mapping; no target: `open` |
    | `.specflow/specs/` | `specflow/impl/` |
    | `.specflow/specs-business/` | `specflow/promises/` |

    A skill replacement applies only when `.claude/skills/<replacement>/SKILL.md` exists, a `cortex specs` or `cortex tasks` one only when the installed `cortex` prints that command in its usage, and a `specflow/` one only when `specflow/` exists at the root, which is after `cortex specs port`. Otherwise the mention is `open` with the reason `replacement not there yet`, and a later run of this step, after `cortex sync`, picks it up.
12. **This step changes no project file outside the listed ones.** A bundle's `.cortex-installed.json` marker is never edited, so an edited bundle no longer matches its marker or the package's copy, and `cortex sync` leaves it alone.
13. **A retired skill with local edits** (2026-11-04). `cortex sync` removes a retired skill only when it is unedited, and leaves an edited one to this step. The skill reads the bundle, writes one row in `.cortex-migrate/skill-edits.md` with decision `open` saying what project-specific content it holds, and asks the person to choose: remove it, or keep that content under a new name. It deletes nothing itself. A kept bundle under a new name is then scanned like any other.
14. **Typed only** (owner decision, sitting item 4). The SKILL.md header carries `disable-model-invocation: true`, in the package and in the mirror, so the skill costs no listing context and no agent starts it by itself. Where it is installed, it runs when typed as `/cortex-migrate`. It is not installed in a migrated project (`store.migrate` Rule 18 step 2): there a session reads it at the packaged path the report prints (`store.migrate` Rule 3), and the header does not affect that. `cortex-register-tasks` carries the same line (`core-cli.tasks-register`), and `core-cli.sync` Rule 22 names it as `/cortex-register-tasks`.

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

## Acceptance Criteria: the skill-adjust step (amendment 2026-11-04)

### The step comes after acceptance and after the plan steps

- **Given** the SKILL.md text
- **When** it is read
- **Then** a skill-adjust section follows the plan steps, and it says it runs after `cortex migrate --accept` and stops when `migration.accepted` is not set

### The step's order is stated

- **Given** the SKILL.md text
- **When** that section is read
- **Then** it names, in this order: `cortex sync --dry-run`, reading each file, deciding each mention, editing, `.cortex-migrate/skill-edits.md`, and showing the person

### The three decisions are stated

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names `edited`, `left` and `open`, says no mention is skipped, and says no skill is deleted and a dropped step is an `open`

### The replacement table is complete

- **Given** the SKILL.md text and `RETIRED_SKILL_NAMES`
- **When** each entry is looked up as literal text, the patterns as `cortex-loop-*` and `cortex-pulse-*`
- **Then** the table has a row holding it, plus rows for `.cortex/`, `.specflow/specs/` and `.specflow/specs-business/`

### A replacement must exist first

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says a replacement that is not there yet makes the mention `open` with the reason `replacement not there yet`, and that `specflow/` paths apply only after `cortex specs port`

### Every edit is reported

- **Given** the SKILL.md text
- **When** it is read
- **Then** it lists the columns of `.cortex-migrate/skill-edits.md`: file, line, term, decision, before and after, and reason

### A retired skill with edits goes to the person

- **Given** the SKILL.md text
- **When** that section is read
- **Then** it names the line `is retired but has local edits`, gives such a bundle an `open` row, offers removing it or keeping its content under a new name, and says the skill deletes nothing

### The Never list still holds

- **Given** the SKILL.md text
- **When** its Never section is read
- **Then** it still names `--apply`, `--accept`, `.cortex/`, `cortex/` and committing, and the skill-adjust section says a person commits

### The skill is typed only

- **Given** `skills/cortex-migrate/SKILL.md` and `skills/cortex-register-tasks/SKILL.md`
- **When** each file's frontmatter is parsed
- **Then** `disable-model-invocation` is `true` in both, and `name` and `description` are still present
