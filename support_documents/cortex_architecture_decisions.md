# Cortex Insight Extraction — Design Decisions

**Status:** Design decisions record, pre-design-pass. Not the full design doc.
**Purpose:** Consolidate agreements from the design conversation so the design pass has a coherent foundation.
**Next:** File ingestion mechanism (ground truth / provenance) to be discussed separately, then folded in.

---

## What Cortex actually is (reframe)

Cortex is a codebase-understanding system. Its persistence layer, self-maintenance loops, and spec-driven capabilities are properties that support the understanding — not the point of the system.

The load-bearing thesis: Cortex maintains a persistent, queryable, actively-refreshed understanding of a codebase, deep enough that Claude behaves like it knows the codebase when working in it — including on codebases the user hasn't extensively worked in themselves.

Existing tools address slices of this. Understand Anything does fast structural indexing. Graphify does deeper LLM extraction but as a one-shot artifact that goes stale. Neither is designed with Claude as the primary user, and neither integrates with a persistent layer that survives across sessions.

## The insight layer

`.cortex/insight/` is the module that holds the codebase understanding. It is:

- **Persistent.** Content lives in `.cortex/insight/` across sessions. Not regenerated per query.
- **Queryable.** Claude and humans query it via `cortex insight` CLI subcommands.
- **Actively refreshed.** Not a one-shot artifact. Scheduled loops keep it current as the codebase changes.
- **Deep.** LLM extraction produces rich per-file understanding, not just structural indexes.
- **Ungated.** Content is inferred rather than passing through human review before landing. Insight is context, not authority. Where insight conflicts with a compass rule or a spec, the gated layer wins.

## The five-module architecture

`.cortex/` reorganizes to five modules, each with a clear role. This includes renaming two v1 modules that had inconsistent names and cleaning up a v1 duplication.

- **atlas** — reference knowledge. Stakeholders, decisions, domain language. The "why" behind the project.
- **compass** — enforceable rules, conventions, and bugs. What the project should do at the enforcement layer. Renamed from v1's `cerebrum` (the name didn't match what the module actually held).
- **archive** — ingested documents and their derived content. Where source documents live and where extraction outputs go. New module introduced in v2 (see Ingestion below).
- **insight** — inferred codebase understanding. Rich per-file entries, concept graph, cluster assignments. Ungated. Absorbs v1's `anatomy` module.
- **pulse** — transient activity artifacts. Loop outputs, working state, progress reports. Unchanged from v1.

Each module is an evocative noun describing its character. All five fit the same family — descriptive of what the module *is* rather than the mechanism it implements.

**One v1 cleanup carried into v2.** Atlas is the single home for decisions (`atlas/decisions/`). v1 had a duplicate `cerebrum/decisions.md` that was justified as "the same data, two views" but that framing accumulates drift. Compass in v2 holds no decisions — it holds rules, conventions, and bugs. Decisions live in atlas. Compass rules that derive from atlas decisions cite them via provenance.

**Storage layout:**

```
.cortex/
├── atlas/
│   ├── stakeholders/
│   ├── decisions/           # single home for decisions
│   └── domain/
├── compass/
│   ├── rules/
│   ├── conventions/
│   └── bugs/                # seven-type bug ledger
├── archive/                 # new in v2
│   ├── _index.md
│   ├── register.md
│   ├── documents/
│   └── types/
├── insight/
│   └── ... (as described in this document)
└── pulse/
    └── ...
```

## The four extraction levels

Insight extraction runs at four levels, each with a distinct role and cost profile. Users configure the target level per project.

**Level 1 — Structural.** Tree-sitter parse, import/export graph, file sizes, entry points, module structure, centrality analysis identifying important files. Deterministic. No LLM. Minutes on a mid-sized codebase.

**Level 2 — Purpose.** LLM pass per file producing a one-paragraph purpose line grounded in the file's content plus Level 1 context (imports, callers). Model: Sonnet. Batched per file. Tens of minutes on a mid-sized codebase.

**Level 3 — Deep understanding.** LLM pass per file identified as important by Level 1's centrality analysis. Produces rich per-file content: main players, insights, patterns, quirks, file map for large files. Model: Sonnet. Multi-agent parallelized. Hours on a real codebase.

**Level 4 — Cross-file semantic graph.** LLM inference over Level 3 outputs producing concept extraction, cross-file semantic edges (files handling the same concern even without imports), pattern identification, convention detection. Model: Sonnet. Hours to days depending on codebase size.

## Initial extraction — the primary capability

The core use case: point Cortex at a codebase Claude doesn't know, and get understanding out. This is what makes Cortex a codebase-understanding tool rather than a codebase-maintenance tool.

**Invocation.** `cortex-extract-insight` is a Claude Code skill, not a CLI command. Users invoke it by opening a Claude Code session on a project and asking Claude to run the extraction skill. Scheduled tasks invoke the skill directly through the existing scheduled-tasks mechanism. This positions Cortex correctly — infrastructure that Claude Code uses to be more effective, not a replacement for Claude Code.

**The extraction is a plan, not a pipeline.** On a fresh codebase, extraction proceeds in phases:

**Phase 1 — Structural pass (Level 1).** Deterministic. Tree-sitter parse, import graph, module structure, centrality analysis. Fast (minutes). Produces the raw material Claude needs to plan the extraction.

**Phase 2 — Planning.** Claude reads the Level 1 output and drafts an extraction plan. The plan identifies logically coherent scopes within the codebase — subsets that can be analyzed as units. Scopes may nest. Scopes may reference shared sub-scopes. The plan is written to `.cortex/pulse/insight-extraction-plan.md` for the user to review.

An example plan:

```yaml
Extraction plan for <project>:

Root scopes (parallelizable):
  - auth/                          [~2,400 files, deep analysis]
    references shared: notifications/, logging/
  - billing/                       [~1,800 files, deep analysis]
    references shared: notifications/, logging/
  - api-gateway/                   [~900 files, moderate depth]
  - admin-panel/                   [~3,100 files, deep analysis]
    contains sub-scope: admin-panel/reporting/  [~1,200 files]

Shared scopes (extracted once, referenced from parents):
  - notifications/                 [~450 files]
  - logging/                       [~200 files]

Estimated total: ~14 hours across parallel workers
Estimated peak parallelism: 5 concurrent extraction agents
```

For manageable codebases (below the auto-run threshold), Claude runs the plan directly without user confirmation. For codebases where the plan warrants review — large scope trees, ambiguous boundaries, high estimated cost — Claude presents the plan and waits for the user to confirm or adjust.

The threshold for auto-run vs. confirm is configurable; defaults are conservative (probably around 6-8 hours estimated duration, or codebases requiring more than three parallel scopes).

**Phase 3 — Execution.** Claude orchestrates the extraction. Each root scope runs as a parallel sub-agent doing per-file analysis at Levels 2 and 3. Shared scopes are extracted once, before or in parallel with the scopes that depend on them. Sub-scopes are extracted before their parents where dependencies require it.

Within each scope's extraction:

- Every file in the scope gets Level 2 analysis (purpose, connections).
- Files identified as important within the scope get Level 3 analysis (main players, insights, file map).
- Importance is determined by centrality within the scope, not globally. A file that's central to `auth/` is analyzed at Level 3 even if it's peripheral to the whole codebase.

**Phase 4 — Cross-scope unification.** After all scopes complete, a final agent reads the outputs and produces the cross-scope semantic layer. This is Level 4 for the whole codebase: concepts that span scopes, patterns replicated across modules, cross-scope semantic edges, the unified tag and cluster structure.

This is the extra step that makes scoped extraction work as a whole rather than as a collection of disconnected analyses. Without it, scope-level insights would be siloed. The unification pass produces the ambient global understanding.

**Scope registry and deduplication.**

Claude's planning phase builds a scope registry that tracks dependencies:

```yaml
scope_registry:
  auth:
    path: src/auth/
    depends_on: [notifications, logging]
  billing:
    path: src/billing/
    depends_on: [notifications, logging]
  notifications:
    path: src/shared/notifications/
    depends_on: []
    shared_by: [auth, billing]
  logging:
    path: src/shared/logging/
    depends_on: []
    shared_by: [auth, billing, api-gateway]
```

The registry determines execution order and prevents redundant work. A scope shared by multiple parents is extracted once. Both parents reference the shared scope's outputs when their analyses touch shared files.

**Same-module vs. similar-module judgment.** When Claude encounters what appears to be the same module referenced from multiple places, the planning phase resolves whether they're actually one scope or two:

- **Same underlying files** (via imports, path resolution, or symlinks): one scope, extracted once, referenced from both parents.
- **Different implementations of similar functionality** (two independent `notifications/` directories with overlapping purpose but different code): two scopes, extracted separately. The cross-scope unification pass identifies them as semantically related and produces cross-scope edges saying "these serve similar purposes." Connected but not deduplicated.

This is a judgment Claude makes during planning based on reading the code, not a mechanical check.

**Recursion.**

If a scope is still too large after planning identifies it, Claude recurses — breaks it into sub-scopes with the same planning process. Recursion terminates when each leaf scope is small enough that a single extraction agent can handle it without further decomposition.

Scope granularity is Claude's judgment during planning, based on cohesion and shared-use rather than a fixed file-count threshold. Small scopes are valid when they're coherent units (a focused 40-file module with clear internal cohesion is a scope) or when deduplication would benefit multiple parents (a 30-file `notifications` module used across three parent scopes justifies its own extraction). Very small collections (5-10 files with no shared usage) typically get folded into their parent rather than warranting a dedicated agent. Everything between is a judgment call Claude makes by reading the code.

**Output.**

When extraction completes, the codebase has a full `.cortex/insight/` layer with scope-based organization (see Storage format). Claude can consult insight for any file, concept, or element in the codebase. The maintenance system (described later) takes over to keep it current.

**Progress and resumability.**

- The skill reports progress to `.cortex/pulse/insight-extraction-progress.md` as it runs. Users can check status without interrupting.
- Reporting covers scope-level progress ("auth/ complete, billing/ 60% through Level 2, notifications/ complete") and file-level within each scope.
- If extraction crashes or is interrupted, it resumes from where it stopped. Scope completions are checkpointed; incomplete scopes resume from the last checkpointed file within them.
- Partial extractions are usable — Claude can consult insight for scopes that have completed even if others are still in progress.

## Per-file understanding entry

Level 3 extraction produces a rich entry per important file. The format:

```yaml
---
path: <file-path>
extracted_at: <timestamp>
extraction_level: 3
size_lines: <count>
size_tokens: <estimate>
centrality: <high|medium|low>
---

## Purpose

One paragraph on what the file does, its role in the codebase.

## Main players

Named atomic elements the file exposes or contains:
- Classes, functions, key constants
- With line ranges
- Each with a short description
- Distinguished by importance (critical to understand vs. present but supporting)

## Insights

Observations about the file that aren't obvious from reading it:
- Conventions this file exemplifies or violates
- Design decisions embedded in the code
- Performance characteristics or gotchas
- Non-obvious dependencies or coupling
- Historical quirks worth knowing before modifying

## File map

Only for files above a size threshold (~500 lines).
- Lines N-M: section description
- Nested if needed for large classes or complex flows
- Purpose: let Claude jump to relevant parts without reading the whole file

## Connections

Uses:
- <file>: <what it uses>

Used by:
- <file>: <what it provides>

Semantically related (not imports):
- <file>: <what connects them semantically>

## Query pointers

Intent-scoped guidance for common modification patterns:
- If you need to <do X>, also read: <files>
- If you need to <do Y>, consider: <files>
- If you need to <do Z>, read first: <files>, then: <files>
```

Small files or files below the centrality threshold get a lighter entry — purpose and connections only, no main players/insights/file map/query pointers.

## Query surface

Three granularities, exposed via CLI:

- `cortex insight file <path>` — returns the rich per-file entry
- `cortex insight concept <name>` — returns which files touch a concept, how it's implemented, related concepts
- `cortex insight element <query>` — returns an atomic element (function, class, key constant) with description, connections, and follow-up pointers. May return "no rich entry" for elements not identified as main players during Level 3 extraction; those are still discoverable via the file entry.

Elements are a byproduct of Level 3 extraction — they come from the main players section of file entries. Not a separate extraction pass.

Natural-language questions ("how does auth work here?", "what does this file do at a high level?", "where is retry logic implemented?") are answered by Claude within the current session, using these retrieval primitives to gather the entries it needs, then reasoning over what it finds. There is no `cortex insight ask` command — the reasoning happens in the current Claude Code session, not in a separate subprocess. This keeps the current session's context intact and avoids duplicating Claude's own capability.

## How Claude consults insight

The CLAUDE.md addition:

```
## Cortex Insight

This project has a Cortex insight layer at .cortex/insight/ that
contains rich per-file understanding, concept extraction, and
semantic connections across the codebase. It is queryable via
the `cortex insight` CLI.

When to read a file directly, when to consult insight:

Read the file itself when you're going to modify it, when you need
exact syntax or implementation details, when the change requires
knowing every method or every line.

Query insight instead of reading when you're trying to understand
what a file does, whether it's relevant to your task, how it
relates to what you're working on, or what its main pieces are.
Insight's per-file entry is a much richer resume than reading
500 lines and remembering fragments. Consult insight first;
read the file when you need exactness.

Before you begin substantive work on any file, query its insight
entry. Before you make changes that could affect multiple files
or touch a concept (auth, session, billing, etc.), query the
concept.

This is not optional. Insight is the difference between grounded
work in this codebase's actual patterns and work that pattern-
matches to your priors about how similar codebases usually work.

Query patterns:
- cortex insight file <path>      — rich per-file understanding
- cortex insight concept <name>   — how a concept lives in the code
- cortex insight element <query>  — atomic element (function, class).
  May return "no rich entry" for elements not identified as main
  players during Level 3 extraction; those are still discoverable
  via the file entry.

When you need to answer a natural-language question about the
codebase, use the queries above to gather relevant entries, then
formulate your answer from what you find. You are the reasoning
mechanism; the CLI provides retrieval.

Insight is inferred, not curated. Its content reflects the
codebase's current state and the extraction system's best
understanding. Where insight conflicts with a compass rule or
a spec, the gated layer wins — insight is context, not authority.
```

Framing is directive without forcing. "Not optional" sets expectation; the read-vs-consult distinction makes insight actually useful in practice by preventing Claude from defaulting to full file reads.

## Skill integrations

Explicit invocations of `cortex insight` in skill workflows:

- **specflow-develop** — queries insight for every file it plans to modify before writing code. Queries the relevant concept before making cross-file changes. Biggest lever for grounded work.
- **specflow-change-router** — queries insight to understand what a proposed change touches.
- **specflow-tests** — queries insight for testing conventions before generating tests.
- **specflow-ingest** — queries insight before proposing spec changes.
- **specflow-onboard-codebase** — coordinates with insight extraction. Deeper integration; probably comes later.

Not integrated:
- **specflow-lint** — structural, doesn't need semantic context.
- **specflow-viewer** — rendering, doesn't need semantic context.
- **specflow-bugs** — bug classification; insight might inform but the seven-type taxonomy is the primary tool.

## Keeping insight current after initial extraction

Once the initial extraction has produced the insight layer for a codebase, the maintenance system keeps it fresh as the codebase evolves. The load-bearing principle: refresh scales with *meaningful* change, not with commit volume.

This is distinct from initial extraction. Refresh assumes insight already exists and updates it incrementally. On a codebase where insight hasn't been extracted yet, users invoke the extraction skill through Claude Code — refresh has no baseline to update.

**Post-commit (deterministic):** Changed files are flagged for review. Fast. No LLM. No extraction happens at this step.

**Daily loop — Level 2 refresh:** Flagged files with real changes get Level 2 re-extraction. Purpose lines and connections stay current. Cheap enough that any non-trivial change warrants Level 2 refresh.

**Daily loop — Level 3 refresh, only when significant change:** Flagged files that had significant changes get Level 3 re-extraction. Most commits (formatting, minor refactors, small feature additions) don't trigger Level 3. Substantial changes to what a file *is* (new methods, refactored responsibilities, new patterns) do.

**Significance detection:** Hybrid mechanism.
- Structural filter first: deterministic rules rule out obvious no-ops (formatting-only, comment-only, whitespace, import reordering).
- LLM triage second: Haiku pass looks at the diff and existing insight entry, decides "significant" or "cosmetic" for cases the structural filter can't classify.

**Level 4 refresh, periodic:** Full Level 4 regeneration runs on a longer cadence (weekly recommended). Neighborhood updates around Level 3 re-extractions can happen daily as a byproduct, but the full semantic graph regeneration is the ground-truth pass that catches drift the incremental updates miss.

**Model choice:** Sonnet for Levels 2, 3, and 4. Haiku for triage. Quality is load-bearing — wrong insight information is prejudicial and worth paying for.

## Storage format

Hybrid.

- **Markdown** for prose content: per-file entries, per-concept entries, `_index.md`. Human and Claude both read markdown easily.
- **JSON** for the semantic graph, tag sets, cluster assignments, and cross-references. Efficient traversal for queries. Regenerated by the refresh loops.

Both are authoritative — markdown is source of truth for prose, JSON is source of truth for graph structure. A validator ensures consistency between them.

**Scope-based organization** when extraction was scoped, flat organization for small codebases extracted as a single unit.

For scoped extractions:

```
.cortex/insight/
├── _index.md                          # active prompt, module overview
├── scope-registry.yaml                # scope tree, dependencies, shared references
├── scopes/
│   ├── auth/
│   │   ├── anatomy/                   # per-file entries within scope
│   │   ├── concepts/                  # scope-local concepts
│   │   └── graph.json                 # scope-local semantic graph
│   ├── billing/
│   │   └── ...
│   ├── notifications/                 # shared scope, referenced from auth/ and billing/
│   │   └── ...
│   └── ...
├── anatomy/                           # (empty when all files are in scopes)
├── concepts/                          # global concepts spanning multiple scopes
├── graph.json                         # cross-scope semantic graph
├── tags.json                          # global tags
└── clusters.json                      # global cluster assignments
```

For unscoped extractions (small codebases treated as a single unit):

```
.cortex/insight/
├── _index.md
├── anatomy/
│   └── src/auth/session.ts.md         # per-file entry, path mirrors source
├── concepts/
│   ├── authentication.md
│   └── ...
├── graph.json
├── tags.json
└── clusters.json
```

The `anatomy/` name preserves continuity with what v1's `.cortex/anatomy/` was — the structural artifact of the codebase at the file level. It's absorbed into insight but retains its identity as the layer that answers "what are the files, what do they do, how do they connect."

The query layer hides the structural difference. `cortex insight file <path>` finds the right scope for the file and reads from there; `cortex insight concept <name>` reads global concepts first and falls back to scope-local concepts if needed. Users mostly don't think about scopes; the query interface abstracts them.

## Anatomy-insight relationship

The `.cortex/anatomy/` module deprecates. Its content and role fold into insight:

- Anatomy's file listing and structural graph become Level 1 output of insight extraction.
- Anatomy's purpose lines become Level 2 output — the same content, richer format, in `.cortex/insight/anatomy/` (or scope-local `.cortex/insight/scopes/<scope>/anatomy/` for scoped extractions).
- Anatomy's `spec_links` and `governs:` resolution move to insight's connections section.
- Anatomy's `purpose_source` provenance (docstring / scanner-llm / read-time) becomes part of insight's extraction metadata.

Consequences:
- The `.cortex/anatomy/` directory disappears in v2.
- Modules that read anatomy today (specflow-tests, specflow-develop, hooks, spec-drift loop) update to read insight instead.
- The four-tier anatomy refresh pattern (§7 of v1 design) generalizes to insight's per-level refresh discipline.
- Read-time purpose capture (v1's PreRead/PostRead cycle) integrates with insight — purposes captured during reading update insight entries, tagged as `read-time` provenance.

The migration is real work but the result is cleaner: one place for codebase understanding, not two overlapping modules.

## Ingestion via archive

The archive module holds documents that get ingested into Cortex and the structured content extracted from them. Ingestion is systematic — every authoritative document that authorizes downstream content (rules, specs, decisions) enters through this pipeline.

**Document types handled:** all documents worth ingesting, extensible.

- Client specifications
- Contracts and legal agreements
- Regulatory and compliance documents
- Technical specifications from stakeholders
- Meeting transcripts, interview recordings, call notes
- Technical decision records (RFCs, architecture docs)
- Existing documentation from a codebase being onboarded
- User research, feedback, complaints

Each document type has an extraction schema defining what structured content the ingestion skill produces from it. Schemas live in `archive/types/` — adding a new document type means adding a schema file, not modifying the skill.

**Archive structure:**

```
.cortex/archive/
├── _index.md
├── register.md                       # human-readable index of all documents
├── documents/
│   ├── client-spec-v2.0/
│   │   ├── source.pdf                # or .md, .docx, whatever
│   │   ├── metadata.yaml             # ingested_at, version, supersedes, etc.
│   │   └── extracted/                # structured content from extraction
│   │       ├── requirements/
│   │       │   ├── GT-CLIENT-001-session-expiry.md
│   │       │   └── ...
│   │       └── summary.md
│   ├── client-spec-v1.5/             # superseded, kept for audit
│   │   └── ...
│   ├── kickoff-meeting-2026-01-08/
│   │   ├── source.txt
│   │   ├── metadata.yaml
│   │   └── extracted/
│   │       ├── decisions.md
│   │       └── open-questions.md
│   └── ...
└── types/
    ├── client-spec.yaml
    ├── contract.yaml
    ├── meeting-transcript.yaml
    └── ...
```

Every ingested document is a directory under `documents/`. Contains the source file, machine-readable metadata, and everything extracted from it. Superseded versions are preserved rather than deleted — audit trail matters.

`register.md` is the browsable summary. Machine-readable metadata lives in each document's `metadata.yaml`.

**Ingestion is one skill.** `cortex-ingest` (or renamed) handles all document types via internal type routing. The user experience is uniform — invoke the skill with a document, the skill classifies the type, routes to the appropriate extraction strategy. Type schemas make the pipeline extensible without changing the skill itself.

**Ingested documents are authoritative by definition.** The user chose to ingest them. Extraction produces structured content directly — not proposals to be reviewed. Extracted content lives in the document's own directory (`documents/<slug>/extracted/`), not in pulse.

**Ingestion workflow:**

1. **User invokes the skill on a document.** Names the document, optionally declares its type.
2. **Skill classifies the document type.** Either declared explicitly or inferred from the content.
3. **Skill stores the source.** Copies the document into `archive/documents/<slug>/` with initial metadata.
4. **Skill runs extraction.** Produces structured content in `archive/documents/<slug>/extracted/` — requirements, decisions, facts, whatever the document type produces.
5. **Skill may ask clarifying questions.** If the document is materially ambiguous, the skill asks the user to clarify inline before finalizing extraction. Not pulse suggestions — direct conversation in the session.
6. **Skill asks: does the user want Claude to draft a change plan?** The extracted content is now in the archive. The user chooses:
   - **Yes** — Claude analyzes the extracted content and drafts a plan for downstream changes (rules to add or update, specs to create, atlas decisions to record). User reviews the plan, adjusts, approves.
   - **No** — the document is ingested and extracted content is available for reference, but no automatic downstream proposals. The user may invoke changes later or reference the extracted content directly.

The user's choice at step 6 matters. Not every ingested document should trigger immediate downstream changes. A meeting transcript may be worth ingesting as context without generating rule proposals. A regulatory document may be reference material for later.

7. **If yes at step 6, skill applies the approved plan.** Creates or updates rules, specs, and decisions. Each has provenance pointing back to the source document (see Provenance below).
8. **Register updates.** The new document is registered; downstream derivations are tracked in the register; the audit trail is complete.

**Document version updates.** When a document version changes (client sends v2.1 of the spec):

1. New version ingested. Skill diffs against v2.0's extracted content.
2. Diffs are surfaced inline: "this requirement is new," "this requirement changed," "this requirement was removed."
3. For changed requirements, downstream artifacts that derive from them are identified.
4. Skill asks whether to draft an update plan (same yes/no gate as step 6).
5. If yes, plan is drafted, reviewed, applied.
6. Old version preserved in `archive/documents/<slug-v2.0>/` as superseded; new version becomes active; register updates.

## Provenance

Every persistent artifact that can trace to an authorizing source carries provenance. This applies to compass rules, both spec trees, and atlas decisions.

**Provenance format.** A frontmatter field listing sources:

```yaml
---
id: R-042
name: session-expiry-thirty-minutes
governs: ["src/auth/**/*.ts"]
check: "regex('SESSION_TTL\\s*=\\s*30\\s*\\*\\s*60')"
severity: error
provenance:
  - derives_from: archive/documents/client-spec-v2.0/extracted/requirements/GT-CLIENT-001-session-expiry.md
---

# R-042: Sessions expire after 30 minutes

Body of the rule...
```

Multiple sources are allowed:

```yaml
provenance:
  - derives_from: archive/documents/client-spec-v2.0/extracted/requirements/GT-CLIENT-001-session-expiry.md
  - derives_from: claude-sessions/pedro/abc123def
```

**Source types.**

- **Archive documents.** Reference the extracted content or the source directly. `archive/documents/<slug>/extracted/...` or `archive/documents/<slug>/source.pdf`.
- **Claude Code sessions.** Referenced by session ID: `claude-sessions/<user>/<session-id>`. Not stored in Cortex — cited but not retrievable through the module. Establishes that a decision came from a specific session; if someone wants the full context, they consult Claude Code directly or ask the user who was in the session.
- **Atlas decisions.** A compass rule may derive from an atlas decision that captures the reasoning. `atlas/decisions/2024-11-auth-tokens.md`.

**Relationship type.** For v1, always `derives_from`. This is a simplification — v1 doesn't distinguish between "derives from" (mandatory authority), "informed by" (contextual influence), "discussed in" (session reference), etc. Simplicity wins for v1; if a relationship taxonomy becomes useful, that's a future refinement (see Future ideas).

**Provenance is not required.** Not every rule, spec, or decision has a traceable source. A rule that emerged from the user directly authoring it doesn't need provenance — the absence of a provenance field means "authored directly." Provenance is populated when a source exists, empty when it doesn't.

**Downstream mechanisms provenance enables:**

- **Drift detection when a source changes.** If `archive/documents/client-spec-v2.0/` is superseded by v2.1 and one of its requirements changed, downstream rules and specs citing that requirement are flagged for review.
- **"What changes if we renegotiate X?" queries.** Traverse the citation graph backward from a source to find every artifact that derives from it.
- **Audit trail.** Every enforceable rule can be traced to the authority that justifies it.

## Extraction skill

`cortex-extract-insight` — the skill that runs the extraction pipeline. Invoked from Claude Code sessions and from scheduled tasks. No CLI wrapper — this positions Cortex as infrastructure on top of Claude Code rather than a replacement for it.

**Invocation contexts:**

- **Initial extraction on a fresh codebase.** User opens a Claude Code session on the project and invokes the skill. Claude runs the planning phase, presents the plan, executes, and reports.
- **Scheduled maintenance.** The scheduled tasks (see Loops) invoke the skill in dirty-only mode to refresh flagged files. Same skill, different invocation parameters.
- **On-demand refresh.** Users can invoke the skill mid-session to refresh a specific file, concept, or scope. Useful when they've made significant changes and want insight to catch up before continuing work.

**Behavior:**

- Orchestrates the extraction phases: Level 1 structural, planning, scoped execution, cross-scope unification.
- Spawns sub-agents for parallel work — one per root scope, coordinated by the top-level extraction agent.
- Handles failure recovery — resumable if extraction crashes partway through. Scope completions are checkpointed; incomplete scopes resume from the last checkpointed file within them.
- Reports progress to `.cortex/pulse/insight-extraction-progress.md` throughout. Reporting is scope-level and file-within-scope level.
- Validates its own outputs against the schema; flags inconsistencies.
- Presents the extraction plan for user review when the codebase warrants planning (above the auto-run threshold); auto-runs for smaller codebases.

Design informed by Graphify's approach. Before implementation, the skill's designer studies Graphify's extraction pipeline and produces a "what we take, what we leave, what we do differently" document. Specifically look at:

- Architecture: how Graphify parallelizes extraction, batches, handles scale.
- Prompts: how Graphify instructs the LLM to extract concepts, tags, edges. Their prompts are crystallized experience worth learning from.
- Storage format: how they serialize graphs and metadata. Whether they use embeddings and why.
- Failure modes: where their extraction produces garbage (jargon-heavy files, config-only files, misnamed code). How they handle these.
- Update mechanism: whether they re-extract everything or incrementally update. How they invalidate stale semantic edges.

Explicitly not copied from Graphify:
- Embeddings-heavy retrieval — Cortex uses structured tags and graph traversal.
- MCP server as primary interface — Cortex is CLI-first.
- Confidence scores that are actually cosine similarity — Cortex's confidence should mean something real.

## Loops

New loops for insight:

- `cortex-loop-insight-refresh-fast` — post-commit, deterministic. Flags files for review. No extraction.
- `cortex-loop-insight-refresh-daily` — daily. Runs significance triage on flagged files. Runs Level 2 on files with any real change. Runs Level 3 on files with significant change. Neighborhood-updates Level 4 semantic edges around Level 3 re-extractions.
- `cortex-loop-insight-refresh-full` — weekly (configurable). Runs full Level 4 regeneration as the ground-truth pass. Catches drift the incremental updates miss.

Existing anatomy-refresh loops deprecate as anatomy deprecates.

## What's still open

Deferred to the design pass itself:

- **Storage format details.** Exact JSON schema for graph.json, tags.json, clusters.json. Field-level structure, edge type enumeration, cluster representation.
- **Constellation integration.** Whether insight adds a preset to the constellation (dashed edges for inferred, background regions for clusters) or whether the constellation stays curated-only. Not central; defer.
- **Migration mechanics** for the v1→v2 module renames (cerebrum → compass), the anatomy → insight absorption, and the removal of duplicate decisions. Cortex is single-user so this is straightforward; still needs to be specified.
- **Ingestion skill name.** `cortex-ingest` is the placeholder from v1's SpecFlow-adjacent naming. Whether to keep it, rename to `cortex-archive-ingest`, or use a shorter name is a design-pass decision.
- **Document type schema format.** What `archive/types/*.yaml` files contain, how the ingestion skill routes on them, how new types are added. Sketched but not specified.

## Future ideas

Deliberately not in scope for the initial insight build, but captured here so they aren't lost when future refinement rounds happen.

- **`cortex insight ask` as a subprocess-based command.** For v1, natural-language questions are answered by the current Claude Code session using the retrieval primitives (`file`, `concept`, `element`). This works but spends context tokens on retrieval. A future addition: `cortex insight ask "<question>"` invokes a headless Claude Code subprocess with the insight layer loaded, answers the question, returns a compact response. The main session sees the answer without paying the context cost of retrieval. Particularly valuable on exploratory queries early in a session ("how does auth work here?", "where's the retry logic?") where the user wants an informed answer without eating into the main context budget. The tradeoff is subprocess cost and losing the current session's context about what the user is working on — worth it for informational queries, not always worth it for questions grounded in the current work. Left for a later round.
- **Provenance relationship taxonomy.** For v1, all provenance uses `derives_from` regardless of the actual relationship. A future refinement: distinguish between `derives_from` (mandatory authority — the source required this artifact), `informed_by` (the source influenced but didn't require), `discussed_in` (session reference for decisions made there), `authored_in` (the source is where this was written up), `contradicted_by` (this artifact conflicts with the source, flagged for review). The taxonomy would let downstream tooling reason about provenance strength — drift detection could ignore `informed_by` sources but flag changes to `derives_from` sources, for example. v1 doesn't need this distinction; when real use surfaces a need, the taxonomy can be introduced with a schema migration.
- **Automated document type detection.** For v1, users may need to declare the document type when ingesting. A future addition: the ingestion skill classifies unknown documents automatically by content analysis. Reduces friction for occasional ingestion of unusual document types.
- **Extraction confidence scoring.** For v1, extraction produces content the user reviews via the change plan gate. A future addition: extraction attaches confidence scores to each extracted item, letting the user prioritize review. Low-confidence extractions get more scrutiny; high-confidence extractions can be auto-approved above some threshold. Useful for very large documents where reviewing every extraction is impractical.

## What this document is not

This is not the v2 design doc. It's a decisions record — a consolidated statement of what we've agreed on during the design conversation, in enough depth that the design pass can build on it without re-litigating settled questions.

The design pass, when it runs, produces:
- v2 design doc (or v1.x — naming to be settled) grounded in these decisions
- Schema addendum for insight module, updated anatomy handling, new loops, CLI additions
- Build order for the extraction system
- Initial spec drafts for the load-bearing pieces

Nothing in this document is implementation-ready. It's the foundation for implementation work to build on.