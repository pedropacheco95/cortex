---
path: src/cli/templates.ts
extracted_at: 2026-08-07T01:00:00Z
extraction_level: 3
size_lines: 606
size_tokens: 8820
centrality: medium
built_at_commit: "c2de5f6"
source_sha256: "e695cd1f9900ad33b7cb68aa5e7bab292d15f1cfae2ff1da33c366d0477bf72a"
---
# src/cli/templates.ts

## Purpose
The single source of every literal string `cortex init` (and, for the scaffolding mechanism it shares, `cortex sync`) writes to disk — schema version and config defaults, gitignore lines, every `.cortex/` directory's `_index.md` active-prompt template, the archive module's index/register templates, the spec-tree skeleton templates, the CLAUDE.md managed block, the FIVE canonical Desktop scheduled-task BUNDLE definitions plus their SKILL.md renderer, and the compass/pulse skeleton leaf templates. `scopeTaskToProfile(task, profile)` remains the one function in this file with actual branching logic, not just string assembly — it scopes a `ScheduledTask` bundle to a process profile via the `specflowOnlyMembers`/`specflowOnlySkills`/`profiles` optional fields three of the five `SCHEDULED_TASKS` bundles set. This pass (`loops.cortex-loop-bundle`, the eleven-per-loop-skill-bundle merge): every `SCHEDULED_TASKS` entry's `requiredSkills` and body prose were updated for the retired per-loop skill names — `cortex-pulse-hygiene`, `cortex-loop-bug-triage`, `cortex-loop-spec-drift`, etc. are gone from `requiredSkills` (replaced by the single `cortex-loop` skill) and from the numbered body steps (each member now reads `` `cortex-loop` → `references/<loop>.md` `` instead of naming its own retired skill) across all five bundles. No shape change beyond that content update — the rest of the file remains pure string assembly; the shapes themselves are owned by cortex-schema.md.

## Main players
- `SCHEDULED_TASKS` (lines 457–537) — the five canonical Desktop scheduled-task bundles (`daily`, `weekly-curation`, `weekly-quality`, `test-runner`, `monthly-review`), each carrying `model`, `requiredSkills`, a hand-written `body`, and (new) profile-scoping metadata on three of the five. [critical]
- `scopeTaskToProfile` (lines 436–455) — NEW: returns `null` when a bundle doesn't belong to a profile at all (`task.profiles` set and excludes it — only `test-runner` uses this, `profiles: ['specflow']`); otherwise drops `specflowOnlySkills` from `requiredSkills` and prepends a scoping instruction to `body` naming the skipped members in prose (the payload is a prompt run by an agent, so "skip these" is expressed in words, not code) — UNLESS `profile === 'specflow'`, in which case the task is returned untouched, making the default path byte-identical to pre-this-spec behaviour. [critical]
- `ScheduledTask` (lines 394–422) — the bundle interface; `specflowOnlyMembers`/`specflowOnlySkills` name a bundle's Bucket-3 sub-members (dropped under non-specflow), `profiles` (when present) restricts the WHOLE bundle (absent = every profile). [critical]
- `claudeMdBlock` (lines 321–372) — builds the §8 CLAUDE.md managed block with project-name substitution; reproduces cortex-schema.md §8 verbatim including the `## Cortex Insight` section and the `insight/observations/` pointer line. [critical]
- `CORTEX_INDEXES` (lines 47–179) — the §7.1 active-prompt `_index.md` template for every `.cortex/` module directory, keyed by path relative to `.cortex/`. [supporting]
- `scheduledTaskSkillMd` (lines 548–565) — renders one bundle's SKILL.md payload (frontmatter `name`/`description`/`model`, the ownership-marker comment, the body). [supporting]
- `INSIGHT_INDEX_TEMPLATE` (lines 191–213) — the LOCKED §7.4 insight-module active-prompt text; `check.index-shape` exempts this one file from the general §7.1 heading contract. [supporting]
- `CONFIG_DEFAULTS` (lines 20–26) — schema §10.1 default config object (no `profile` key here — the profile is applied separately by `freshConfig` in init.ts, not baked into this shared default). [supporting]

## Insights
- **`scopeTaskToProfile` is the ONE place in this file where a profile value changes what gets WRITTEN, not just recorded.** Every other profile-related touch elsewhere in the codebase (checks/config.ts's validation, session-start.ts's entry line) reads the profile but doesn't transform output; this function is the actual scoping mechanism both `scaffold.ts`'s `writeScheduledTasks` and `sync.ts`'s `syncScheduledTaskPayloads` call before writing anything.
- Bundle-to-Bucket mapping is explicit in the `SCHEDULED_TASKS` array itself, not derived: `daily` sets `specflowOnlyMembers: ['bug-triage', 'spec-drift']` (its other three members — hygiene, insight-refresh-daily, session-observe — are Bucket-1 and run under every profile); `weekly-quality` sets `specflowOnlyMembers: ['specflow-lint', 'specflow-verify']` (its third member, insight-refresh-full, is Bucket-1); `test-runner` sets `profiles: ['specflow']` on the WHOLE bundle because its single member (the code-writing test-runner loop) is entirely spec-first work with no Bucket-1 half to keep. `weekly-curation` and `monthly-review` carry neither field — both are Bucket-1 in their entirety and pass through unscoped under every profile.
- The scoping instruction text `scopeTaskToProfile` prepends is deliberately explicit about non-failure: `"Skipping them is not a failure — do not record it as one, and do not report a missing report for them."` — without this, an agent running the bundle under `superpowers` might otherwise flag the absent bug-triage/spec-drift reports as an error.
- **`requiredSkills` narrowed alongside the retirement/addition chains in `src/cli/scaffold.ts`:** the `daily` bundle's `specflowOnlySkills` shrank from three droppable skills to just `specflow-bugs`, because `cortex-loop` now also houses that bundle's Bucket-1 members (hygiene, insight-refresh-daily, session-observe) and so can never be dropped under a non-specflow profile (`loops.cortex-loop-bundle` Rule 6) — `weekly-curation`, `weekly-quality`, `test-runner`, and `monthly-review` each collapse their multi-skill `requiredSkills` list down to `cortex-loop` (plus any still-standalone skill like `specflow-lint`/`cortex-extract-insight`) the same way.
- No logic beyond `scopeTaskToProfile` exists in this file — everything else really is string assembly; the shapes are schema-owned, this file just supplies the literal bytes.

## File map
- Lines 1–9: doc comment, `SCHEMA_VERSION` (now `'3.3'`).
- Line 11: `PRESENT_MODULES`.
- Lines 13–26: `CONFIG_DEFAULTS`.
- Lines 28–39: `GITIGNORE_LINES`.
- Lines 41–179: `CORTEX_INDEXES` (per-module `_index.md` templates).
- Lines 181–213: `INSIGHT_INDEX_TEMPLATE` (locked text).
- Lines 215–236: `ARCHIVE_INDEX_TEMPLATE`.
- Lines 238–250: `ARCHIVE_REGISTER_TEMPLATE`.
- Lines 252–272: `SPECS_INDEX_TEMPLATE`.
- Lines 274–290: `SPECS_OVERVIEW_TEMPLATE`.
- Lines 292–308: `SPECS_BUSINESS_OVERVIEW_TEMPLATE`.
- Lines 310–372: `claudeMdBlock()`.
- Lines 374–422: `ScheduledTask` interface (profile-scoping fields at 419–421).
- Lines 424–455: `scopeTaskToProfile()` (NEW).
- Lines 457–537: `SCHEDULED_TASKS` (the five bundles).
- Lines 539–565: `scheduledTaskSkillMd()`.
- Lines 567–580: `COMPASS_ENVIRONMENT_TEMPLATE`, `COMPASS_DO_NOT_REPEAT_TEMPLATE`.
- Lines 582–594: `pulseReportHeader()`.
- Lines 596–610: `pulseDismissedTemplate()`.

## Connections
Uses:
- src/cli/profile.ts: `ProcessProfile` (type only, NEW) — `ScheduledTask.profiles` and `scopeTaskToProfile`'s parameter.

Used by:
- src/archive/scaffold.ts: `ARCHIVE_INDEX_TEMPLATE`, `ARCHIVE_REGISTER_TEMPLATE`
- src/cli/init.ts: nearly every export — config defaults, gitignore lines, index templates, spec-tree templates, scheduled-task roster
- src/cli/scaffold.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS`, `scopeTaskToProfile` — the Rules 10/13/17 mechanism this module's templates feed
- src/cli/sync.ts: `SCHEMA_VERSION`, `CORTEX_INDEXES`, `ARCHIVE_INDEX_TEMPLATE`, `INSIGHT_INDEX_TEMPLATE`, `SCHEDULED_TASKS`, `scopeTaskToProfile`, `scheduledTaskSkillMd` — the index-refresh and scheduled-task-payload-refresh comparisons
- src/cli/tasks-register.ts: `SCHEDULED_TASKS` — the bundle roster used to build plan/register rows
- src/hooks/session-start.ts: `SCHEMA_VERSION` — fallback schema version string used when config is unreadable
- src/insight/scaffold.ts: `INSIGHT_INDEX_TEMPLATE` (outside this scope)
- src/loops/onboarding-drift.ts: template/constant reuse for its report (outside this scope)
- src/loops/report.ts: shared pulse report header/templates (outside this scope)
- src/pulse/review.ts: pulse templates (outside this scope)

## Query pointers
- If you need to see exactly which scheduled-task members are Bucket-1 vs Bucket-3, read the `SCHEDULED_TASKS` array's `specflowOnlyMembers`/`profiles` fields directly — they are the authoritative source, not a separately-maintained table.
- If you need to trace how a profile value reaches this file, also read src/cli/profile.ts (`readProfile`) and the two callers of `scopeTaskToProfile`: src/cli/scaffold.ts (`writeScheduledTasks`) and src/cli/sync.ts (`syncScheduledTaskPayloads`).
- If you need every literal artefact `cortex init`/`cortex sync` write, this file is the complete inventory — cross-reference against cortex-schema.md for the shape each template is required to satisfy.
