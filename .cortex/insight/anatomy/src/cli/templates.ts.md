---
path: src/cli/templates.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 499
size_tokens: 6358
centrality: medium
built_at_commit: "8248c76"
source_sha256: "5a49c2410c12126d15eb330d0810fde28e7449e040b3051bfd2a3c113384dc25"
---
# src/cli/templates.ts

## Purpose
The single source of every literal string `cortex init` writes to disk — schema version and config defaults, gitignore lines, every `.cortex/` directory's `_index.md` active-prompt template, the archive module's index/register templates, the spec-tree skeleton templates, the CLAUDE.md managed block, the fourteen canonical Desktop scheduled-task definitions plus their SKILL.md renderer, and the compass/pulse skeleton leaf templates. No logic beyond string assembly — the shapes themselves are owned by cortex-schema.md.

## Connections
Uses:
- (none src-internal)

Used by:
- src/archive/scaffold.ts: `ARCHIVE_INDEX_TEMPLATE`, `ARCHIVE_REGISTER_TEMPLATE`
- src/cli/init.ts: nearly every export — config defaults, gitignore lines, index templates, spec-tree templates, CLAUDE.md block, scheduled-task templates
- src/hooks/session-start.ts: `SCHEMA_VERSION` — fallback schema version string used when config is unreadable
- src/insight/scaffold.ts: `INSIGHT_INDEX_TEMPLATE` (outside this scope)
- src/loops/onboarding-drift.ts: template/constant reuse for its report (outside this scope)
- src/loops/report.ts: shared pulse report header/templates (outside this scope)
- src/pulse/review.ts: pulse templates (outside this scope)
