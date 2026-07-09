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

`~/.claude/scheduled-tasks/` is one namespace per user; unscoped names collide the moment a second project runs `cortex init`. This spec owns the schema §9.1 naming scheme — the plain default `<project-slug>-<canonical-task-name>` with a `<project-slug>-<short-hash>-<canonical-task-name>` fallback engaged only on a proven collision — the ownership marker that makes a plain-named dir attributable to its project, the five canonical bundle names, its application in init's task writer, project-scoped recognition in `--partial`, and the `cortex tasks rename` migration for projects registered under any prior naming generation (unscoped legacy names and the pre-consolidation hash-scoped names alike).

## Entities

- **READS:** the project root path (slug + hash inputs); `~/.claude/scheduled-tasks/` entries and their ownership markers; the canonical bundle-name set (schema §9.1).
- **WRITES:** `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` (via init), including the ownership marker in the body; directory renames plus marker stamping (via `cortex tasks rename`).
- **CREATES:** `scopedTaskName(root, canonical)` (plain form), `hashScopedTaskName(root, canonical)` (fallback), `resolveScopedTaskName(tasksDir, root, canonical)` (collision-aware selector), the ownership-marker helpers (`taskDirProjectRoot`, marker stamping), `isOwnScopedTask`, and slug/hash helpers, shared by init and the rename subcommand.

## Rules

1. **Naming per schema §9.1, exactly:** slug transformation (lowercase; non-`[a-z0-9-]` → `-`; collapse; trim; empty → `project`); the plain default `<slug>-<canonical>`; the `<slug>-<hash6>-<canonical>` fallback (SHA256-of-absolute-path first 6 hex) engaged only when the plain dir already carries an ownership marker for a **different** project root; the **five canonical bundle names** — `daily`, `weekly-curation`, `weekly-quality`, `test-runner`, `monthly-review` (the pre-consolidation per-loop short ids and canonical names — e.g. `hygiene` / `cortex-pulse-hygiene`, `specflow-lint`, … — are now *retired* task identities, mapped to their new bundle only for cleanup, Rule 4).
2. **Init writes scoped names, plain by default.** The task writer creates `<scoped-name>/SKILL.md` with frontmatter `name:` = the resolved scoped name (`resolveScopedTaskName`) and stamps the ownership marker (`<!-- cortex-project-root: <resolved-root> -->`) in the body; **the prompt body invokes each member loop's underlying skill by its real name**, in sequence — registration identity (one bundle name) and execution identity (several member skills) are distinct (§9.1). The Desktop app derives the display name from the id (dash→space, capitalize first letter), so the plain id `cortex-daily` shows as "Cortex daily".
3. **Project-scoped recognition.** Init's exists/preserve/overwrite logic (`--partial` included) matches only **this project's** tasks: its plain `<slug>-<canonical>` name — accepted only when the dir's ownership marker is absent or names this root (a marker naming a different root rejects it) — or its `<slug>-<hash6>-<canonical>` fallback name. Other projects' tasks — including a same-slug project's plain-named dir carrying a foreign marker — and non-Cortex tasks are never counted, listed, overwritten, or skipped-with-notice.
4. **`cortex tasks rename`.** Migrates **every prior naming generation** to the current one, in two phases: (a) this project's pre-consolidation `<slug>-<hash6>-<canonical>` dirs move to their resolved current names; (b) unscoped legacy-named dirs (the known internal short-id set and bare canonical names — carrying no project identity, so the command claims them for the current project) move to this project's resolved scoped names. Each move rewrites the frontmatter `name:` and stamps the ownership marker, leaving the rest of the body byte-identical, and reports each move. The known legacy set spans **all fourteen retired task identities under both the old hash-scoped grammar and the plain grammar** so a project registered under either generation migrates cleanly onto the five bundles. Idempotent: nothing legacy → "Nothing to rename.", exit 0. Target already exists → skip that entry with a notice, exit 0. Names outside the known set are never touched.
5. **Deterministic Core** (R-001): pure file I/O; the only writes are the task directory and its SKILL.md.

## Acceptance Criteria

### Scoped name construction

- **Given** a project at `/Users/me/dev/My API_v2`
- **When** `scopedTaskName` runs for the `daily` bundle
- **Then** the plain name is `my-api-v2-daily`
- **And** `hashScopedTaskName` for the same bundle is `my-api-v2-<h6>-daily` where `<h6>` is the first 6 hex of SHA256 of the absolute path
- **And** `resolveScopedTaskName` returns the plain `my-api-v2-daily` unless a dir of that name already carries an ownership marker for a different project root, in which case it returns the hash-fallback form

### Two same-named projects don't collide

- **Given** fixture projects at `<tmp>/work/api` and `<tmp>/personal/api`, both fully init'd with a fake home
- **When** both register tasks
- **Then** the second to register, finding the first's plain-named dirs carrying a foreign ownership marker, falls back to its hash-scoped names, so the home holds two disjoint task sets each attributable by name + marker, with zero overwrites

### Registration identity vs execution identity

- **Given** any scoped task written by init
- **Then** its frontmatter `name:` is the resolved scoped bundle name, its body carries the ownership marker for this project root, and its body invokes each member loop's underlying skill by its real name (e.g. the `daily` bundle invokes `cortex-pulse-hygiene`, `cortex-loop-bug-triage`, … — never the scoped bundle name)

### --partial recognises only its own project

- **Given** a fake home holding another project's scoped tasks (including a same-slug project's plain-named dir carrying a foreign marker) and a user's unrelated task
- **When** `cortex init --partial` runs for this project
- **Then** the summary's registered/preserved/skipped counts reflect only this project's tasks and the foreign entries are byte-untouched

### Rename migrates every prior generation, idempotently

- **Given** a fake home with an unscoped legacy `hygiene/`, a pre-consolidation hash-scoped `<slug>-<h6>-cortex-loop-spec-drift/`, an unrelated `daily-report/`, and a pre-existing scoped target for one legacy entry
- **When** `cortex tasks rename` runs
- **Then** the legacy Cortex entries (both grammars) move to this project's current bundle names with frontmatter rewritten and the ownership marker stamped, bodies otherwise byte-identical, the collision is skipped with a notice, `daily-report/` is untouched, and each move is reported
- **And** a second run reports nothing to rename, exit 0

## Notes

- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
