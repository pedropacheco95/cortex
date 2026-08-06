---
name: specflow-onboard-codebase
description: 'Reverse-engineer specs from existing code. "onboard this codebase".'
---

# Specflow: Onboard Existing Codebase

## When to use

Reverse-engineer a two-layer spec tree (developer specs in .specflow/specs/ plus business specs
in .specflow/specs-business/, with _overview.md in every folder of both trees) from an existing
codebase. Uses bottom-up atom extraction with delegated agents for deep code investigation,
relationship graphing for deterministic domain discovery, adversarial investigation before any
bug classification, and a verification pass against the completed specs. Use this skill when
the user says "onboard this codebase", "reverse engineer specs", "generate specs from code",
"bring this under spec management", "analyze this codebase", or any request to retroactively
create specifications from working code.

## What this skill does

Turn an existing codebase into a spec-managed project. Read code, extract what the specs
*should have been*, challenge every judgment, verify every spec, then let the human correct.

## What this skill produces

Two parallel spec trees, bidirectionally linked, plus folder overviews:

- `.specflow/specs/` — developer specs with entity references (READS/WRITES), rules, Given/When/Then
  criteria. Specs reference entities by name but do not define schemas — the model/migration
  is the single source of truth for field definitions.
- `.specflow/specs-business/` — business specs with outcomes, journeys, business rules, success
  metrics. Organized in domain subfolders. Filenames are journey-oriented, starting with the
  persona (`user-fills-dynamic-form.business.md`, not `form-submission.business.md`).
- `_overview.md` in every folder of both trees
- Bidirectional `implements:` (dev, single value) / `implemented_by:` (business, list)
- `onboarding-scratch/atoms/` — retained atom extraction records (the audit trail)
- Delta analysis: bug findings filed in the `.cortex/compass/bugs/` ledger, plus
  implicit-behaviors.md, dead-features.md, link-map.md
- Investigation records and verification feedback in proposed-notes.md

## Agent Delegation Model

Onboarding a large codebase exceeds what a single agent can hold in context. Each
subagent in Claude Code gets a ~200K token context window, of which ~150K is usable
after system prompt, tools, and skill instructions. A single 4,000+ line source file
can consume 30-40K tokens. This means a subagent trying to read an entire large module
will run out of read budget before covering everything.

**The solution: delegate aggressively, delegate early, delegate small.**

| Task | Why delegate | Agent scope |
|---|---|---|
| Reading a large source file (1000+ lines) | A single file can consume 20-40% of context | One agent per file, returns structured atom records |
| Reading a module with multiple files | Files compete for context space | One agent per file or small cluster of related files |
| Scanning a code module/domain | Single agent loses context across 100+ files | One agent per top-level directory or service |
| Investigating an atom's relationships | Tracing callers/callees requires reading many files | One atom + everything that touches it |
| Adversarial bug investigation | Building a defense requires deep, focused reading | One potential bug + all related code |
| Verifying a set of specs | Re-reading code against specs requires fresh context | One domain's specs + code |

### Context budget rules

1. **Never try to read a file larger than 1,000 lines in your own context.** Spawn a
   subagent to read it and return structured findings.

2. **Never try to cover more than ~5,000 lines of source code in one agent's context.**
   If a directory contains more, split it into chunks and delegate each chunk.

3. **Each subagent should read deeply and return concisely.** The subagent reads the full
   source file (which may be 30K tokens), extracts the atoms and rules, and returns a
   structured summary (which is ~2K tokens). The orchestrator's context receives only
   the summary.

4. **Prefer many small agents over few large ones.** 10 agents each reading one file and
   returning summaries is better than 2 agents each trying to read 5 files. The cost is
   tokens (parallel agents burn budget faster), but the quality is higher because each
   agent has full context for its file.

5. **Track coverage explicitly.** After atom extraction, count how many routes/components/
   functions were extracted vs how many exist. If the count doesn't match, identify the
   gap and spawn additional agents to cover the missing items. Never silently skip code
   because the budget ran out.

### How to delegate a large file read

```
Agent tool call:
  prompt: "Read [file path] (lines [start]-[end]). For every endpoint/function/model
           you find, return a structured atom record with: identity (name, type, line
           number), entities touched (READS/WRITES), atoms called, atoms that call it,
           external dependencies, and any behavioral rules you can identify from the
           logic. Also flag anything that looks like it might be a bug — but do NOT
           classify it, just describe what you see."
```

For very large files (3,000+ lines), split into line ranges:
- Agent 1: lines 1-1500
- Agent 2: lines 1500-3000
- Agent 3: lines 3000-4500
- Agent 4: lines 4500-end

Each returns atom records for the endpoints/functions in its range. The orchestrator
merges the records.

Each sub-agent receives a focused task, the context it needs, and a structured output
format. Sub-agents extract, investigate, and verify. The orchestrating agent makes final
classification decisions and writes specs from sub-agent outputs.

## Cortex Awareness

When the project has a `.cortex/insight/` directory (a Cortex project — design §8.4
bridge 5), build from the extracted insight instead of re-walking the tree:

- **Phase 1 starts from insight.** Use the insight per-file entries (`cortex insight
  file <path>` — Purpose + Connections per source file) and the L1 import graph
  (`.cortex/insight/graph.json` `imports` edges) as the initial file inventory and
  relationship seed. Delegate deep file reads only where a file has no insight entry
  or its entry is too thin to extract atoms from — not for files insight already
  explains.
- **Phase 7 rules use the schema format.** Alongside the human-readable RULES.md, draft
  the machine-readable compass rules per cortex-schema §4.2: one
  `.cortex/compass/rules/R-NNN-<slug>.md` per rule with `id`, `title`, `source`, and
  `governs` frontmatter — and a `check:` predicate wherever the constraint is
  mechanically checkable.
- **Bug findings land in the §4.3 ledger (design §8.5).** Every confirmed bug from
  Phases 6 and 8 is filed as `.cortex/compass/bugs/B-NNN-<slug>.md` with the
  seven-type frontmatter — never a root `bugs.md` deliverable — so the daily bug-triage
  loop finds them.
- **Insight coordination (when `.cortex/insight/` exists).** If the project already
  carries an insight layer, consult it rather than re-deriving understanding: run
  `cortex insight file <path>` for a file's rich entry and
  `cortex insight concept <name>` for how a concept lives in the code, and delegate
  deep reads only where the entries are missing or too thin. Insight is inferred
  context, not authority — confirm it against the gated layers (compass rules, specs)
  before it drives a classification. A fresh onboard typically has no insight yet —
  proceed without it, never block on its absence; full coordination with the
  `cortex-extract-insight` skill is future work.

## The Eight Phases

### Phase 1: Atom Extraction

**Read `references/atom-extraction.md` for the full protocol.**

Identify every concrete unit of behavior (atom) and map relationships. Mechanical, not
interpretive. No specs written yet.

Atom types: endpoints, models/tables, significant functions, workers/jobs, external
integrations. For each: identity, entities touched (READS/WRITES), atoms called, atoms
that call it, external dependencies.

**Agent delegation:** Spawn one extraction agent per source file that exceeds 1,000 lines,
or per top-level directory for smaller files. For very large files (3,000+ lines), split
into line-range agents. Each agent reads its scope, extracts atom records, and returns
structured findings. The orchestrator merges the records into the unified atom graph.

**Coverage tracking:** After all extraction agents return, count the atoms found vs the
total endpoints/components/functions identified in the project scan. If the count is short,
identify which files or line ranges were missed and spawn additional agents. Report any
remaining coverage gaps explicitly — never silently skip code.

**Output:** The atom graph (nodes + entity/call/integration edges) AND committed atom
records in `onboarding-scratch/atoms/`. These scratch files are mandatory — they are the
audit trail for how domains were discovered.

### Phase 2: Domain Discovery and Spec Generation

#### 2a. Cluster atoms into domains

Domains emerge from the relationship graph, not from file directory structure. Groups of
atoms that reference each other heavily and reference other groups lightly form a domain.

1. Start with entity clusters (atoms sharing the same tables)
2. Merge clusters with many call edges between them
3. Split clusters larger than ~20 atoms with distinct sub-concerns
4. Separate cross-cutting atoms (rate limiting, logging) as infrastructure

Name domains using the codebase's vocabulary.

#### 2b. Generate the developer tree

Deterministic rules:

- **Entity ownership:** The spec whose atom *creates* the entity (migration, model
  definition) owns it for dependency purposes. But specs do NOT define schemas — they
  reference entities with READS/WRITES sections.
- **Granularity:** One leaf spec per endpoint (backend), per route (frontend), or per
  component with its own significant state management. Workers and jobs are one spec each.
- **Dependency direction:** The spec that references another spec's entity depends on it.
- **File naming:** `.specflow/specs/{domain}/{capability}/{leaf}.spec.md`
- **Dev spec file names use the leaf name**, not generic `spec.md`.

**Entity references in specs:** Every dev spec has an Entities section listing which
entities it reads from and writes to, without defining the schema:

```markdown
## Entities

- **READS:** User, Class
- **WRITES:** Booking, Class (decrements available_spots)
```

This anchors the relationship graph and enables verification without duplicating the
schema. The model/migration is the single source of truth for field definitions.

**Agent delegation:** For each domain, spawn an agent to investigate its atoms deeply and
produce draft spec content. If a domain's source code exceeds 5,000 lines total, split
it into sub-agents per file or per route cluster. The spec-writing agent for a domain
should receive the atom records (from Phase 1) plus access to the source files — if the
source files are too large for one context, it should spawn its own sub-agents to re-read
specific sections as needed.

**Never let a spec-writing agent run out of read budget.** If an agent reports that it
couldn't read all the code for its domain, spawn additional agents to cover the gap.
Incomplete specs are worse than more agents.

Do NOT classify potential bugs yet — flag them for Phase 3.

Use `references/spec-schema.md` for the full dev spec format.

#### 2c. Synthesize the business tree

Business specs are synthesized by grouping dev capabilities into user-visible outcomes.
Signals (in order of trustworthiness): frontend route tree / menu items, user-facing
entry points, README / product description, CLI subcommands, public API contract sections,
coherent journeys from the atom graph.

**Naming convention:** Business spec filenames are journey-oriented, starting with the
persona: `user-fills-dynamic-form.business.md`, `coach-manages-schedule.business.md`.
This forces the author to think from the user's perspective.

**Directory structure:** `.specflow/specs-business/{domain}/{outcome}.business.md` with `_overview.md`
in every domain folder. Business specs are NOT flat at root — they are organized in domain
subfolders.

Sizing: 8-25 business specs for a medium app. Mark uncertain groupings as `status: draft`
with `OPEN:` notes.

Use `references/business-spec-template.md`.

#### 2d. Wire links and emit overviews

1. Set `implements:` on each dev spec (single value) and `implemented_by:` on each
   business spec (list). Unmapped dev specs get `implements: []`.
2. Emit `_overview.md` in every folder of both trees using
   `references/folder-overview-template.md`.

### Phase 3: Adversarial Investigation

**Read `references/adversarial-investigation.md` for the full protocol.**

Before classifying anything as a bug, dead code, or coupling issue, make the strongest
possible case that the code is correct: "How would the developer defend this?"

Five defenses to attempt:
1. Construct a business justification
2. Check for systemic patterns (same "wrong" thing done consistently = convention)
3. Trace callers and callees
4. Check if the "fix" would break something downstream
5. Check for compensating code elsewhere

**Agent delegation:** Each potential bug gets its own investigation agent.

**Every investigated item gets a record in proposed-notes.md** — even items classified as
correct. Do not curate the trail. The human needs the full reasoning for every judgment.

Classification: no defense holds = high-confidence bug. Weak defense = needs human
judgment. Strong defense = correct behavior.

### Phase 4: Verification Pass

**Read `references/verification-pass.md` for the full protocol.**

Re-read the code against completed specs to catch spec-writing errors. For each dev spec:
verify entity references match reality (does this code actually read/write these tables?),
verify rules match the actual logic, verify acceptance criteria would pass, verify
dependencies, verify the `implements:` link.

**Agent delegation:** One verification agent per domain.

Corrections are applied directly. Escalated issues are flagged as `OPEN:`.
The human receives specs that have been written, challenged, and verified.

### Phase 5: Human Correction Layer

Present both layers to the human: business tree first (smaller, more familiar), then dev
tree with bidirectional links and investigation records from Phase 3.

For large codebases, present one business domain at a time with its dev children inline.

Every correction gets logged in `corrections.md`. Correction types: approved, bug,
dead-feature, missing-spec, coupling-issue, clarification, regrouping, business-split,
business-merge.

### Phase 6: Delta Analysis

Process corrections.md and generate four deliverables:

- **Bug ledger entries (`.cortex/compass/bugs/B-NNN-<slug>.md`)** — one file per
  confirmed bug with cortex-schema §4.3 frontmatter (seven-type `type:`, `severity`,
  `status`, `affects`) — never a root `bugs.md`. Each body carries: spec ID,
  investigation reference, what code does, what it should do, defense attempted, why it
  failed. Severities follow the schema enum: `critical`/`high` (data/security/core-flow),
  `medium` (broken with workaround), `low` (cosmetic/edge-case).
- **implicit-behaviors.md** — Undocumented behaviors with keep/remove recommendations.
- **dead-features.md** — Deprecated or unwanted code with removal recommendations.
- **link-map.md** — Business-to-dev coverage table plus unmapped dev specs.

### Phase 7: Claude Code Tooling Generation

Generate CLAUDE.md, RULES.md, skills, and agents.

**CLAUDE.md:** What the project is, how Specflow works (two-layer model, bidirectional
links, _overview.md, entity references not definitions), the build loop, key decisions.

**RULES.md:** 10-20 hard constraints extracted from the codebase's patterns. Specific
and actionable.

**Skills and agents** for project-specific patterns and operations.

Conventions discovered during atom extraction become rules.

### Phase 8: Test Generation and Calibration

Generate one atomic test per dev spec acceptance criterion. Run against the current
codebase to calibrate:

| Result | Meaning | Action |
|---|---|---|
| Pass | Code matches spec | Alignment confirmed |
| Fail — test wrong | Agent misinterpreted spec | Fix the test |
| Fail — code wrong | Code doesn't match spec | File in the `.cortex/compass/bugs/` ledger |

After calibration: every failing test = a ledger entry (`B-NNN`), every passing test =
confirmed alignment.

### Phase 9: Build Order

Generate `build-order.md` as a **phased remediation plan** organized by priority:

1. **Phase 0: Guardrails** — critical safety fixes, CI setup
2. **Phase 1: Major bug triage** — all critical/high-severity bugs from the
   `.cortex/compass/bugs/` ledger
3. **Phase 2: Robustness** — medium-severity bugs, input validation gaps
4. **Phase 3: Deduplication** — dead code removal, consolidating duplicated logic
5. **Phase 4: API hygiene** — consistency fixes, naming, response shapes
6. **Phase 5: Stakeholder decisions** — items that need product/business input

Include effort estimates per phase where possible. This is an actionable work plan, not
just a reading order.

## Output Structure

```
project-root/
├── CLAUDE.md
├── RULES.md
├── build-order.md
├── corrections.md
├── implicit-behaviors.md
├── dead-features.md
├── link-map.md
├── proposed-notes.md
├── onboarding-scratch/
│   └── atoms/                             # mandatory — retained extraction records
│       ├── 01-backend-controllers.md
│       ├── 02-config-modules.md
│       ├── 03-frontend-components.md
│       └── ...
├── .claude/
│   ├── skills/{name}/SKILL.md
│   └── agents/{name}.md
├── .specflow/specs/
│   ├── _overview.md
│   ├── _index.md
│   └── {domain}/
│       ├── _overview.md
│       └── {capability}/
│           ├── _overview.md
│           └── {leaf}.spec.md
└── .specflow/specs-business/
    ├── _overview.md
    └── {domain}/
        ├── _overview.md
        └── {outcome}.business.md
```

Bug findings are not a project-root deliverable — they are filed in the
`.cortex/compass/bugs/` ledger (cortex-schema §4.3).

## Onboarding Summary Report (mandatory final output)

```
Onboarding complete.

Atoms extracted: [N] ([N] endpoints, [N] models, [N] functions, [N] workers, [N] integrations)
Domains discovered: [N] ([list])
Developer specs created: [N]
Business specs created: [N]
Unmapped dev specs: [N]
Folders missing _overview.md: 0
Business specs marked draft: [N]

Adversarial investigation:
  Items investigated: [N]
  Classified as bugs: [N] ([N] high, [N] medium confidence)
  Classified as correct: [N]
  Escalated to human: [N]

Verification pass:
  Specs confirmed: [N]
  Specs corrected: [N]
  Issues escalated: [N]

Bugs filed in the ledger: [N] ([N] critical/high, [N] medium, [N] low)
Dead-code candidates: [N]
```

If "Folders missing _overview.md" is non-zero, go back and fill them before declaring
onboarding complete.

## Reference Files

| File | Read when |
|---|---|
| `references/atom-extraction.md` | Phase 1 — atom types, grep patterns, project type adaptation, agent delegation |
| `references/adversarial-investigation.md` | Phase 3 — five defenses, classification rules, record format, examples |
| `references/verification-pass.md` | Phase 4 — six verification checks, feedback format |
| `references/spec-schema.md` | Phase 2b — developer spec format with entity references |
| `references/business-spec-template.md` | Phase 2c — business spec format, journey-oriented naming |
| `references/folder-overview-template.md` | Phase 2d — overview template |
| `references/claude-md-template.md` | Phase 7 — CLAUDE.md template |
