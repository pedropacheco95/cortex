# Cortex — Design Document

**Status:** Design phase. No code written. Pending review by Pedro.
**Author:** Pedro Pacheco (Sucesso Fractal), in collaboration with Claude.
**Date:** 4 June 2026.
**Document purpose:** Capture the architectural decisions that emerged from the design conversation. This document is the durable artefact that survives the chat. The schema document (`cortex-schema.md`) and the SpecFlow specs depend on this being right.

---

## 1. Problem statement

Understanding a codebase deeply enough to work in it productively — with an LLM assistant or alone — requires holding five kinds of context simultaneously: what the code *is* (structure), *why* it exists in that shape (decisions), *what conventions* govern it (rules), *which acceptance criteria* it must satisfy (specs), and *what state* the working session is in (runtime behaviour). Each kind of context lives in a different place and degrades at a different rate. Most projects keep some of it in code, some in scattered documents, some in people's heads.

Existing tools for AI-assisted context (OpenWolf for runtime middleware, Understand Anything for codebase graphs, LLM Wiki / Graphify for knowledge bases) each address one slice and do it well, but:

- They are designed to be installed alongside the codebase, increasing footprint and maintenance burden in projects where lightweight tooling is preferred.
- They do not integrate spec-driven development discipline — bugs, conventions, and decisions are tracked separately from acceptance criteria.
- They treat code structure, runtime behaviour, and project knowledge as separate concerns when they are deeply interrelated.
- They are owned by external maintainers with their own roadmaps and stability profiles.

Cortex is a holistic, owned-end-to-end system for understanding a codebase. It absorbs SpecFlow — an existing spec-driven test methodology (11 skills, two spec trees, four test layers, seven-type bug taxonomy) — as its specs-and-tests lineage, and adds new layers for code structure (anatomy), conventions and rules (cerebrum), project knowledge (atlas), self-maintenance (pulse), and runtime scaffolding (hooks, CLAUDE.md, `_index.md`). It deploys per-project without contaminating the working repo with persistent state beyond what the user explicitly chooses to commit.

---

## 2. Core thesis

Cortex rests on two convictions, each independently load-bearing:

**Most knowledge about a codebase can be expressed as specs.** A file's purpose is a spec ("this file does X in ~N tokens"). A project decision is a spec ("we use Postgres because Z"). A convention is a spec ("never use camelCase for DB columns"). Specs are the unifying form because they have acceptance criteria — they can be tested, verified, and traced.

SpecFlow (now part of Cortex — see §8) operates two spec trees: `specs/` for dev specs (the implementation contract) and `specs-business/` for business specs (the user-outcome layer). Cerebrum rules, atlas decisions, and anatomy entries all reference these via frontmatter, producing a citation graph that Claude navigates.

**A bug is not a spec. A bug is a signal that something in the spec-and-implementation chain is broken.** SpecFlow already classifies bugs into seven types:

1. **Missing criterion** — a dev spec exists but lacks an AC for this case.
2. **Incomplete rule** — a spec rule is stated but doesn't cover the observed behaviour.
3. **Wrong rule** — a rule is wrong as written and needs revision.
4. **Missing dev spec** — no dev spec covers this case at all; a new one is needed.
5. **Missing business spec** — no business spec captures the user outcome involved; a new one is needed (rarer, but real).
6. **Drift between layers** — dev spec and business spec contradict, or implementation has drifted from spec.
7. **Correct spec but wrong/missing test** — the spec is right; the test layer (atomic, spec, journey, or scenario) is the problem.

The earlier three-way framing (missing spec / wrong spec / wrong skill) was a simplification of this. The seven-type taxonomy is what Cortex uses going forward, with `cerebrum/bugs/` (the unified bug ledger — see §4) storing entries classified by type.

The taxonomy also became v1's automation gate, which the original framing didn't anticipate: both the daily bug-triage loop and the test-runner classify against exactly these seven, and both carry an explicit "not one of the seven" escape — an unclassifiable failure (flaky run, infrastructure) is reported, never force-fitted and never filed. If a real missing category emerges (infrastructure-failure is the likely candidate), that is a schema change to the taxonomy, not a per-loop workaround.

Bugs do not get "promoted to rules" as a category. A bug triage produces a spec change (types 1-6, in the appropriate spec or tree) or a test/skill fix (type 7). The cerebrum holds rules and conventions that are themselves specs; bugs are upstream of those rules, captured in `cerebrum/bugs/` because they're observations about how the project should behave but currently doesn't.

**The other conviction: Cortex serves both interactive sessions and autonomous loops.** A single Claude Code session benefits from Cortex — answers get grounded in real artefacts, conventions get enforced, decisions remain traceable. But loops (schedule-triggered, event-driven, or otherwise autonomous Claude Code invocations that run without a human in the room) cannot work well *without* a persistence layer. Every loop run starts cold; without Cortex, every run re-derives conventions, repeats corrections, and drifts. With Cortex, loops compound: each run builds on what previous runs learned and what the user curated.

The doc is not predicting a pivot from sessions to loops — it's recognising that both are happening simultaneously, and Cortex needs to serve both today. Boris Cherny (creator of Claude Code) has publicly described running hundreds of loops in parallel as his primary work mode; most users are still primarily in session mode. Cortex's design holds in both worlds because the same persistence layer answers both needs. See §11 for the architectural consequences.

The system that links code structure (what), project decisions (why), runtime behaviour (when), conventions and rules (how), specs across two trees (acceptance criteria), tests across four layers (verification), and bugs across seven types (broken state), and that serves both interactive and autonomous consumers, is the differentiator. No existing tool covers all of that.

---

## 3. Architecture overview

**v1 platform: macOS only.** Cortex v1 ships for macOS exclusively. The reasoning is operational: Claude Code Desktop scheduled tasks (used for autonomous loops, see §11) are macOS and Windows only — not available on Linux — and v1 cannot afford to ship two scheduling backends. macOS is chosen for v1 because it's the author's primary platform. Windows support is a v1.1 candidate; Linux remains deferred until Claude Code's Desktop scheduled tasks reach Linux or until cron + `claude -p` headless mode is mature enough to use as a fallback.

### 3.1 Two layers

**Cortex Core** — a globally installed Node.js binary. Deterministic. No LLM calls from Core itself. Owns:
- The `.cortex/` directory schema (and the `specs/` and `specs-business/` SpecFlow tree conventions).
- The CLI (`cortex init`, `cortex scan`, `cortex status`, `cortex constellation`, plus the per-loop CLIs).
- The Claude Code hooks (`SessionStart`, `PreWrite`, `PostWrite`, optional `PreRead`).
- The git post-commit hook for anatomy-refresh-fast.
- The constellation compiler and renderer.
- Desktop scheduled task SKILL.md writers (creates `~/.claude/scheduled-tasks/` entries on macOS).

**Skills** — Claude Code skill bundles installed to the project's `.claude/skills/`. Agentic. Call LLMs. Read and write `.cortex/`, `specs/`, and `specs-business/` but do not own their schemas. Two namespaces, both shipped as part of Cortex v1:

- **`specflow-*` skills** — spec-and-test lineage. 11 existing skills (see §8 for the full list): `specflow-onboard-codebase`, `specflow-deep-onboard`, `specflow-new-project`, `specflow-change-router`, `specflow-spec-editor`, `specflow-tests`, `specflow-bugs`, `specflow-ingest`, `specflow-viewer`, `specflow-lint`, `specflow-develop`.

- **`cortex-*` skills** — persistence-and-loop lineage. New skills for atlas, anatomy bookkeeping, pulse loops, and the suggestion-accept/reject workflow.

Both namespaces are part of one product. The distinction is conceptual (what concern the skill addresses) not organisational (where it lives or who maintains it).

The split between Core and Skills mirrors a common deterministic-layer / agentic-layer pattern: deterministic plumbing for things that must be exact and cheap (file I/O, schema enforcement, CLI), agentic workflows for things that benefit from LLM judgment (ingest, triage, synthesis, pattern extraction).

### 3.2 The contract between layers

A single document, `cortex-schema.md`, defines:
- The `.cortex/` directory layout.
- The `specs/` and `specs-business/` tree conventions (inherited from SpecFlow, now part of the unified schema).
- File formats — markdown frontmatter conventions for anatomy, cerebrum (including bugs), atlas, dev specs, business specs.
- Traceability conventions: dev spec `implements:` (single value), business spec `implemented_by:` (list), scenario `covers:`.
- Test layer conventions (atomic, spec, journey, scenario).
- Hook payload contracts (what Core injects, what Skills can expect).
- Cross-reference conventions (the citation graph spanning all artefacts).
- Schema versioning policy.

Core implements the schema. Skills consume it. Schema lives in its own document and both sides reference it by version.

This is non-negotiable. Without it, Core and Skills will drift. The schema is the load-bearing artefact of the entire system.

### 3.3 Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Claude Code Skills (agentic, LLM-using)           │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  specflow-*      │←──→│  cortex-*        │               │
│  │  (11 skills:     │    │  (atlas, pulse,  │               │
│  │   spec & test    │    │   anatomy, loops)│               │
│  │   discipline)    │    │                  │               │
│  └────────┬─────────┘    └────────┬─────────┘               │
│           │ read/write             │ read/write             │
└───────────┼────────────────────────┼────────────────────────┘
            ↓                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Cortex Core (deterministic, no LLM)               │
│  ┌──────────────────────────────────────────────────┐       │
│  │  CLI: cortex init / scan / status / constellation│       │
│  │       + per-loop CLIs                            │       │
│  │  Hooks: SessionStart, PreWrite, PostWrite,       │       │
│  │         optional PreRead, git post-commit        │       │
│  │  Owns: .cortex/, specs/, specs-business/ schemas │       │
│  │  Writes: Desktop scheduled task SKILL.md files   │       │
│  └──────────────────────────────────────────────────┘       │
└───────────┬─────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: The filesystem                                    │
│  specs/  specs-business/  .cortex/  tests/                  │
│  (all owned by Cortex; conventions defined in the schema)   │
└─────────────────────────────────────────────────────────────┘
```

Both skill namespaces are siblings at Layer 2 within one product. Integration is via filesystem conventions (Layer 0), enforced by the schema (§3.2). Cortex Core sits below both, providing the runtime substrate.

---

## 4. The Cortex modules

Three durable modules plus one transient. The two SpecFlow spec trees (`specs/` and `specs-business/`) and the test tree (`tests/`) are part of Cortex's data model but documented in §8 (the SpecFlow lineage) rather than here, because their conventions are inherited from SpecFlow and detailed there.

### 4.1 anatomy/ — code structure layer

Per-file index with one-line purpose, token estimate, governing specs, and applicable rules. Generated by Cortex's native scanner (see §7).

```
anatomy/
├── _index.md            ← SpecFlow-compatible discovery
├── files.md             ← per-file: path, purpose, tokens, last_seen, spec_links
├── graph.json           ← imports/exports map (native scanner)
└── layers.md            ← architectural layer assignments
```

### 4.2 cerebrum/ — write-time enforcement layer and bug ledger

Project conventions, decisions, rules, and bugs. Each rule is a lightweight markdown file with frontmatter linking it to its source (bug triage, decision, or convention), the files it governs, and an optional machine-checkable predicate. Rules are **not** SpecFlow specs themselves — SpecFlow specs reference rules by ID via frontmatter, and the testable subset of rules carries `check:` predicates that a separate skill can turn into tests.

```
cerebrum/
├── _index.md
├── preferences.md       ← project conventions (stack, formatting, frameworks)
├── environment.md       ← operational identity (SSH alias, Chrome profile, etc.)
├── do-not-repeat.md     ← summary index of rules that prevent recurring mistake patterns
├── standing-authorities.md ← default decisions the assistant holds without asking (granted, scoped, revisable)
├── decisions.md         ← ADRs in spec format
├── bugs/                ← the unified bug ledger (replaces SpecFlow's bugs.md)
│   ├── _index.md
│   ├── B-001-...md      ← one file per bug, classified by SpecFlow's seven-type taxonomy
│   └── ...
└── rules/               ← one file per rule
    └── R-001-no-camelcase-db.md
```

`environment.md` holds *pointers* (SSH alias names, Chrome profile names, account identifiers) — never secrets. Atlas holds the *why*; cerebrum/environment holds the *what Claude needs every session*.

`standing-authorities.md` emerged during the build as a first-class cerebrum artefact: the granted decision boundaries an autonomous or semi-autonomous session operates within — which permissions are standing, which always require asking. It is curated exactly like rules: human-granted, never self-expanded.

**`cerebrum/bugs/` is the unified bug ledger.** Each bug is a markdown file with frontmatter carrying its `type:` (one of the seven SpecFlow types — see §2), `severity:`, `status:` (open / triaged / resolved), `affects:` (spec IDs, file paths, or rule IDs), `proposed_fix:`, and a body with diagnostic evidence. This replaces SpecFlow's previous `bugs.md` flat file with one-file-per-bug for better composition with the citation graph and constellation. The bug ledger is colocated with cerebrum because bugs are observations about how the project should behave but currently doesn't — adjacent to rules, but distinct (rules are accepted constraints; bugs are pending problems).

### 4.3 atlas/ — project knowledge base

Karpathy's LLM Wiki pattern applied to project context. Stakeholders, decisions, domain language, source materials. Works equally well for client engagements, personal projects, OSS contributions, or any codebase where decisions and history matter.

```
atlas/
├── _index.md
├── stakeholders/        ← people involved, vendors, external systems
├── decisions/           ← human-readable narrative of decisions (cross-link to cerebrum/decisions.md)
├── domain/              ← the project's business / problem-domain terms
└── sources/             ← raw call transcripts, RFPs, slack exports, PDFs, design docs
```

Two views of the same decision: atlas has the narrative ("On 12 April the team decided to use Postgres because of compliance — see source X"); cerebrum has the enforcement view ("R-014: any new persistence layer must use Postgres, per atlas/decisions/2026-04-12-database-choice.md"). One write, two reads.

### 4.4 Deferred to v2

- **ledger/** — token/read observability. Cheap to add when needed but maintenance burden out of proportion to v1 value.
- **Interactive graph viewer beyond the constellation** — covered by the optional Graphify enhancement (§7.5) when users opt in; not part of v1 directly.
- **Atlas-as-graph chain** — running graph-style structural analysis on the atlas itself.
- **Open-sourcing.** Use it on three projects first. Refactor. Then decide.

---

## 5. Hooks: four core

Hooks are **reinforcement**, not the primary scaffolding mechanism. CLAUDE.md and `_index.md` prompts (see §6 below) are what actually direct Claude into Cortex. Hooks fire at decision points to inject just-in-time context that prompts alone can't anticipate.

All hooks are pure Node.js file I/O. No network. **Warn-never-block.** All five are registered in the project's `.claude/settings.json` by `cortex init`.

| Hook | Fires on | What it does | Status |
|---|---|---|---|
| `SessionStart` | New Claude Code session | Injects a minimal pointer: "Cortex is active. See `.cortex/_index.md` for what's available." That's it. No top-N lists, no ranked content. | Core |
| `PreToolUse` (Write/Edit) | Before any write or edit | Checks `cerebrum/rules/` for rules matching path or content pattern. Warns if the proposed write violates a rule. Includes rule source (bug triage, decision) in the warning. | Core |
| `PostToolUse` (Write/Edit) | After a successful write | Updates `anatomy/files.md` for the changed file (re-estimates tokens, refreshes purpose if structure changed). | Core |
| `PreToolUse` (Read) | Before any file read | Looks up `anatomy/files.md` for the target path; if found, injects purpose + token estimate + governing specs + applicable rules, plus a one-line writeback instruction: if the purpose is wrong or stale, emit a `<cortex:purpose>` tag. Warns on duplicate reads within a session. | Core (opt-out) |
| `PostToolUse` (Read) | After a file read | Silent. Sweeps the session transcript for unapplied `<cortex:purpose>` tags and refines the corresponding anatomy purposes (`purpose_source: read-time`). The capture half of refine-during-use. | Core (opt-out, paired with PreRead) |

### 5.1 Why SessionStart is minimal

The earlier design proposed injecting "top 5 active specs, top 5 most-recently-violated cerebrum rules" at session start. This was wrong on two counts:

- **Ranked lists guess at relevance instead of letting Claude pull what it actually needs.** If today's task is a new feature, last week's active specs are irrelevant noise.
- **Most-recently-violated is backward-looking.** Claude should be told rules exist and where to find them, not which ones it has failed.

The minimal version primes Claude with the *existence and location* of Cortex, not its contents. Contents come from grepping `_index.md` files on demand, from PreWrite warnings on actual writes, and from skills actively reading Cortex as part of their workflow.

### 5.2 Why the Read pair is opt-out (previously: PreRead optional)

This is OpenWolf's signature mechanism — inject a one-line summary before each read so Claude can skip the full read when the summary suffices. It's real and it works: OpenWolf measures ~65% token reduction on bare Claude CLI usage. But:

- The savings are specific to **undisciplined sessions on large codebases with high read redundancy.**
- In a SpecFlow-driven workflow, Claude already reads with intent (per-spec, per-ticket context), so the redundant-reads failure mode is much smaller.
- The hook fires unconditionally and cannot distinguish "exploring blindly" from "reading deliberately," producing noise in the latter case.

The original opt-in recommendation weighed PreRead as a token-saving device only. It is now half of a read-time refinement mechanism: reading is the highest-signal moment for anatomy — Claude is already forming an understanding of the file — and the three maintenance tiers (§7.2) never use that moment. PreRead injects and invites correction; PostRead captures it. That flips the cost/benefit: the pair ships **on by default**, disabled via `cortex.config.json` for users who want to skip the writeback token cost.

### 5.3 Why PreWrite is the high-value hook

This is where Cortex earns its keep. The PreWrite hook is the only one that **prevents a class of error** rather than observing or summarising. A cerebrum rule that catches a snake_case violation before the write lands is worth more than any amount of session priming or read-time observability. This hook is non-negotiable in v1.

Dogfooding sharpened the mechanism in round one (ledger B-001): a rule carrying an evaluable `check:` predicate warns only when the predicate actually fires on the proposed content — a conforming write to a governed path stays silent — while a rule with no evaluable predicate warns on path match, the correct conservatism when content can't be checked mechanically. This split is what keeps "silence is the normal case" true; the contract lives in schema §4.2's consumption note.

Fewer hooks than OpenWolf's six. SpecFlow handles Stop and other lifecycle events through its own skills.

---

## 6. Scaffolding: how Claude actually engages with Cortex

The earlier design implicitly assumed Claude would discover and use `.cortex/` on its own given a discoverable structure. That assumption is wrong. Claude reads what it is *directed* to read — through CLAUDE.md, through hook-injected context, and through explicit instructions inside skills. A passive data layer with hooks for runtime nudges is not enough.

This section names the four scaffolding mechanisms that make Cortex actively used rather than nominally present, and how they layer.

### 6.1 The four mechanisms, in order of primacy

**1. CLAUDE.md modification (primary entry point).** `cortex init` writes a Cortex section into the project's CLAUDE.md describing:
- That Cortex is active on this project.
- The `.cortex/` directory layout — anatomy, cerebrum, atlas — and what each contains.
- The protocol: before working on a task, read the relevant `_index.md` files. When asked "why" questions, grep `cerebrum/` and `atlas/` first. When encountering unfamiliar terms, check `atlas/domain/`.
- That the citation graph (frontmatter cross-references) is the navigation API.

Without this, the hooks inject context that Claude has no framework for using. With it, Claude knows Cortex exists, where its data lives, and when to consult it. This is the **primary** scaffolding mechanism — hooks are secondary.

**2. `_index.md` files as active prompts (not passive indices).** Every Cortex directory has an `_index.md`. These are not documentation — they are **prompts disguised as documentation**, written to instruct Claude how and when to read into the module. An index that says "Rules and conventions for this project" is useless. An index that says "When the user proposes code changes, check the rules whose `governs:` field matches the file path. When asked about a project decision, grep `source:` fields to find rules derived from atlas decisions" actively scaffolds Claude's behaviour.

`_index.md` content style is part of the schema, not an implementation detail. The schema doc specifies the prompt shape for each module's index.

**3. Skill-level engagement (active reading by workflows).** Cortex Skills and SpecFlow Skills must explicitly read `.cortex/` as part of their workflow, not assume Claude does so spontaneously. `cortex-ingest` and `specflow-bugs` are designed this way from the start. The 11 existing SpecFlow skills are all updated for Cortex awareness as part of v1 — `specflow-develop` checks anatomy for files relevant to the ticket, cerebrum for applicable rules, atlas for relevant decisions, before generating any code; the others get analogous reads.

This is the most invasive change of the four mechanisms because it touches every SpecFlow skill — but since SpecFlow is now part of Cortex, the work is internal rather than cross-product coordination. See §8.4 for the per-skill integration list.

**4. Hooks (reinforcement at decision points).** The hooks from §5 fire at moments where prompts and skills can't anticipate the need — a specific file is about to be read, a specific write is about to violate a rule, a new session is starting. Hooks reinforce the other three mechanisms; they do not replace them.

### 6.2 Why this layering matters

If only hooks existed: Claude receives context injections but has no framework for using them. The PreRead hook tells Claude "this file is the JWT middleware" and Claude shrugs.

If only CLAUDE.md existed: Claude knows Cortex exists but the data goes stale and is not surfaced at the moment of decision. A PreWrite cerebrum check fires too late if it's a CLAUDE.md instruction rather than a runtime hook.

If only `_index.md` files existed: Claude has navigable structure but no entry point telling it to navigate.

If only skills engaged with Cortex: Cortex works inside Cortex Skills but not during general Claude Code use.

All four together: Claude knows Cortex exists (CLAUDE.md), knows how to read each module (`_index.md`), is actively directed there by every workflow (skills), and gets reinforcement at runtime (hooks).

### 6.3 The trust budget

A practical concern. Every scaffolding mechanism uses tokens. CLAUDE.md is read every session. `_index.md` files get read whenever Claude follows the protocol. Hooks inject tokens per call. Skills load Cortex data as part of their work.

This is a feature, not a bug — the tokens are spent making Claude's outputs grounded and verifiable. But the budget needs to be respected:

- CLAUDE.md Cortex section: target under 400 tokens.
- Each `_index.md`: target under 300 tokens.
- SessionStart hook injection: target under 100 tokens.
- PreWrite hook warning: only fires when a rule actually applies — average overhead near zero.
- PreRead hook (if enabled): under 50 tokens per file read.

Cortex aims to spend tokens where they buy grounding and avoid them where they don't. The constellation, the dashboard, the `cortex status` CLI — these consume no Claude tokens, they're for the human.

### 6.4 What the schema must specify

For the scaffolding mechanisms to be reliable rather than vibes-based, the schema doc must define:

- The exact text of the CLAUDE.md Cortex section template, with substitution points for project name and module presence.
- The required shape of `_index.md` files for each module — what sections, what prompt patterns, what token budget.
- The format of hook payload injections — what fields, what token budget per hook.
- The expected skill-level reads — what `cortex-aware` SpecFlow skills must check before generating code.

These are not implementation details. They are the contract that makes Cortex actively used rather than merely installed.

---

## 7. Anatomy: native scanner

### 7.1 Decision

Cortex v1 ships with a **native anatomy scanner owned by Cortex Core**. No external tool runtime dependency. Graphify is documented as an optional v2 enhancement for users who want its MCP server or `--wiki` export; it is not the default and not required.

This reverses an earlier decision in this doc's history. The reasoning is in §7.4 below.

### 7.2 What the native scanner does

`cortex scan` (called by `cortex init` on first run and re-invoked manually thereafter; the git post-commit hook runs the *fast refresh tier* (§11.4), not a full scan). A completed scan also recompiles `.cortex/constellation.json` (§12.8), so the map refreshes whenever anatomy does:

1. **List files.** Glob the project root, respect `.gitignore` and `cortex.config.json` exclusions.
2. **Estimate tokens per file.** Character count divided by ~4. Fast, deterministic, accurate to within ~15%.
3. **Parse structure.** Tree-sitter — shipped as WASM (`web-tree-sitter` + prebuilt grammars; no native compilation on install) — extracts top-level definitions — functions, classes, exports — and imports per file. Single language per file inferred from extension; v1 grammars: TS/TSX/JS, Python, Rust, Go. Files without a grammar are still listed and token-estimated.
4. **Resolve one-line purpose (deterministically).** Core derives each file's purpose from its own doc comment — a JSDoc block, a Python module docstring, a Rust `//!`/`///` comment, or a Go leading comment — when present. Files without a usable doc comment are marked `needs_purpose_refresh: true` and left for the LLM pass, which Core never runs. That batched LLM pass for the flagged files (~20–30 at a time, SHA256-cached so unchanged files never re-run) is performed by the agentic `cortex-loop-anatomy-refresh` deep-tier Skill (§11.4). The Skill runs inline as part of `cortex init` (so day-1 anatomy is complete), and thereafter on its scheduled cadence; `cortex scan` itself never invokes the Skill — it only produces the flags. This keeps Core deterministic and LLM-free (§3.1) while still delivering complete purposes. Purpose freshness is a **four-tier mechanism**: **mark-dirty-fast** (post-commit), **bulk-fill-on-schedule** (the deep loop), **inline-on-init** (day-1 completeness), and **refine-during-use** (the PreRead/PostRead cycle, §5) — the fourth capturing understanding at the highest-signal moment, when Claude is already reading the file. Two coordination rules keep the four tiers from fighting: **provenance trust ordering** — `purpose_source: read-time > docstring > scanner-llm` (schema §4.1); an automated tier never replaces a higher-trust purpose unless the file's content changed — and **atomic row writes** — every tier writes `last_seen` together with any other fields it touches, never separately, so hygiene and spec-drift never observe a half-updated row.
5. **Cross-link specs.** If `specs/_index.md` is present, match file paths against spec frontmatter `governs:` fields. Populate `spec_links:` per file.
6. **Emit `.cortex/anatomy/`.** Per the schema (now including `purpose_source` provenance, §4.1) — `files.md`, `graph.json` (imports/exports only), `layers.md` (architectural layer inference based on directory structure + heuristic).

The scanner is pure Node.js with a small set of focused dependencies (WASM tree-sitter + grammars, frontmatter/glob parsing) — no native compilation, no second language runtime, no LLM SDKs anywhere in Core (rule R-001 enforces this at write time). It produces what Cortex actually needs and nothing more.

### 7.3 What the scanner deliberately does not do

These are real features in Graphify and other tools. They are not in the v1 native scanner:

- **Community detection (Leiden).** Cool but not load-bearing for anatomy's purpose (give Claude a per-file index). Layer assignment via directory/heuristic is sufficient.
- **Confidence-tagged edges.** Belongs to LLM-extracted concept graphs, which Cortex's anatomy is not. Cerebrum confidence comes from the source of the rule (decision, convention, bug triage), not from inferred edge confidence.
- **Multi-modal ingest (PDF, image).** Atlas handles non-code sources via `cortex-ingest`. Anatomy is for code.
- **MCP server.** v2 if anyone asks.
- **Knowledge graph beyond imports/exports.** The constellation is the human-facing graph view; it composes anatomy + cerebrum + atlas + specs nodes at render time. The anatomy artefact itself is a flat per-file index plus a thin imports/exports map.

### 7.4 Why native, not Graphify

The doc previously chose Graphify as the default backend. On reflection, that was wrong for three reasons:

1. **Dependency footprint.** Graphify is Python. Cortex is Node. Default-Graphify means every Cortex user installs both runtimes. Native Node scanner means one runtime.
2. **Schema churn risk.** Graphify is a young, fast-moving project. Pinning a version protects Cortex from breaks but freezes us out of upgrades. Owning the scanner means schema stability is a Cortex decision.
3. **Capability mismatch.** Graphify's signature features (Leiden, confidence edges, multi-modal, MCP) are not what anatomy needs. Paying the dependency cost for capabilities that aren't load-bearing is overengineering.

What we give up: the MCP server (deferred), the `--wiki` export (atlas seeds manually or via `cortex-ingest` for v1), the broad language support beyond what tree-sitter directly covers (tree-sitter covers the same 20+ languages; this is functionally equivalent).

### 7.5 Optional Graphify enhancement (v2 path)

If a user wants Graphify's extras, `cortex.config.json` will eventually support:

```json
{
  "anatomy": {
    "enhancement": "graphify",
    "graphify": { "wiki_export": true, "mcp_server": true }
  }
}
```

When enabled, `cortex scan` additionally invokes Graphify and exposes its outputs alongside the native anatomy. The native scanner remains the source of truth for `anatomy/files.md`; Graphify supplements with the wiki and the MCP server. This is a v2 feature only — not part of the v1 surface.

---

## 8. SpecFlow within Cortex

SpecFlow is the spec-and-test lineage of Cortex — 11 skills, two spec trees, four test layers, seven bug types — absorbed as part of the product. This section documents what SpecFlow is (because the rest of the doc references it constantly), how it composes with the other Cortex layers (anatomy, cerebrum, atlas, pulse), and what skills exist today versus what's new in Cortex v1.

### 8.1 The two spec trees

```
specs/                                # Developer specs (implementation contract)
├── _index.md                         # Dependency graph, build order
├── {domain}/
│   ├── _overview.md                  # What, what it covers, why grouped
│   ├── {capability}/
│   │   ├── _overview.md
│   │   └── {leaf}.spec.md            # The atomic unit — rules + Given/When/Then ACs
│   └── ...

specs-business/                       # Business specs (user-outcome layer)
├── {domain}/
│   ├── _overview.md
│   └── {persona-journey}.business.md # e.g., user-books-a-class.business.md
```

**Traceability headers (YAML frontmatter):**

- Dev specs: `id:`, `status:`, `depends_on:`, `implements:` (single value pointing to ONE business spec).
- Business specs: `id:`, `status:`, `depends_on:`, `implemented_by:` (list of all dev specs that serve this outcome).

`implements:` is strictly one value. Many-to-one signals a spec decomposition problem — that's a SpecFlow-defined diagnostic, not just a frontmatter rule.

Dev spec body sections: Intent, Entities (READS / WRITES / CREATES — references only, never schema definitions), Rules (numbered), Acceptance Criteria (Given/When/Then cards), Notes (with OPEN: items highlighted).

Business spec body sections: Outcome, Who This Is For, User Journey (numbered steps), Business Rules, Success Metrics, Out of Scope, Notes.

### 8.2 The four test layers

| Layer | Scope | Infrastructure | Count | Verifies |
|---|---|---|---|---|
| **Atomic** | 1 criterion | Mocked | 1 per Given/When/Then | Single behaviour in isolation |
| **Spec** | 1 dev spec | Integrated slice | 1 per dev leaf spec | Rule interactions, entity write accuracy, implementation completeness (NOT criteria replay) |
| **Journey** | 1 business spec | Real containers | 1 per business spec | End-to-end user journey with real infrastructure |
| **Scenario** | Multiple business specs | Full sandbox | Enough to cover all business specs | Cross-journey realistic workflows |

The `covers:` mechanism in scenario test specs (`tests/scenarios/specs/{name}.md`):

```yaml
---
name: new-player-first-booking
covers:
  - auth.secure-account-access
  - booking.reserve-and-pay
  - notifications.booking-confirmation
---
```

**Coverage constraint:** every business spec must appear in at least one scenario's `covers:` list. Enforced mechanically by the verification pass (see `specflow-tests` and `specflow-verify` loop in §11).

Test output structure:

```
tests/
├── setup/                            # Harness, DB setup, smoke tests
├── fixtures/                         # Factories + seeds
├── atomic/{domain}/{capability}/{leaf}.test.{ext}
├── spec/{domain}/{capability}/{leaf}.test.{ext}
├── journey/{business-domain}/{outcome}.test.{ext}
├── scenario/
│   ├── specs/{name}.md
│   └── {name}.test.{ext}
└── verification-report.md
```

### 8.3 The 11 SpecFlow skills (all built, all included in Cortex v1)

| # | Skill | Role |
|---|---|---|
| 1 | `specflow-new-project` | Scaffold a fresh project's spec trees and tests/ structure |
| 2 | `specflow-onboard-codebase` | Inspect an existing codebase and produce dev + business specs |
| 3 | `specflow-deep-onboard` | Multi-pass deep onboarding (atoms → pass A → B → C) for large codebases |
| 4 | `specflow-change-router` | Classify an incoming request and route to the right SpecFlow skill |
| 5 | `specflow-spec-editor` | Create or modify individual spec files with discipline |
| 6 | `specflow-tests` | Generate tests across all four layers; produce verification reports |
| 7 | `specflow-bugs` | Classify a reported problem against the seven-type bug taxonomy |
| 8 | `specflow-ingest` | Ingest external documents (RFPs, transcripts, etc.) into specs and atlas entries |
| 9 | `specflow-viewer` | Render a navigable HTML view of the spec trees |
| 10 | `specflow-lint` | Check spec-tree health (orphan specs, broken `implements:`, missing coverage) |
| 11 | `specflow-develop` | Recursive orchestration with depth calibration, verification cascade, gap documentation |

These are Claude Code skills installed to the project's `.claude/skills/specflow-{name}/` — exactly the same format and surface as the new `cortex-*` skills. There are no SpecFlow agents (the agent path was abandoned because Claude Code subagents can't spawn further subagents).

### 8.4 Integration with anatomy, cerebrum, atlas, pulse

The composition is the value proposition. Six concrete bridges:

1. **Dev specs reference cerebrum rules by ID.** A spec for the payment service carries frontmatter `governed_by: [R-007, R-014]`. `specflow-tests` includes those rules' checks when generating atomic and spec tests. Cerebrum rules themselves are not specs — they're a lighter format. The testable subset carries a `check:` predicate (regex, AST query, grep pattern); rules not referenced by any spec still get tested via the `check:` predicate.

2. **Atlas decisions correspond to business specs.** Business specs answer "what user outcome are we serving"; atlas decisions answer "why we chose this approach." `specflow-ingest` writing a business spec also writes an atlas entry; the two cross-reference.

3. **`cerebrum/bugs/` replaces SpecFlow's flat `bugs.md`.** `specflow-bugs` writes to the new layout (one file per bug, frontmatter-classified). Pulse loops can read bugs to detect drift between layers (type 6) and surface stale unresolved bugs.

4. **Spec-aware anatomy.** Each anatomy file entry includes the spec ID(s) governing that file (via the `implements:` chain). Accessed by Claude via the protocol in §9.1; surfaced by the PreRead hook when that hook is enabled.

5. **`cortex init` scaffolds the spec trees and recommends `specflow-onboard-codebase`** when initialising a project that doesn't have spec trees yet (per §13 step 7). Init is deterministic Core and never auto-runs onboarding — it is a heavyweight agentic workflow the user starts deliberately, with the scanned anatomy already in place for it to build on. On a project that already has specs, `cortex init` reads `specs/_index.md` and cross-links anatomy entries.

6. **SpecFlow skills are Cortex-aware.** All 11 SpecFlow skills read Cortex data (anatomy for relevant files, cerebrum for applicable rules, atlas for relevant decisions) as part of their workflow. This is part of the v1 work, not deferred. The deepest integrations are in `specflow-tests` (test generation incorporates cerebrum `check:` predicates), `specflow-develop` (consults anatomy and cerebrum before generating code), and `specflow-change-router` (routes by checking which Cortex module the request touches).

### 8.5 SpecFlow state files (the existing artefacts)

SpecFlow currently produces a substantial set of markdown outputs during its workflows. Under Cortex these get a stable home — some inside `.cortex/` (durable knowledge), some at the project root (existing convention preserved for backward compatibility), some in `.cortex/pulse/` (transient process outputs).

**Migrated to `.cortex/cerebrum/`:**

- `bugs.md` (old, flat file at project root) → `.cortex/cerebrum/bugs/B-NNN-*.md` (new, one file per bug, frontmatter-classified against the seven-type taxonomy). The bug ledger becomes the unified store; `specflow-bugs` and the `cortex-loop-bug-triage` loop both write here.

**Re-homed to `.cortex/pulse/` (transient process outputs) — as shipped, this migration is at the *instruction level*: the Cortex-aware skills write to the new homes natively, so new runs never produce the legacy files. Pre-existing legacy files on old projects are not auto-moved (see the migration-step note below):**

- `gaps.md` → `.cortex/pulse/gaps.md` (produced by `specflow-develop`, reviewed and dismissed like other pulse outputs). *Redirected in the awareness pass ✓*
- `tests/verification-report.md` → `.cortex/pulse/verification-report.md` (produced by `specflow-tests` and the `specflow-verify` scheduled loop). *Redirected in the awareness pass ✓*
- `proposed-notes.md` → `.cortex/pulse/proposed-notes.md` (adversarial investigation judgments from onboarding). *As shipped: redirected on the deep-onboard path; single-pass `specflow-onboard-codebase` still names the root home — tracked as ledger B-004.*
- `corrections.md` → `.cortex/pulse/corrections.md` (human-applied corrections during onboarding; cleared when onboarding completes successfully). *Same B-004 status as proposed-notes.*
- `onboarding-scratch/atoms/` → `.cortex/pulse/onboarding-scratch/atoms/` (atom extraction records from Phase 1 of onboarding).
- `onboarding-scratch/pass-{a,b,c}/` → `.cortex/pulse/onboarding-scratch/pass-{a,b,c}/` (raw outputs from deep-onboard's three-pass execution; retained for audit trail). *Redirected in the awareness pass ✓*
- `deep-onboard-report.md` → `.cortex/pulse/deep-onboard-report.md` (summary of three-pass convergence and disagreement resolutions). *Redirected in the awareness pass ✓*

**Preserved at project root (existing files that already serve a different audience):**

- `CLAUDE.md` — gains a Cortex section but otherwise stays where it is (Claude Code reads it from project root).
- `RULES.md` — 10-20 hard project constraints from onboarding. Lives at the project root because it's an audience artefact (humans reading the project), distinct from `.cortex/cerebrum/rules/` (machine-readable rule files used by Claude during writes). The two are related but not the same: `RULES.md` is a human-readable summary; `cerebrum/rules/` are individually-addressable, frontmatter-tagged rules with optional `check:` predicates. As shipped, the cross-reference is authored, not automated: seed rules cite `RULES.md` in their `source:` frontmatter; `cortex init` performs no automatic cross-referencing (an init-level linker is a possible v1.x nicety, not currently planned).
- `build-order.md` — phased remediation plan produced during onboarding. Stays at project root; it's a working document the human consults, not a Cortex-owned artefact.
- `implicit-behaviors.md` — undocumented behaviours flagged during onboarding. Stays at project root.
- `dead-features.md` — deprecated code flagged during onboarding. Stays at project root.
- `link-map.md` — business-to-dev coverage table. Stays at project root; read by `specflow-viewer` for the canonical mapping.

Moving the cerebrum and pulse artefacts into the Cortex layout means they participate in the citation graph (referenceable by spec ID, rule ID, file path) and benefit from pulse's review/dismiss workflow. The project-root files stay where SpecFlow already writes them — they're either human-audience documents or have established cross-references from other tools.

As shipped, `cortex init`'s migration step handles exactly one artefact: a legacy root `bugs.md` is split into `.cortex/cerebrum/bugs/B-NNN-*.md` per the schema, with a deprecation marker left at the old path until the next major version. The other legacy files are handled by the instruction-level redirects above — new runs never produce them — but init does not move pre-existing copies; extending init's migration to the full list is a recorded post-v1 consideration.

### 8.6 Standalone mode is no longer relevant

Earlier versions of this doc described a "standalone mode" where Cortex worked without SpecFlow. With SpecFlow absorbed, this is not a meaningful state — they ship together. A project with no specs is just a project where the spec trees are empty; Cortex still works, but the value of cerebrum, anatomy, and atlas compounds significantly when spec trees fill in.

---

## 9. How Claude Code uses Cortex

Cortex does not present a UI to Claude. The constellation visualisation is for humans. Claude accesses the same underlying data through the four scaffolding mechanisms described in §6 — CLAUDE.md, `_index.md` prompts, skill-level engagement, and hooks. The subsections below describe what Claude actually *does* with the data once the scaffolding has directed it there.

### 9.1 The protocol: index-first reading

The pattern, established by CLAUDE.md and reinforced by each module's `_index.md`:

1. Read the relevant `_index.md` first — these are prompts that name what's in the directory and when to consult each kind of artefact. Small, cheap, designed for Claude to read every time.
2. Read only the individual files the `_index.md` directs Claude to for the current task.
3. Follow frontmatter cross-references (see 9.2) when an artefact cites another — this is the citation graph being walked.

Token budget for a deep answer drops from "size of codebase" to "size of relevant citation chain."

### 9.2 Frontmatter cross-references (the citation graph)

Every Cortex artefact carries explicit cross-references in YAML frontmatter:

```yaml
# cerebrum/rules/R-014-no-socketio.md
id: R-014
source:
  - atlas/decisions/2026-04-12-realtime-stack.md
  - bugs/B-031.md
governs:
  - anatomy/services/realtime/*
  - anatomy/api/notifications/*
related_specs:
  - REALTIME-002
confidence: EXTRACTED
```

When asked "why don't we use Socket.IO here?", Claude greps `.cortex/` for the rule, follows its `source:` frontmatter to the original decision and bug, and produces a fully cited answer. This works because the frontmatter convention is universal across all four modules — the schema (see §6.4) enforces it.

### 9.3 Hook-injected context at decision points

The hooks from §5 bring data to Claude at moments protocol alone can't anticipate — specifically the PreWrite hook fires when a write would violate a rule, regardless of whether Claude consulted the cerebrum first. This is reinforcement; it catches cases where the protocol was skipped or the relevant rule wasn't found by index navigation.

Hook outputs are plain text injected into Claude's context. See §5 for the specific payloads.

### 9.4 Skill-level reads (workflow engagement)

Cortex Skills and Cortex-aware SpecFlow Skills explicitly read `.cortex/` as part of their workflow. `cortex-ingest` reads atlas indexes before adding new entries. `specflow-bugs` reads cerebrum and the spec trees to classify a bug against the seven-type taxonomy. `specflow-develop` reads anatomy, cerebrum, and atlas before code generation.

This is the most concrete way "more grounded answers" becomes a property of the system rather than an aspiration — workflows that *must* read Cortex by design produce answers that are *always* grounded in it, not occasionally.

### 9.5 What this changes for Claude

Cortex does not make Claude smarter. It makes Claude's answers more **grounded**, which presents as certainty because the citations are real.

- **Answers carry provenance.** Decisions traceable to atlas sources, rules, original bugs, specs.
- **Repeated mistakes stop being possible.** When a bug triage produces a new or revised spec, the same mistake cannot occur again without an explicit warning at write time.

### 9.6 What Cortex cannot fix

- **Genuine ambiguity.** Orphan nodes in the constellation surface this honestly; the human still has to make the call.
- **Stale data.** PostWrite hook helps but isn't perfect. Pulse (§10) catches the drift through hygiene scans; manual `cortex scan` remains available.
- **Cerebrum rule drift.** Obsolete rules from old conventions. Pulse hygiene flags dead references; promotion of new conventions from sessions is handled by Pulse distil.

---

## 10. Pulse: self-maintenance

Cortex's data layer is only useful if it stays current. Anatomy goes stale as files move. Cerebrum drifts as conventions evolve. Atlas accumulates orphan decisions. Mid-conversation drop-offs leave unfinished threads that rot silently. And many of the things the user would *want* in cerebrum — Chrome profile preferences, environment quirks, repeated corrections — get said in sessions and never captured.

Pulse is the layer that keeps Cortex honest. It is a **process**, not a module: a pair of skills that run on a cadence, each producing a transient artefact in `.cortex/pulse/` that the user reviews. Pulse never silently mutates cerebrum; it proposes, the user disposes.

### 10.1 Two mechanisms

**Hygiene** — fast, mostly deterministic, runs frequently. Surveys the project for unfinished or broken state and produces a briefing.

**Distil** — slower, LLM-heavy, runs less often. Reads Claude Code session transcripts and surfaces patterns that should become cerebrum rules.

These are designed separately because they have different cost profiles and different relationships to user attention. One mechanism doesn't fit both.

### 10.2 Hygiene

A skill — `cortex-pulse-hygiene` — invoked on a cadence (default: at most once per 24h, triggered by SessionStart hook with a cooldown check). Output: `.cortex/pulse/hygiene-report.md`, overwritten each run.

What it checks:

- **Orphan branches.** Local branches not merged, not deleted, no commits in N days.
- **Stale PRs / draft PRs.** Open PRs without recent activity (if a remote is configured).
- **Mid-conversation drop-offs.** Recent Claude Code sessions where the last assistant message contained incomplete-action language ("let me", "next I'll", "I'll continue"). One small LLM pass for detection.
- **Anatomy drift.** Anatomy entries pointing at files that no longer exist; files added since last `cortex scan` that aren't in anatomy.
- **Cerebrum dead references.** Rules citing bugs or atlas decisions that have been deleted.
- **Spec orphans.** Specs in `specs/` with no implementing files in anatomy, or files in anatomy that should be governed by a spec but aren't.
- **Aged TODOs.** Code comments with `TODO`/`FIXME` markers older than N days (configurable).

Almost all of this is deterministic — git commands, filesystem comparisons, regex matching. The mid-conversation detection is the only LLM-using check and it only fires when there are recent sessions to analyse. Total cost per run: well under 100 tokens on a typical project.

### 10.3 Distil

A skill — `cortex-pulse-distil` — invoked on a slower cadence (default: weekly). Output: `.cortex/pulse/suggestions.md`, overwritten each run.

What it does:

1. Reads Claude Code session transcripts for the project since the last distil run.
2. Batched LLM analysis to identify recurring patterns — corrections, preferences, environment specifics, conventions the user has stated more than once.
3. For each candidate pattern, checks whether it's already covered by existing cerebrum content. If not, includes it in the suggestions file.
4. Each suggestion includes: the pattern, occurrence count, source session references, confidence, proposed cerebrum location, and a stub of the proposed addition.

Three rules keep this useful rather than annoying:

- **Conservative thresholds.** A pattern needs at least N occurrences (default N=3) before surfacing. One-offs are filtered out.
- **No silent writes.** Distil only writes to `suggestions.md`. It never modifies cerebrum directly. The user accepts a suggestion via `cortex pulse-accept S-042`, which applies the change.
- **Rejection memory.** `.cortex/pulse/dismissed.md` records rejected suggestions. The same pattern is not re-proposed for a configurable window (default 90 days).

Example suggestion entry:

```markdown
## S-042: Chrome profile environment rule

**Pattern:** User has specified "use Chrome profile X" in 3 sessions
(2026-05-18, 2026-05-22, 2026-06-04).

**Currently in cerebrum?** No.

**Proposed addition to `cerebrum/environment.md`:**
> Chrome profile: profile-X (contains saved credentials for project systems).

**Source sessions:** [list]
**Confidence:** High (3 occurrences, consistent phrasing).
**Action:** `cortex pulse-accept S-042` or `cortex pulse-reject S-042`.
```

### 10.4 Cadence and scheduling

Both pulse loops run as **Claude Code Desktop scheduled tasks** — the native scheduling mechanism Claude Code ships. `cortex init` creates the task definitions by writing `SKILL.md` files to `~/.claude/scheduled-tasks/<task-name>/`. The Desktop app picks them up and fires them on the configured cadence.

The SKILL.md format is minimal — YAML frontmatter with `name` and `description`, plus the prompt body:

```markdown
---
name: cortex-pulse-hygiene
description: Daily Cortex hygiene scan
---
Invoke the cortex-pulse-hygiene skill. Update .cortex/pulse/hygiene-report.md
with the findings. Do not modify cerebrum, anatomy, or atlas directly.
```

Hygiene runs daily; distil runs weekly. The Desktop app handles all scheduling, jitter (deterministic offset to avoid sync collisions), and seven-day catch-up after machine sleep (one consolidated run for missed time, with notification).

Hygiene findings are *also* surfaced at SessionStart via the SessionStart hook. The hook does not re-run hygiene — it reads the existing `hygiene-report.md` (written by the last scheduled run) and injects a one-line summary if the report is recent. This separates the *when does hygiene run* (Desktop task, daily) from *when does the user see findings* (SessionStart, every session). Both share the same source.

Three properties acknowledged:

- **macOS-only in v1.** Desktop scheduled tasks aren't available on Linux. v1 ships macOS-only (see §3); Windows is a v1.1 candidate.
- **Desktop app must be open and machine awake.** If the machine is asleep, the task is skipped. Catch-up runs the most recently missed instance when the machine wakes. For both pulse loops, missing intermediate runs is acceptable — one fresh report is what matters.
- **Manual escape hatch.** Both skills are invokable directly (`cortex pulse-hygiene`, `cortex pulse-distil`) regardless of scheduled-task state. If Desktop scheduling is paused or the user wants to force-run a report, the CLI always works.

Bonus capability available via Claude Code's `update_scheduled_task` MCP tool: a running Cortex loop can modify its own schedule. For example, distil could increase frequency if it detects a high rate of accepted suggestions (signal that patterns are emerging fast) or decrease frequency on quiet projects. Not used in v1 but the capability is there for v1.x evolution.

### 10.5 Why Pulse is a process, not a module

`.cortex/pulse/` exists but its contents are **transient**. `hygiene-report.md` overwrites each run. `suggestions.md` overwrites each run. Only `dismissed.md` and timestamp tracking files persist. The directory is gitignored by default.

This is deliberate. Pulse's findings are not durable knowledge — they're a working queue. The durable knowledge lives in cerebrum (once a suggestion is accepted), atlas, and specs. Treating Pulse as a module would clutter Cortex's data model with transient state that doesn't belong alongside curated artefacts.

### 10.6 Integration with the other layers

- **Reads anatomy** to detect file drift (anatomy entry vs filesystem).
- **Reads cerebrum** to detect dead source references and to filter suggestions already covered.
- **Reads atlas** to detect orphan decisions.
- **Reads `specs/`** for spec orphans.
- **Reads Claude Code session transcripts** for hygiene's drop-off detection and distil's pattern extraction.
- **Reads `.cortex/pulse/dismissed.md`** to avoid re-proposing rejected suggestions.
- **Writes only to `.cortex/pulse/`.** Never directly mutates cerebrum, anatomy, atlas, or specs.

The "writes only to its own directory" rule is the architectural guarantee that Pulse is safe to run. Cerebrum stays a curated artefact; Pulse never grows it autonomously.

### 10.7 Open question on session transcript access

Distil depends on programmatically reading Claude Code session history. The exact location, format, and stability of session storage needs verification before locking the schema. Three possibilities:

- **Project-local session storage** (e.g. in `.claude/` per project) — easiest case, transcripts are alongside the project.
- **Global session storage** (e.g. in `~/.claude/`) — needs filtering by project. Possible but requires care.
- **Ephemeral or hard-to-access storage** — distil moves to v1.5; v1 ships hygiene only.

**Resolved (verified 2026-07-02):** session storage is the second case — global, at `~/.claude/projects/<slug>/<session-id>.jsonl` where `<slug>` is the project's absolute path with `/` replaced by `-`; JSONL of typed entries. Distil and skill-suggest stay in v1 scope; the session-reading layer (`loops.session-reading`) owns the location/parsing and is deliberately tolerant of format drift since the format is Claude-Code-owned.

---


## 11. Loops: the architectural frame Cortex serves

Pulse hygiene and Pulse distil are not exceptions — they are the first two of a wider family. Cortex ships loops because loops are how the persistence layer stays honest, current, and self-improving. This section names the family, the properties that make a loop a *Cortex loop*, and the thirteen loops shipped in v1.

### 11.1 What a loop is, briefly

A loop is autonomous Claude Code work: a scheduled or event-triggered invocation that runs without a human in the room. Boris Cherny, head of Claude Code at Anthropic, has publicly stated that his job is now to write loops — he runs hundreds in parallel, scanning GitHub, Slack, CI, and Twitter, surfacing what to build, and writing code via sub-agents.

A loop has six structural elements (per Addy Osmani's "loop engineering" naming). Claude Code provides native primitives for most of them; Cortex's specific contribution is narrower than earlier framing suggested:

1. **A goal** — verifiable stopping condition. Claude Code provides `/goal` (run until condition met, separate model grades).
2. **A scheduler** — Claude Code provides `/loop` (session-scoped, fires while session open), Desktop scheduled tasks (persistent local, macOS/Windows), Routines (cloud, Pro/Max only), and GitHub Actions (CI events). Cortex v1 uses Desktop scheduled tasks for unattended loops and `/loop` integration for session-time visibility.
3. **Skills** — Claude Code provides the skill format; Cortex ships skills that conform to it.
4. **Connectors** — Claude Code provides MCP. Cortex doesn't add connectors.
5. **Sub-agents** — Claude Code provides sub-agent invocation. Cortex defines a writer/verifier pattern for loops that mutate code (test-runner is the v1 example).
6. **Memory** — **This is Cortex's primary contribution.** Anatomy, cerebrum, atlas, plus the scaffolding (CLAUDE.md, `_index.md`, `loop.md`) that makes them accessible to any loop or session.

The honest framing: **Cortex is primarily the memory layer for Claude Code loops, plus a curated set of example loops that maintain that memory.** The rest of the loop infrastructure is Claude Code's. This is *less* than what earlier versions of this doc claimed Cortex provides, but the smaller claim is the true one and arguably more compelling — Cortex's job is to make Claude Code's existing loop primitives durable across runs.

### 11.2 Why Cortex is loop-infrastructure

A single Claude Code session benefits from Cortex but doesn't strictly need it. A loop *cannot work well without it* — every run starts cold otherwise, re-derives conventions, repeats corrections, drifts.

What Cortex provides to any loop (its own or user-written):

- **Persistent context** (anatomy, cerebrum, atlas) so the loop doesn't start cold.
- **A scaffolding protocol** (CLAUDE.md + `_index.md`) so loops navigate the persistence layer the same way human-driven sessions do.
- **Write discipline** (frontmatter conventions, schema validator) so loops produce artefacts that compose with everything else.
- **A propose-don't-mutate convention** for autonomous writes — `.cortex/pulse/` is the queue for human review.
- **Examples** — the thirteen shipped loops show the pattern, so users can write their own with confidence.
- **Compounding during normal use** — read-time purpose capture (§5's Read pair) refines anatomy every time a session reads a file: ordinary work improves the memory every subsequent loop and session starts from, with no scheduled run involved.

Cortex serves interactive sessions *and* loops with the same machinery. The doc earlier (§2) named this as one of the two convictions Cortex rests on; this section is its operational consequence.

### 11.3 The four properties of a Cortex loop

A loop is a *Cortex loop* — distinguished from arbitrary user loops — if it has all four:

1. **It maintains `.cortex/` integrity.** Each Cortex loop keeps a specific module from rotting (anatomy, cerebrum, atlas, scaffolding).
2. **It writes only to `.cortex/pulse/`** (with one exception, the test-runner — see §11.4). Same rule as Pulse hygiene/distil: propose, don't mutate. The user accepts via `cortex pulse-accept <id>`.
3. **It uses the same skill format and CLI surface as everything else in Cortex.** A user invokes `cortex loop-rule-decay` manually; a Desktop scheduled task invokes the same skill. No special framework.
4. **It composes with the others.** Loops share session-reading machinery, the schema validator, the pulse-accept/reject UI, and a single `~/.claude/scheduled-tasks/` registration step. Adding a loop is cheaper than writing it from scratch.

This consistency matters because it means a user writing their own loops can copy Cortex's pattern. The Cortex loops aren't a privileged class — they're worked examples.

### 11.4 The thirteen Cortex loops

All in v1, listed by what they maintain.

Two conventions all thirteen share as shipped: **always-write** — every loop overwrites its output file on every run with a fresh timestamp and explicit "nothing this cycle" empty states (schema §4.5), so the pulse directory is self-documenting; and **gate interaction** — distil and skill-suggest emit §4.5 proposal sections through the pulse review CLI (`pulse-list`/`accept`/`reject`, single S-namespace); the curation and verification loops emit human-readable reports (wiring their proposals through the gate needs an edit-typed proposal mechanism — a recorded post-v1 consideration); the anatomy loops maintain machine-owned regenerable state directly and propose nothing.

**Pulse loops (already detailed in §10):**

1. **`cortex-pulse-hygiene`** — daily hygiene scan. Orphan branches, stale PRs (via `gh` when available, skipped-with-notice otherwise), anatomy drift, cerebrum dead references, spec orphans, aged TODOs — all deterministic, via `cortex pulse-hygiene`. The one designed LLM check, mid-conversation drop-off detection, is deferred to the skill layer in v1; the report footer states it. Output: `pulse/hygiene-report.md`. Trigger: Desktop scheduled task (daily). Findings are surfaced into Claude Code sessions via the SessionStart hook, which reads (does not re-run) the existing report.

2. **`cortex-pulse-distil`** — weekly session pattern extraction for cerebrum content. User preferences, environment settings, recurring corrections. Output: `pulse/suggestions.md`. Trigger: Desktop scheduled task (weekly). As shipped: deterministic bookends (`--collect` gathers this project's transcripts since the last run; `--propose` applies the threshold/already-covered/dismissed filters and writes §4.5 proposal sections with session provenance); the pattern judgment runs in-session for the scheduled skill (no nested subprocesses) or as a headless subprocess for the manual CLI. Pending proposals keep their S-ids across runs.

**Anatomy-maintenance loops:**

3. **`cortex-loop-anatomy-refresh-fast`** — runs on every git commit, async, deterministic only. Re-estimates tokens for changed files, updates import/export edges via tree-sitter, marks affected files as `needs_purpose_refresh: true`. Zero LLM calls. Sub-second. Backgrounded so commits aren't blocked. Trigger: git post-commit hook (not a Claude Code scheduled task; this one is pure CLI invoked from git). As shipped, additionally: deleted files lose their row and edges; every row write carries `last_seen` atomically with the other touched fields (the hygiene/spec-drift coordination rule, §7.2); invocable as both `cortex anatomy-refresh-fast` (the installed hook's command) and `cortex loop-anatomy-refresh --fast`.

4. **`cortex-loop-anatomy-refresh-deep`** — runs daily at a quiet hour. Picks up everything marked `needs_purpose_refresh: true` from the fast pass, batches ~25 files with head excerpts, runs the LLM purpose-line pass, clears the flag. One pass per day regardless of commit volume. Trigger: Desktop scheduled task (daily). As shipped, additionally: a mid-flight hash guard defers any file that changed after collect (keeps its flag for the next cycle); applied purposes land as `purpose_source: scanner-llm` and never overwrite a `read-time` purpose on unchanged content (§4.1 trust ordering); the same Skill is what `cortex init` runs inline for day-1 completeness.

The two-tier split (fast/deterministic vs deep/batched) is the pattern that prevents commit-time LLM cost. It generalises beyond anatomy and is worth recognising as a Cortex idiom: **mark dirty fast, refresh deep on a schedule.**

**Curation loops:**

5. **`cortex-loop-rule-decay`** — weekly. For each cerebrum rule, checks: do the files it governs still exist? Does its source still exist? Has the rule been violated recently without correction (suggesting obsolescence)? — *this third signal is deferred: it needs hook-warning telemetry that v1 does not record; the shipped signals are dead `governs`, dead `source`, and age-plus-dead-governs, with the deferral stated in the report footer.* Surfaces candidates for retirement. Output: `pulse/rule-candidates.md`. Trigger: Desktop scheduled task (weekly).

6. **`cortex-loop-atlas-staleness`** — monthly. Decisions older than N months (shipped default: 180 days, stated in the footer) that the codebase still cites get flagged for re-verification. Sources older than N months not referenced by any rule or spec get flagged for archival; dead atlas cross-references are a third shipped finding class. Output: `pulse/atlas-review.md`. Trigger: Desktop scheduled task (monthly).

7. **`cortex-loop-onboarding-drift`** — monthly. Re-reads CLAUDE.md's Cortex section and each `_index.md` against the current schema. Proposes updates where the schema has evolved or where new patterns warrant surfacing at session start. Output: `pulse/scaffolding-review.md`. Trigger: Desktop scheduled task (monthly). As shipped, the checks reuse the validator's index/CLAUDE-block logic rather than reimplementing (managed-block version vs schemaVersion, §7.1 heading shape, 300-token budget, plus a template-identical-in-grown-directory heuristic, labelled as a hint).

**Verification loops (SpecFlow lineage):**

These two shipped as exactly what they claimed: scheduling wrappers, not new implementations — cadence plus paper trail around existing checking. Each gained a thin deterministic CLI (`cortex loop-specflow-lint` / `loop-specflow-verify`) so the daily dated report exists even without an agentic session; the judgment stays in the interactive skills.

8. **`specflow-lint` (scheduled)** — daily. Runs the existing `specflow-lint` skill to check spec-tree health: orphan specs (no `implements:` or no `implemented_by:`), broken cross-references, missing `_overview.md` files. (Covers-list completeness belongs to `specflow-verify`, per schema Decision 4.) Output: `pulse/lint-report.md`. Trigger: Desktop scheduled task (daily). Cheap, mostly deterministic.

9. **`specflow-verify` (scheduled)** — daily. Runs the verification portion of `specflow-tests`: confirms tests exist for every dev spec at the atomic and spec layers, every business spec at the journey layer, and every business spec appears in at least one scenario. Detects drift between spec and test artefacts. Output: `pulse/verification-report.md`. Trigger: Desktop scheduled task (daily). As shipped it mechanically owns the §8.2 covers-completeness constraint, and distinguishes declared deferrals (spec-Notes convention) from genuine gaps.

10. **`cortex-loop-spec-drift`** — daily. For each spec, finds the anatomy files it governs. Checks whether those files have changed substantively since the spec was last updated. Flags suspect specs where the spec is wrong, the implementation has regressed, or new ACs are needed. Output: `pulse/spec-drift.md`. Trigger: Desktop scheduled task (daily). As shipped: git last-commit date comparison with a 14-day grace window (stated in the footer); each suspect lists both dates and the three readings. Complements `specflow-lint` (structural integrity) and `specflow-verify` (test coverage) by detecting *content* drift.

11. **`cortex-loop-test-runner`** — the heaviest loop. Runs daily for atomic + spec tiers (mocked, fast); weekly for journey (real infrastructure); on-demand for scenario (full sandbox). On failure: classifies via the `specflow-bugs` seven-type discipline — a result of "not one of the seven" (flaky, infra) is reported and nothing else happens: no bug filed, no fix attempted. Classifiable failures run the writer/verifier harness; a verified fix lands on a `cortex/test-fix-*` branch (built in a worktree — the checked-out tree is never touched) with a PR whose body always carries five fields: the failing spec, the traced criterion, the writer's reasoning, the verifier's verdict, and the trigger context. Budget exhaustion (default 3 iterations) files a ledger case-file with the last diff and the full verdict history — and that entry's open status IS the retry suppression: the failure is not re-attempted until a human resolves it. Reports to `pulse/test-failures.md`. This is the only Cortex loop that writes to *code* — and the writer/verifier split plus the branch boundary is what makes that safe. Trigger: Desktop scheduled task (daily for atomic+spec; weekly for journey), with manual `cortex test-run` override.

**Skill-suggestion loops:**

12. **`cortex-loop-skill-suggest`** — weekly, shares distil's session-reading pass. Where distil mines for cerebrum content (things the user *said*), skill-suggest mines for repeated *workflows* (things Claude *did* more than once that should be encapsulated as a reusable skill). Output: `pulse/skill-suggestions.md` with proposed `SKILL.md` drafts. User accepts via the pulse gate → the skill file is created at the proposal's target path (new files only — accept never overwrites an existing skill); the drafting judgment picks project-local by default, and the human can edit the target before accepting. Trigger: Desktop scheduled task (weekly).

This is the loop that turns *use* into *infrastructure*. Every accepted skill suggestion means the next time that pattern arises, Claude invokes the skill directly instead of re-deriving the workflow. Pure compounding.

13. **`cortex-loop-bug-triage`** — daily. Reads `cerebrum/bugs/` for bugs with `status: open` and runs `specflow-bugs` to classify each against the seven-type taxonomy. Fills the bug entry's absent classification frontmatter (`type:`, `severity:`, `proposed_fix:`) — fill-only, never overwriting a human's values; for already-classified entries it re-derives independently and reports divergence, both readings side by side, in `pulse/bug-triage.md` (calibration signal in both directions). Type-7 routing to a test-fix workflow did not ship in v1 — the test-runner discovers test failures on its own cadence; wiring triage's type-7s into it is a recorded post-v1 consideration. Trigger: Desktop scheduled task (daily). This makes the bug ledger active rather than passive.

### 11.5 The shared mechanism

Six things every Cortex loop uses, built once and reused:

- **Schema-conformant frontmatter** for whatever artefact it produces (suggestions, candidates, gaps, drift).
- **The pulse-accept / pulse-reject CLI** for converting proposals into accepted changes.
- **The dismissed-suggestions memory** so rejected proposals don't recur within the window (default 90 days).
- **Desktop scheduled task registration** — `cortex init` writes `~/.claude/scheduled-tasks/<task-name>/SKILL.md` for each loop. The SKILL.md format is YAML frontmatter (`name`, `description`) plus the prompt body. Cadence configuration is set via the Desktop app (one-time setup, see §13).
- **The session-reading layer** for loops that analyse Claude Code transcripts (distil and skill-suggest share this).
- **The writer/verifier sub-agent pattern** for any loop that proposes mutations beyond `.cortex/pulse/` (test-runner is the only v1 example, but the mechanism is general).

This shared infrastructure must be built before the loops on top of it. Implementation order (§16.2) reflects this.

### 11.6 What Cortex deliberately does not provide for loops

Cortex is loop-*memory*, not a loop runtime. Things Cortex does not ship:

- A scheduler. Claude Code's Desktop scheduled tasks handle that. `cortex init` writes SKILL.md files; Claude Code runs them.
- Sub-agent orchestration primitives. Cortex loops use Claude Code's existing skill and sub-agent mechanisms; we don't reinvent them.
- Connectors to GitHub, Slack, Linear, etc. Loops that need to *act* on external systems use MCP connectors the user installs separately.
- A loop-authoring DSL. Users who write their own loops write them as Claude Code skills, the same way Cortex's loops are written.
- Cloud scheduling integration. Routines (Anthropic's cloud-scheduled tasks) are Pro/Max only with daily run limits (5/15/25) and run on fresh clones with no local file access — not a fit for Cortex's memory model.

The deferred answer to "should Cortex ship more loops?" is: only when a recurring pattern emerges across multiple users' own loops. The thirteen shipped are the ones that maintain Cortex itself. Loops that do project work (CI triage, dependency review, deploy verification) belong to the user.

### 11.7 The scale claim

Cortex's value to a user scales with how many loops they're running. A user doing zero loops gets the session benefits (grounded answers, write-time enforcement, navigable knowledge). A user doing five loops gets persistence that compounds across runs. A user doing fifty gets a self-maintaining knowledge system where the loops curate each other's outputs.

The thirteen shipped loops are the floor of what Cortex maintains autonomously, not the ceiling.

---

## 12. The constellation

### 12.1 Framing

The dashboard is **proof of comprehension**, not observability. Anyone looking at it — a collaborator, a stakeholder, a future maintainer, the user themselves returning to a project after months away — can see: someone has understood this project, and the understanding is structured, navigable, and not in anyone's head where it disappears when they leave.

The metaphor is a **map**, not a dashboard. Zoom levels. Hierarchical. Same data, different scale.

Early-stage pitch: *"This is the map of the project as Cortex understands it so far. Zoom in to see how the parts connect."*

Mature-stage pitch: *"This constellation has 340 nodes across 6 levels. Every architectural layer, every decision, every convention, every spec — all navigable, traceable, and durable. When the people working on this project move on, the map remains."*

### 12.2 Node types

Nodes come from four sources, distinctly coloured:

- **Anatomy nodes** — significant files, sized by token estimate, coloured by architectural layer.
- **Cerebrum nodes** — rules, preferences, decisions.
- **Atlas nodes** — stakeholders, decisions, domain concepts, sources.
- **Spec nodes** — SpecFlow ACs.

Edges come from frontmatter cross-references. Edge stroke can carry semantic distinctions where they exist in the underlying data (e.g. dashed for `inferred:` or `unverified:` frontmatter flags on a cross-reference); design decision deferred to schema.

### 12.3 Hierarchical zoom

**Level 0 (galaxy):** Four nodes — Anatomy, Cerebrum, Atlas, Specs. Edges weighted by cross-reference count. Defer to v1.1.

**Level 1 (constellations):** Each module decomposes into natural groupings — architectural layers for anatomy, categories for cerebrum, subfolders for atlas, domain folders for specs. 15-25 constellation nodes total. Aggregated edges. **Default view for v1.**

**Level 2 (stars within constellations):** Click a constellation to expand. Real nodes appear with labels. Cross-boundary edges show ghost nodes (40% opacity, half size, directional hint) on the constellation edge.

**Level 3 (star detail):** Click an individual node. Right pane fills with markdown rendered from the underlying artefact.

**Level 4+ (recursive):** Atlas/decisions might subdivide by quarter; rules might subdivide by category. Depth is "however deep the data goes." Defer recursion beyond Level 3 until a real engagement needs it.

### 12.4 Zoom behaviour

Discrete level transitions triggered by clicking into a constellation. The zoom animation is *visual confirmation* of the level change, not the mechanism. Breadcrumb at top: `Project › Anatomy › API layer › payment-controller.ts`.

**Not** continuous zoom where nodes fade in/out based on viewport scale. That's what Gephi does and it's awful to use.

### 12.5 Five view presets

Same graph data, five server-side lenses (locked at spec time; each is a testable contract — "preset X returns the node set matching predicate Z"):

- **default** — everything visible. The stakeholder demo view.
- **anatomy-only** — structure view.
- **knowledge-only** — cerebrum + atlas + specs; no code.
- **orphans** — nodes with no connections in either direction; surfaces unmapped state honestly (§12.6).
- **domain** (parameterized) — all spec-tree nodes in a single domain.

### 12.6 What the constellation surfaces

- **Density.** Tight clusters = well-understood subsystems. Sparse regions = gaps.
- **Bridges.** Nodes connecting two clusters = architectural seams or institutional knowledge.
- **Orphans.** Anatomy nodes without spec/rule/atlas links = parts the freelancer doesn't yet have context for. **Honest about coverage.**
- **Provenance.** Every cerebrum rule and atlas claim traceable via edges to its source. Nothing invented.
- **Coverage counters.** Four numbers at the bottom growing over an engagement.

### 12.7 What the constellation is not

- Not a generic codebase graph viewer. There are existing tools for that (Graphify, Sourcegraph, IDE call hierarchies). The constellation is opinionated — it shows the multi-layer citation graph specific to Cortex, not raw code structure.
- Not a chat interface. Claude Code is the chat interface.
- Not a control panel. CLI stays source of truth. The constellation observes; it doesn't act.
- Not a marketing artefact. No animations, gradients, or "AI-powered" copy. Restraint is the credibility.

### 12.8 Technical approach

The constellation is a **read-only graph compiler + renderer** over `.cortex/`. Architecture:

1. `cortex scan` produces `.cortex/constellation.json` — the hierarchical tree of node groups plus edges.
2. `cortex constellation` opens a local Node server serving a single-page renderer.
3. Renderer uses **Cytoscape** with compound nodes for hierarchy. Parent nodes render as rounded rectangles around children when expanded, single node when collapsed. Native library support; no custom layout logic.
4. Browser does no graph computation — only rendering. All compilation in Core.

Optional v1.5: `cortex constellation --static` produces a self-contained HTML file with data inlined. Shareable as a standalone artefact — handover document, project archive, demonstration of comprehension.

---

## 13. The day-1 workflow

```bash
cd <project-repo>
cortex init
```

In order, on the user's machine only:

1. Check for existing `.cortex/`; bail if found unless `--force`.
2. Append the regenerable/sensitive/transient subpaths to `.gitignore` — `.cortex/anatomy/`, `.cortex/atlas/sources/`, and `.cortex/pulse/` — leaving `.cortex/cerebrum/`, `.cortex/atlas/` (minus `sources/`), and `.cortex/cortex.config.json` committable as durable project knowledge (see §14).
3. Create `.cortex/` skeleton, populating each module's `_index.md` from the schema's prompt templates — these are active prompts directing Claude how to read the module, not empty placeholders. Create empty `.cortex/pulse/` directory for transient artefacts. Create `.cortex/cerebrum/bugs/` directory for the bug ledger.
4. Install all 22 skills (11 `specflow-*` + 11 `cortex-*`) to the project's `.claude/skills/` directory. If any are already present, prompt before overwriting (preserves user customisations).
5. Run the native anatomy scanner (deterministic Core): list files, estimate tokens, parse imports/exports with tree-sitter, derive one-line purposes from doc comments where present (marking the rest `needs_purpose_refresh`). Emit `.cortex/anatomy/files.md`, `graph.json`, `layers.md`. The batched LLM purpose pass for the flagged files is run by the agentic anatomy-refresh Skill, not Core.
6. Inspect `package.json`, `tsconfig`, `.eslintrc`, `pyproject.toml`, `README.md` to draft `cerebrum/preferences.md`. Reviewed before any of it becomes a rule.
7. If spec trees are absent, scaffold them: empty `specs/_index.md`, empty `specs-business/` with placeholder `_overview.md`. If present, cross-link anatomy entries to specs via the `implements:` chain.
8. If a legacy SpecFlow `bugs.md` exists at the project root or in `specs/`, migrate it to `.cortex/cerebrum/bugs/` one-file-per-bug layout (one B-NNN file per bug entry, frontmatter carrying the seven-type classification). Leave the original in place with a deprecation header pointing at the new location until the next major version.
9. **Append the Cortex section to the project's CLAUDE.md**, using the schema's template. Substitutes project name and detected stack. Creates CLAUDE.md if absent.
10. Register the three core hooks (and the optional PreRead if enabled in config) in the project's `.claude/settings.json`. Merges if present.
11. Install the git post-commit hook (`cortex-loop-anatomy-refresh-fast`). Async, deterministic, sub-second.
12. **Write Desktop scheduled task definitions** to `~/.claude/scheduled-tasks/<task-name>/SKILL.md` for each scheduled loop: pulse-hygiene (daily), pulse-distil (weekly), skill-suggest (weekly), anatomy-refresh-deep (daily), rule-decay (weekly), atlas-staleness (monthly), onboarding-drift (monthly), spec-drift (daily), specflow-lint (daily), specflow-verify (daily), test-runner (daily for atomic+spec, weekly for journey), bug-triage (daily). Twelve scheduled tasks total (the thirteenth loop, anatomy-refresh-fast, is the git hook from step 11). Each SKILL.md is a `name`/`description` frontmatter plus a prompt that invokes the corresponding Cortex skill. The Desktop app picks them up automatically.
13. Print summary: files indexed, specs found, skills installed, preferences drafted, hooks registered, post-commit hook installed, scheduled tasks written, CLAUDE.md updated, bug ledger initialised (and migrated if applicable), atlas ready for ingest. Output also includes a one-line reminder: "Open Claude Code Desktop to confirm task cadences (the SKILL.md files are written; the Desktop app applies the defaults on first open)."

**Day-1 deliverable:** an oriented view of the codebase, starter cerebrum (preferences + empty bug ledger), spec trees scaffolded or cross-linked, empty atlas ready to be filled, active hooks, a CLAUDE.md directing Claude into Cortex from the next session forward, anatomy auto-refresh wired to commits, twelve scheduled tasks ready to fire from the Desktop app, and all 22 skills (`specflow-*` + `cortex-*`) installed and Cortex-aware. Footprint on the project repo: `.gitignore`, `.claude/settings.json`, `.claude/skills/`, CLAUDE.md, and `.git/hooks/post-commit` modifications. Footprint outside the repo: `~/.claude/scheduled-tasks/` entries (one per scheduled loop).

---

## 14. What gets committed and what doesn't

Default `.gitignore` additions written by `cortex init`:

```
.cortex/anatomy/        # working state, regenerable
.cortex/atlas/sources/  # may contain sensitive raw materials
.cortex/pulse/          # transient: hygiene reports, suggestions queue, timestamps
```

**Not** gitignored by default — committable as durable project knowledge for teams or collaborative projects:

```
.cortex/cerebrum/       # rules, decisions, preferences (the durable artefact)
.cortex/atlas/_index.md
.cortex/atlas/stakeholders/
.cortex/atlas/decisions/
.cortex/atlas/domain/
```

The split: regenerable working state stays local; durable project knowledge can be shared. Decided per-project whether to commit the cerebrum and atlas-but-not-sources.

---

## 15. The v1 surface

Locked scope. Everything else deferred.

**Cortex Core (Node.js, global install via npm):**
- CLI: `cortex init`, `cortex scan` (incremental and `--full`), `cortex status`, `cortex constellation`, `cortex test-run`, plus per-loop invocations: `cortex pulse-hygiene`, `cortex pulse-distil`, `cortex loop-anatomy-refresh` (with `--fast`/`--deep`), `cortex loop-rule-decay`, `cortex loop-atlas-staleness`, `cortex loop-onboarding-drift`, `cortex loop-spec-drift`, `cortex loop-test-coverage`, `cortex loop-test-runner`, `cortex loop-skill-suggest`. Plus the pulse review CLI: `cortex pulse-accept <id>`, `cortex pulse-reject <id>`, `cortex pulse-list`.
- Hooks: `SessionStart`, `PreToolUse` (Write/Edit), `PostToolUse` (Write/Edit), and the Read pair — `PreToolUse` (Read) + `PostToolUse` (Read) — on by default, opt-out via config.
- Git post-commit hook for `cortex-loop-anatomy-refresh-fast`.
- Constellation compiler producing `.cortex/constellation.json`.
- Constellation renderer (local Node server + Cytoscape SPA).
- CLAUDE.md template and `_index.md` prompt templates (written into the project by `init`).
- Native anatomy scanner (tree-sitter + LLM purpose-line pass).
- Desktop scheduled task registration for all scheduled loops — writes `~/.claude/scheduled-tasks/<task-name>/SKILL.md` files for the Desktop app to pick up. macOS only in v1.
- Shared writer/verifier sub-agent harness used by test-runner (and available to user-written loops).
- Session-reading layer used by distil and skill-suggest.
- Owns `.cortex/` schema.

**Skills (Claude Code skill bundles installed to `.claude/skills/`):**

Two namespaces. One product. All shipped as part of Cortex v1.

*specflow-\* skills (11, all already built — see §8.3):*
- `specflow-new-project`, `specflow-onboard-codebase`, `specflow-deep-onboard`, `specflow-change-router`, `specflow-spec-editor`, `specflow-tests`, `specflow-bugs`, `specflow-ingest`, `specflow-viewer`, `specflow-lint`, `specflow-develop`.
- All 11 are updated for Cortex-awareness as part of v1 (read anatomy, cerebrum, atlas before producing output).

*cortex-\* skills (new in v1):*
- `cortex-ingest` — atlas source → atlas entries (sibling to `specflow-ingest`; specifically handles non-spec sources like call transcripts and RFPs).
- `cortex-pulse-hygiene` — `pulse/hygiene-report.md`.
- `cortex-pulse-distil` — `pulse/suggestions.md`.
- `cortex-loop-anatomy-refresh` (fast + deep tiers) — anatomy updates.
- `cortex-loop-rule-decay` — `pulse/rule-candidates.md`.
- `cortex-loop-atlas-staleness` — `pulse/atlas-review.md`.
- `cortex-loop-onboarding-drift` — `pulse/scaffolding-review.md`.
- `cortex-loop-spec-drift` — `pulse/spec-drift.md`.
- `cortex-loop-test-runner` — `pulse/test-failures.md` and PR branches for fixable failures.
- `cortex-loop-skill-suggest` — `pulse/skill-suggestions.md`.
- `cortex-loop-bug-triage` — invokes `specflow-bugs` on open bugs, surfaces triage to `pulse/bug-triage.md`.

**All Cortex skills are loop-invokable.** Every skill is designed to be invoked by a scheduler (Desktop scheduled task) with stable arguments and to produce structured output. Users writing their own loops can call Cortex skills directly.

**Modules under `.cortex/`:**
- `anatomy/` — from the native scanner.
- `cerebrum/` — rules, preferences, decisions, environment, and the bug ledger (`bugs/`).
- `atlas/` — stakeholders, decisions, domain, sources.
- `pulse/` — transient process artefacts (loop outputs, suggestions queue, dismissed-suggestions memory, timestamps). Gitignored by default.

**Plus the SpecFlow trees under the project root:**
- `specs/` — dev specs.
- `specs-business/` — business specs.
- `tests/` — atomic / spec / journey / scenario test layers.

**Cross-cutting:**
- Every artefact carries YAML frontmatter conforming to `cortex-schema.md`.
- Every directory has an `_index.md` that is an active prompt, not a passive index.
- CLAUDE.md contains a Cortex section directing Claude to the data.

Roughly 15 CLI commands. Three core hooks plus one optional, plus the git post-commit hook. **Twenty-two skills total** (11 SpecFlow + 11 Cortex). Three durable modules plus one transient under `.cortex/`, plus the two SpecFlow spec trees and the test tree. Native anatomy. Self-maintenance via thirteen loops covering Pulse, anatomy, curation, verification, skill discovery, and bug triage. Larger than earlier in this doc; reflects the unified product.

---

## 16. Build plan

### 16.1 Phases

**Phase 1 — `cortex-schema.md`.** Pure design work, no code. Locks file formats, frontmatter conventions, directory shapes, hook payload contracts, schema versioning. Both Core and Skills depend on it. Reviewed carefully before anything else proceeds.

**Phase 2 — SpecFlow specs for v1.** Given/When/Then ACs across the four SpecFlow tiers (atomic / spec / journey / scenario), traceability headers, `covers:` lists ensuring every business spec appears in at least one scenario. First real test of whether SpecFlow scales to a system this size.

**Phase 3 — Implementation, one spec at a time, in dependency order.** Each piece reviewed before the next begins.

### 16.2 Implementation order (as shipped)

Sequenced to build shared infrastructure before the loops that depend on it. SpecFlow's 11 skills already existed and ran — their v1 work was the Cortex-awareness pass (step 30), not net-new implementation. **All thirty steps below shipped; annotations record what each became in the running system where it differs from the plan.** Actual ship order occasionally diverged from the numbering — the five curation loops (17, 20–22, 25) shipped before the anatomy-refresh pair (15–16), which was deliberately re-prioritised as the load-bearing freshness mechanism; the SpecFlow-shaped loops (23, 24, 26) shipped after read-time capture (27) rather than before. The numbering is preserved as the dependency order it always was.

**Foundation:**
1. Schema validator — as planned; 24-check catalogue (schema Appendix A), `ValidationReport` per §6.1, exposed as `cortex validate` (grown in step 8's round for the agentic layer).
2. CLAUDE.md and `_index.md` prompt templates — shipped inside step 4's round (`src/cli/templates.ts`), not standalone; validated by `check.index-shape`/`check.claude-md`.
3. Native anatomy scanner — as planned, with one architectural correction locked at spec time: Core never runs the LLM purpose pass (§3.1 wins); docstring-first extraction is deterministic, everything else is flagged `needs_purpose_refresh` for the deep tier. tree-sitter shipped as WASM (`web-tree-sitter` + prebuilt grammars: TS/TSX/JS/Python/Rust/Go).
4. `cortex init` — as planned plus two grown capabilities: `--partial` (registers only tasks whose skills are present — how Cortex bootstrapped itself while its own loops were unbuilt) and exit code 3 ("complete but unauthenticated") distinguishing auth failure from degradation in the inline purpose pass.
5. The core hooks — shipped as the planned three (`SessionStart`, `PreWrite`, `PostWrite`), grew to five in step 27. PreWrite's enforcement split (predicate-bearing rules warn only when the predicate fires; predicateless warn on path match) emerged during first-round dogfooding as ledger B-001 (type: wrong-rule) — Rule 4 as written treated path-match alone as sufficient, contradicting the "warn on relevant case" business rule. Fixed in the same round the constellation compiler shipped. See §5.
6. Constellation compiler — as planned; citation-graph edges only (imports deliberately excluded per §12.7), `_index.md`/`_overview.md` files are scaffolding, not nodes.
7. Constellation renderer — as planned structurally; the three view presets became five server-side lenses (§12.5), each a testable contract.
8. `cortex-ingest` skill — as planned; first shipped agentic bundle, activated init's skills-install path; the `cortex validate` CLI rode along as the agentic layer's first shared command.

**Shared loop infrastructure (built once, used by every loop):**
9. Pulse review CLI — as planned, then grown in the distil round into the single gate for ALL proposal sections: one global S-namespace (counter file), discovery across every `pulse/*.md`, provenance-mandatory sections, target roots covering cerebrum plus new-skill files (schema §4.5).
10. Session-reading layer — as planned; resolved design question 9 empirically (global storage, project-slug directories, JSONL) — distil and skill-suggest stayed in v1.
11. Writer/verifier harness — as planned plus two hardenings: crash-recovery sweep for orphaned worktrees (ledger B-002) and `writerOutputs` audit capture (needed by the test-runner's PR contract; never fed to the verifier — independence intact).
12. Desktop scheduled task SKILL.md writer — shipped inside step 4's round; made project-scoped by step 28.
13. Git post-commit hook — installed by step 4; its command (`cortex anatomy-refresh-fast`) shipped with step 15; the global `cortex` binary gap (hook silently no-oping) was found and fixed in that round.
14. Bug ledger migration — shipped inside step 4 (init Rule 9); the awareness pass (step 30) completed the other §8.5 migrations at the skill-instruction level.

**The thirteen loops, in dependency order:**
15. `cortex-loop-anatomy-refresh-fast` — as planned (commit-scoped rows + edges, atomic `last_seen` writes as the hygiene-coordination pin); deliberately re-prioritised ahead of its numbered position: the load-bearing freshness loop.
16. `cortex-loop-anatomy-refresh-deep` — as planned; also the Skill init's inline pass invokes, closing the day-1 complete-purposes promise end-to-end.
17. `cortex-pulse-hygiene` — deterministic checks shipped; the one designed LLM check (mid-conversation drop-off detection) deferred to the skill layer, stated in the report footer. SessionStart integration as planned (reads, never re-runs).
18. `cortex-pulse-distil` — as planned, with the deterministic-bookends shape that became the loop idiom: Core collects and proposes; judgment runs in-session for scheduled skills (no nested subprocesses) or headless for the manual CLI.
19. `cortex-loop-skill-suggest` — as planned; shares distil's corpus; accepted proposals create new skill files through the pulse gate.
20. `cortex-loop-rule-decay` — as planned minus the "violated recently" signal (needs violation telemetry that doesn't exist yet; documented in the report footer).
21. `cortex-loop-atlas-staleness` — as planned.
22. `cortex-loop-onboarding-drift` — as planned, reusing the validator's index checks rather than reimplementing.
23. `specflow-lint` (scheduled) — shipped as a scheduling wrapper plus a thin deterministic CLI over the validator, NOT a new implementation — worth naming: the "loop" is cadence plus paper trail; the judgment stays in the interactive skill.
24. `specflow-verify` (scheduled) — same wrapper shape; this is where the §8.2 covers-completeness constraint is mechanically owned (schema Decision 4), with declared deferrals distinguished from genuine gaps.
25. `cortex-loop-spec-drift` — as planned; git-date comparison with a 14-day grace window.
26. `cortex-loop-bug-triage` — as planned with one reconciliation the design forced: §11.4 said "update the bug's frontmatter", §11.3 forbids cerebrum writes. Resolution: fill-only on absent classification fields, never overwrite, divergence surfaced in the report. This is the second loop granted an exception to §11.3's cerebrum-write prohibition (the first being test-runner's PR path), with the same "narrow, principled, reported" discipline governing both.
27. Read-time purpose capture — **grown step, first-class.** PreRead promoted from "optional, ship last" to core opt-out, plus the new PostRead writeback hook and `purpose_source` provenance (schema §4.1). **Decision and rationale:** the original plan treated PreRead purely as a token-saving device (hence optional); reading turned out to be the highest-signal moment for anatomy — Claude is already forming an understanding — so the old "optional PreRead" final-touch step was merged into this one as the injection half of refine-during-use, and the fourth freshness tier (§7.2) was born. The old step 29 was deleted, not deferred.
28. Scheduled-task project scoping — **grown step, first-class.** `~/.claude/scheduled-tasks/` is one namespace per user; the second project to adopt Cortex would have collided with the first. `<project-slug>-<path-hash6>-<canonical-task-name>` naming (schema §9.1), project-scoped recognition in init/`--partial`, and the `cortex tasks rename` migration. Surfaced as a real blocker the day multi-project adoption became imminent; fixed before it, not after.
29. `cortex-loop-test-runner` — as planned on the harness, with three contracts locked at spec time: budget exhaustion files a ledger case-file whose open status IS the retry suppression; every PR carries the five-field context body; classification defers entirely to the seven-type taxonomy, with not-one-of-the-seven reported and never force-fitted.

**Final touches:**
30. Cortex-awareness pass over all 11 SpecFlow skills — as planned, at three calibrated depths (deep: develop/tests/change-router; moderate: the onboarding/ingest/authoring set; light: viewer/lint/bugs), plus the §8.5 output-home migrations at the instruction level and packaging of all eleven bundles — completing §13 step 4's "all 22 skills".

**As-shipped retrospective.** Original estimate: closer to two months than two weeks. Actual: roughly a dozen review-gated rounds over 2026-06-30 → 2026-07-03. Built spec-first with agent implementation under human review, with the spec-per-piece discipline (§16.3) intact throughout: every step was specced, implemented, independently verified, and dogfooded on this repository before the next began. Three defects were caught by the system's own mechanisms during the build and resolved through the ledger (B-001–B-003) — the dogfooding thesis (§16.4) held.

The step list captures the shipped code; it does not capture the encoded discipline. Over the course of the build, `.cortex/cerebrum/` accumulated substrate that wasn't in the original §16.2 — `standing-authorities.md`, preferences for coordinated-change sequencing, always-write empty-state conventions, the ride-along threshold refinement, the extraction-shared-source-of-truth preference. These emerged from patterns that repeated across rounds and were captured so future work inherits them rather than re-deriving. They belong in cerebrum (already there) and in this doc's discussion of process (§16.3 or the reconciliation-pass write-up). Item (6) of the reconciliation covers them explicitly.

"v1.0 internal means everything in the implementation order is built and working on your own projects" — reached 2026-07-03.

### 16.3 What is explicitly not the build process

**Not:** "Claude, here are full specs for Cortex, build it." That produces a system understood only at the spec level, with implementation choices made silently along the way that surface later as bugs.

**Yes:** slower, spec-per-piece, review-each-step. Produces a Cortex the author actually owns and understands.

A process preference that earned its place during the build (encoded in `cerebrum/preferences.md`): coordinated writer+parser+schema changes ship as an explicitly sequenced set — schema first, then parser, then writer, then a round-trip regression — never in parallel. Half-shipped coordinated changes break existing artefacts silently; the fence-grammar fix (B-003) was the first exercise.

### 16.4 Dogfooding

Cortex is built using SpecFlow on itself. If SpecFlow can't be used to build Cortex, that's a signal SpecFlow needs work before it can be used on serious projects. The build process is also a SpecFlow validation.

---

## 17. Open questions from the design review — dispositions

These nineteen questions were posed before the schema was drafted. All were answered during the build — most by explicit decision at a review gate, several by the running system settling them empirically. Recorded here with rationale; none remain open in v1 except the two explicitly moved to `post-v1-considerations.md`.

1. **Renderer choice** — RESOLVED: Cytoscape, as recommended; compound nodes carried the hierarchy with zero custom layout code (§12.8).

2. **Constellation Level 0 (galaxy view)** — DEFERRED TO v1.1, unchanged from the lean. The Level-1 default proved sufficient for v1's audiences.

3. **init modifying `.claude/settings.json`** — RESOLVED: acceptable. Shipped with merge-never-clobber discipline (unrelated keys preserved, `check.hook-config` validates the result); no footprint complaints in practice.

4. **Cerebrum gitignored by default?** — RESOLVED: committable (schema Decision 1 — §14's split won over §13's blanket ignore). The Cortex repo itself commits its cerebrum, including the bug ledger.

5. **CLAUDE.md as primary scaffolding** — RESOLVED: acceptable and load-bearing. The managed marker block (`<!-- cortex:start -->…<!-- cortex:end -->`) made the footprint idempotent and reversible, which defused the invasiveness concern.

6. **PreRead default state** — RESOLVED, then SUPERSEDED: the question assumed PreRead was a token-saving device. Read-time capture (§16.2 step 27) reframed it as half of refine-during-use; the pair ships **on by default**, opt-out via `hooks.preRead`.

7. **`_index.md` token budget: binding or advisory?** — RESOLVED: advisory-with-teeth. `check.index-shape` emits a warning (never an error) over 300 tokens; the onboarding-drift loop re-surfaces persistent violations monthly.

8. **Scanner LLM purpose-line cost** — RESOLVED: the proposed alternative won outright. Docstring-first extraction is deterministic Core; the LLM pass touches only files without usable doc comments, and only when changed (§7.2 step 4).

9. **Session transcript access** — RESOLVED EMPIRICALLY: case two — global storage at `~/.claude/projects/<slug>/<session-id>.jsonl`. Distil and skill-suggest stayed in v1; the session-reading layer is deliberately tolerant of format drift (§10.7).

10. **Distil threshold N=3** — CONFIRMED: shipped as `pulse.distilThresholdN` (config, default 3). No tuning pressure observed yet.

11. **Scheduled task cadence metadata location** — RESOLVED BY DECISION, residual unverified: v1 takes the conservative path (write SKILL.md; cadence confirmed in the Desktop UI on first open). Hypothesis (a) — a sibling config file — was never UI-tested; if it proves true, a MINOR schema addition covers it.

12. **Rejection memory window** — CONFIRMED: 90 days, `pulse.dismissedWindowDays`. `cortex pulse-reset-dismissed` did not ship; resetting is a manual edit of `dismissed.md` (acceptable at current volumes; a command remains a v1.x nicety).

13. **Test-runner PR authorship** — RESOLVED: the user's own `gh` auth, with the PR body stating its automated origin. No bot account, no co-author trailer; the five-field body carries the provenance that matters (§11.4 item 11).

14. **Test-runner fix budget** — CONFIRMED: default 3, shipped as first-class config (`harness.maxIterations`) with per-invocation override precedence — a property of the harness, not the test-runner, so every future code-mutating loop inherits it.

15. **Anatomy-refresh-fast scope** — RESOLVED: runs on all commits. The deterministic checks proved cheap enough that skip-lists weren't worth their complexity; `.gitignore`/`anatomy.exclude` filtering applies as everywhere else.

16. **Skill-suggest output target** — RESOLVED: the proposal's own `Target:` names the destination (project-local by default, chosen by the drafting judgment); the human can edit the target before accepting. New files only — accept never overwrites a skill.

17. **Loop concurrency** — MOVED TO POST-V1: no lock files shipped. The always-write convention makes a same-loop double-fire last-writer-wins on a transient report — accepted risk at v1 scale, recorded in `post-v1-considerations.md`.

18. **`update_scheduled_task` self-adapting cadence** — MOVED TO POST-V1, unchanged: no v1 loop uses it; recorded as the v1.x candidate it always was.

19. **Bug-triage interactivity** — RESOLVED: the conservative path, made precise by the fill-only reconciliation (§11.4 item 13): classify-and-report, absent fields filled, human judgment never overwritten, no draft spec changes produced by the loop.

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Cortex Core** | The Node.js binary. Deterministic. Owns `.cortex/` schema. |
| **Cortex Skills** | The Claude Code plugin. Agentic. Sibling to SpecFlow. |
| **anatomy** | The code-structure module under `.cortex/`. |
| **cerebrum** | The rules/decisions/conventions module under `.cortex/`. |
| **atlas** | The project-knowledge module under `.cortex/`. |
| **pulse** | Originally the self-maintenance process (Hygiene + Distil). Now part of the wider loop family in §11. `.cortex/pulse/` is the transient directory where every loop writes its proposals. |
| **loop** | Autonomous Claude Code work — scheduled or event-triggered invocation that runs without a human in the room. Six structural elements (goal, scheduler, skills, connectors, sub-agents, memory). See §11. |
| **Cortex loop** | A loop that maintains `.cortex/` integrity, writes only to `.cortex/pulse/`, uses the standard skill format, and composes with other loops. Thirteen shipped in v1. |
| **Desktop scheduled task** | Claude Code's native persistent scheduling mechanism. Stored as `~/.claude/scheduled-tasks/<task-name>/SKILL.md`. Fires while the Desktop app is open and the machine is awake; catches up missed runs on resume. macOS and Windows only. |
| **writer/verifier split** | Architectural pattern where the agent producing output is not the agent grading it. Required for any loop that writes beyond `.cortex/pulse/` (test-runner is the v1 example). |
| **SpecFlow tiers** | Four-tier test taxonomy: atomic (one AC, mocked), spec (full leaf spec sequenced), journey (one business spec end-to-end against real infra), scenario (multiple business specs in full sandbox). Every business spec must appear in at least one scenario's `covers:` list. |
| **seven-type bug taxonomy** | SpecFlow's classification: missing criterion, incomplete rule, wrong rule, missing dev spec, missing business spec, drift between layers, correct spec but wrong/missing test. See §2. |
| **two spec trees** | `specs/` (dev specs, implementation contract) and `specs-business/` (business specs, user-outcome layer). Linked via `implements:` (single value) and `implemented_by:` (list). |
| **bug ledger** | The unified bug store at `.cortex/cerebrum/bugs/`. One markdown file per bug, frontmatter-classified against the seven-type taxonomy. Replaces SpecFlow's legacy `bugs.md`. |
| **specflow-\* namespace** | Skills handling spec-and-test discipline. 11 skills, all built. Part of Cortex v1. |
| **cortex-\* namespace** | Skills handling persistence and loops (atlas, anatomy bookkeeping, pulse, the 13 loops). New in Cortex v1. |
| **citation graph** | The implicit graph formed by frontmatter cross-references. What Claude navigates. |
| **constellation** | The hierarchical visualisation of the citation graph + anatomy graph. What humans navigate. |
| **Graphify** | External tool, optional v2 enhancement for users wanting an MCP server or wiki export. Not part of v1. |
| **SpecFlow** | The spec-driven test methodology that is now part of Cortex (one of two skill namespaces). Eleven existing skills, two spec trees, four test layers, seven-type bug taxonomy. See §8. |
| **schema** | The contract in `cortex-schema.md` defining file formats and conventions for all of `.cortex/`, `specs/`, `specs-business/`, and `tests/`. |

---

## 19. Decisions deliberately deferred

- Open-source license and timing. Use privately on three projects first.
- Multi-platform support beyond Claude Code (Codex, Cursor, etc.). Cortex's hook layer is Claude-Code-specific; ports would require equivalent lifecycle mechanisms in other tools.
- Cortex-to-Cortex sharing (template projects, cross-project rule libraries). Possible but not v1.
- Dashboard auth or remote viewing. Currently localhost-only.
- Metrics, telemetry, anonymous usage tracking. None.
- A Cortex MCP server exposing Cortex queries to other tools. Not in v1; if a user opts into the optional Graphify enhancement (§7.5), Graphify's MCP server covers anatomy queries.

---

**End of design document.**

Next artefact: `cortex-schema.md` — the contract document that locks file formats. Drafted in collaboration with Claude once the design above is reviewed and signed off.
