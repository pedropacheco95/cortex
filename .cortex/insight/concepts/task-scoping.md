# task-scoping

Project-scoped naming of Claude Desktop scheduled tasks so one global `~/.claude/scheduled-tasks/` namespace can hold many projects' tasks without collision. Two-tier scheme: the default plain form is `<project-slug>-<canonical-task-name>` (`scopedTaskName()`, no hash); `<project-slug>-<short-hash>-<canonical-task-name>` (`hashScopedTaskName()`) is only the collision-fallback (and legacy pre-revision) form.

## Files

- src/cli/init.ts
- src/cli/task-scoping.ts
