# Cortex

*A persistent, actively-refreshed understanding of your codebase — built for Claude to use.*

**Status:** v3, as shipped. Schema 3.0. macOS-only. Distributed as a global Node.js CLI (`cortex`).

---

## 1. The one-sentence thesis

Cortex maintains a persistent, queryable, continuously-refreshed understanding of a codebase, deep enough that Claude behaves like it *knows* the codebase when working in it — including codebases you've never worked in yourself.

Everything else — the persistence layer, the self-maintenance loops, the spec-and-test lineage — exists to serve that understanding. It is not the point; the understanding is.

## 2. The problem

Every Claude Code session starts cold. It reads files, reconstructs mental context, pattern-matches to how codebases *usually* work, and forgets it all when the session ends. On a codebase you know well that's a minor tax. On one you don't — a client's, a legacy system, a teammate's service — it's the difference between grounded work and confident guessing.

Existing tools each solve a slice:
- **Fast structural indexers** (tree-sitter, ctags) parse and stop — no understanding, just symbols.
- **One-shot LLM extractors** (e.g. Graphify) go deep but produce an artifact that goes stale the moment the code moves.
- Neither is designed with **Claude as the primary user**, and neither survives across sessions.

Cortex is the union: deep LLM extraction *and* scheduled refresh *and* a query surface shaped for how Claude actually consults context during work *and* a persistent layer that accumulates instead of starting over.

## 3. Architecture: two layers, one contract

Cortex is deliberately split into two layers that never blur:

| | **Cortex Core** | **Skills** |
|---|---|---|
| What | A deterministic Node.js/TypeScript binary | Agentic Claude Code skill bundles |
| Does | File I/O, schema enforcement, the CLI, hooks, deterministic queries | The LLM work: extraction, judgment, proposals |
| LLM calls | **Never** (hard rule) | Yes — that's their job |
| Why the split | Git-hook safety, deterministic tests, predictable cost | Intelligence lives where it belongs |

The load-bearing artifact between them is **`cortex-schema.md`** — the versioned contract Core *implements* and Skills *consume*, both referencing it by version. Without it, the two layers drift. Today it's at **v3.0**.

This boundary is non-negotiable: Core stays LLM-free so that a git hook can never hang on a model call, tests are reproducible, and cost is bounded. All the "magic" is in Skills, all the "guarantees" are in Core.

## 4. The five modules of `.cortex/`

A project's Cortex knowledge lives in `.cortex/`, organized into five modules — each an evocative noun describing what it *is*:

- **atlas** — reference knowledge. Stakeholders, decisions, domain language. The "why" behind the project. The single home for decisions.
- **compass** — enforceable rules, conventions, and the seven-type bug ledger. What the project *must* do at the enforcement layer. (The one module that carries write-time authority.)
- **archive** — ingested source documents and the structured content extracted from them. Where a client spec, contract, or transcript enters the system and becomes traceable authority.
- **insight** — inferred codebase understanding. Rich per-file entries, a concept graph, cluster assignments. The flagship. Ungated — context, not authority.
- **pulse** — transient activity. Loop outputs, working state, progress reports. Machine-owned; never hand-edited.

The dividing principle across all five is **gated vs. ungated**. Compass, atlas, and the spec trees are *gated* — nothing lands there without passing human review. Insight is *ungated* — it's inferred and lands directly. Where the two conflict, **the gated layer always wins**: insight is context, never authority.

## 5. Insight — the flagship capability

Insight is why Cortex exists. It holds an inferred, persistent, queryable, actively-refreshed understanding of the codebase, produced by LLM extraction and served by deterministic Core.

### Four extraction levels

Extraction runs at four altitudes, each with a distinct cost/depth profile:

1. **L1 — Structural** (deterministic, Core, no LLM): tree-sitter parse, import/export graph, module structure, centrality analysis. Minutes.
2. **L2 — Purpose** (Sonnet, per file): a grounded one-paragraph purpose plus connections, for *every* file.
3. **L3 — Deep** (Sonnet, on centrality-important files): main players with line ranges, non-obvious insights, quirks, a file map for large files, and intent-scoped "query pointers." Hours.
4. **L4 — Cross-file semantic graph** (Sonnet): concepts, cross-file edges (files handling the same concern even without imports), pattern and convention detection, clusters. Every edge carries non-empty evidence. **No embeddings** — structured tags and graph traversal, so every inference is explainable and stable across model changes.

### Extraction is a plan, not a pipeline

On a fresh codebase, `cortex-extract-insight` (a Skill — no CLI wrapper, because agentic work belongs in Skills) reads the L1 output and *plans*: it identifies logically-coherent **scopes**, writes a scope registry, extracts shared scopes once, runs per-scope L2/L3 in parallel sub-agents, and finishes with a cross-scope **unification** pass that makes the whole cohere rather than fragment. It's resumable from checkpoints and reports progress as it runs.

### The query surface

Three deterministic Core commands (no LLM at query time — the judgment was spent at extraction time):

```
cortex insight file <path>       # the rich per-file entry
cortex insight concept <name>    # which files touch a concept, how, related concepts
cortex insight element <query>   # a function/class/constant, with connections
```

Natural-language questions ("how does auth work here?") are answered by Claude *in-session*, using these primitives to gather entries and reasoning over them — no separate subprocess, so the session's context stays intact.

### Staying fresh

The load-bearing maintenance principle: **refresh scales with *meaningful* change, not commit volume.** A post-commit hook flags changed files (deterministic, no LLM); a daily loop re-extracts L2 on real changes and L3 only on *significant* ones (a Haiku pass triages the ambiguous cases); a weekly loop regenerates L4 as ground truth. A reverse-dependency index and confidence-aging keep cross-file edges from silently drifting — the specific failure mode that makes one-shot extractors rot.

## 6. SpecFlow within Cortex — specs are the source of truth

Cortex absorbs SpecFlow as its spec-and-test lineage. **Specs are the source of truth; code is an artifact.** Two parallel trees under `.specflow/`:

- **`specs-business/`** — stakeholder outcomes, journeys, success metrics. *Why* something exists.
- **`specs/`** — developer specs: schemas, APIs, dependency chains, Given/When/Then acceptance criteria. Read this before writing code.

The trees are bidirectionally linked (`implements:` ↔ `implemented_by:`); drift between them is a bug. Every directory carries an `_overview.md` explaining what it groups.

Testing spans **four tiers**: atomic (one per criterion, mocked), spec (one per dev spec, integrated), journey (one per business spec, real infra), and scenario (full sandbox). Every acceptance criterion becomes a test case.

## 7. Provenance — every rule traces to its authority

Any persistent, authorized artifact carries `provenance:` frontmatter with `derives_from:` entries pointing at its source — an archive document, a Claude Code session, or an atlas decision. This turns the knowledge layer into an auditable citation graph:

- **Drift detection** — when a source document is superseded, downstream rules and specs that derive from it are flagged for review.
- **"What changes if we renegotiate X?"** — traverse the graph backward from any source to everything that depends on it.
- **Audit** — every enforceable rule traces to the authority that justifies it.

Absence of provenance simply means "authored directly" — it's populated when a source exists, never faked.

## 8. Self-maintenance: the pulse gate and the loops

Cortex keeps *itself* current through scheduled loops. The inviolable rule: **loops propose, they never mutate.** Everything a loop wants to change to a gated layer lands as a typed suggestion in the pulse gate; you decide:

```
cortex pulse-list                # what's queued
cortex pulse-accept <id>         # apply it (transactionally)
cortex pulse-reject <id>         # decline — and it's remembered, so it won't nag
```

The one sanctioned exception is the test-runner, which writes code behind a writer/verifier split.

The loops run as **five scheduled bundles** (consolidated from fourteen individual loops), each pinned to a model matched to its blast radius:

| Bundle | Cadence | Model | What it does |
|---|---|---|---|
| **Cortex daily** | 02:00 daily | Sonnet 5 | hygiene sweep, bug triage, spec-drift, insight refresh (L2/L3), session observation |
| **Cortex weekly curation** | Sat 04:00 | **Opus 4.8** | distil sessions into rule/skill candidates; audit compass rules for decay |
| **Cortex weekly quality** | Sun 04:00 | Sonnet 5 | spec-tree lint, scheduled verification, full L4 insight regeneration |
| **Cortex test runner** | Sun 06:00 | Sonnet 5 | the only code-writing loop — isolated by design |
| **Cortex monthly review** | 1st, 06:00 | Sonnet 5 | project-memory staleness, scaffolding drift |

Two loops read your day's Claude Code sessions to close knowledge gaps: **session-observe** (daily, per-session — routes observations into insight, conventions into compass, decisions into atlas) and **distil** (weekly, cross-session — mines repetition into rule and skill candidates). Weekly curation runs on Opus because its output shapes the rules that govern every future session.

## 9. How Claude engages with it

Cortex directs Claude into the knowledge layer at every session through scaffolding it installs:

- A managed **CLAUDE.md** block teaching the read-vs-consult discipline: *query insight to understand a file's role and relationships; read the file itself only when you need exact syntax to modify it.*
- An `_index.md` **active prompt** in every module directory — a prompt, not a placeholder, telling Claude what to read and when.
- **Warn-never-block hooks** (pure Node file I/O, no network) that surface context at read/write decision points and capture read-time purpose corrections.

The effect: Claude consults a rich, current resume of a file instead of reading 500 lines and remembering fragments — grounded in the codebase's actual patterns rather than priors.

## 10. Key decisions, and why

- **Two layers, hard boundary.** Core deterministic and LLM-free; Skills agentic. Everything about safety, testability, and cost depends on it.
- **The schema is the contract.** Versioned, referenced by both layers. It's the thing that keeps them from drifting.
- **No embeddings.** Structured tags + graph traversal instead of vector similarity — every inference explainable, stable across model changes. (Notably, this was *validated* against Graphify, which independently uses no embeddings.)
- **Insight is ungated; gated layers win.** Inferred understanding is context, never authority.
- **Propose, don't mutate.** Loops never touch gated content directly — the human gate is load-bearing.
- **Decisions live in exactly one place** (atlas). No "two views of the same decision" that drift.

## 11. What Cortex is, in one paragraph

A globally-installed CLI that, pointed at any codebase, extracts a deep multi-level understanding of it, keeps that understanding fresh as the code changes, serves it to Claude through a query surface and scaffolding designed for how Claude actually works, ingests the documents that authorize the project's rules, tracks every rule back to its source, and maintains all of it through scheduled loops that propose but never overwrite — so that Claude, in any session, behaves like it already knows the code.
