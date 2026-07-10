---
path: src/cli/task-scoping.ts
extracted_at: 2026-07-10T10:00:00Z
extraction_level: 3
size_lines: 315
size_tokens: 3408
centrality: low
built_at_commit: "5f24181"
source_sha256: "acc60130cc686ce95a26f673ec30aa3d0d2bf33d492196743797d1c338c3f191"
---
# src/cli/task-scoping.ts

## Purpose
Implements project-scoping for Claude Desktop scheduled tasks — since `~/.claude/scheduled-tasks/` is one global namespace per user, every Cortex-managed task name is prefixed `<project-slug>-<canonical-task-name>` (schema §9.1), falling back to `<project-slug>-<short-hash>-<canonical-task-name>` only when the plain name is already owned by a DIFFERENT project (detected via a deterministic ownership-marker comment, `<!-- cortex-project-root: /abs/path -->`, stamped into every payload SKILL.md body Cortex writes or migrates). Also provides the one-time `cortex tasks rename` migration that moves legacy unscoped or pre-revision hash-scoped task directories to their resolved current names, rewriting only the frontmatter `name:` line and the ownership marker while leaving the rest of the SKILL.md body byte-identical.

## Connections
Uses:
- (none src-internal)

Used by:
- src/cli/init.ts: uses `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName`, `hashScopedTaskName`, `resolveScopedTaskName`, `taskDirProjectRoot` to write and retire this project's scheduled tasks under scoped/collision-resolved names
- src/cli/tasks-register.ts: uses `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, `scopedTaskName` to build the registration plan's per-bundle ids and to identify retired registry entries to drop
- src/cli/cli.ts: the `tasks rename` verb dynamically imports and calls `tasksRename` directly

## Main players
- `resolveScopedTaskName` (lines 168–175) — the §9.1 collision-resolution entry point: returns the plain `<slug>-<canonical>` name unless that dir already exists under a DIFFERENT project's ownership marker, in which case it falls back to the hash form. This is the function `writeScheduledTasks` (init.ts) actually calls to decide where to write a payload. [critical]
- `hashScopedTaskName` (lines 126–128) — `<project-slug>-<short-hash>-<canonical-task-name>`, the collision-fallback grammar (also the pre-revision legacy grammar every task dir carried before scoping landed). [critical]
- `taskDirProjectRoot` (lines 152–157) — reads a task dir's SKILL.md ownership marker; undefined means "owner unknown," never proof of foreignness. Backs both collision resolution and the retired-task-removal guard in `writeScheduledTasks`. [critical]
- `scopedTaskName` (lines 116–118) — the plain `<project-slug>-<canonical-task-name>` name; pure, collision-unaware (collision awareness lives in `resolveScopedTaskName`). [critical]
- `migrateHashScopedTaskDirs` (lines 244–264) — self-heal migration: renames this project's pre-revision `<slug>-<hash6>-<canonical>` dirs to their currently-resolved names on every `cortex init` / `tasks plan|register|rename` run; idempotent, no-ops when the plain name is owned by another project (source==target). [supporting]
- `tasksRename` (lines 280–315) — the `cortex tasks rename` CLI entry: runs `migrateHashScopedTaskDirs` (phase 1) then claims any unscoped legacy-named dirs (internal short ids or bare canonical names) for the current project (phase 2); idempotent, exit 0 always. [critical]
- `isOwnScopedTask` (lines 185–200) — recognizes whether a directory name belongs to this project (hash-form or plain-form, the latter additionally checked against the ownership marker when `tasksDir` is supplied). [supporting]

## Insights
- The ownership marker is an HTML comment, not a frontmatter key — chosen because the Desktop app parses SKILL.md frontmatter and an unknown key risks rejection, and because the SKILL.md is the only artefact the payload contract owns (no sidecar file).
- Collision resolution requires a POSITIVE mismatch to fall back to the hash form: a plain-named dir with no ownership marker at all is claimed as this project's own (every dir Cortex places at a plain name is stamped, so an unmarked one is either a user-edited payload or an improbable hand-made stranger matching the naming grammar).
- `migrateHashScopedTaskDirs` and `tasksRename`'s phase 1 do the same underlying rename, but `migrateHashScopedTaskDirs` runs silently as a self-heal step on every relevant command, while `tasksRename` is the explicit, reporting CLI verb — `tasksRename` calls `migrateHashScopedTaskDirs` directly and folds its output into its own report lines.
- `claimSkillMd` (private, lines 217–233) rewrites ONLY the frontmatter `name:` line and stamps/refreshes the ownership marker immediately after the frontmatter block — every other body byte stays identical, so a user's edits to a payload's prompt body survive a rename untouched.
- `RETIRED_CANONICAL_TASK_NAMES` carries two generations of deregistration: (a) the pre-v3 v2 insight pair and deep anatomy refresh, and (b) the fourteen standalone v3.0-pre-consolidation loop canonicals (skill-suggest retired outright, its lens folded into pulse-distil) now superseded by the five bundles in `CANONICAL_TASK_NAMES` — both are cleaned so a re-init replaces old generations with the current one rather than leaving duplicates.

- The Claude Desktop app derives a scheduled task's UI display name from the task id (kebab-case dashes → spaces, first letter capitalized), not from SKILL.md frontmatter `name` (confirmed by reading the app's asar bundle); canonical task ids are chosen so they render as pretty titles. (claude-sessions/pedropacheco1/3bac199d-2d61-471f-b48b-f91c871cd282)
- Project ownership of a scoped task dir is marked by an HTML comment `<!-- cortex-project-root: /abs/path -->` after the SKILL.md frontmatter (not a frontmatter key — the app parses frontmatter and unknown keys are risky; not a sidecar file). A missing marker is treated as ours (keeps user-edited payloads byte-preserved); a marker naming a different root is foreign. (claude-sessions/pedropacheco1/3bac199d-2d61-471f-b48b-f91c871cd282)
## Query pointers
- If you need the exact set of five canonical bundle names, also read src/cli/templates.ts (`SCHEDULED_TASKS`).
- If you need how these scoped names are actually written to disk, also read src/cli/init.ts (`writeScheduledTasks`).
- If you need how these scoped names are registered/verified against the Desktop app's own registry, also read src/cli/tasks-register.ts.
