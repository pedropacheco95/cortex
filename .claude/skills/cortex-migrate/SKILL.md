---
name: cortex-migrate
description: 'Decide what a 3.x .cortex/ store keeps before cortex migrate --apply: read the working files Core cannot judge and write the plan file (rescue, digest or retire, with a reason). Use when asked to migrate a project to the 4.0 store.'
disable-model-invocation: true
---

# Cortex: migrate (the agentic half)

`cortex migrate` is deterministic, so it cannot tell whether a 3.x working file holds knowledge. You read what it cannot judge, and decide each file. Your decisions become the plan file, and Core applies them. The rule is that no information is lost: a file is retired only when what it says is kept elsewhere, can be regenerated, or is scaffolding.

Work in `.cortex-migrate/`, and add that line to the file `git rev-parse --git-path info/exclude` prints (never to `.gitignore`).

## Steps, in order

1. **Dry run.** Run `cortex migrate --json --report .cortex-migrate/report.json`. Add `--visibility public` or `--visibility private` when the person has said which the repository is. If the command prints a usage text instead, or `report.json` has no `noLoss` field, the installed `cortex` predates the 4.0 store: stop, and say so.
2. **Read.** From the report, take every entry that is retired as `unpromoted work` or `not a store folder` (its `undecided` field is true), every entry with a `review` flag, and every file under `concepts`. Work through them in folder groups, opening the files as needed. In a set of passes and their merge, read the merge first.
3. **Decide each one**, and give each decision a one-line reason (see Deciding below).
4. **Write** `plan.json` and `decisions.md` in `.cortex-migrate/`. `decisions.md` is a table of ref, decision, target and reason, so that a person can audit every call.
5. **Re-run** `cortex migrate --plan .cortex-migrate/plan.json`, and fix any error it names.
6. **Stop** when both no-loss lines (`tracked:` and `untracked:`) show `undecided: 0`. Show the person those two lines and `decisions.md`. A person runs `--apply`.

## Deciding

The plan file is JSON. Each key is an entry ref, or a folder key ending in `/**`. An exact ref always wins over a folder key. Each value takes one of these forms:

- `"world/terms/fare.md"`: rescue the text verbatim, at a 4.0 target picked by the kind → folder table in `cortex/MAP.md` (or schema Part II S8.2);
- `"history/sources/raw/<folder>/<name>"`: keep the file byte for byte, in the gitignored raw folder;
- `{ "target": "<path>", "file": ".cortex-migrate/digests/<slug>.md" }`: a digest. You write the body, with no frontmatter, and migrate supplies the frontmatter and the origin;
- `"retired"`: nothing of value is lost. Name what supersedes the file in the reason.

How to choose:

- **Rescue** a file that is small, self-contained, and holds knowledge kept nowhere else.
- **Digest** the knowledge that sits in a large or raw work file. Keep what a person or agent would need, and drop the scaffolding.
- **Retire** a file that is regenerable, superseded (by a kept bug, rule, term, decision or spec), or scaffolding. Use a folder key when a whole folder retires for one reason, with exact refs for the files in it that you keep.
- Keep one consolidated copy when several files hold the same thing (passes and their merge). Rescue the most complete version, and retire the others as superseded by it.
- An unanswered question for a person is knowledge and is never retired: rescue it, or digest it into `now/`.
- A pending proposal is never retired: digest it to `now/proposals.md`, one `## <id>: <title>` heading per proposal. Use the 3.x id where it has one, else `P-<report stem>-<n>`.
- A recorded reason for a dismissal or a rejection is a "why we didn't": rescue it, for example into `world/decisions/`.
- Tests, scripts and other non-markdown work are rescued only as raw or as a digest, never into `world/` or `code/`. For a set of passes, keep the latest suite and retire the others.
- When two kept files disagree, the digest records both statements with their refs, and never picks one.
- A concept definition that encodes domain meaning goes to `world/terms/<term>.md`. One that only describes what code does stays dropped.

## The skill-adjust step

Every other skill in a project that names a retired skill or the old store is checked and adjusted if needed. This step runs after a person has run `cortex migrate --accept`. If `migration.accepted` is not set, stop and say so. This step may run in a later session, so add `.cortex-migrate/` to the exclude file first if it is not there.

1. Run `cortex sync --dry-run`, which writes nothing, and read its `project skills to adjust` section and its `is retired but has local edits` lines.
2. Read each listed file in full, and every mention in it.
3. Decide each mention (below).
4. Make the edits, changing only the words the decision needs.
5. Write `.cortex-migrate/skill-edits.md`: one row per mention, with file, line, term, decision, the text before and after, and a one-line reason.
6. Show the person the counts and the file. A person commits, and `cortex sync --dry-run` should then list only the mentions decided `left` or `open`.

Each mention gets exactly one decision:

- **edited**: the skill told an agent to use the retired name or path, and the table gives a replacement that exists;
- **left**: the mention needs no change, such as history or a changelog, with the reason;
- **open**: the table gives no usable replacement, or the step's meaning would change. The file stays as it is and the row says what the person must decide.

A mention is never silently skipped. A skill is never deleted, and no step of a project's own process is removed by you: dropping one is an `open`.

| Named | Becomes |
|---|---|
| `specflow-brainstorm`, `specflow-plan`, `specflow-spec-editor`, `specflow-tests`, `specflow-new-project`, `specflow-ingest`, `specflow-intent-reconcile` | `specflow-spec` |
| `specflow-request-review`, `specflow-receive-review` | `specflow-review` |
| `specflow-onboard-codebase`, `specflow-deep-onboard` | `specflow-onboard` |
| `specflow-lint` | `cortex specs lint` |
| `specflow-viewer` | `cortex specs view` |
| `specflow-entry`, `specflow-change-router`, `specflow-develop`, `specflow-bugs` | none: `open`, noting that the `## Specs` block's rules now do this work |
| `cortex-archive-ingest`, `cortex-ingest` | `cortex-remember` (its source digest) |
| `_conventions`, `cortex-extract-insight`, `cortex-loop`, `cortex-loop-*`, `cortex-pulse-*` | none: `open` |
| `.cortex/<path>` | the target `.cortex-migrate/report.json` gives that path, else the S9.3 mapping; no target: `open` |
| `.specflow/specs/` | `specflow/impl/` |
| `.specflow/specs-business/` | `specflow/promises/` |

A skill replacement applies only when `.claude/skills/<replacement>/SKILL.md` exists, a `cortex specs` or `cortex tasks` one only when the installed `cortex` prints that command in its usage, and a `specflow/` one only when `specflow/` exists at the root, which is after `cortex specs port`. Otherwise the mention is `open` with the reason `replacement not there yet`, and a later run of this step, after `cortex sync`, picks it up.

This step changes no project file outside the listed ones. A bundle's `.cortex-installed.json` marker is never edited, so an edited bundle no longer matches its marker or the package's copy, and `cortex sync` leaves it alone.

### A retired skill with local edits

`cortex sync` removes a retired skill only when it is unedited, and leaves an edited one here, with the line `is retired but has local edits`. Read the bundle, write one row in `.cortex-migrate/skill-edits.md` with decision `open` saying what project-specific content it holds, and ask the person to choose: remove it, or keep that content under a new name. Delete nothing yourself. A kept bundle under a new name is then scanned like any other.

## Never

- Never run `cortex migrate --apply` or `cortex migrate --accept`.
- Never write under `.cortex/` or `cortex/`. Only `.cortex-migrate/` is yours, plus the listed files under `.claude/skills/` in the skill-adjust step.
- Never commit.
