/**
 * Templates written by `cortex init` (spec core-cli.init).
 * Shapes are owned by cortex-schema.md: §1 layout, §7.1 active prompts,
 * §7.2 specs index, §8 CLAUDE.md managed block, §10.1 config defaults.
 */

export const SCHEMA_VERSION = '2.0';

export const PRESENT_MODULES = 'anatomy, cerebrum, atlas, insight, pulse';

/** Schema §10.1 defaults, verbatim. `hooks.preRead` governs the Read pair
 *  (PreRead + PostRead) and defaults TRUE; init writes it explicitly on fresh
 *  projects so the config self-documents (§10.1). */
export const CONFIG_DEFAULTS: Record<string, unknown> = {
  schemaVersion: SCHEMA_VERSION,
  anatomy: { exclude: ['dist/**', 'node_modules/**'], enhancement: 'none' },
  hooks: { preRead: true },
  pulse: { distilThresholdN: 3, dismissedWindowDays: 90, hygieneFreshnessHours: 48 },
  insight: { clusterCarryOverJaccard: 0.5, promotionMinAgeDays: 14, promotionMinObservations: 2 },
  harness: { maxIterations: 3 },
  loop: { enabled: false },
};

/** Gitignore paths per schema Decision 1 (four: the three regenerable/sensitive/
 *  transient dirs + the compiled constellation, §4.9) — never a bare `.cortex/`. */
export const GITIGNORE_LINES = [
  '.cortex/anatomy/',
  '.cortex/atlas/sources/',
  '.cortex/pulse/',
  '.cortex/constellation.json',
];

/**
 * §7.1 active-prompt _index.md for every `.cortex/` directory.
 * Key = path relative to `.cortex/`; '' = the root.
 * Every entry follows the required shape: "Read this when:" / "What's here:" /
 * "How to navigate:", each well under the 300-token budget.
 */
export const CORTEX_INDEXES: Record<string, string> = {
  '': `# Cortex — index

**Read this when:** you start any task in this project — this is the map of the
knowledge layer.

**What's here:**
- \`anatomy/\` — per-file index of the codebase (purpose, tokens, spec links). Open before navigating unfamiliar code.
- \`cerebrum/\` — rules, preferences, decisions, and the bug ledger. Open before writes and for "why" questions.
- \`atlas/\` — stakeholders, narrative decisions, domain terms, raw sources. Open for project context.
- \`pulse/\` — transient loop outputs and suggestions. Open when reviewing proposals.
- \`cortex.config.json\` — schema version and module config.

**How to navigate:** each module's \`_index.md\` says when to read deeper. Follow
frontmatter cross-references (paths and bare IDs) to trace any claim to its source.
`,
  'anatomy': `# Anatomy — index

**Read this when:** you need to locate code, understand what a file is for, or
estimate the cost of reading it — before opening unfamiliar files.

**What's here:**
- \`files.md\` — one row per indexed file: purpose, tokens, sha256, spec links, needs_purpose_refresh, purpose_source.
- \`graph.json\` — import/export edges between files.
- \`layers.md\` — architectural-layer assignments.

**How to navigate:** find the file's row in \`files.md\`; follow \`spec_links\` to the
dev specs that govern it; use \`graph.json\` to walk imports before editing.
`,
  'cerebrum': `# Cerebrum — index

**Read this when:** the user asks "why" about a convention or decision, before you
propose a write that touches governed files, or when triaging a bug.

**What's here:**
- \`rules/\` — one file per rule (R-NNN). Match a write's path against each rule's \`governs\`.
- \`bugs/\` — the bug ledger (B-NNN), classified by the seven-type taxonomy.
- \`preferences.md\`, \`environment.md\` — project conventions and operational pointers.
- \`decisions.md\` — ADRs; each cross-links to \`atlas/decisions/\`.
- \`do-not-repeat.md\` — index of recurring-mistake rules.

**How to navigate:** from a rule, follow \`source:\` to the atlas decision or bug that
justifies it; follow \`governs:\` to the files it constrains; follow \`related_specs:\`
to the specs it touches.
`,
  'cerebrum/bugs': `# Bug ledger — index

**Read this when:** a bug is reported, a test fails unexpectedly, or you need to know
whether a failure mode has been seen before.

**What's here:**
- \`B-NNN-<slug>.md\` — one file per bug: type (seven-type taxonomy), severity, status, and what it affects.

**How to navigate:** follow \`affects:\` to the rule, file, or spec involved; follow
\`related_specs:\` to the governing specs. IDs are monotonic and never reused.
`,
  'cerebrum/rules': `# Rules — index

**Read this when:** you are about to write or edit project files — check whether a
rule's \`governs\` glob matches the target path first.

**What's here:**
- \`R-NNN-<slug>.md\` — one file per rule: title, source, governed globs, optional machine check.

**How to navigate:** follow \`source:\` to the atlas decision or bug justifying the
rule; \`governs:\` names the constrained paths; \`check:\` is the testable predicate.
`,
  'atlas': `# Atlas — index

**Read this when:** you need project context — who is involved, what was decided and
why, or what a domain term means.

**What's here:**
- \`stakeholders/\` — one file per person/org and their role.
- \`decisions/\` — dated narrative decisions (YYYY-MM-DD-slug).
- \`domain/\` — one file per domain term with its definition.
- \`sources/\` — raw materials (gitignored; may be sensitive).

**How to navigate:** from a decision, follow \`sources:\` to raw material and
\`cerebrum_rules:\` to rules derived from it; \`supersedes:\` walks decision history.
`,
  'atlas/stakeholders': `# Stakeholders — index

**Read this when:** you need to know who owns, uses, or decided something — before
attributing requirements or contacting anyone.

**What's here:**
- \`<slug>.md\` — one file per stakeholder: name, role, org, contact pointer (never secrets).

**How to navigate:** follow \`related_specs:\` to the specs a stakeholder cares about;
\`sources:\` points at the raw material they appear in.
`,
  'atlas/decisions': `# Decisions — index

**Read this when:** you need the "why" behind a convention, an architecture choice, or
a rule — before proposing to change any of them.

**What's here:**
- \`YYYY-MM-DD-<slug>.md\` — one dated narrative per decision: what was chosen and why.

**How to navigate:** follow \`cerebrum_rules:\` to the rules a decision produced,
\`supersedes:\` to the decision it replaced, and \`sources:\` to the raw material.
`,
  'atlas/domain': `# Domain terms — index

**Read this when:** you meet an unfamiliar project/business term, or before naming new
concepts — reuse existing vocabulary.

**What's here:**
- \`<term>.md\` — one file per term: definition, aliases, related specs.

**How to navigate:** follow \`related_specs:\` to where the term is load-bearing;
\`aliases:\` lists synonyms to avoid inventing duplicates.
`,
  'atlas/sources': `# Sources — index

**Read this when:** you need the raw material behind a decision or stakeholder claim —
transcripts, briefs, PDFs. This directory is gitignored (may be sensitive).

**What's here:**
- \`<slug>.<ext>\` — raw captured material.
- \`<slug>.meta.md\` — optional metadata (kind, captured, origin).

**How to navigate:** atlas artefacts point here via \`sources:\`; never quote secrets
from these files into committed artefacts.
`,
  'pulse': `# Pulse — index

**Read this when:** reviewing what the scheduled loops found or proposed — reports and
suggestions land here and are transient (gitignored).

**What's here:**
- \`*.md\` — loop reports (hygiene, suggestions, rule candidates), overwritten each run.
- \`dismissed.md\` — rejection memory; persists so dismissed suggestions stay dismissed.

**How to navigate:** each report's \`loop:\` header names the skill that wrote it;
suggestion entries carry S-NNN IDs referenced by \`dismissed.md\`.
`,
};

/**
 * §7.4 `insight/_index.md` — the ungated-module active prompt. Follows the §7.1
 * shape (`Read this when:` / `What's here:` / `How to navigate:`, <300 tok) with
 * the module-specific requirement (spec insight.module-contract Rule 2): it names
 * insight as ungated/unreviewed and points at `cortex insight` as the query
 * surface. `insight/map/` itself carries NO `_index.md` (§4.10.3) — this one index
 * describes both the prose (`.md`) and inferred (`.json`) content.
 */
export const INSIGHT_INDEX_TEMPLATE = `# Insight — index

**Read this when:** you need conceptual orientation — how things relate, what a
domain cluster contains, or how setup/testing/deploy actually work here. Insight
is **ungated**: useful immediately, **not human-reviewed**. For enforced rules, cerebrum.

**What's here:**
- \`map/*.md\` — observed project knowledge (setup, testing, deploy, conventions, …).
- \`map/graph.json\`, \`tags.json\`, \`clusters.json\` — the inferred concept map. Query
  via CLI; never hand-edit.

**How to navigate:** \`cortex insight query <topic>\` first; \`cortex insight
neighbors <node-id>\` to walk relations; \`cortex insight list\` to see everything.
Treat claims here as unreviewed — trace load-bearing ones before relying on them.
`;

/** §7.2 specs/_index.md skeleton — active prompt + dependency/build index. */
export const SPECS_INDEX_TEMPLATE = `# Specs — engineering index

**Read this when:** you are about to implement, change, or review behaviour — find the
governing leaf spec and its dependencies before touching code.

**What's here:** developer specs (\`*.spec.md\`) grouped domain → capability → leaf.
Only leaf specs are implementable.

## Domains

(none yet — run \`specflow-onboard-codebase\` to populate this tree)

## Dependency Graph

(no specs yet)

## Build Order

(no specs yet)
`;

export const SPECS_OVERVIEW_TEMPLATE = `# Developer specs

## What this is

The developer spec tree — the implementation contract for this project. Each leaf spec
defines one behaviour with entities, rules, and acceptance criteria.

## What it covers

Nothing yet. This is a skeleton written by \`cortex init\`; run
\`specflow-onboard-codebase\` to reverse-engineer specs from the existing code.

## Why it's grouped this way

Three conceptual levels — domain → capability → leaf — so every behaviour has exactly
one home and dependencies stay explicit.
`;

export const SPECS_BUSINESS_OVERVIEW_TEMPLATE = `# Business outcomes

## What this is

The business layer of the project's documentation: user outcomes and journeys written
for stakeholders, in plain language.

## What it covers

Nothing yet. This skeleton was written during project setup; onboarding fills it with
one outcome document per user journey.

## Why it's grouped this way

One folder per business domain so stakeholders can find outcomes by area without
reading implementation detail.
`;

/** §8 CLAUDE.md managed block, exact template with substitutions applied. */
export function claudeMdBlock(projectName: string): string {
  return `<!-- cortex:start v${SCHEMA_VERSION} -->
## Cortex

Cortex is active on **${projectName}**. The knowledge layer lives in \`.cortex/\`:

- \`anatomy/\` — per-file map (purpose, tokens, governing specs). What each file is.
- \`cerebrum/\` — rules, decisions, preferences, and the bug ledger. The "why" and the "must".
- \`atlas/\` — stakeholders, decisions (narrative), domain terms, source materials.
- \`insight/\` — ungated, queryable inferred/observed knowledge layer (\`cortex insight\` to query).

**Protocol:** before working a task, read the relevant \`_index.md\` first — they are
prompts that tell you what to read and when. For "why" questions, grep \`cerebrum/\` and
\`atlas/\`. For unfamiliar terms, check \`atlas/domain/\`. Follow frontmatter
cross-references (the citation graph) to trace any claim to its source.

Specs are the source of truth: \`.specflow/specs-business/\` (outcomes) and \`.specflow/specs/\` (implementation),
linked by \`implements:\`/\`implemented_by:\`. Don't let the trees drift.

Modules present: ${PRESENT_MODULES}. Schema: ${SCHEMA_VERSION}.
<!-- cortex:end -->`;
}

/**
 * The twelve Desktop scheduled tasks (design §13 step 12, init Rules 13 & 17).
 * `requiredSkills` declares the skill(s) the task's prompt body invokes — the
 * task→skill mapping is owned here, by the task definitions themselves. Each
 * skill named in `requiredSkills` is named verbatim in `body`; `--partial`
 * (init Rule 17) skips a task unless every entry exists as a directory in the
 * project's `.claude/skills/`.
 */
export interface ScheduledTask {
  name: string;
  description: string;
  body: string;
  /** Skill directory names the prompt body invokes (design §11 loop names). */
  requiredSkills: string[];
}

export const SCHEDULED_TASKS: ScheduledTask[] = [
  {
    name: 'hygiene',
    description: 'Nightly hygiene scan of the Cortex knowledge layer; writes a report to .cortex/pulse/.',
    requiredSkills: ['cortex-pulse-hygiene'],
    body: 'Invoke the `cortex-pulse-hygiene` skill: read `.cortex/_index.md`, then audit every Cortex artefact for staleness, broken cross-references, and budget overruns. Write `hygiene-report.md` to `.cortex/pulse/` with schema-valid frontmatter. Propose only — never edit cerebrum, anatomy, atlas, or the spec trees directly.',
  },
  {
    name: 'distil',
    description: 'Distil recurring session corrections into cerebrum rule candidates in .cortex/pulse/.',
    requiredSkills: ['cortex-pulse-distil'],
    body: 'Invoke the `cortex-pulse-distil` skill: review recent session history for corrections the user made more than the configured threshold. Draft rule candidates (R-NNN shape, schema §4.2) into `.cortex/pulse/rule-candidates.md` for human approval. Never write into `.cortex/cerebrum/` directly.',
  },
  {
    name: 'skill-suggest',
    description: 'Suggest new Claude skills from repeated project workflows; proposals go to .cortex/pulse/.',
    requiredSkills: ['cortex-loop-skill-suggest'],
    body: 'Invoke the `cortex-loop-skill-suggest` skill: look for repeated multi-step workflows in this project that would benefit from a dedicated skill. Write suggestions (S-NNN entries) to `.cortex/pulse/suggestions.md`. Respect `.cortex/pulse/dismissed.md` — do not re-suggest dismissed items inside their expiry window.',
  },
  {
    name: 'anatomy-refresh-deep',
    description: 'Fill needs_purpose_refresh rows in .cortex/anatomy/files.md with reviewed one-line purposes.',
    requiredSkills: ['cortex-loop-anatomy-refresh'],
    body: 'Invoke the `cortex-loop-anatomy-refresh` skill (deep tier): open `.cortex/anatomy/files.md` and, for every row with `needs_purpose_refresh: true`, read the file and write a precise one-line purpose into the row, then set the flag to `false`. Keep the table format exactly as specified by cortex-schema.md §4.1.',
  },
  {
    name: 'rule-decay',
    description: 'Flag stale or unused cerebrum rules for retirement review; report to .cortex/pulse/.',
    requiredSkills: ['cortex-loop-rule-decay'],
    body: 'Invoke the `cortex-loop-rule-decay` skill: audit `.cortex/cerebrum/rules/` for rules whose `governs` globs no longer match files, whose sources vanished, or that have not fired in a long time. Write a retirement-candidate report to `.cortex/pulse/` — never retire a rule yourself.',
  },
  {
    name: 'atlas-staleness',
    description: 'Detect stale atlas knowledge (old decisions, orphaned sources); report to .cortex/pulse/.',
    requiredSkills: ['cortex-loop-atlas-staleness'],
    body: 'Invoke the `cortex-loop-atlas-staleness` skill: audit `.cortex/atlas/` for decisions contradicted by newer ones, stakeholders no longer referenced, domain terms unused in the codebase, and orphaned sources. Write findings to `.cortex/pulse/` as proposals for human review.',
  },
  {
    name: 'onboarding-drift',
    description: 'Detect drift between the codebase and the onboarded spec tree; report to .cortex/pulse/.',
    requiredSkills: ['cortex-loop-onboarding-drift'],
    body: 'Invoke the `cortex-loop-onboarding-drift` skill: compare `.cortex/anatomy/files.md` and the code against `.specflow/specs/` — find files with no governing spec and specs whose governed files vanished. Write a drift report to `.cortex/pulse/` recommending onboarding updates.',
  },
  {
    name: 'spec-drift',
    description: 'Detect implementation drift from dev specs and dev/business contradiction; report to .cortex/pulse/.',
    requiredSkills: ['cortex-loop-spec-drift'],
    body: 'Invoke the `cortex-loop-spec-drift` skill: for each implemented leaf spec in `.specflow/specs/`, verify the code still satisfies its rules and that its business parent still describes the same outcome. Write a layer-drift report to `.cortex/pulse/` — classify findings per the seven-type bug taxonomy.',
  },
  {
    name: 'specflow-lint',
    description: 'Run the structural lint over specs/ and specs-business/; report violations to .cortex/pulse/.',
    requiredSkills: ['specflow-lint'],
    body: 'Run the `specflow-lint` skill over both spec trees: format, naming, frontmatter, bidirectional links, and overview presence. Write the lint report to `.cortex/pulse/`; apply only unambiguous mechanical fixes.',
  },
  {
    name: 'specflow-verify',
    description: 'Run the verification pass (coverage completeness, scenario covers) and report to .cortex/pulse/.',
    requiredSkills: ['specflow-tests'],
    body: 'Invoke the `specflow-tests` skill (verification pass only): verify project-completeness constraints that the schema validator does not own — every business spec appears in at least one scenario `covers:`, journeys map to business specs, and the build order is current. Write `verification-report.md` to `.cortex/pulse/`.',
  },
  {
    name: 'test-runner',
    description: 'Run the four-layer test cascade and triage failures into the bug ledger workflow.',
    requiredSkills: ['cortex-loop-test-runner'],
    body: 'Invoke the `cortex-loop-test-runner` skill: run the test suites (atomic, spec, journey, scenario) with pnpm. Triage failures: classify each per the seven-type taxonomy and draft bug entries for `.cortex/cerebrum/bugs/` via the writer/verifier flow this loop is governed by.',
  },
  {
    name: 'bug-triage',
    description: 'Triage open bugs in .cortex/cerebrum/bugs/: classify, prioritise, and propose fixes.',
    requiredSkills: ['cortex-loop-bug-triage', 'specflow-bugs'],
    body: 'Invoke the `cortex-loop-bug-triage` skill: run `cortex loop-bug-triage --collect`, classify every worklist bug in-session against the seven-type taxonomy using the `specflow-bugs` skill\'s diagnostic discipline, write the results JSON to a scratchpad, then run `cortex loop-bug-triage --report <file>`. Fill-only (loops.bug-triage Rule 3): absent type/severity/proposed_fix fields on open bugs are filled; present fields are never overwritten — divergences land in `.cortex/pulse/bug-triage.md` for human review.',
  },
];

/**
 * SKILL.md for one scheduled task. `scopedName` is the §9.1 project-scoped
 * registration identity (`<slug>-<hash>-<canonical>`, core-cli.task-scoping
 * Rule 2) and lands ONLY in the frontmatter `name:`; the prompt body is
 * unchanged and invokes the underlying skill by its real name.
 */
export function scheduledTaskSkillMd(task: ScheduledTask, scopedName: string): string {
  return `---
name: ${scopedName}
description: ${JSON.stringify(task.description)}
---

# ${task.name} (Cortex scheduled task)

${task.body}

**Ground rules:** conform to cortex-schema.md (schema ${SCHEMA_VERSION}); read the
relevant \`_index.md\` files before acting; propose changes via \`.cortex/pulse/\`
unless your task explicitly owns another write path.
`;
}

/** Skeleton contents for cerebrum leaf files created empty by init. */
export const CEREBRUM_ENVIRONMENT_TEMPLATE = `# Environment

Operational pointers only — aliases, profile names, tool locations. **Never secrets.**

(nothing recorded yet)
`;

export const CEREBRUM_DO_NOT_REPEAT_TEMPLATE = `# Do not repeat

Index of recurring-mistake rules. Each entry points at a rule in \`rules/\`.

(nothing recorded yet)
`;

export const CEREBRUM_DECISIONS_TEMPLATE = `# Decisions (ADR index)

Architecture decision records. Each entry cross-links to the narrative decision in
\`../atlas/decisions/\`.

(no decisions recorded yet)
`;

/**
 * Schema §4.5 pulse artefact header — the one shape every loop report opens
 * with (`kind` + `generated` + `loop`), shared so the always-write convention
 * cannot drift per loop.
 */
export function pulseReportHeader(kind: string, loop: string, generatedIso: string): string {
  return `---
kind: ${kind}
generated: ${generatedIso}
loop: ${loop}
---
`;
}

export function pulseDismissedTemplate(nowIso: string): string {
  return `---
kind: pulse-dismissed
generated: ${nowIso}
loop: cortex-init
---

# Dismissed suggestions

Rejection memory: one entry per dismissed S-NNN suggestion, with \`dismissed\` and
\`expires\` timestamps. Loops must not re-suggest entries inside their window.

(none yet)
`;
}
