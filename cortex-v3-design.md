# Cortex v3 — Design Document

**Status:** Design phase. Grounded in the `support_documents/cortex_v3_architecture.md` decisions record (the settled foundation this document expands, never re-litigates). No code written, no schema edits, no specs. Depends on `cortex-schema.md` v2.0 as the contract in force; a schema 3.0 addendum is a **later** phase — §10 below names every clause that addendum must add or change, but does not draft it. Pending review by Pedro.
**Author:** Pedro Pacheco (Sucesso Fractal), in collaboration with Claude.
**Date:** 7 July 2026.
**Document purpose:** Turn the v3 decisions record into a coherent design doc — the reframe of what Cortex *is* (a codebase-understanding system for Claude Code), the `insight` rebuild that is v3's centre of gravity, the reorganization of `.cortex/` into five named modules, systematic document ingestion through `archive`, and the `provenance` system that ties enforceable content back to its authorizing source. This is a **separate document** from `cortex-design.md` (the frozen v1.0 record) and `cortex-v2-design.md` (the frozen v2 record). Cross-references of the form "v1 §N" point into `cortex-design.md`; "v2 §N" into `cortex-v2-design.md`; "schema §N" into `cortex-schema.md` v2.0. Section references to the settled foundation read "the decisions record."

A note on the word "v3": where v1 §4.4 used "v2" loosely to mean "post-v1", and v2 narrowed it to the insight-plus-reorganization round, v3 is the round that **reframes Cortex around codebase understanding** and rebuilds the insight module to deliver it. v3 is layered on the shipped v2 foundation — not a rework of v2 in place. What v2 built and what v2 keeps building is stated precisely in §2.

Cortex is a codebase-understanding system for Claude Code: a persistent, actively-refreshed, queryable layer of deep understanding about any codebase Claude works in, deep enough that Claude behaves like it knows the codebase — including codebases the user has never extensively worked in themselves.

---

## 1. What Cortex v3 is — the reframe

### 1.1 The thesis, restated at v3's altitude

v1 and v2 described Cortex as a *persistence-and-maintenance* system: a curated knowledge layer (cerebrum, atlas, anatomy), a set of self-maintenance loops, a spec-driven lineage inherited from SpecFlow, and — in v2 — an ungated insight layer that captured inferred structure and session observations. Each of these is real and each is kept. But describing Cortex as "the persistence layer plus the loops plus the specs" mistakes the machinery for the purpose.

**v3 states the purpose directly: Cortex exists to give Claude deep, persistent, actively-refreshed understanding of any codebase Claude works in.** The persistence layer, the self-maintenance loops, the spec-driven capabilities — all of these are properties that *support* the understanding. They are not the point of the system. This is a reframe, not a repudiation: everything v1 and v2 built continues to serve, but it now serves a stated centre rather than standing as an end in itself.

The consequence is architectural, not merely rhetorical. When understanding is the point, the load-bearing module is the one that *produces and serves* understanding — `insight`. Everything in v3 either serves insight (the refresh loops, the extraction skill, the query CLI), is orthogonal to it (archive, provenance, the module rename), or is a cleanup that the reframe made obvious (decisions-single-home). §5 is therefore the longest section in this document by design: it is the section that carries v3's reason for existing.

### 1.2 Positioning against existing tools

The reframe is sharpest when stated against the tools Cortex is not:

- **Deeper than fast structural indexing (Understand Anything).** Structural indexers parse with tree-sitter and stop. Cortex does that as *one level* (L1, §5.2) and then spends real LLM extraction on top — per-file purpose, deep per-file understanding, and a cross-file semantic graph. Structure is the substrate, not the product.
- **Fresher than one-shot LLM extraction (Graphify).** A one-shot extraction is an artifact that goes stale the moment the codebase moves. Cortex maintains understanding through scheduled refresh that scales with *meaningful* change (§5.9), so the understanding is a living layer, not a snapshot with a decaying half-life. The `graphify-extraction-study.md` verdicts (§5.11) confirm this is the single most important thing to differ on: Graphify's own update mechanism invalidates on file change only and lets cross-file semantic drift accumulate silently until a full rebuild — a gap fatal to an "actively-refreshed" system, and one Cortex is designed to close.
- **Designed with Claude as the primary user.** The query surface and the data organization are shaped for how Claude actually consults context during work — a per-file "resume" richer than reading 500 lines and remembering fragments — not for a human browsing a graph viewer. The CLAUDE.md protocol (§5.7) makes this consultation directive, not incidental.
- **Integrated with a persistent layer that survives across sessions.** Understanding accumulates rather than starting cold each session. This is the property that the whole v1/v2 substrate exists to provide, now pointed at the thing that most benefits from it.

### 1.3 What "no embeddings" buys, and why v3 keeps it

Cortex uses structured tags and graph traversal instead of vector similarity — everywhere, at every level. The extraction study (§5.11) makes this a validated stance rather than a preference: Graphify, an independently-built system solving the same problem, uses **no vector embeddings anywhere**; its only notion of similarity is (a) LLM-judged edges carried on a discrete confidence rubric and (b) lexical near-duplicate detection. That is the strongest available evidence that the no-embeddings design is buildable. The properties it buys — every inference explainable (each edge names its rationale), everything stable across LLM model changes (a model swap produces different *new* inferences, but never silently re-ranks or invalidates existing content the way re-embedding does), and Cortex Core untouched by vector infrastructure (RULES rule 3: Core stays deterministic file I/O) — are exactly the properties v1 §7.3 and v2 §3.4 already committed to. v3 does not reopen this; it inherits it and extends it to four extraction levels.

---

## 2. Relationship to v1 and v2

v3 is layered on the **shipped v2 foundation**. The clean way to read the relationship is a three-column ledger: what v3 keeps unchanged, what it adds, and — the headline — what it supersedes.

### 2.1 Kept / added / superseded

| | Item | Status in v3 |
|---|---|---|
| **Kept** | Cortex Core as a global Node.js binary — deterministic, no LLM calls (RULES 3), owns `.cortex/` schema, CLI, hooks, constellation compiler | Unchanged |
| **Kept** | Skills as Claude Code bundles — two namespaces: 11 specflow-* (spec-and-test lineage) and cortex-* (persistence and loops). The Core-vs-Skills split | Unchanged; load-bearing |
| **Kept** | The two spec trees under `.specflow/specs/` (dev) + `.specflow/specs-business/` (business), linked by `implements:`/`implemented_by:` | Unchanged (v2 §9 reorganization stands) |
| **Kept** | The pulse gate for autonomous proposals from loops | Unchanged; **extended** by provenance and ingestion (§6, §7) |
| **Kept** | The seven-type bug taxonomy | Unchanged; re-homed into `compass/bugs/` by the rename (§4) |
| **Kept** | The four test tiers (atomic, spec, journey, scenario) | Unchanged |
| **Kept** | The scaffolding mechanism — CLAUDE.md managed block, `_index.md` files, warn-never-block hooks (RULES 6) | Unchanged; **extended** by the insight CLAUDE.md block (§5.7) |
| **Added** | `compass` module (the renamed `cerebrum`) | New name, same governance role (§4) |
| **Added** | `archive` module + document-type schemas + one ingestion skill | New (§6) |
| **Added** | `provenance` / `derives_from` system on rules, specs, decisions | New (§7) |
| **Added** | Four-level insight extraction (L1–L4), the plan-not-pipeline initial extraction, the `cortex insight file/concept/element` query surface, the `cortex-extract-insight` skill, and three refresh loops | New (§5) |
| **Superseded** | **v2's `insight` module** — the `map/` concept-map layout, the `insight-refresh`/`insight-gaps` loops, and the `query/get/neighbors/list` verbs (the `insight-gaps` loop's session-observation role re-homes to `cortex-loop-session-observe`, §9 — not dropped) | **Replaced** by v3's insight (§5, §8) |
| **Superseded** | `.cortex/anatomy/` as a standalone module | **Absorbed** into insight (§5.10) |
| **Superseded** | Duplicate decisions home (`cerebrum/decisions.md` alongside `atlas/decisions/`) | **Deleted**; decisions live only in atlas (§4.2) |

### 2.2 The headline: insight supersession

The most consequential relationship in this document is that **v3 redefines the same `.cortex/insight/` module that v2 is mid-building.** v2's insight (v2 §3) is a *concept-map over the curated artefact set* — `insight/map/<topic>.md` prose plus `graph.json`/`tags.json`/`clusters.json`, produced by two loops (`cortex-loop-insight-refresh` + `cortex-loop-insight-gaps`), promoted into the gated layers through the pulse gate, queried via `cortex insight query/get/neighbors/list`, and rendered as a constellation overlay preset.

v3's insight is a *leveled, scoped, per-file understanding of the source code itself* — rich L1–L4 extraction, a scope registry, per-file entries, queried via `cortex insight file/concept/element`, produced by the `cortex-extract-insight` skill and three refresh loops.

**These are not the same module wearing two coats.** v2's insight is a stepping stone; v3's insight supersedes it wholesale. The owner's ruling is explicit and this document encodes it: v2's insight code that has already landed stays in place as interim dogfood — it keeps working, keeps being useful — until v3's insight replaces it. The immediate build consequence is that **build-order-v2 steps 6–8** (the two insight loops and the promotion accept path, v2 §13) **are frozen**: they are not built out further, because what they build is being replaced. All *other* v2 work — schema 2.0, the `.specflow/` reorganization, the query-CLI substrate, the pulse-gate extensions — **continues unchanged**, because none of it is insight-specific and all of it is foundation v3 builds on. §8 states exactly what is salvaged from the v2 insight work and what is dropped.

---

## 3. The five modules of `.cortex/`

v3 organizes durable state into **five** modules under `.cortex/`, each with one clear role and a name that describes *character* rather than *mechanism*. This replaces the v1/v2 enumeration ("three durable modules plus insight plus pulse") with a cleaner five-way split.

- **atlas** — reference knowledge. Stakeholders, decisions, domain language. The "why" behind the project. **Now the single home for decisions** (§4.2).
- **compass** — enforceable rules, conventions, and the seven-type bug ledger. What the project should do at the enforcement layer. **The renamed `cerebrum`** (§4.1).
- **archive** — ingested documents and the structured content extracted from them. Source material and its derivations (§6).
- **insight** — inferred codebase understanding. Rich per-file entries, concept graph, cluster assignments. The primary capability (§5).
- **pulse** — transient activity artefacts. Loop outputs, working state, progress reports. Unchanged from v1/v2.

### 3.1 Storage layout

Reproduced from the decisions record; the schema 3.0 addendum (§10) locks the field-level detail:

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
│   └── ...                  # §5.8
└── pulse/
    └── ...
```

**`.cortex/anatomy/` from v1/v2 disappears.** Its role is absorbed into insight; the transition is §5.10. Every module keeps its `_index.md` active prompt (schema §7.1, RULES 9) — including the two new/renamed modules, whose prompts the schema 3.0 addendum specifies.

### 3.2 Why five names that describe character

The v1 module names mixed metaphors: `cerebrum` (brain-metaphor) held rules and bugs (governance-shaped content), while `atlas` and `anatomy` described character and structure respectively. v3 regularizes on *character*: atlas is reference, compass gives direction (enforcement), archive preserves source, insight infers, pulse is transient. The rename in §4 is the one place this regularization touches shipped content.

---

## 4. Module migrations

Two changes fold into the reorganization. Both are single-user, in-place migrations — Cortex has no external users, so the migration mechanics are straightforward but must still be specified (the migration spec named in §10 owns the exact mechanics; this section states what changes and why).

### 4.1 `cerebrum` → `compass`

The v1 name didn't match what the module held. `cerebrum` (a brain metaphor) governs rules, conventions, and bugs — governance-shaped content, not brain-metaphor content. `compass` names the role: the thing that tells you which way the project must go at the enforcement layer.

The rename is mechanical but has a **ripple** across every surface that names or addresses cerebrum:

- **Node-id grammar.** The constellation node-id grammar (schema §4.9) addresses rules and bugs. Rule and bug ids (`R-NNN`, `B-NNN`) are unchanged and their node-id prefixes (`rule:`, and the bug prefix) are content-keyed, not path-keyed, so they survive the directory rename; but any grammar clause that spells the *module path* (`cerebrum/…`) re-roots to `compass/…`.
- **Validator checks.** Every `check.*` that reads or asserts cerebrum structure (`check.cerebrum-*`, the PreWrite enforcement read, layout checks) re-roots to compass.
- **Scaffolding.** The CLAUDE.md managed block (schema §8), each `_index.md` that names cerebrum, `loop.md` wording, hook payloads that reference cerebrum, and the CLAUDE.md "Modules present" line.
- **Skill and loop text.** Every cortex-* loop and specflow-* skill that names `cerebrum/` in its instructions (`cortex-loop-rule-decay`, `cortex-pulse-distil`, `specflow-bugs`, and others).

Per RULES 19, the migration spec's change report must enumerate **every** check and clause the rename touches, not just the primary target — a rename is precisely the kind of change where "reported 3, touched 9" is the failure mode. The exact rewrite mechanics (find-and-replace grade for text; a directory move plus a validator re-root for structure) are left to the migration spec.

### 4.2 Decisions single-home

v1 carried `atlas/decisions/` *and* `cerebrum/decisions.md` as "the same data, two views." That framing accumulates drift — two copies of a decision diverge the moment one is edited without the other. v3 deletes the duplicate: **decisions live only in `atlas/decisions/`.** A compass rule that derives from a decision does not re-state it; it *cites* it, via provenance (`derives_from: atlas/decisions/<slug>.md`, §7). The reasoning that used to be copied into `cerebrum/decisions.md` is now reachable by following the citation, not by maintaining a second copy.

`cerebrum/decisions.md` is excluded from the `cerebrum`→`compass` rename entirely — it never exists at `compass/decisions.md`. The migration deletes it directly from its original `cerebrum/decisions.md` location, as its own step after the rename has landed to everything else (the migration spec sequences the two changes so the file is removed rather than renamed-then-removed), and, where a compass rule's body referenced the duplicated decision text, replaces the inline copy with a provenance citation. Rules that had no decision linkage are untouched.

---

## 5. Insight — the codebase-understanding capability

Insight is the primary capability. This section is the design's centre of gravity. Everything else in v3 either serves it, is orthogonal to it, or is a related cleanup.

### 5.1 What insight contains — five properties

`.cortex/insight/` holds an inferred, persistent, queryable, actively-refreshed understanding of the codebase. Five properties define it and each one is a design commitment:

- **Persistent.** Content lives in `.cortex/insight/` across sessions. Not regenerated per query. (This inherits v2 §3.3's "committed, machine-owned" git quadrant — insight is not gitignored; a fresh clone or a CI loop inherits the understanding rather than recreating the cold-start problem insight exists to solve.)
- **Queryable.** Claude and humans query it via `cortex insight` CLI subcommands (§5.6), which are **deterministic Core reading pre-extracted files** — no LLM at query time (RULES 3 holds; the judgment was spent at extraction time).
- **Actively refreshed.** Scheduled loops keep it current as the codebase changes, scaling with *meaningful* change, not commit volume (§5.9).
- **Deep.** LLM extraction produces rich per-file understanding — main players, insights, quirks, file maps — not just structural indexes.
- **Ungated.** Content is inferred rather than passing through human review before landing. Insight is **context, not authority.** Where insight conflicts with a compass rule or a spec, the gated layer wins. This is the v2 §2 gated/ungated thesis, carried forward exactly: insight never earns write-time enforcement authority (no PreWrite reads insight), because it never passed the gate that authority is earned through.

### 5.2 The four extraction levels

Insight extraction runs at four levels, each with a distinct role and cost profile. The level design is Cortex-original — the extraction study (§5.11) is explicit that Graphify is a *two-level* fixed pipeline (deterministic structural + one flat LLM semantic pass) with "no analogue of Cortex's L2/L3/L4 layering." The primitives Cortex borrows (§5.11) are shared *across* the levels; the level structure itself is Cortex's.

**Level 1 — Structural.** Deterministic tree-sitter parse (RULES 18: tree-sitter Node bindings, the only parser). Import/export graph, file sizes, entry points, module structure, centrality analysis. No LLM — this level runs **in Core**. Minutes on a mid-sized codebase.

**Level 2 — Purpose.** LLM pass per file producing a one-paragraph purpose plus connections, using the file's content and L1 context. Model: Sonnet. Batched per file. Tens of minutes on a mid-sized codebase.

**Level 3 — Deep understanding.** LLM pass per file identified as important by L1's centrality analysis. Produces main players, insights, patterns, quirks, and a file map for large files. Model: Sonnet. Multi-agent parallelized. Hours on a real codebase.

**Level 4 — Cross-file semantic graph.** LLM inference over L3 outputs. Concepts, cross-file semantic edges (files handling the same concern even without imports), pattern identification, cluster assignments. Model: Sonnet. Hours to days depending on codebase size.

**No embeddings** (§1.3). Structured tags and graph traversal, not vector similarity. From the study: L4 is the level that "names concepts," so the study's entropy gate and sentence-node sanitizer (§5.11) are the guardrails that keep low-information and prose-masquerading-as-entity nodes out of the graph.

### 5.3 Initial extraction — a plan, not a pipeline

The core scenario is what makes Cortex a codebase-*understanding* tool rather than a codebase-*maintenance* tool: the user points Cortex at a codebase Claude doesn't know and gets understanding out.

**Invocation.** `cortex-extract-insight` is a Claude Code **skill**, not a CLI command. Users invoke it by opening a Claude Code session on a project and asking Claude to run the extraction; scheduled tasks invoke the skill directly. There is deliberately **no CLI wrapper** — this positions Cortex correctly, as infrastructure that Claude Code *uses* to be more effective, rather than a tool that wraps around Claude. (It also honours RULES 3: extraction is agentic LLM work and therefore lives in a Skill, never in Core.)

**The extraction is a plan, not a pipeline.** Claude reads the codebase and *decides* how to analyze it, in four phases:

**Phase 1 — Structural pass.** L1 runs on the whole codebase. Deterministic, fast, in Core. Produces the raw material Claude needs to plan the rest — the import/export graph, sizes, centrality.

**Phase 2 — Planning.** Claude reads the L1 output and drafts an extraction plan identifying logically coherent *scopes* — subsets of the codebase analyzable as units. Scopes may nest; scopes may reference shared sub-scopes. The plan is written to `.cortex/pulse/insight-extraction-plan.md` for user review. An example plan:

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

For manageable codebases (below an auto-run threshold), Claude executes the plan without asking. For codebases where the plan warrants review — large scope trees, ambiguous boundaries, high estimated cost — Claude presents the plan and waits for confirmation or adjustment. The threshold is configurable; defaults are conservative.

**Phase 3 — Execution.** Claude orchestrates the extraction. Each root scope runs as a parallel sub-agent doing per-file analysis at L2 and L3. Shared scopes are extracted once, before or in parallel with the scopes that depend on them. Within each scope: every file gets L2 (purpose, connections); files identified as important by centrality *within the scope* get L3. **Importance is scope-local** — a file central to `auth/` is analyzed at L3 even if it's peripheral to the whole codebase.

The execution's orchestration contract is lifted directly from the extraction study's TAKE verdicts (§5.11): parallel sub-agents dispatched in one message, each writing its fragment to a disk file, with "the file exists on disk" as the success signal, a missing fragment as a warn-don't-silently-skip, and more than half missing as an abort. This is battle-tested defensive orchestration and Cortex adopts it verbatim.

**Phase 4 — Cross-scope unification.** After all scopes complete, a final agent produces the L4 semantic layer across the whole codebase: concepts spanning scopes, patterns replicated across modules, cross-scope semantic edges. This is what makes scoped extraction *cohere* rather than fragment. The study is explicit that Graphify has no analogue — its "merge" is a dumb dedup-by-ID union with no unification reasoning — so this pass is designed from scratch, borrowing only the study's determinism disciplines (stable IDs, total-ordered serialization) for the mechanical clustering underneath it.

### 5.4 Scope registry, deduplication, and recursion

Claude's planning phase builds a **scope registry** — the durable record of the scope tree, dependencies, and shared references:

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

The registry determines execution order and prevents redundant work: a scope shared by multiple parents is extracted once, and both parents reference the shared scope's outputs. The registry is Cortex-original — the study confirms Graphify has "no scope registry, no recursion, and no plan-the-extraction step," so this is designed independently. It gives three things Graphify's flat chunker cannot: stable scope IDs to attach L2/L3/L4 output to, a natural recursion boundary, and a place to record *why* a scope exists.

**Same-module vs. similar-module** is a judgment Claude makes during planning by reading the code:
- **Same underlying files** (via imports, path resolution, or symlinks): one scope, extracted once, referenced from both parents.
- **Different implementations of similar functionality** (two independent `notifications/` directories with overlapping purpose but different code): two scopes, extracted separately. Cross-scope unification identifies them as semantically related and produces edges saying "these serve similar purposes." Connected, not deduplicated. (The study's dedup guardrail — "same label ≠ same entity across scopes; never merge same-named symbols by string similarity alone" — is the rule that keeps unification from over-merging.)

**Recursion.** If a scope is still too large after planning, Claude recurses — breaks it into sub-scopes with the same planning process. Recursion terminates when each leaf scope is small enough for a single extraction agent. Scope granularity is Claude's judgment based on cohesion and shared-use, not a fixed threshold: coherent 40-file modules are valid scopes; a 30-file module shared across three parents justifies its own scope for deduplication; very small collections (5–10 files with no sharing) fold into their parent.

### 5.5 The per-file understanding entry

L3 extraction produces a rich entry per important file. The format (reproduced from the decisions record) is Cortex-original — the study notes Graphify has no L2 "purpose" prompt and no L3 "deep understanding" prompt to copy, only the shared primitives (deterministic path-derived IDs, the EXTRACTED/INFERRED/AMBIGUOUS provenance vocabulary, the discrete confidence rubric):

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
- Classes, functions, key constants — with line ranges
- Each with a short description
- Distinguished by importance (critical to understand vs. supporting)

## Insights
Observations that aren't obvious from reading it:
- Conventions this file exemplifies or violates
- Design decisions embedded in the code
- Performance characteristics or gotchas
- Non-obvious dependencies or coupling
- Historical quirks worth knowing before modifying

## File map
Only for files above a size threshold (~500 lines).
- Lines N–M: section description (nested if needed)
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

Small files, or files below the centrality threshold, get a **lighter entry** — purpose and connections only (L2). The "Main players" section is where the `element` query surface (§5.6) sources its content: elements are a *byproduct* of L3, not a separate extraction pass.

### 5.6 The query surface

Three granularities, exposed via CLI, all deterministic Core reading pre-extracted files:

- `cortex insight file <path>` — returns the rich per-file entry.
- `cortex insight concept <name>` — returns which files touch a concept, how it's implemented, related concepts.
- `cortex insight element <query>` — returns an atomic element (function, class, key constant) with description, connections, and follow-up pointers. May return "no rich entry" for elements not identified as main players during L3; those remain discoverable via the file entry.

**This supersedes v2's verbs.** v2 shipped `cortex insight query/get/neighbors/list` over the concept-map-of-artefacts. v3 replaces them with `file/concept/element` over the codebase-understanding layer. The verb change is not cosmetic — it reflects that v3 insight answers "what is this *file/concept/element* in the code," where v2 insight answered "what does the *curated artefact graph* say relates." §8 records the verb retirement.

**No `cortex insight ask` in v3.** Natural-language questions ("how does auth work here?", "where is retry logic implemented?") are answered by Claude *within the current session*, using these retrieval primitives to gather entries and reasoning over what it finds. There is no subprocess-based `ask` command: the reasoning happens in-session, which keeps the current session's context intact and avoids duplicating Claude's own capability. A subprocess-based `ask` is a named future addition (§11), not v3 scope.

### 5.7 How Claude consults insight — the CLAUDE.md block

CLAUDE.md gains a section (the managed block, schema §8) that directs Claude to use insight and specifies *when*. This block is reproduced verbatim from the decisions record and the schema 3.0 addendum locks it as template text:

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

The framing is **directive without forcing.** "Not optional" sets the expectation; the read-vs-consult distinction is what makes insight useful in practice by preventing Claude from defaulting to full file reads. The closing paragraph teaches the trust model (ungated, gated-layer-wins) at the point of use — the same discipline v2 §7.3 applied to the `insight/_index.md` prompt, and RULES 11's token budget (CLAUDE.md Cortex section < 400 tokens) governs the block's size. The final "compass rule" phrasing reflects the §4.1 rename — v2's block would have said "cerebrum."

### 5.8 Storage format

Hybrid — markdown for prose content, JSON for graph structure. Both authoritative; a validator ensures consistency. This is the study-validated split (§5.11): "JSON owns the graph/tags/clusters; markdown owns per-file prose." Two layouts, chosen by whether the extraction scoped:

**Scoped extraction (large codebases):**

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

**Unscoped extraction (small codebases):**

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

The `anatomy/` sub-directory name preserves continuity with what v1's `.cortex/anatomy/` was — the structural artefact of the codebase at the file level — now living *inside* insight. **The query layer hides the scoped-vs-flat structural difference**; users (and Claude) query `cortex insight file <path>` and don't think about scopes. From the study: serialization is deterministic (total-ordered nodes/edges so diffs are meaningful not permutation-noise), the graph write refuses to shrink an existing graph without `--force` (a crashed refresh must never silently truncate the store), and every entry carries a `built_at_commit` stamp plus a per-entry content hash as the staleness ledger.

The exact JSON shapes for `graph.json`, `tags.json`, `clusters.json` — field structure, edge-type enumeration, cluster representation, the confidence-tier enum, the co-located provenance/evidence string per edge — are named as schema-3.0-addendum work (§10) and were explicitly left open by the decisions record; the study supplies the design inputs (discrete confidence tiers each tied to a named evidence type; the EXTRACTED/INFERRED/AMBIGUOUS provenance enum; deterministic path-derived IDs).

### 5.9 Maintenance and refresh — scaling with meaningful change

Once initial extraction has produced the insight layer, the maintenance system keeps it fresh. The load-bearing principle: **refresh scales with *meaningful* change, not with commit volume.** The tiering maps cleanly onto the study's "content-hash manifest + code-only-skips-LLM" verdict:

- **Post-commit (deterministic, no LLM).** Changed files are flagged for review. Fast. No extraction at this step. (The study's code-only fast path, wholesale.)
- **Daily loop — L2 refresh.** Flagged files with real changes get L2 re-extraction. Cheap enough that any non-trivial change warrants it.
- **Daily loop — L3 refresh, only when significant.** Flagged files with *significant* changes get L3 re-extraction. Most commits don't trigger L3; substantial changes to what a file *is* — new methods, refactored responsibilities, new patterns — do.
- **L4 refresh, periodic.** Full L4 regeneration runs weekly (configurable) as the ground-truth pass; neighbourhood updates around L3 re-extractions happen daily as a byproduct.

**Significance detection is hybrid:** a **structural filter first** (deterministic rules — the study's skip-lists and no-op detectors — rule out formatting-only, comment-only, whitespace, import-reordering changes; this belongs in **Core**, RULES 3), then an **LLM triage second** (a **Haiku** pass looks at the diff and the existing insight entry and decides "significant" or "cosmetic" for cases the structural filter can't classify).

**Model choice:** Sonnet for L2/L3/L4; Haiku for triage. Quality is load-bearing — wrong insight is prejudicial and worth paying for.

**Where v3 must design beyond Graphify (from the study's DIFFERENTLY verdicts):** Graphify invalidates on *file change only* and lets cross-file semantic drift accumulate silently until a full rebuild. Cortex must not inherit this. Three design requirements on the refresh loops follow: (1) a **reverse dependency index** so a changed file invalidates not just its own entry but every concept/edge that *references* an entity in it; (2) **confidence-aging** on un-revisited semantic edges — an INFERRED edge not re-confirmed across N refreshes is surfaced to the loop for re-verification rather than silently trusted; (3) **scope-scoped invalidation** — a changed file re-plans only its owning scope(s) and the cross-scope edges touching them, leaving untouched scopes cached. These are Cortex-original (the study confirms Graphify has no analogue) and the schema 3.0 addendum must give the reverse index and the staleness ledger a storage shape.

### 5.10 The anatomy transition

`.cortex/anatomy/` disappears in v3. Its content and role fold into insight:

- Anatomy's file listing and structural graph become **L1** output of insight extraction.
- Anatomy's purpose lines become **L2** output — same content, richer format, in `.cortex/insight/anatomy/` (or scope-local `.cortex/insight/scopes/<scope>/anatomy/`).
- Anatomy's `spec_links` and `governs:` resolution move to insight's **Connections** section.
- Anatomy's `purpose_source` provenance becomes part of insight's **extraction metadata** (and read-time purpose capture — v1's PreRead/PostRead cycle — integrates with insight, tagged as `read-time` provenance).

Modules that read anatomy today update to read insight instead: `specflow-tests`, `specflow-develop`, the hooks, and the spec-drift loop. This is a real ripple and the migration/build order (§10) sequences it so those consumers are re-pointed as anatomy's content moves, not before. The **anatomy-refresh loop pair** (`cortex-loop-anatomy-refresh` deep, and the fast variant) deprecates as anatomy deprecates — replaced by the three insight-refresh loops (§9).

### 5.11 The `cortex-extract-insight` skill, grounded in the Graphify study

`cortex-extract-insight` is invoked from Claude Code sessions and from scheduled tasks; **no CLI wrapper** (§5.3). Its behaviour:

- Orchestrates the extraction phases (L1, planning, scoped execution, cross-scope unification).
- Spawns sub-agents for parallel work — one per root scope, coordinated by the top-level agent.
- Handles failure recovery — resumable if extraction crashes; scope completions are checkpointed.
- Reports progress to `.cortex/pulse/insight-extraction-progress.md`.
- Validates outputs against the schema.
- Presents the extraction plan for user review when the codebase warrants it; auto-runs for smaller codebases.

**The skill is designed against `graphify-extraction-study.md`** — the take/leave/differ study that read Graphify's full skill bundle and installed package. Its verdicts, condensed, are the design ground for the skill:

| Axis | TAKE (adopt) | LEAVE (reject) | DIFFERENTLY (Cortex-original) |
|---|---|---|---|
| **Architecture** | Parallel sub-agents in one message; write-fragment-to-disk-then-merge; disk-file-is-success-signal; cache-first dispatch keyed on content hash; directory-grouped batching intent; AST-and-LLM in parallel (L1 ‖ L2/L3) | Fixed 20–25-file flat chunking (no significance notion); the interactive "narrow to a subdirectory" size gate | Plan-not-chunk (scope registry, recursion); the cross-scope L4 unification pass |
| **Prompts** | EXTRACTED/INFERRED/AMBIGUOUS provenance enum; discrete confidence rubric (never a free float; the production lesson that continuous ranges collapse to a bimodal 0.5/0.85 mess); deterministic path-derived IDs; caller→callee edge direction + within-language guard; "don't re-extract what AST already has" | — | Three distinct prompt bodies (L2 purpose / L3 deep / L4 concept graph) sharing the primitives; rationale-as-attribute generalized into the L3 schema; `semantically_similar_to` tightened to non-obvious-and-cross-cutting as the *only* sanctioned similarity edge |
| **Storage** | md+JSON hybrid; `built_at_commit` stamp; refuse-to-shrink-without-force guard; deterministic total-ordered serialization; `norm_label` as *one* cheap lexical index | One-markdown-file-per-node (Obsidian vault) — Cortex writes one entry per *source file*; the interchange-export zoo (GraphML/SVG/Cypher/Neo4j/wiki) | Structured tags as a first-class store (the concrete embeddings replacement); co-located confidence + provenance + one-clause evidence string per edge |
| **Failure modes** | The skip-lists (`node_modules`, build dirs, lockfiles) and sensitive-file patterns — in **Core**, pre-triage; the entropy gate + sentence-node sanitizer; "exclude mechanical hubs from centrality"; the dedup *guard-rules* (same label ≠ same entity) | The MinHash/LSH string-similarity dedup *machinery* (deterministic IDs prevent the duplicates instead of reconciling them) | Significance as a *ranking* problem, not just a skip problem — rank survivors by centrality, route only the top tier to expensive L3; catch config/generated-but-committed files at triage via a content-significance signal |
| **Update** | Content-hash manifest; code-only-skips-LLM; hash-the-body-not-the-frontmatter; stable-ID clustering (remap-to-previous); prune-on-delete + no-round-trip merge; `built_at_commit` + per-entry hashes | Trusting cached semantic edges indefinitely (the silent-drift gap) | Reverse dependency index; confidence-aging; scope-scoped invalidation (§5.9) |

Explicitly **not adopted** (the three the decisions record names, confirmed by the study): embeddings-heavy retrieval (Graphify uses none — it validates the stance), MCP-as-primary-interface (Cortex is CLI-first; MCP stays a possible secondary adapter, never the source of truth), and cosine-as-confidence (Graphify never did it either — confidence is strength-of-evidence on a discrete rubric, never a relabelled similarity magnitude). The study confirms the design inputs the bundle *cannot* supply — the scope registry, the L4 unification-reasoning pass, the three prompt bodies, the tag schema, the centrality-ranking policy, and semantic-edge reverse-dependency invalidation — as things Cortex designs independently.

### 5.12 Skill integrations

Explicit `cortex insight` invocations added to skill workflows (a separate follow-up pass, per the v2 §7.2 precedent — the substrate ships before the enrichment):

- **specflow-develop** — queries insight for every file it plans to modify before writing code; queries the relevant concept before cross-file changes. The biggest lever for grounded work.
- **specflow-change-router** — queries insight to understand what a proposed change touches.
- **specflow-tests** — queries insight for testing conventions before generating tests.
- **specflow-ingest** — queries insight before proposing spec changes.
- **specflow-onboard-codebase** — coordinates with insight extraction. Deeper integration; probably later.

Not integrated: **specflow-lint** (structural, no semantic context needed), **specflow-viewer** (rendering), **specflow-bugs** (the seven-type taxonomy is the primary tool; insight may inform but doesn't lead).

### 5.13 The insight `_index.md` active prompt

Every module carries an `_index.md` active prompt (schema §7.1, RULES 9); insight is no exception. Where the CLAUDE.md block (§5.7) tells Claude *when* to consult insight from anywhere in a session, the module's own `_index.md` orients a reader who has navigated into `.cortex/insight/` — what the module holds, that it is inferred-not-curated, and how to query it rather than read the files directly. This block is reproduced from the drafted content; the schema 3.0 addendum (§10) locks it as template text, and it must stay under the RULES 11 budget (`_index.md` < 300 tokens):

```
# Insight — inferred codebase understanding (ungated)

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
```

The prompt teaches the same trust model as the CLAUDE.md block at a second point of use — inferred, context-not-authority, gated-layer-wins — and names the loops that keep it current, including `cortex-loop-session-observe` (§9), so a reader who lands in the module understands both what insight is and how it stays fresh.

---

## 6. Archive & ingestion

The `archive` module holds documents ingested into Cortex and the structured content extracted from them. Ingestion is **systematic**: every authoritative document that authorizes downstream content (rules, specs, decisions) enters through this pipeline, so that every enforceable claim can trace to a source (§7).

### 6.1 Document types

The list is extensible — adding a new type means adding a schema file to `archive/types/`, not modifying the ingestion skill:

- Client specifications
- Contracts and legal agreements
- Regulatory and compliance documents
- Technical specifications from stakeholders
- Meeting transcripts, interview recordings, call notes
- Technical decision records (RFCs, architecture docs)
- Existing documentation from a codebase being onboarded
- User research, feedback, complaints

### 6.2 Structure

```
.cortex/archive/
├── _index.md
├── register.md                       # human-readable index of all documents
├── documents/
│   ├── client-spec-v2.0/
│   │   ├── source.pdf                # or .md, .docx, whatever
│   │   ├── metadata.yaml             # ingested_at, version, supersedes, etc.
│   │   └── extracted/
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

Every ingested document is a directory under `documents/` containing the source, machine-readable `metadata.yaml`, and everything extracted from it under `extracted/`. **Superseded versions are preserved, not deleted** — the audit trail is the point. `register.md` is the browsable summary; the machine-readable metadata lives per-document.

### 6.3 The one ingestion skill with type routing

**One skill** handles all document types via internal type routing. The skill is named **`cortex-archive-ingest`**. The decisions record used `cortex-ingest` as a placeholder; the final name resolves a real collision — there is already a shipped `cortex-ingest` skill scoped to atlas-only ingestion, and a `specflow-ingest` skill that owns requirement-shaped sources, so the archive skill takes a distinct name. The existing atlas-only `cortex-ingest` **re-homes into archive** — folded into `cortex-archive-ingest` as its atlas-routing extraction strategy (§6.6), not left as a separate skill.

The user experience is uniform: invoke the skill with a document, the skill classifies the type (declared explicitly or inferred from content), routes to the appropriate extraction strategy. Type schemas (`archive/types/*.yaml`) make the pipeline extensible without changing the skill. **Ingested documents are authoritative by definition** — the user chose to ingest them — so extraction produces structured content *directly* into the document's own `extracted/` directory, not into pulse.

### 6.4 The 8-step workflow

1. User invokes the skill on a document; names it, optionally declares its type.
2. Skill classifies the document type — declared, or inferred from content.
3. Skill stores the source in `archive/documents/<slug>/` with initial metadata.
4. Skill runs extraction, producing structured content in `archive/documents/<slug>/extracted/`.
5. Skill may ask clarifying questions inline if the document is materially ambiguous — direct conversation, not pulse suggestions.
6. **The yes/no change-plan gate.** The skill asks: does the user want Claude to draft a change plan?
   - **Yes** — Claude analyzes the extracted content and drafts a plan for downstream changes (rules to add/update, specs to create, atlas decisions to record). User reviews, adjusts, approves.
   - **No** — the document is ingested and its extracted content is available for reference, but no automatic downstream proposals. The user may invoke changes later.
7. If yes, the skill applies the approved plan — creating or updating rules, specs, and decisions, **each carrying provenance** back to the source document (§7).
8. Register updates: the new document is registered, downstream derivations tracked, the audit trail complete.

The step-6 gate matters: not every ingested document should trigger downstream changes. A meeting transcript may be worth ingesting as context without generating rule proposals; a regulatory document may be reference material for later. This gate is where ingestion touches the **pulse gate** — the downstream change plan is proposed and human-approved through the existing gate machinery (§8 salvage), so ingestion never mutates gated content autonomously (RULES 7).

### 6.5 Document version updates

When a document version changes (client sends v2.1 of the spec):

1. New version ingested; the skill diffs against v2.0's extracted content.
2. Diffs surfaced inline: "this requirement is new," "changed," "removed."
3. For changed requirements, downstream artefacts that derive from them are identified (via the provenance reverse-lookup, §7.4).
4. The skill asks whether to draft an update plan (same yes/no gate as step 6).
5. If yes, the plan is drafted, reviewed, applied.
6. Old version preserved in `archive/documents/<slug-v2.0>/` as superseded; the new version becomes active; register updates.

### 6.6 The atlas-only `cortex-ingest` re-homes into archive

The v1/v2 `cortex-ingest` skill ingests non-spec sources (transcripts, RFPs, briefs) into `atlas/sources/` and extracts atlas-shaped stakeholders/decisions/domain terms. In v3, source material has a dedicated home — `archive/` — and a systematic pipeline. The atlas-only ingestion **re-homes into archive**: raw sources land under `archive/documents/<slug>/source.*` rather than `atlas/sources/`, and the atlas extractions (stakeholders, decisions, domain terms) become one *type-routed extraction strategy* within the ingestion skill rather than a separate skill. This unifies "capture a source" onto one pipeline and gives atlas-derived decisions the same provenance chain as everything else. The name (`cortex-archive-ingest`) and the fold-in are decided, not open (§6.3, §11 Q4).

---

## 7. Provenance

Every persistent artefact that can trace to an authorizing source carries provenance. This applies to **compass rules, both spec trees, and atlas decisions.**

### 7.1 Format

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

### 7.2 Source types

- **Archive documents.** Reference the extracted content or the source directly: `archive/documents/<slug>/extracted/...` or `archive/documents/<slug>/source.pdf`.
- **Claude Code sessions.** Referenced by session id: `claude-sessions/<user>/<session-id>`. **Not stored in Cortex** — cited but not retrievable through the module. Establishes that a decision came from a specific session; retrieving full context requires Claude Code access or asking the user.
- **Atlas decisions.** A compass rule may derive from an atlas decision that captures the reasoning: `atlas/decisions/2024-11-auth-tokens.md`. (This is the §4.2 single-home mechanism in action — the rule cites the decision instead of duplicating it.)

### 7.3 The `derives_from` relationship — one type, for v3

For v3, provenance uses **exactly one** relationship: `derives_from`. Simplicity wins for the first version. A relationship taxonomy (`informed_by`, `discussed_in`, `contradicted_by`, `authored_in`, …) that lets downstream tooling reason about provenance *strength* is a named future refinement (§11), not v3 scope. Provenance is populated **when a source exists** — absence of the field means "authored directly," not "unknown origin."

### 7.4 What provenance enables

- **Drift detection when a source changes.** If a source document is superseded and one of its requirements changed, downstream rules and specs citing that requirement are flagged for review (§6.5 step 3 consumes this).
- **"What changes if we renegotiate X?" queries.** Traverse the citation graph backward from a source to find every artefact that derives from it.
- **Audit trail.** Every enforceable rule traces to the authority that justifies it.

Provenance is a natural extension of the v1/v2 curated citation graph (schema §6), not a parallel system: it uses the same frontmatter-cross-reference mechanism, the same validator machinery that checks a reference *resolves*, and the same "follow the link to the source" navigation. The one new capability is *backward* traversal from a source to its derivations, which the schema 3.0 addendum makes indexable.

---

## 8. Retiring v2's insight module

This is the explicit supersession section. v3 redefines the same `.cortex/insight/` module v2 is mid-building (§2.2). This section states precisely what is salvaged, what is dropped, and how the interim v2 code lives until v3's insight replaces it.

### 8.1 What v2's insight is

v2's insight (v2 §3) is a **concept-map over the curated artefact set**: `insight/map/<topic>.md` prose files (session observations — setup quirks, testing gotchas, corrections) written by a session-observation loop, plus `graph.json`/`tags.json`/`clusters.json` — inferred edges, tags, and clusters over the *same node set as the constellation* (files, rules, specs, decisions), written by a refresh loop. It shipped: two producer loops (`cortex-loop-insight-refresh` for the JSON, `cortex-loop-insight-gaps` for the prose), a pulse-gated **promotion mechanism** graduating stable insight content into compass/atlas, a `cortex insight query/get/neighbors/list` CLI, and an `insight` **constellation preset** rendering inferred edges as a dashed overlay.

### 8.2 What is SALVAGED

- **The typed pulse-gate and promotion machinery.** v2 extended the pulse gate with typed suggestion sections (`Type:` field), **edit-typed proposals** (current-content + replacement, for targets that must be edited not appended), and **extended target roots** (atlas, insight, `RULES.md` — now compass, atlas, `RULES.md`). This machinery is **kept and reused**: v3's archive ingestion (§6.4 step 6, §6.5) proposes downstream change plans *through this exact gate*, and the edit-typed proposal shape is exactly what an ingestion update plan needs when a superseded document changes an existing rule. The promotion mechanism's *plumbing* — how ungated content becomes a human-reviewed proposal targeting a gated layer — survives as the general pulse-proposal machinery, now with two producers feeding it: archive ingestion (above), and the session-observation loop `cortex-loop-session-observe` (§9), which routes its gated convention/rule and decision proposals through this exact gate while writing its ungated insight observations directly.
- **The query-CLI plumbing and dispatch.** The `cortex insight <verb>` command dispatch, the `--json` output convention, the deterministic-Core-reads-files execution model, the argument parsing and validation — the *plumbing* is reused. Only the **verbs** change (§8.3).

### 8.3 What is DROPPED

- **The `map/` layout.** `insight/map/<topic>.md` + the three flat JSON files are replaced by v3's scoped/flat per-file layout (§5.8). The node set changes fundamentally: v2's nodes were *curated artefacts* (files, rules, specs, decisions via the constellation grammar); v3's are *source-code entities* (files, elements, concepts extracted from code). This is why it is a supersession and not a migration — there is no meaningful `map/` → `scopes/` content mapping to carry over.
- **The `insight-refresh` and `insight-gaps` loop *mechanisms*.** Replaced by the three insight-refresh loops (fast/daily/full, §9). What drops is the v2 *mechanism* of the `insight-gaps` loop — its five-gap-signal framing (investigation load, misjudgment, user explanations, corrections, memory-commit requests, v2 §5) and its write into `insight/map/` prose. The **session-observation role itself survives**, re-homed to a new loop, `cortex-loop-session-observe` (§9): it still reads Claude Code session transcripts and infers durable knowledge, refocused from codebase-gap-signals to typed routing — ungated codebase observations enrich insight directly, gated conventions/rules and decisions go to compass/atlas through the pulse gate. The role is not lost; only the v2 mechanism is.
- **The `query/get/neighbors/list` verbs.** Replaced by `file/concept/element` (§5.6). `get` and `list` have rough analogues in the new surface but the semantics differ enough (per-file entry vs. per-topic file) that they are retired rather than renamed.
- **The `insight` constellation preset (as built).** v2's preset composed a dashed overlay from `insight/map/graph.json`. v3's insight graph is a different artefact with a different node set; whether v3 adds a *new* constellation preset over the code-understanding graph is left open (§11) — the decisions record files constellation integration as "not central; defer."

### 8.4 The interim: v2 insight code stays as dogfood until replaced

The v2 insight code that has **already landed stays in place** and keeps working — it is useful interim dogfood, and ripping it out before v3's replacement is ready would leave a gap. The **immediate build consequence**: build-order-v2 steps 6–8 (the two insight loops and the promotion accept path) are **frozen** — not extended, not deleted. Non-insight v2 work (schema 2.0, the `.specflow/` reorganization, the query-CLI substrate, the pulse-gate extensions) **continues unchanged**. When v3's insight lands (§10's build order), it replaces the v2 module wholesale and the frozen steps are retired with it.

---

## 9. Loops in v3

The v1/v2 loop roster (thirteen self-maintenance loops, plus v2's two insight loops) changes in exactly two areas — the anatomy transition and the insight supersession; everything else is unchanged.

**Retire:**
- `cortex-loop-anatomy-refresh` (deep) and its fast variant — anatomy deprecates (§5.10).
- `cortex-loop-insight-refresh` and `cortex-loop-insight-gaps` (v2's pair) — v2 insight is superseded (§8). `insight-gaps`' session-observation role is not lost: it re-homes to the new `cortex-loop-session-observe` (below); only the v2 loop mechanism and its five-gap-signal framing retire.

**Add — the three insight-refresh loops:**
- `cortex-loop-insight-refresh-fast` — post-commit, deterministic, no LLM. Flags changed files for review; no extraction. (Runs in Core-adjacent skill discipline: the flagging is deterministic; the loop invokes no LLM at this tier.)
- `cortex-loop-insight-refresh-daily` — daily. Runs significance triage on flagged files (structural filter + Haiku, §5.9); runs L2 on files with any real change; runs L3 on files with significant change; neighbourhood-updates L4 semantic edges around L3 re-extractions.
- `cortex-loop-insight-refresh-full` — weekly (configurable). Full L4 regeneration as the ground-truth pass.

**Add — the session-observation loop:**
- `cortex-loop-session-observe` — the v3 successor to v2's `insight-gaps`, refocused from codebase-gap-signals to session observation. (The name is provisional and renameable; treat it as settled otherwise.) It reads recent Claude Code session transcripts — the shared session corpus, coordinated with `cortex-pulse-distil` (which also reads sessions) and with the read-time purpose capture in §5.10 — and infers durable knowledge from how a session actually went: user corrections, gotchas hit, non-obvious behaviour discovered, patterns established. It routes what it finds **by type**. Ungated codebase observations enrich the relevant insight per-file entries (the *Insights* and *Query pointers* sections, §5.5), written **directly** — insight is machine-owned and ungated (RULES 7's machine-owned-ungated allowance, the same basis as the refresh loops), carrying `claude-sessions/<user>/<id>` provenance (§7.2). Gated conventions/rules are **proposed to compass through the pulse gate**; decisions are **proposed to atlas through the pulse gate** (human-reviewed, RULES 7). The loop follows the loop-write invariant (v2 §4.4): it never mutates gated content directly, may write ungated insight directly, and sends everything gated through pulse as a typed proposal (reusing the salvaged pulse-gate/promotion machinery, §8.2). Its boundary with `cortex-pulse-distil`: distil mines *cross-session repetition* into rule candidates; session-observe captures *in-context, per-session* observations and routes them by type — shared corpus, different altitude (the exact division of labour is a spec-pass detail).

**Unchanged:** every other loop — `cortex-pulse-hygiene`, `cortex-pulse-distil`, `cortex-loop-bug-triage`, `cortex-loop-rule-decay`, `cortex-loop-skill-suggest`, `cortex-loop-spec-drift`, `cortex-loop-atlas-staleness`, `cortex-loop-onboarding-drift`, and the test-runner — keeps its cadence, its `--collect`/judgment/`--apply|--propose` bookend idiom, and its propose-through-pulse discipline (RULES 7). Loops that *read* anatomy (`spec-drift`, and the develop/tests skills) re-point to insight as part of the anatomy transition (§5.10). The loop-write invariant restated at v2 §4.4 — *a loop never mutates gated content* — governs the four new loops exactly as it governs the rest: they maintain machine-owned ungated insight state directly, and propose anything gated through pulse.

The scheduled-task registration (the canonical task names, schema §9.1) updates: the anatomy-refresh and v2-insight tasks deregister; the three insight-refresh tasks and the session-observation task register. Net task count and the exact renumbering are migration/build-order detail (§10).

---

## 10. What the design pass produces next

Forward pointers only. **None of the following is produced in this document.** This section names the scope of each downstream artefact so the next pass can build it without re-deriving what v3 decided.

### 10.1 The schema 3.0 addendum — scope

Schema v3.0 is a MAJOR bump (a module renamed, a module removed, a module added, new frontmatter). The addendum must add or change at least these clauses (per RULES 19, the addendum's own change report enumerates every check and clause it touches):

- **Compass module.** Re-root every `cerebrum/` clause and check to `compass/`; rename `check.cerebrum-*` → `check.compass-*`; re-root the PreWrite enforcement read; update the node-id grammar's module-path spellings. State that rule/bug ids and their content-keyed node prefixes are unchanged.
- **Decisions single-home.** Remove the `cerebrum/decisions.md` artefact contract; make `atlas/decisions/` the sole decisions home; document the compass-rule-cites-decision-via-provenance pattern.
- **Archive module.** New `archive/` layout clause (`_index.md`, `register.md`, `documents/<slug>/` with `source.*` + `metadata.yaml` + `extracted/`, `types/`); the `metadata.yaml` contract (ingested_at, version, supersedes); the `archive/types/*.yaml` document-type schema format and how the ingestion skill routes on it (the decisions record left this "sketched but not specified"); new checks `check.archive-layout`, `check.archive-metadata`, `check.archive-type`.
- **Insight — new layout.** Replace the v2 `insight/map/` contract with the scoped and flat layouts (§5.8): `scope-registry.yaml`, `scopes/<scope>/{anatomy,concepts,graph.json}`, top-level `anatomy/`, `concepts/`, `graph.json`, `tags.json`, `clusters.json`. The per-file entry frontmatter + section contract (§5.5). The exact JSON shapes (edge-type enumeration, the discrete confidence-tier enum, the co-located provenance/evidence string, cluster representation, tag vocabulary) — explicitly left open by the decisions record. The staleness ledger (`built_at_commit` + per-entry hashes) and the reverse dependency index storage shape (§5.9). The insight module's `_index.md` active prompt (§5.13), finalized as template text under the RULES 11 `_index.md` budget.
- **Insight — query CLI and extract-skill contract.** The `cortex insight file/concept/element` command contracts (superseding `query/get/neighbors/list`); the `cortex-extract-insight` skill's I/O contract, the `insight-extraction-plan.md` and `insight-extraction-progress.md` pulse artefact formats.
- **Provenance frontmatter.** The `provenance:` list field with `derives_from:` entries on compass rules, both spec trees, and atlas decisions; the three source-type reference forms (archive path, `claude-sessions/<user>/<id>`, `atlas/decisions/<slug>`); resolution semantics (archive/atlas references must resolve; `claude-sessions` references are cited-not-resolved); a `check.provenance` that validates resolvable references and the backward-traversal index.
- **New loop names + scheduled tasks.** Deregister the anatomy-refresh pair and the v2 insight pair; register `cortex-loop-insight-refresh-{fast,daily,full}` and `cortex-loop-session-observe`; update the canonical task-name list (schema §9.1) and the renumbering. The validator/loop-ownership clauses must cover `cortex-loop-session-observe`: it writes ungated insight directly and proposes gated conventions/rules and decisions to compass/atlas through the pulse gate.
- **Validator checks.** The re-rooted compass/insight/`.specflow` checks, the new archive/provenance/insight checks, and the significance-triage structural-filter rules that live in Core.
- **Version wiring.** `schemaVersion: "3.0"`; the migration policy (schema §10.4) — whether the 2.0→3.0 migration ships a `cortex migrate` (still single-user, so the v2 §9.2 waiver logic may carry, but the anatomy→insight content move is more than a rename and the migration spec must decide).

### 10.2 The build-order-v3 outline

Same discipline as v1 §16.2 / v2 §13 — shared substrate before dependents, spec-per-piece, review-gated (RULES 14). Dependency order, not a schedule:

1. **Schema 3.0 addendum** — drafted and reviewed first (both layers depend on it).
2. **Module migration** — `cerebrum`→`compass` rename + decisions-single-home, with the validator/scaffolding/skill re-root, early, so everything downstream builds against final module names.
3. **Archive** — the module layout, `types/*.yaml` schemas, the `check.archive-*` checks, the ingestion skill (`cortex-archive-ingest`) with type routing and the 8-step workflow.
4. **Provenance** — the frontmatter field, `check.provenance`, the backward-traversal index; wired into archive's step-7 plan application.
5. **Insight rebuild** — L1 in Core (with the study's skip-lists and centrality); the `cortex-extract-insight` skill (planning, scoped execution, cross-scope unification); the per-file entry contract; the `cortex insight file/concept/element` CLI; the storage layouts + validator checks; the three refresh loops with reverse-dependency invalidation and confidence-aging.
6. **Session-observation loop** — `cortex-loop-session-observe` (§9), once insight (step 5) and the salvaged pulse gate exist: ungated insight enrichment written directly, gated compass/atlas proposals through the pulse gate.
7. **Anatomy deprecation** — re-point anatomy's consumers (develop, tests, hooks, spec-drift) to insight; retire the anatomy-refresh loops; migrate read-time purpose capture into insight.
8. **Skill integrations** — the `cortex insight` enrichment of develop/change-router/tests/ingest/onboard (§5.12), as a follow-up pass.
9. **Ingestion re-home** — fold the atlas-only `cortex-ingest` into archive (§6.6).
10. **Constellation preset** — if adopted (§11 open), a v3 insight preset over the code-understanding graph.

### 10.3 Load-bearing initial specs

The specs the build order most depends on being right first (drafted in the spec-pass, not here): the `cortex-extract-insight` skill spec (the plan-not-pipeline, scope registry, four-phase execution); the insight storage-format spec (the JSON shapes and per-file entry); the `cortex insight` CLI spec; the provenance frontmatter + `check.provenance` spec; the archive ingestion skill spec (8-step workflow + the yes/no gate); and the module-migration spec (the rename + decisions-single-home mechanics).

---

## 11. Open questions

Carried from the decisions record's "What's still open," plus the questions v3's supersession of v2 insight raises. Three earlier design calls (Q4, Q6, Q7) are now **resolved** and marked inline, their numbers kept stable so cross-references hold; the rest are deferred to the design/spec pass, not to further design conversation.

1. **Storage-format details.** Exact JSON schema for `graph.json`, `tags.json`, `clusters.json` — field structure, edge-type enumeration, the discrete confidence-tier enum, cluster representation. (Decisions record; the study supplies inputs, §5.11.)
2. **Constellation integration.** Whether v3 adds a *new* insight preset over the code-understanding graph (dashed edges for inferred, background regions for clusters) or the constellation stays curated-only. The decisions record files this as "not central; defer." Note the v2 insight preset (§8.3) is dropped regardless.
3. **Migration mechanics.** How the `cerebrum`→`compass` rename, the anatomy→insight absorption, and the duplicate-decisions removal are executed. Single-user so straightforward, but the anatomy→insight content move is more than a rename and needs specifying (§10.1 version-wiring note).
4. **Resolved — ingestion skill name.** The archive ingestion skill is named `cortex-archive-ingest`; the existing atlas-only `cortex-ingest` folds into it as its atlas-routing extraction strategy rather than remaining a separate skill (§6.3, §6.6).
5. **Document-type schema format.** What `archive/types/*.yaml` files contain and how the ingestion skill routes on them. Sketched, not specified.
6. **Resolved — session-observed unreviewed knowledge.** v3 keeps a session-observation loop: `cortex-loop-session-observe` (§9) reads the shared session corpus and routes inferences by type — ungated codebase observations enrich insight directly (with `claude-sessions/*` provenance); gated conventions/rules and decisions are proposed to compass/atlas through the pulse gate. The role v2's `insight-gaps` played survives; only its mechanism retires. See §9.
7. **Resolved — the v3 insight `_index.md` prompt.** The module's `_index.md` carries insight's active prompt (RULES 9, schema §7.1); §5.13 reproduces the drafted block, which the schema 3.0 addendum finalizes as template text under the RULES 11 budget.

### Future ideas (deliberately out of v3 scope)

Captured so they aren't lost: **`cortex insight ask`** as a subprocess-based command (a headless Claude Code subprocess with insight loaded answers a natural-language question and returns a compact response, sparing the main session's context budget); a **provenance relationship taxonomy** (`informed_by`/`discussed_in`/`contradicted_by`/… beyond the single `derives_from`); **automated document-type detection** at ingestion; and **extraction confidence scoring** with an auto-approve threshold above the change-plan gate.

---

## 12. Glossary

New domain vocabulary introduced or redefined in v3:

- **compass** — the renamed `cerebrum` module. Enforceable rules, conventions, and the seven-type bug ledger — the project's enforcement-layer direction. The one module carrying write-time authority (PreWrite reads it).
- **archive** — the module holding ingested source documents and the structured content extracted from them. Sources are preserved verbatim (including superseded versions) for audit; extractions live in each document's `extracted/` directory.
- **extraction-level (L1–L4)** — the four altitudes of insight extraction: L1 structural (tree-sitter, Core, no LLM), L2 per-file purpose (Sonnet), L3 deep per-file understanding on centrality-important files (Sonnet), L4 cross-file semantic graph (Sonnet). Cost and depth rise with the level.
- **extraction-scope** — a logically coherent subset of a codebase analyzed as a unit during initial extraction. Scopes nest and may reference shared sub-scopes. The unit of parallelism (one sub-agent per root scope), replacing Graphify's flat file-chunking.
- **scope-registry** — the durable record (`scope-registry.yaml`) of the scope tree, each scope's path, `depends_on`, and `shared_by`. Determines execution order, prevents redundant extraction of shared scopes, and marks recursion boundaries.
- **cross-scope-unification** — the final extraction phase (Phase 4): an agent produces the L4 semantic layer across the whole codebase — concepts, patterns, and edges spanning scopes — so scoped extraction coheres rather than fragments. Cortex-original; Graphify has no analogue.
- **provenance** — the `provenance:` frontmatter field on compass rules, specs, and atlas decisions, listing the authorizing sources an artefact derives from. Enables drift detection, renegotiation queries, and audit.
- **derives_from** — the single provenance relationship type in v3 (a taxonomy of stronger/weaker relationships is a future refinement). Points at an archive document/extraction, a Claude Code session id, or an atlas decision.
- **ungated-layer** — content that is inferred rather than human-reviewed before landing (all of insight). Context, not authority: where it conflicts with a gated artefact (compass rule, spec), the gated layer wins. Carried unchanged from the v2 gated/ungated thesis.
- **cortex-extract-insight** — the Claude Code skill that produces the insight layer: L1 structural pass, planning, scoped parallel L2/L3 execution, and cross-scope L4 unification. Invoked from sessions and scheduled tasks; no CLI wrapper. Designed against `graphify-extraction-study.md`.
- **cortex-loop-session-observe** — the v3 loop that observes Claude Code sessions and infers durable knowledge from how a session went (corrections, gotchas, non-obvious behaviour, established patterns). Routes by type: ungated codebase observations enrich insight directly (with `claude-sessions/*` provenance); gated conventions/rules and decisions are proposed to compass/atlas through the pulse gate. The v3 successor to v2's `insight-gaps`, refocused from codebase-gap-signals to session observation.

---

**End of v3 design document.**

Next artefact, after review: the `cortex-schema.md` 3.0 addendum — the §10.1 clauses drafted as contract text — then the module-migration spec and the load-bearing insight/archive/provenance specs under the build order in §10.2.
