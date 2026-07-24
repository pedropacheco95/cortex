---
path: src/cli/templates.ts
extracted_at: 2026-07-23T12:00:00Z
extraction_level: 2
size_lines: 553
size_tokens: 8188
centrality: medium
built_at_commit: "bcbda52"
source_sha256: "2a046cbb448929642717e46792f86d88c046df34a5ca356ececbff39235fab64"
---
# src/cli/templates.ts

## Purpose
The single source of every literal string `cortex init` (and, for the scaffolding mechanism it shares, `cortex sync`) writes to disk — schema version and config defaults, gitignore lines, every `.cortex/` directory's `_index.md` active-prompt template, the archive module's index/register templates, the spec-tree skeleton templates, the CLAUDE.md managed block, the FIVE canonical Desktop scheduled-task BUNDLE definitions (each bundle carrying a `model` field and a hand-written prompt `body`) plus their SKILL.md renderer, and the compass/pulse skeleton leaf templates. No logic beyond string assembly — the shapes themselves are owned by cortex-schema.md. This pass's only change is prose inside three `SCHEDULED_TASKS` bundle bodies (`daily`'s session-observe step, `weekly-curation`'s pulse-distil step, `monthly-review`'s onboarding-drift step) — no new exports, no shape change.

## Connections
Uses:
- (none src-internal)

Used by:
- src/archive/scaffold.ts: `ARCHIVE_INDEX_TEMPLATE`, `ARCHIVE_REGISTER_TEMPLATE`
- src/cli/init.ts: nearly every export — config defaults, gitignore lines, index templates, spec-tree templates, scheduled-task roster
- src/cli/scaffold.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS` — the Rules 10/13/17 mechanism this module's templates feed
- src/cli/sync.ts: `SCHEMA_VERSION`, `CORTEX_INDEXES`, `ARCHIVE_INDEX_TEMPLATE`, `INSIGHT_INDEX_TEMPLATE`, `SCHEDULED_TASKS`, `scheduledTaskSkillMd` — the index-refresh and scheduled-task-payload-refresh comparisons
- src/cli/tasks-register.ts: `SCHEDULED_TASKS` — the bundle roster used to build plan/register rows
- src/hooks/session-start.ts: `SCHEMA_VERSION` — fallback schema version string used when config is unreadable
- src/insight/scaffold.ts: `INSIGHT_INDEX_TEMPLATE` (outside this scope)
- src/loops/onboarding-drift.ts: template/constant reuse for its report (outside this scope)
- src/loops/report.ts: shared pulse report header/templates (outside this scope)
- src/pulse/review.ts: pulse templates (outside this scope)
