---
id: core-cli.task-scoping
status: implemented
depends_on:
  - core-cli.init
governs:
  - "src/cli/task-scoping.ts"
implements: ../../specs-business/core-cli/developer-runs-cortex-on-every-project.business.md
governed_by:
  - R-001
---

# Scheduled-Task Project Scoping

## Intent

`~/.claude/scheduled-tasks/` is one namespace per user; unscoped names collide the moment a second project runs `cortex init`. This spec owns the schema §9.1 naming scheme — `<project-slug>-<short-hash>-<canonical-task-name>` — its application in init's task writer, project-scoped recognition in `--partial`, and the `cortex tasks rename` migration for projects registered under the old names.

## Entities

- **READS:** the project root path (slug + hash inputs); `~/.claude/scheduled-tasks/` entries; the canonical task-name set (schema §9.1).
- **WRITES:** `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` (via init); directory renames (via `cortex tasks rename`).
- **CREATES:** `scopedTaskName(root, canonical)` and slug/hash helpers, shared by init and the rename subcommand.

## Rules

1. **Naming per schema §9.1, exactly:** slug transformation (lowercase; non-`[a-z0-9-]` → `-`; collapse; trim; empty → `project`), SHA256-of-absolute-path first 6 hex, canonical task names for all twelve tasks (the internal short ids map to canonical: `hygiene` → `cortex-pulse-hygiene`, `specflow-lint` → `specflow-lint`, etc.).
2. **Init writes scoped names.** The task writer creates `<scoped-name>/SKILL.md` with frontmatter `name:` = the scoped name; **the prompt body invokes the underlying skill by its real name** — registration identity and execution identity are distinct (§9.1).
3. **Project-scoped recognition.** Init's exists/preserve/overwrite logic (`--partial` included) matches only entries with **this project's** `<slug>-<hash>-` prefix and a canonical suffix. Other projects' tasks — and non-Cortex tasks — are never counted, listed, overwritten, or skipped-with-notice.
4. **`cortex tasks rename`.** Enumerates entries under the **legacy names** (the known internal short-id set and canonical set, unscoped), moves each to this project's scoped name, rewrites the frontmatter `name:`, leaves the body untouched, and reports each move. Idempotent: nothing legacy → "nothing to rename", exit 0. Target already exists → skip that entry with a notice, exit 0. Entries outside the known set are never touched. (Legacy names carry no project identity; the command documents that it claims them for the current project — the one-time migration reality.)
5. **Deterministic Core** (R-001): pure file I/O; the only writes are the task directory and its SKILL.md.

## Acceptance Criteria

### Scoped name construction

- **Given** a project at `/Users/me/dev/My API_v2`
- **When** `scopedTaskName` runs for `cortex-pulse-hygiene`
- **Then** the name is `my-api-v2-<h6>-cortex-pulse-hygiene` where `<h6>` is the first 6 hex of SHA256 of the absolute path

### Two same-named projects don't collide

- **Given** fixture projects at `<tmp>/work/api` and `<tmp>/personal/api`, both fully init'd with a fake home
- **When** both register tasks
- **Then** the home holds two disjoint task sets, each attributable by prefix, with zero overwrites

### Registration identity vs execution identity

- **Given** any scoped task written by init
- **Then** its frontmatter `name:` is the scoped name and its body invokes the underlying skill's real name (`cortex-pulse-hygiene`, not the scoped name)

### --partial recognises only its own project

- **Given** a fake home holding another project's scoped tasks and a user's unrelated task
- **When** `cortex init --partial` runs for this project
- **Then** the summary's registered/preserved/skipped counts reflect only this project's tasks and the foreign entries are byte-untouched

### Rename migrates legacy tasks, idempotently

- **Given** a fake home with legacy `hygiene/`, `specflow-lint/`, an unrelated `daily-report/`, and a pre-existing scoped target for one legacy entry
- **When** `cortex tasks rename` runs
- **Then** the legacy Cortex entries move to scoped names with frontmatter rewritten and bodies byte-identical, the collision is skipped with a notice, `daily-report/` is untouched, and each move is reported
- **And** a second run reports nothing to rename, exit 0

## Notes

- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
