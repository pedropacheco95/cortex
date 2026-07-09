/**
 * Templates written by `cortex init` (spec core-cli.init).
 * Shapes are owned by cortex-schema.md: §1 layout, §7.1 active prompts,
 * §7.2 specs index, §8 CLAUDE.md managed block, §10.1 config defaults.
 */
import * as path from 'path';

export const SCHEMA_VERSION = '3.0';

export const PRESENT_MODULES = 'compass, atlas, archive, insight, pulse';

/** Schema §10.1 defaults, verbatim (v3.0, addendum A10.0): the v2.0 `anatomy`
 *  block is removed with the anatomy module, and the v2.0 `insight` block
 *  (cluster carry-over / promotion tuning) is superseded — the v3 insight
 *  config keys are deferred to the insight-refresh loop spec and are not yet
 *  part of the contract. `hooks.preRead` governs the Read pair (PreRead +
 *  PostRead) and defaults TRUE; init writes it explicitly on fresh projects
 *  so the config self-documents (§10.1). */
export const CONFIG_DEFAULTS: Record<string, unknown> = {
  schemaVersion: SCHEMA_VERSION,
  hooks: { preRead: true },
  pulse: { distilThresholdN: 3, dismissedWindowDays: 90, hygieneFreshnessHours: 48 },
  harness: { maxIterations: 3 },
  loop: { enabled: false },
};

/** Gitignore paths per schema Decision 1 (v3.0: `.cortex/anatomy/` no longer
 *  exists — its line retired at build-order-v3 step 7) — never a bare `.cortex/`.
 *  v3.0 amendment (Decision 1): `archive/` is a fifth, MIXED git policy within
 *  the one module — only `documents/*\/source.<ext>` (the verbatim, possibly
 *  sensitive raw source) is gitignored; `_index.md`, `register.md`,
 *  `metadata.yaml`, `extracted/`, and `types/` are committed (schema §4.4). */
export const GITIGNORE_LINES = [
  '.cortex/atlas/sources/',
  '.cortex/pulse/',
  '.cortex/constellation.json',
  '.cortex/archive/documents/*/source.*',
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
- \`compass/\` — rules, preferences, and the bug ledger. Open before writes and for "why" questions.
- \`atlas/\` — stakeholders, narrative decisions, domain terms, raw sources. Open for project context.
- \`archive/\` — ingested source documents and their structured extractions. Open for verbatim sources.
- \`insight/\` — inferred per-file/concept understanding of the codebase (query via \`cortex insight\`).
- \`pulse/\` — transient loop outputs and suggestions. Open when reviewing proposals.
- \`cortex.config.json\` — schema version and module config.

**How to navigate:** each module's \`_index.md\` says when to read deeper. Follow
frontmatter cross-references (paths and bare IDs) to trace any claim to its source.
`,
  'compass': `# Compass — index

**Read this when:** the user asks "why" about a convention or decision, before you
propose a write that touches governed files, or when triaging a bug.

**What's here:**
- \`rules/\` — one file per rule (R-NNN). Match a write's path against each rule's \`governs\`.
- \`bugs/\` — the bug ledger (B-NNN), classified by the seven-type taxonomy.
- \`preferences.md\`, \`environment.md\` — project conventions and operational pointers.
- \`do-not-repeat.md\` — index of recurring-mistake rules.

**How to navigate:** from a rule, follow \`source:\` to the atlas decision or bug that
justifies it; follow \`governs:\` to the files it constrains; follow \`related_specs:\`
to the specs it touches.
`,
  'compass/bugs': `# Bug ledger — index

**Read this when:** a bug is reported, a test fails unexpectedly, or you need to know
whether a failure mode has been seen before.

**What's here:**
- \`B-NNN-<slug>.md\` — one file per bug: type (seven-type taxonomy), severity, status, and what it affects.

**How to navigate:** follow \`affects:\` to the rule, file, or spec involved; follow
\`related_specs:\` to the governing specs. IDs are monotonic and never reused.
`,
  'compass/rules': `# Rules — index

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
\`compass_rules:\` to rules derived from it; \`supersedes:\` walks decision history.
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

**How to navigate:** follow \`compass_rules:\` to the rules a decision produced,
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
 * §7.4 `insight/_index.md` — the ungated-module active prompt, v3.0. LOCKED
 * template text (design §5.13; schema §7.4 reproduces it verbatim, under the
 * RULES 11 <300-token budget). It states the trust model — inferred, not
 * curated; context, not authority; gated layer wins — and points at the
 * `cortex insight file/concept/element` CLI as the query surface. Note the
 * locked text deliberately does NOT carry the §7.1 `Read this when:` /
 * `What's here:` headings — check.index-shape exempts this one file (see
 * src/schema/checks/layout.ts); check.insight-index owns its shape instead.
 */
export const INSIGHT_INDEX_TEMPLATE = `# Insight — inferred codebase understanding (ungated)

This module holds Cortex's inferred understanding of THIS codebase:
per-file entries (purpose, main players, insights, file map,
connections), concepts, and the semantic graph. Inferred, not
curated — context, not authority. Where insight conflicts with a
compass rule or a spec, the gated layer wins.

Query it; don't read these files directly:
- cortex insight file <path>     — the rich per-file entry
- cortex insight concept <name>  — how a concept lives in the code
- cortex insight element <query> — a function / class / constant

Before substantive work on a file, query its insight entry; before
cross-file or concept-touching changes, query the concept
(see the "Cortex Insight" block in CLAUDE.md).

Layout: per-file entries under anatomy/ (or scopes/<scope>/anatomy/
when scoped); concepts under concepts/; the semantic graph in
graph.json / tags.json / clusters.json; the scope tree in
scope-registry.yaml. Kept current by the insight-refresh loops
(fast / daily / full) and enriched by cortex-loop-session-observe.
`;

/**
 * §7.1 `archive/_index.md` — the archive-module active prompt (schema §4.4,
 * §7.1 shape). No dedicated filled example is given in the schema itself
 * (mirrors how `atlas/` has none) — this follows the same voice/shape as the
 * compass/atlas/insight indexes above.
 */
export const ARCHIVE_INDEX_TEMPLATE = `# Archive — index

**Read this when:** you need the verbatim source or structured extraction behind
an ingested document (a client spec, contract, transcript, RFP, or similar) —
before citing or re-deriving something that was already captured.

**What's here:**
- \`register.md\` — human-readable index of every ingested document, active and superseded.
- \`documents/<slug>/\` — one dir per ingested document: \`source.<ext>\` (gitignored,
  may be sensitive), \`metadata.yaml\` (kind, version, status), \`extracted/\` (structured content).
- \`types/*.yaml\` — document-type schemas: classification hints + the extraction-output contract.

**How to navigate:** start at \`register.md\` to find a document; open its
\`metadata.yaml\` for \`kind\`/\`status\`/\`supersedes\`; read \`extracted/\` before the raw
\`source.<ext>\`. A document's \`kind\` names the \`types/<kind>.yaml\` that shaped its extraction.
`;

/**
 * `archive/register.md` — free markdown, no frontmatter contract beyond the
 * general document header below (schema §4.4: "a committed, human-maintained
 * index, not a transient loop report"). Updated by `cortex-archive-ingest`
 * (build-order-v3 step 3b) on every ingestion or version update.
 */
export const ARCHIVE_REGISTER_TEMPLATE = `# Archive register

One entry per ingested document — active and superseded. Updated by
\`cortex-archive-ingest\` on every ingestion or version update.

(no documents ingested yet)
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

- \`compass/\` — rules, preferences, and the bug ledger. The "must".
- \`atlas/\` — stakeholders, decisions (narrative), domain terms, source materials.
- \`archive/\` — ingested source documents (client specs, transcripts, contracts) and their structured extractions.
- \`insight/\` — ungated, queryable inferred/observed knowledge layer (\`cortex insight\` to query).

**Protocol:** before working a task, read the relevant \`_index.md\` first — they are
prompts that tell you what to read and when. For "why" questions, grep \`compass/\` and
\`atlas/\`. For unfamiliar terms, check \`atlas/domain/\`. Follow frontmatter
cross-references (the citation graph) to trace any claim to its source.

Specs are the source of truth: \`.specflow/specs-business/\` (outcomes) and \`.specflow/specs/\` (implementation),
linked by \`implements:\`/\`implemented_by:\`. Don't let the trees drift.

Modules present: ${PRESENT_MODULES}. Schema: ${SCHEMA_VERSION}.
<!-- cortex:end -->`;
}

/**
 * The Desktop scheduled tasks (design §13 step 12, init Rules 13 & 17; schema
 * §9.1 canonical set). v3.0 consolidation: the fourteen standalone loop
 * registrations collapse into FIVE bundles, each firing on one cadence under
 * one model and running its member loops sequentially with per-member failure
 * isolation. The underlying loop skills (`cortex-pulse-hygiene`,
 * `cortex-loop-bug-triage`, …) and their CLI verbs are unchanged and still
 * invocable individually — only the scheduling wrapper consolidates. The
 * `skill-suggest` loop is retired outright: its workflow-mining judgment folds
 * into `cortex-pulse-distil` as an extra lens (weekly-curation bundle). The
 * fast insight tier remains the git post-commit hook, not a scheduled task.
 *
 * `model` is the Claude model the bundle's loops run under — stamped both into
 * the payload frontmatter (§9.1 fallback) and the registry entry
 * (tasks-register). `requiredSkills` is the union of every member loop's
 * skills (plus `cortex-extract-insight` where a member calls into extraction);
 * each is named verbatim in `body`, and `--partial` (init Rule 17) skips a
 * bundle unless every entry exists as a directory in the project's
 * `.claude/skills/`.
 */
export interface ScheduledTask {
  name: string;
  description: string;
  body: string;
  /**
   * The Claude model this bundle's loops run under. Mapped onto the Desktop
   * create-scheduled-task tool's optional `model` argument by the
   * `cortex-register-tasks` skill, and stamped into the payload frontmatter as
   * the §9.1 fallback the app uses when the registry entry lacks a model.
   */
  model: string;
  /** Skill directory names the prompt body invokes (design §11 loop names). */
  requiredSkills: string[];
}

export const SCHEDULED_TASKS: ScheduledTask[] = [
  {
    name: 'daily',
    description:
      'Cortex daily bundle — runs pulse-hygiene, bug-triage, spec-drift, insight-refresh-daily, and session-observe in sequence; each writes its own report to .cortex/pulse/.',
    model: 'claude-sonnet-5',
    requiredSkills: [
      'cortex-pulse-hygiene',
      'cortex-loop-bug-triage',
      'specflow-bugs',
      'cortex-loop-spec-drift',
      'cortex-loop-insight-refresh-daily',
      'cortex-extract-insight',
      'cortex-loop-session-observe',
    ],
    body:
      'This is the Cortex **daily bundle** — one scheduled task covering five daily loops. Run the members in the listed order, each with its own established skill discipline. **Failure isolation:** if a member fails, record the failure and CONTINUE to the next member — never abort the bundle because one member failed. Each member still writes its own pulse report exactly as it does standalone; this bundle changes only the scheduling, not where the individual reports land.\n\n' +
      '1. **pulse-hygiene** (`cortex-pulse-hygiene`): read `.cortex/_index.md`, then run `cortex pulse-hygiene`; it audits every Cortex artefact for staleness, broken cross-references, and budget overruns and writes `.cortex/pulse/hygiene-report.md`. Propose only — never edit compass, atlas, the spec trees, or insight directly.\n' +
      '2. **bug-triage** (`cortex-loop-bug-triage`, using `specflow-bugs`): run `cortex loop-bug-triage --collect`, classify every worklist bug in-session against the seven-type taxonomy using the `specflow-bugs` diagnostic discipline, write the results JSON to your session scratchpad, then run `cortex loop-bug-triage --report <file>`. Fill-only: absent type/severity/proposed_fix fields on open bugs are filled, present fields never overwritten — divergences land in `.cortex/pulse/bug-triage.md`.\n' +
      '3. **spec-drift** (`cortex-loop-spec-drift`): run `cortex loop-spec-drift`; for each implemented leaf spec it verifies the code still satisfies the rules and the business parent still describes the same outcome, and writes `.cortex/pulse/spec-drift.md` classifying findings per the seven-type bug taxonomy.\n' +
      '4. **insight-refresh-daily** (`cortex-loop-insight-refresh-daily`, using `cortex-extract-insight`): run `cortex loop-insight-refresh --daily --collect`, triage the uncertain files in-session, re-extract L2/L3 via the `cortex-extract-insight` skill in dirty-only mode, re-verify surfaced stale references and confidence-aged edges, then run `cortex loop-insight-refresh --daily --apply`. Writes only `.cortex/insight/` (machine-owned, ungated) plus its pulse report — never gated content, never a pulse proposal.\n' +
      '5. **session-observe** (`cortex-loop-session-observe`): run `cortex loop-session-observe --collect`, read the unobserved sessions and infer durable knowledge, routing it BY TYPE — ungated codebase observations enrich the relevant insight per-file entry directly; conventions/rules and decisions go into a proposals JSON — then run `cortex loop-session-observe --apply --proposals <file>`. Never write `.cortex/compass/` or `.cortex/atlas/` directly (RULES 7); leave cross-session repetition to the weekly distil.\n\n' +
      '**Digest (final step):** after all five members, write ONE summary for the user — per member, whether it ran or was skipped-on-failure (with the error) and a one-line outcome. Each member\'s own pulse report remains the authoritative detail; the digest only rolls up what happened this run.',
  },
  {
    name: 'weekly-curation',
    description:
      'Cortex weekly-curation bundle — runs pulse-distil (with the workflow-mining lens) and rule-decay in sequence; proposals land in .cortex/pulse/.',
    model: 'claude-opus-4-8',
    requiredSkills: ['cortex-pulse-distil', 'cortex-loop-rule-decay'],
    body:
      'This is the Cortex **weekly-curation bundle** — one scheduled task covering two weekly curation loops. Run the members in the listed order, each with its own established skill discipline. **Failure isolation:** if a member fails, record the failure and CONTINUE to the next member — never abort the bundle because one member failed. Each member still writes its own pulse report exactly as it does standalone.\n\n' +
      '1. **pulse-distil** (`cortex-pulse-distil`): run `cortex pulse-distil --collect`, perform the pattern judgment in-session, then run `cortex pulse-distil --propose <file>`; it writes `.cortex/pulse/suggestions.md`. Beyond rule-shaped patterns, apply the **workflow-mining lens** folded in from the retired skill-suggest loop: when a cross-session pattern is workflow-shaped — a repeated multi-step MANUAL workflow rather than a single preference/convention — emit it as a `skill-proposal`-typed candidate in the SAME candidates array (set `"type": "skill-proposal"`, `"proposedTarget": ".claude/skills/<name>/SKILL.md"` for a NEW skill, and `"proposedText"` to a complete draft SKILL.md). The deterministic propose half writes it as a `skill-proposal` section in the same suggestions output.\n' +
      '2. **rule-decay** (`cortex-loop-rule-decay`): run `cortex loop-rule-decay`; it audits `.cortex/compass/rules/` for rules whose `governs` globs no longer match, whose sources vanished, or that have not fired in a long time, and writes a retirement-candidate report to `.cortex/pulse/rule-candidates.md`. Never retire a rule yourself.\n\n' +
      '**Digest (final step):** after both members, write ONE summary for the user — per member, whether it ran or was skipped-on-failure (with the error) and a one-line outcome. Each member\'s own pulse report remains the authoritative detail.',
  },
  {
    name: 'weekly-quality',
    description:
      'Cortex weekly-quality bundle — runs specflow-lint, specflow-verify, and insight-refresh-full in sequence; reports land in .cortex/pulse/.',
    model: 'claude-sonnet-5',
    requiredSkills: ['specflow-lint', 'specflow-tests', 'cortex-loop-insight-refresh-full', 'cortex-extract-insight'],
    body:
      'This is the Cortex **weekly-quality bundle** — one scheduled task covering three weekly quality loops. Run the members in the listed order, each with its own established skill discipline. **Failure isolation:** if a member fails, record the failure and CONTINUE to the next member — never abort the bundle because one member failed. Each member still writes its own pulse report exactly as it does standalone.\n\n' +
      '1. **specflow-lint** (`specflow-lint`): run the `specflow-lint` skill over both spec trees — format, naming, frontmatter, bidirectional links, and overview presence. Write the lint report to `.cortex/pulse/`; apply only unambiguous mechanical fixes.\n' +
      '2. **specflow-verify** (`specflow-tests`, verification pass only): verify project-completeness constraints the schema validator does not own — every business spec appears in at least one scenario `covers:`, journeys map to business specs, and the build order is current. Write `.cortex/pulse/verification-report.md`.\n' +
      '3. **insight-refresh-full** (`cortex-loop-insight-refresh-full`, using `cortex-extract-insight`): run `cortex loop-insight-refresh --full --collect`, re-run cross-scope L4 unification via the `cortex-extract-insight` skill over every scope (deterministic regeneration: stable ids, total-ordered serialization; a legitimate shrink from deleted files is sanctioned on this ground-truth pass), then run `cortex loop-insight-refresh --full --report`. Writes only `.cortex/insight/` plus its pulse report — never gated content, never a pulse proposal.\n\n' +
      '**Digest (final step):** after all three members, write ONE summary for the user — per member, whether it ran or was skipped-on-failure (with the error) and a one-line outcome. Each member\'s own pulse report remains the authoritative detail.',
  },
  {
    name: 'test-runner',
    description:
      'Cortex test-runner bundle — runs the tiered test-runner cascade (the only code-writing loop, kept isolated) and triages failures into the bug-ledger workflow.',
    model: 'claude-sonnet-5',
    requiredSkills: ['cortex-loop-test-runner'],
    body:
      'This is the Cortex **test-runner bundle** — one scheduled task covering a single loop, the tiered test-runner. It is the only code-writing loop and is kept isolated by design (never merged with other loops). **Failure isolation:** if the member fails, record the failure in the digest rather than raising.\n\n' +
      '1. **test-runner** (`cortex-loop-test-runner`): run `cortex loop-test-runner --collect`, classify each pending failure in-session against the seven-type taxonomy with the `specflow-bugs` diagnostic discipline, then run `cortex loop-test-runner --fix-stage <results.json>`. It writes code behind the writer/verifier split this loop is governed by, drafts bug entries for `.cortex/compass/bugs/`, and summarises `.cortex/pulse/test-failures.md`.\n\n' +
      '**Digest (final step):** write ONE summary for the user — whether the loop ran or was skipped-on-failure (with the error) and a one-line outcome. The loop\'s own `.cortex/pulse/test-failures.md` remains the authoritative detail.',
  },
  {
    name: 'monthly-review',
    description:
      'Cortex monthly-review bundle — runs atlas-staleness and onboarding-drift in sequence; reports land in .cortex/pulse/.',
    model: 'claude-sonnet-5',
    requiredSkills: ['cortex-loop-atlas-staleness', 'cortex-loop-onboarding-drift'],
    body:
      'This is the Cortex **monthly-review bundle** — one scheduled task covering two monthly review loops. Run the members in the listed order, each with its own established skill discipline. **Failure isolation:** if a member fails, record the failure and CONTINUE to the next member — never abort the bundle because one member failed. Each member still writes its own pulse report exactly as it does standalone.\n\n' +
      '1. **atlas-staleness** (`cortex-loop-atlas-staleness`): run `cortex loop-atlas-staleness`; it audits `.cortex/atlas/` for decisions contradicted by newer ones, stakeholders no longer referenced, unused domain terms, and orphaned sources, and writes findings to `.cortex/pulse/atlas-review.md` as proposals for human review.\n' +
      '2. **onboarding-drift** (`cortex-loop-onboarding-drift`): run `cortex loop-onboarding-drift`; it compares the codebase (and its insight entries) against `.specflow/specs/` — files with no governing spec, specs whose governed files vanished — and writes `.cortex/pulse/scaffolding-review.md` recommending onboarding updates.\n\n' +
      '**Digest (final step):** after both members, write ONE summary for the user — per member, whether it ran or was skipped-on-failure (with the error) and a one-line outcome. Each member\'s own pulse report remains the authoritative detail.',
  },
];

/**
 * SKILL.md for one scheduled task. `scopedName` is the §9.1 project-scoped
 * registration identity (`<slug>-<canonical>` plain, or the
 * `<slug>-<hash6>-<canonical>` collision fallback — core-cli.task-scoping
 * Rule 2) and lands ONLY in the frontmatter `name:`; the prompt body invokes
 * the underlying skill by its real name. `projectRoot` is stamped as the §9.1
 * ownership-marker comment — how collision resolution tells same-slug
 * projects apart.
 */
export function scheduledTaskSkillMd(task: ScheduledTask, scopedName: string, projectRoot: string): string {
  return `---
name: ${scopedName}
description: ${JSON.stringify(task.description)}
model: ${task.model}
---

<!-- cortex-project-root: ${path.resolve(projectRoot)} -->

# ${task.name} (Cortex scheduled task)

${task.body}

**Ground rules:** conform to cortex-schema.md (schema ${SCHEMA_VERSION}); read the
relevant \`_index.md\` files before acting; propose changes via \`.cortex/pulse/\`
unless your task explicitly owns another write path.
`;
}

/** Skeleton contents for compass leaf files created empty by init. */
export const COMPASS_ENVIRONMENT_TEMPLATE = `# Environment

Operational pointers only — aliases, profile names, tool locations. **Never secrets.**

(nothing recorded yet)
`;

export const COMPASS_DO_NOT_REPEAT_TEMPLATE = `# Do not repeat

Index of recurring-mistake rules. Each entry points at a rule in \`rules/\`.

(nothing recorded yet)
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
