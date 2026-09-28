---
path: src/cli/templates.ts
extracted_at: 2026-09-22T00:00:00Z
extraction_level: 3
size_lines: 679
size_tokens: 9988
centrality: high
built_at_commit: "a66041b"
source_sha256: "4591d59e1b09eb9e17c1550c90acecd2b9e61869643cc93b67b98a53e9b5f3b6"
---
# src/cli/templates.ts

## Purpose
The single source of every literal string `cortex init` (and, for the scaffolding mechanism it shares, `cortex sync`) writes to disk — schema version and config defaults, gitignore lines, every `.cortex/` directory's `_index.md` active-prompt template, the archive module's index/register templates, the spec-tree skeleton templates, the CLAUDE.md managed block, the five canonical Desktop scheduled-task bundle definitions plus their SKILL.md renderer, and the compass/pulse skeleton leaf templates. `SCHEMA_VERSION` bumped `'3.3'` → `'3.4'` this pass. `CONFIG_DEFAULTS` gained two new keys: `hooks.readDefer: false` (3.4 third revision — switches on the PreRead row's read-deferral mode; registers no hook and changes nothing while false, but is written explicitly on fresh projects so the config self-documents — this is RULES.md rule 6's one measured exception to "hooks never block") and `visibility: { repo: 'unknown', allow: [] }` (3.4 fifth revision — makes the repository's visibility, which Core cannot detect, a visible question per `schema.visibility` Rule 1 / RULES.md rule 20; `cortex sync` never adds this key to an existing config). `GITIGNORE_LINES` gained `.cortex/recall-index.json` (3.4 amendment to Decision 1 — the compiled, regenerable recall index joins `constellation.json` in the gitignored quadrant). `CORTEX_INDEXES`' compass entry now mentions `registry.md`/`cortex id next`, its atlas entry gained an `evidence/` bullet and a `bears_on:` navigation pointer, and a new `atlas/evidence` key was added with its own index template. The CLAUDE.md-block machinery gained a genuinely new function, `placementTail(config)` — renders the schema §8 `{{PLACEMENT_TAIL}}` fragment (the notes-directory sentence when `placement.localNotesDir` is set, then a visibility sentence: rule 20's public-repo notice, an "unknown — set it" nudge, or nothing when private) — and `claudeMdBlock` now takes an optional `config` parameter it threads straight into `placementTail`, appended to the **Placement:** paragraph; the protocol paragraph also gained a sentence naming non-implementer roles ("sessions that dispatch, review or plan rather than edit"). `scopeTaskToProfile` remains the one function in this file with real branching logic (not string assembly) — unchanged in shape this pass.

## Main players
- `placementTail` (lines 362–383, NEW) — builds the §8 placement-tail fragment from `config.placement.localNotesDir` and `config.visibility.repo`; never throws (an unrecognised `repo` value is treated the same as `unknown`). [critical]
- `claudeMdBlock` (lines 392–444) — builds the §8 CLAUDE.md managed block with project-name substitution and, new this pass, an optional `config` object passed straight to `placementTail`; reproduces cortex-schema.md §8 verbatim. [critical]
- `SCHEDULED_TASKS` (lines 531–605) — the five canonical Desktop scheduled-task bundles (`daily`, `weekly-curation`, `weekly-quality`, `test-runner`, `monthly-review`); unchanged in content this pass. [critical]
- `scopeTaskToProfile` (lines 510–529) — scopes a bundle to a process profile; `null` when `task.profiles` excludes it, otherwise drops `specflowOnlySkills` and prepends a scoping instruction to `body` unless `profile === 'specflow'` (byte-identical pass-through). [critical]
- `ScheduledTask` (lines 468–496) — the bundle interface; `specflowOnlyMembers`/`specflowOnlySkills` name Bucket-3 sub-members, `profiles` (when present) restricts the WHOLE bundle. [critical]
- `CONFIG_DEFAULTS` (lines 30–37) — schema §10.1 default config object; now carries `hooks.readDefer` and `visibility` (both NEW this pass) alongside the unchanged `schemaVersion`/`pulse`/`harness`/`loop` keys. [critical]
- `CORTEX_INDEXES` (lines 62–211) — the §7.1 active-prompt `_index.md` template for every `.cortex/` module directory; gained the `atlas/evidence` entry (lines 155–168, NEW) and touched-up compass/atlas navigation text. [supporting]
- `scheduledTaskSkillMd` (lines 616–633) — renders one bundle's SKILL.md payload; unchanged this pass. [supporting]
- `GITIGNORE_LINES` (lines 48–54) — now five entries including `.cortex/recall-index.json` (NEW). [supporting]
- `INSIGHT_INDEX_TEMPLATE` (lines 223–245) — the LOCKED §7.4 insight-module active-prompt text; unchanged this pass. [supporting]

## Insights
- **`placementTail` is the second place in this file (after `scopeTaskToProfile`) where config actually changes output, not just gets recorded.** It reads two independent config paths (`placement.localNotesDir`, `visibility.repo`) defensively — each is type-checked (`typeof === 'object' && !== null && !Array.isArray`) before being read, so a malformed `cortex.config.json` degrades to an empty tail rather than throwing; `claudeMdBlock` itself never throws on bad config either, matching `upsertClaudeMd`'s (scaffold.ts) own try/catch-and-default-to-`{}` behaviour on the caller side.
- The `visibility.repo` branch order matters: `public` gets the RULES.md rule-20 notice, `private` gets nothing, and everything else (`unknown`, absent, or any unrecognised string) gets the "set it" nudge — so an operator who mistypes the value (e.g. `'internal'`) is nudged the same as one who never set it, rather than silently treated as private.
- `SCHEMA_VERSION`'s bump to `'3.4'` is the version every schema-version-keyed judgment in `scaffold.ts`/`sync.ts` compares against — the skill-bundle additions chain's `shouldInstallAbsent`, the retirement chain's `applicableSkillMigrations`, and `sync()`'s own MINOR-version rewrite all read this constant, so bumping it here is what makes a project's `declaredVersion < '3.4'` treatment kick in project-wide; this file is the single point of truth for that comparison, even though the comparison logic itself lives elsewhere.
- The `atlas/evidence` index template (NEW) is the fourth `.cortex/atlas/` subdirectory template alongside `stakeholders`, `decisions`, and `domain` — it documents the `findings`/`bears_on`/`supersedes` frontmatter shape a decision can now cite via `sources:` instead of embedding a number inline, mirroring how `bears_on:` was also added to the `atlas/decisions` template's navigation line in the same pass.
- No logic beyond `scopeTaskToProfile` and the new `placementTail` exists in this file — everything else is still pure string assembly; the shapes are schema-owned (cortex-schema.md §8, §10.1, §7.1/§7.4), this file supplies the literal bytes.

## File map
- Lines 1–8: doc comment, imports.
- Line 9: `SCHEMA_VERSION` (now `'3.4'`).
- Line 11: `PRESENT_MODULES`.
- Lines 13–29: `CONFIG_DEFAULTS` doc comment + object (`readDefer`, `visibility` NEW).
- Lines 39–54: `GITIGNORE_LINES` doc comment + array (`.cortex/recall-index.json` NEW).
- Lines 56–211: `CORTEX_INDEXES` — per-module `_index.md` templates, incl. `atlas/evidence` (NEW, 155–168) and touched-up `compass`/`atlas/decisions` navigation text.
- Lines 213–245: `INSIGHT_INDEX_TEMPLATE` (locked text, unchanged).
- Lines 247–268: `ARCHIVE_INDEX_TEMPLATE`.
- Lines 270–282: `ARCHIVE_REGISTER_TEMPLATE`.
- Lines 284–304: `SPECS_INDEX_TEMPLATE`.
- Lines 306–322: `SPECS_OVERVIEW_TEMPLATE`.
- Lines 324–340: `SPECS_BUSINESS_OVERVIEW_TEMPLATE`.
- Lines 342–361: `claudeMdBlock`/`placementTail` doc comments.
- Lines 362–383: `placementTail()` (NEW).
- Lines 385–444: `claudeMdBlock()` (now `config`-parameterised, placement paragraph at 410–411).
- Lines 446–496: `ScheduledTask` doc comment + interface.
- Lines 498–529: `scopeTaskToProfile()` doc comment + function (unchanged).
- Lines 531–605: `SCHEDULED_TASKS` (the five bundles, unchanged this pass).
- Lines 607–633: `scheduledTaskSkillMd()`.
- Lines 635–648: `COMPASS_ENVIRONMENT_TEMPLATE`, `COMPASS_DO_NOT_REPEAT_TEMPLATE`.
- Lines 650–662: `pulseReportHeader()`.
- Lines 664–678: `pulseDismissedTemplate()`.

## Connections
Uses:
- src/cli/profile.ts: `ProcessProfile` (type only) — `ScheduledTask.profiles` and `scopeTaskToProfile`'s parameter.

Used by:
- src/archive/scaffold.ts: `ARCHIVE_INDEX_TEMPLATE`, `ARCHIVE_REGISTER_TEMPLATE`.
- src/atlas/evidence.ts: template/constant reuse (NEW edge — likely the new `atlas/evidence` index template or `PRESENT_MODULES`; outside this scope to confirm exactly which export).
- src/cli/init.ts: nearly every export — config defaults, gitignore lines, index templates, spec-tree templates, scheduled-task roster.
- src/cli/scaffold.ts: `claudeMdBlock`, `scheduledTaskSkillMd`, `ScheduledTask` (type), `SCHEDULED_TASKS`, `scopeTaskToProfile` — the Rules 10/13/17 mechanism this module's templates feed; `claudeMdBlock` is now called with a config object.
- src/cli/sync.ts: `SCHEMA_VERSION`, `CORTEX_INDEXES`, `ARCHIVE_INDEX_TEMPLATE`, `INSIGHT_INDEX_TEMPLATE`, `SCHEDULED_TASKS`, `scopeTaskToProfile`, `scheduledTaskSkillMd`.
- src/cli/tasks-register.ts: `SCHEDULED_TASKS` — the bundle roster used to build plan/register rows.
- src/hooks/session-start.ts: `SCHEMA_VERSION` — fallback schema version string used when config is unreadable.
- src/insight/scaffold.ts: `INSIGHT_INDEX_TEMPLATE` (outside this scope).
- src/loops/onboarding-drift.ts: template/constant reuse for its report (outside this scope).
- src/loops/report.ts: shared pulse report header/templates (outside this scope).
- src/pulse/review.ts: pulse templates (outside this scope).
- src/recall/index-blocks.ts: template/constant reuse (NEW edge — likely `CORTEX_INDEXES`'s atlas entries, which the generated recall blocks are appended to; outside this scope to confirm exactly which export).

## Query pointers
- If you need to see exactly which scheduled-task members are Bucket-1 vs Bucket-3, read the `SCHEDULED_TASKS` array's `specflowOnlyMembers`/`profiles` fields directly — they are the authoritative source, not a separately-maintained table.
- If you need to trace how config reaches the CLAUDE.md block (placement/visibility), read `placementTail`/`claudeMdBlock` here, then `upsertClaudeMd` in src/cli/scaffold.ts (which resolves the config object this file's functions receive).
- If you need to trace how a profile value reaches this file, also read src/cli/profile.ts (`readProfile`) and the two callers of `scopeTaskToProfile`: src/cli/scaffold.ts (`writeScheduledTasks`) and src/cli/sync.ts (`syncScheduledTaskPayloads`).
- If you need every literal artefact `cortex init`/`cortex sync` write, this file is the complete inventory — cross-reference against cortex-schema.md for the shape each template is required to satisfy.
