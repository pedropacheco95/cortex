---
path: src/cli/task-scoping.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 174
size_tokens: 1775
centrality: low
built_at_commit: "8248c76"
source_sha256: "e85a1c2eb988e514742ec2a772b2a069e4740de44754ea6a87c8f5b59c8da20e"
---
# src/cli/task-scoping.ts

## Purpose
Implements project-scoping for Claude Desktop scheduled tasks — since `~/.claude/scheduled-tasks/` is one global namespace per user, every Cortex-managed task name is prefixed `<project-slug>-<short-hash>-<canonical-task-name>` (schema §9.1). Also provides the one-time `cortex tasks rename` migration that moves legacy unscoped task directories to their scoped names, rewriting only the frontmatter `name:` line and leaving the SKILL.md body byte-identical.

## Connections
Uses:
- (none src-internal)

Used by:
- src/cli/init.ts: uses `CANONICAL_TASK_NAMES`, `RETIRED_CANONICAL_TASK_NAMES`, and `scopedTaskName` to write and retire this project's scheduled tasks under scoped names
