---
path: src/cli/templates.ts
extracted_at: 2026-07-10T10:00:00Z
extraction_level: 2
size_lines: 515
size_tokens: 7501
centrality: medium
built_at_commit: "5f24181"
source_sha256: "35feea6d9b01cce211a116a8ac962cc4ef96373ef03c79393ae39d3cf1f65948"
---
# src/cli/templates.ts

## Purpose
The single source of every literal string `cortex init` writes to disk — schema version and config defaults, gitignore lines, every `.cortex/` directory's `_index.md` active-prompt template, the archive module's index/register templates, the spec-tree skeleton templates, the CLAUDE.md managed block, the FIVE canonical Desktop scheduled-task BUNDLE definitions (v3.0 consolidation of the prior fourteen standalone loop registrations, each bundle now carrying a `model` field) plus their SKILL.md renderer, and the compass/pulse skeleton leaf templates. No logic beyond string assembly — the shapes themselves are owned by cortex-schema.md.

## Connections
Uses:
- (none src-internal)

Used by:
- src/archive/scaffold.ts: `ARCHIVE_INDEX_TEMPLATE`, `ARCHIVE_REGISTER_TEMPLATE`
- src/cli/init.ts: nearly every export — config defaults, gitignore lines, index templates, spec-tree templates, CLAUDE.md block, scheduled-task templates
- src/cli/tasks-register.ts: `SCHEDULED_TASKS` — the bundle roster used to build plan/register rows
- src/hooks/session-start.ts: `SCHEMA_VERSION` — fallback schema version string used when config is unreadable
- src/insight/scaffold.ts: `INSIGHT_INDEX_TEMPLATE` (outside this scope)
- src/loops/onboarding-drift.ts: template/constant reuse for its report (outside this scope)
- src/loops/report.ts: shared pulse report header/templates (outside this scope)
- src/pulse/review.ts: pulse templates (outside this scope)
