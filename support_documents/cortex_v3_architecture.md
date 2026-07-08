# Cortex v3 Architecture — Design Decisions

**Status:** Design decisions record, pre-design-pass. Not the full design doc.

**Purpose:** Consolidate the design decisions made across four related threads — the reframe of what Cortex is, the codebase-understanding capability (insight), the reorganization of `.cortex/` into five modules, and the introduction of systematic document ingestion — into a single foundation for the design pass.

**What follows is not an implementation plan.** It's the record of what's been decided, in enough depth that the design pass can produce the actual design doc, schema addendum, build order, and initial specs without re-litigating settled questions.

---

## What Cortex is

Cortex is a codebase-understanding system for Claude Code. Its purpose is to give Claude deep, persistent, actively-refreshed understanding of any codebase Claude works in — deep enough that Claude behaves like it knows the codebase, including on codebases the user hasn't extensively worked in themselves.

The persistence layer, the self-maintenance loops, the spec-driven capabilities inherited from SpecFlow — all of these are properties that support the understanding. They are not the point of the system.

**Positioning against existing tools:**

- Deeper than fast structural indexing (Understand Anything). Cortex does real LLM extraction, not just tree-sitter parsing.
- Fresher than one-shot LLM extraction (Graphify). Cortex maintains understanding through scheduled refresh, not as an artifact that goes stale between runs.
- Designed with Claude as the primary user. The query surface and the data organization are shaped for how Claude actually consults context during work, not for humans browsing a graph viewer.
- Integrated with a persistent layer that survives across sessions. Understanding accumulates rather than starting cold each time.

---

## The five modules of `.cortex/`

Cortex organizes durable state into five modules under `.cortex/`. Each module has one clear role. All five have names that describe character rather than mechanism.

- **atlas** — reference knowledge. Stakeholders, decisions, domain language. The "why" behind the project.
- **compass** — enforceable rules, conventions, and bugs. What the project should do at the enforcement layer.
- **archive** — ingested documents and their extracted content. Source material and its structured derivations.
- **insight** — inferred codebase understanding. Rich per-file entries, concept graph, cluster assignments.
- **pulse** — transient activity artifacts. Loop outputs, working state, progress reports.

**Two changes from v1** are folded into this reorganization:

1. **`cerebrum` renames to `compass`.** The v1 name didn't match what the module actually held (rules, conventions, bugs — governance-shaped content, not brain-metaphor content).
2. **Decisions live only in atlas.** v1 had `atlas/decisions/` *and* `cerebrum/decisions.md` as "the same data, two views." That framing accumulates drift. In v3, decisions live only in `atlas/decisions/`. Compass rules that derive from atlas decisions cite them via provenance.

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
├── archive/
│   ├── _index.md
│   ├── register.md
│   ├── documents/
│   └── types/
├── insight/
│   └── ... (see below)
└── pulse/
    └── ...
```

**`.cortex/anatomy/` from v1 deprecates.** Its role is absorbed into insight. See "Insight and the anatomy transition" below.

---

## Insight: the codebase-understanding capability

Insight is the primary capability. Everything else in v3 either serves it, is orthogonal to it, or (in the case of the module rename) is a related cleanup.

### What insight contains

`.cortex/insight/` holds an inferred, persistent, queryable, actively-refreshed understanding of the codebase. Five properties define it:

- **Persistent.** Content lives in `.cortex/insight/` across sessions. Not regenerated per query.
- **Queryable.** Claude and humans query it via `cortex insight` CLI subcommands.
- **Actively refreshed.** Scheduled loops keep it current as the codebase changes.
- **Deep.** LLM extraction produces rich per-file understanding, not just structural indexes.
- **Ungated.** Content is inferred rather than passing through human review before landing. Insight is context, not authority. Where insight conflicts with a compass rule or a spec, the gated layer wins.

### The four extraction levels

Insight extraction runs at four levels. Each has a distinct role and cost profile.

**Level 1 — Structural.** Deterministic tree-sitter parse. Import/export graph, file sizes, entry points, module structure, centrality analysis. No LLM. Minutes on a mid-sized codebase.

**Level 2 — Purpose.** LLM pass per file producing a one-paragraph purpose plus connections. Uses the file's content and Level 1 context. Model: Sonnet. Batched per file. Tens of minutes on a mid-sized codebase.

**Level 3 — Deep understanding.** LLM pass per file identified as important by Level 1's centrality analysis. Produces main players, insights, patterns, quirks, file map for large files. Model: Sonnet. Multi-agent parallelized. Hours on a real codebase.

**Level 4 — Cross-file semantic graph.** LLM inference over Level 3 outputs. Concepts, cross-file semantic edges (files handling the same concern even without imports), pattern identification, cluster assignments. Model: Sonnet. Hours to days depending on codebase size.

**No embeddings.** Cortex uses structured tags and graph traversal instead of vector similarity. Everything explainable and stable across LLM model changes.

### Initial extraction — the primary use case

The core scenario: user points Cortex at a codebase Claude doesn't know, and gets understanding out. This is what makes Cortex a codebase-understanding tool rather than a codebase-maintenance tool.

**Invocation.** `cortex-extract-insight` is a Claude Code skill. Users invoke it by opening a Claude Code session on a project and asking Claude to run the extraction. Scheduled tasks invoke the skill directly. No CLI wrapper — this positions Cortex correctly, as infrastructure that Claude Code uses to be more effective, not around it.

**The extraction is a plan, not a pipeline.** Claude reads the codebase and decides how to analyze it, in phases:

**Phase 1 — Structural pass.** Level 1 runs on the whole codebase. Deterministic, fast, produces the raw material Claude needs to plan the rest.

**Phase 2 — Planning.** Claude reads the Level 1 output and drafts an extraction plan. The plan identifies logically coherent scopes — subsets of the codebase that can be analyzed as units. Scopes may nest. Scopes may reference shared sub-scopes. The plan is written to `.cortex/pulse/insight-extraction-plan.md` for user review.

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

For manageable codebases (below an auto-run threshold), Claude executes the plan without asking. For codebases where the plan warrants review — large scope trees, ambiguous boundaries, high estimated cost — Claude presents the plan and waits for the user to confirm or adjust. The threshold is configurable; defaults are conservative.

**Phase 3 — Execution.** Claude orchestrates the extraction. Each root scope runs as a parallel sub-agent doing per-file analysis at Levels 2 and 3. Shared scopes are extracted once, before or in parallel with the scopes that depend on them.

Within each scope:
- Every file gets Level 2 analysis (purpose, connections).
- Files identified as important by centrality within the scope get Level 3 analysis.
- Importance is scope-local. A file central to `auth/` is analyzed at Level 3 even if it's peripheral to the whole codebase.

**Phase 4 — Cross-scope unification.** After all scopes complete, a final agent produces the Level 4 semantic layer across the whole codebase: concepts spanning scopes, patterns replicated across modules, cross-scope semantic edges. This is what makes scoped extraction cohere rather than fragmenting.

### Scope registry and deduplication

Claude's planning phase builds a scope registry:

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

**Same-module vs. similar-module.** When Claude encounters what appears to be the same module in multiple places, planning resolves whether they're actually one scope or two:

- **Same underlying files** (via imports, path resolution, or symlinks): one scope, extracted once, referenced from both parents.
- **Different implementations of similar functionality** (two independent `notifications/` directories with overlapping purpose but different code): two scopes, extracted separately. Cross-scope unification identifies them as semantically related and produces edges saying "these serve similar purposes." Connected but not deduplicated.

This is a judgment Claude makes during planning based on reading the code.

### Recursion

If a scope is still too large after planning, Claude recurses — breaks it into sub-scopes with the same planning process. Recursion terminates when each leaf scope is small enough for a single extraction agent.

Scope granularity is Claude's judgment based on cohesion and shared-use, not a fixed threshold. Coherent 40-file modules are valid scopes. 30-file modules shared across three parents justify their own scope for deduplication. Very small collections (5-10 files with no sharing) typically fold into their parent.

### Per-file understanding entry

Level 3 extraction produces a rich entry per important file:

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

Small files or files below the centrality threshold get a lighter entry — purpose and connections only.

### Query surface

Three granularities, exposed via CLI:

- `cortex insight file <path>` — returns the rich per-file entry
- `cortex insight concept <name>` — returns which files touch a concept, how it's implemented, related concepts
- `cortex insight element <query>` — returns an atomic element (function, class, key constant) with description, connections, and follow-up pointers. May return "no rich entry" for elements not identified as main players during Level 3; those are still discoverable via the file entry.

Elements are a byproduct of Level 3 extraction — they come from the main players section of file entries. Not a separate extraction pass.

Natural-language questions ("how does auth work here?", "where is retry logic implemented?") are answered by Claude within the current session, using these retrieval primitives to gather entries and reasoning over what it finds. There is no `cortex insight ask` command in v1 — the reasoning happens in the current session, not in a subprocess. This keeps the current session's context intact and avoids duplicating Claude's own capability. See Future ideas for the subprocess-based `ask` as a v-plus-one addition.

### How Claude consults insight

CLAUDE.md gains a section that directs Claude to use insight and specifies when:

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

The framing is directive without forcing. "Not optional" sets expectation; the read-vs-consult distinction is what makes insight actually useful in practice by preventing Claude from defaulting to full file reads.

### Skill integrations

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

### Storage format

Hybrid — markdown for prose content, JSON for graph structure. Both authoritative; a validator ensures consistency.

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

For unscoped extractions (small codebases):

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

The `anatomy/` name preserves continuity with what v1's `.cortex/anatomy/` was — the structural artifact of the codebase at the file level. The query layer hides the scoped-vs-flat structural difference; users mostly don't think about scopes.

### Keeping insight current after initial extraction

Once initial extraction has produced the insight layer, the maintenance system keeps it fresh. The load-bearing principle: refresh scales with *meaningful* change, not with commit volume.

**Post-commit (deterministic).** Changed files are flagged for review. Fast. No LLM. No extraction happens at this step.

**Daily loop — Level 2 refresh.** Flagged files with real changes get Level 2 re-extraction. Cheap enough that any non-trivial change warrants Level 2 refresh.

**Daily loop — Level 3 refresh, only when significant change.** Flagged files with significant changes get Level 3 re-extraction. Most commits don't trigger Level 3. Substantial changes to what a file *is* — new methods, refactored responsibilities, new patterns — do.

**Significance detection is hybrid:**
- Structural filter first: deterministic rules rule out obvious no-ops (formatting-only, comment-only, whitespace, import reordering).
- LLM triage second: Haiku pass looks at the diff and existing insight entry, decides "significant" or "cosmetic" for cases the structural filter can't classify.

**Level 4 refresh, periodic.** Full Level 4 regeneration runs weekly (configurable) as the ground-truth pass. Neighborhood updates around Level 3 re-extractions happen daily as a byproduct.

**Model choice:** Sonnet for Levels 2, 3, 4. Haiku for triage. Quality is load-bearing — wrong insight is prejudicial and worth paying for.

### Insight and the anatomy transition

`.cortex/anatomy/` deprecates in v3. Its content and role fold into insight:

- Anatomy's file listing and structural graph become Level 1 output of insight extraction.
- Anatomy's purpose lines become Level 2 output — same content, richer format, in `.cortex/insight/anatomy/` (or scope-local `.cortex/insight/scopes/<scope>/anatomy/` for scoped extractions).
- Anatomy's `spec_links` and `governs:` resolution move to insight's connections section.
- Anatomy's `purpose_source` provenance becomes part of insight's extraction metadata.

Modules that read anatomy today (specflow-tests, specflow-develop, hooks, spec-drift loop) update to read insight instead. Read-time purpose capture (v1's PreRead/PostRead cycle) integrates with insight — purposes captured during reading update insight entries, tagged as `read-time` provenance.

### The extraction skill

`cortex-extract-insight` — invoked from Claude Code sessions and from scheduled tasks. No CLI wrapper.

**Invocation contexts:**
- **Initial extraction on a fresh codebase.** User opens a Claude Code session and invokes the skill. Claude runs planning, presents the plan, executes, reports.
- **Scheduled maintenance.** The refresh loops invoke the skill in dirty-only mode.
- **On-demand refresh.** Users can invoke the skill mid-session to refresh a specific file, concept, or scope.

**Behavior:**
- Orchestrates the extraction phases (Level 1, planning, scoped execution, cross-scope unification).
- Spawns sub-agents for parallel work — one per root scope, coordinated by the top-level agent.
- Handles failure recovery — resumable if extraction crashes. Scope completions are checkpointed.
- Reports progress to `.cortex/pulse/insight-extraction-progress.md`.
- Validates outputs against the schema.
- Presents the extraction plan for user review when the codebase warrants it; auto-runs for smaller codebases.

**Informed by Graphify's approach.** Before implementation, the skill designer studies Graphify's extraction pipeline and produces a "what we take, what we leave, what we do differently" document. Look at Graphify's architecture, prompts, storage format, failure modes, and update mechanism. Explicitly don't copy: embeddings-heavy retrieval, MCP server as primary interface, confidence scores that are actually cosine similarity.

### Insight loops

- `cortex-loop-insight-refresh-fast` — post-commit, deterministic. Flags files for review. No extraction.
- `cortex-loop-insight-refresh-daily` — daily. Runs significance triage on flagged files. Runs Level 2 on files with any real change. Runs Level 3 on files with significant change. Neighborhood-updates Level 4 semantic edges around Level 3 re-extractions.
- `cortex-loop-insight-refresh-full` — weekly (configurable). Runs full Level 4 regeneration as the ground-truth pass.

Existing anatomy-refresh loops deprecate as anatomy deprecates.

---

## Document ingestion via archive

The archive module holds documents that get ingested into Cortex and the structured content extracted from them. Ingestion is systematic — every authoritative document that authorizes downstream content (rules, specs, decisions) enters through this pipeline.

### Document types

All documents worth ingesting. The list is extensible; adding a new type means adding a schema file to `archive/types/`, not modifying the ingestion skill.

- Client specifications
- Contracts and legal agreements
- Regulatory and compliance documents
- Technical specifications from stakeholders
- Meeting transcripts, interview recordings, call notes
- Technical decision records (RFCs, architecture docs)
- Existing documentation from a codebase being onboarded
- User research, feedback, complaints

### Archive structure

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

Every ingested document is a directory under `documents/`. Contains the source, machine-readable metadata, and everything extracted from it. Superseded versions are preserved, not deleted — audit trail matters.

`register.md` is the browsable summary. Machine-readable metadata lives in each document's `metadata.yaml`.

### The ingestion skill

**One skill.** `cortex-ingest` (name to be finalized in the design pass) handles all document types via internal type routing. The user experience is uniform — invoke the skill with a document, the skill classifies the type, routes to the appropriate extraction strategy. Type schemas make the pipeline extensible without changing the skill.

**Ingested documents are authoritative by definition.** The user chose to ingest them. Extraction produces structured content directly. Extracted content lives in the document's own directory (`documents/<slug>/extracted/`), not in pulse.

### The ingestion workflow

1. User invokes the skill on a document. Names it, optionally declares its type.
2. Skill classifies the document type — declared explicitly or inferred from content.
3. Skill stores the source in `archive/documents/<slug>/` with initial metadata.
4. Skill runs extraction. Produces structured content in `archive/documents/<slug>/extracted/`.
5. Skill may ask clarifying questions inline if the document is materially ambiguous. Direct conversation, not pulse suggestions.
6. **Skill asks: does the user want Claude to draft a change plan?** The extracted content is now in the archive. The user chooses:
   - **Yes** — Claude analyzes the extracted content and drafts a plan for downstream changes (rules to add or update, specs to create, atlas decisions to record). User reviews the plan, adjusts, approves.
   - **No** — the document is ingested and extracted content is available for reference, but no automatic downstream proposals. The user may invoke changes later or reference the extracted content directly.
7. If yes, skill applies the approved plan. Creates or updates rules, specs, and decisions. Each has provenance pointing back to the source document.
8. Register updates. The new document is registered; downstream derivations tracked; audit trail complete.

The choice at step 6 matters. Not every ingested document should trigger downstream changes. A meeting transcript may be worth ingesting as context without generating rule proposals. A regulatory document may be reference material for later.

### Document version updates

When a document version changes (client sends v2.1 of the spec):

1. New version ingested. Skill diffs against v2.0's extracted content.
2. Diffs are surfaced inline: "this requirement is new," "this requirement changed," "this requirement was removed."
3. For changed requirements, downstream artifacts that derive from them are identified.
4. Skill asks whether to draft an update plan (same yes/no gate as step 6).
5. If yes, plan is drafted, reviewed, applied.
6. Old version preserved in `archive/documents/<slug-v2.0>/` as superseded; new version becomes active; register updates.

---

## Provenance

Every persistent artifact that can trace to an authorizing source carries provenance. This applies to compass rules, both spec trees, and atlas decisions.

### Format

A frontmatter field listing sources:

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

### Source types

- **Archive documents.** Reference the extracted content or the source directly. `archive/documents/<slug>/extracted/...` or `archive/documents/<slug>/source.pdf`.
- **Claude Code sessions.** Referenced by session ID: `claude-sessions/<user>/<session-id>`. Not stored in Cortex — cited but not retrievable through the module. Establishes that a decision came from a specific session; retrieving full context requires Claude Code access or asking the user.
- **Atlas decisions.** A compass rule may derive from an atlas decision that captures the reasoning. `atlas/decisions/2024-11-auth-tokens.md`.

### Relationship type

For v1, always `derives_from`. Simplicity wins for the first version. A relationship taxonomy (informed_by, discussed_in, contradicted_by, etc.) is a future refinement if real use surfaces the need.

### When provenance is populated

Not every rule, spec, or decision has a traceable source. Absence of a provenance field means "authored directly." Provenance is populated when a source exists.

### What provenance enables

- **Drift detection when a source changes.** If a source document is superseded and one of its requirements changed, downstream rules and specs citing that requirement are flagged for review.
- **"What changes if we renegotiate X?" queries.** Traverse the citation graph backward from a source to find every artifact that derives from it.
- **Audit trail.** Every enforceable rule can be traced to the authority that justifies it.

---

## What v3 keeps from v1 and v2

The architecture from v1 and v2 that continues into v3 without change:

- **Cortex Core as a global Node.js binary.** Deterministic, no LLM calls, owns `.cortex/` schema and CLI and hooks and constellation compiler.
- **Skills as Claude Code skill bundles.** Two namespaces: specflow-* (11 skills inherited from SpecFlow) and cortex-* (persistence and loop lineage). Agentic, LLM-using. The Core-vs-Skills split is load-bearing — git-hook safety, deterministic testing, and cost predictability all depend on Core staying LLM-free.
- **The 13 self-maintenance loops** (with the anatomy-refresh pair deprecating and being replaced by the insight-refresh loops described above).
- **The pulse gate** for autonomous proposals from loops.
- **The seven-type bug taxonomy** for classifying defects.
- **The four test tiers** (atomic, spec, journey, scenario) and two spec trees (dev under `.specflow/specs/`, business under `.specflow/specs-business/`).
- **The scaffolding mechanism** — CLAUDE.md, `_index.md` files, hooks — that directs Claude into the persistence layer at every session.

---

## What's still open

Deferred to the design pass itself, not to further design conversations:

- **Storage format details.** Exact JSON schema for graph.json, tags.json, clusters.json. Field-level structure, edge type enumeration, cluster representation.
- **Constellation integration.** Whether insight adds a preset to the constellation (dashed edges for inferred, background regions for clusters) or whether the constellation stays curated-only. Not central; defer.
- **Migration mechanics.** How the module renames (cerebrum → compass), the anatomy → insight absorption, and the removal of duplicate decisions are actually executed. Cortex is single-user so this is straightforward; still needs to be specified.
- **Ingestion skill name.** `cortex-ingest` is a placeholder. Final name is a design-pass decision.
- **Document type schema format.** What `archive/types/*.yaml` files contain, how the ingestion skill routes on them. Sketched but not specified.

---

## Future ideas

Deliberately not in scope for v3. Captured here so they aren't lost.

- **`cortex insight ask` as a subprocess-based command.** For v1, natural-language questions are answered by the current Claude Code session using the retrieval primitives. This works but spends context tokens on retrieval. A future addition: `cortex insight ask "<question>"` invokes a headless Claude Code subprocess with the insight layer loaded, answers the question, returns a compact response. The main session sees the answer without paying the context cost of retrieval. Particularly valuable on exploratory queries where the user wants an informed answer without eating into the main context budget. The tradeoff is subprocess cost and losing the current session's context about what the user is working on.

- **Provenance relationship taxonomy.** For v1, all provenance uses `derives_from` regardless of the actual relationship. A future refinement distinguishes between `derives_from` (mandatory authority), `informed_by` (contextual influence), `discussed_in` (session reference), `authored_in` (source is where this was written up), `contradicted_by` (this artifact conflicts with the source, flagged for review). Would let downstream tooling reason about provenance strength.

- **Automated document type detection.** For v1, users may need to declare document type. A future addition: the ingestion skill classifies unknown documents automatically by content analysis.

- **Extraction confidence scoring.** For v1, extraction produces content the user reviews via the change plan gate. A future addition: extraction attaches confidence scores to each extracted item, letting the user prioritize review or auto-approve high-confidence extractions above some threshold.

---

## What this document is not

Not the v3 design doc. Not implementation-ready. A decisions record — the consolidated statement of what we've agreed on across the design conversation, in enough depth that the design pass can build on it without re-litigating settled questions.

The design pass, when it runs, produces the actual design doc, schema addendum for the module reorganization and the new capabilities, build order across the changes, and initial spec drafts for the load-bearing pieces.