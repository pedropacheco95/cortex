# Cortex — presentation brief

*For the agent preparing the "Claude and Claude Code" talk. Cortex is one segment of that talk: a concrete, shipped example of what you can build on top of Claude Code. Written 2026-09-17. For the long-form version see `presentation.md` (schema 3.0 era, still accurate on architecture); for exact contracts see `cortex-schema.md`.*

## The one-line pitch

Every Claude Code session starts cold. Cortex gives Claude a persistent, queryable, self-refreshing understanding of a codebase, so it behaves like it already knows the code, even a codebase you have never worked in yourself.

## Facts to get right

| | |
|---|---|
| What it is | Global Node.js CLI (`cortex`) + a set of Claude Code skill bundles |
| Install | `npm i -g @pedropacheco95/cortex` (Node >= 20) |
| Status | v1.0 shipped, schema 3.4, macOS only for now |
| Author | Pedro Pacheco, solo, built with Claude Code |
| Size | ~30k lines of TypeScript in `src/`, ~150 test files, ~114 commits since 2026-07-02 |
| Repo | github.com/pedropacheco95/cortex |

## The problem it solves (slide 1)

Claude reads files, reconstructs context, pattern-matches to how codebases *usually* work, then forgets it all when the session ends. On your own code that is a tax. On a client's or legacy codebase it is the difference between grounded work and confident guessing.

Existing tools each solve a slice: structural indexers (tree-sitter, ctags) parse and stop; one-shot LLM extractors go deep but rot the moment the code moves. Neither is built with Claude as the primary user, and neither survives across sessions.

## The design in three ideas (slides 2-4)

**1. Two layers, one contract.**
Cortex Core is a deterministic TypeScript binary: file I/O, schema validation, CLI, git hooks, queries. It never calls an LLM. Skills are Claude Code skill bundles that do all the LLM work: extraction, judgement, proposals. The versioned `cortex-schema.md` is the contract between them. The split means a git hook can never hang on a model call, tests are reproducible, and cost is bounded.

**2. Gated vs. ungated knowledge.**
Everything lands in `.cortex/` in five modules:
- `compass` — rules, conventions, bug ledger (what the project *must* do)
- `atlas` — stakeholders, decisions, domain terms, evidence (the *why*)
- `archive` — ingested source docs (client specs, transcripts, contracts) and their extractions
- `insight` — inferred per-file understanding + a cross-file concept graph (the flagship)
- `pulse` — transient loop output, sessions, open threads, proposals (machine-owned)

Compass, atlas and the spec trees are **gated**: nothing lands without a human approving it. Insight is **ungated**: inferred, lands directly. Where they disagree, the gated layer wins. Insight is context, never authority.

**3. Loops propose, they never mutate.**
Five scheduled bundles (registered with Claude Code Desktop's scheduled tasks) keep Cortex fresh: daily hygiene + insight refresh + session observation; weekly curation on Opus (distils your sessions into rule and skill candidates); weekly quality (spec lint, full graph regeneration); an isolated test-runner; a monthly review. Anything a loop wants to change in a gated layer becomes a typed suggestion in the pulse gate. You review with `cortex pulse-list` / `pulse-accept` / `pulse-reject`. Rejections are remembered.

## Insight, the flagship (slide 5)

Extraction runs at four levels: L1 structural (tree-sitter, no LLM), L2 purpose (one grounded paragraph per file), L3 deep (main players with line ranges, quirks, file maps for central files), L4 cross-file concept graph (concepts, edges with evidence, clusters, no embeddings, so every inference is explainable). It runs as a plan with parallel sub-agents and a unification pass, resumable from checkpoints.

Querying is instant and LLM-free:

```
cortex insight file src/auth/session.ts
cortex insight concept authentication
cortex insight element validateToken
```

In-session, Claude answers "how does auth work here?" using those same primitives. A managed CLAUDE.md block teaches the discipline: query insight to understand a file, read the file only when you need exact syntax to change it.

## SpecFlow, the spec-and-test lineage (slide 6, give it two or three slides if there is time)

SpecFlow is the development discipline Cortex absorbed. Cortex answers "what does Claude know about this codebase?"; SpecFlow answers "how does Claude change it without going off the rails?". The two ship together as one skill bundle.

### The rule

**Specs are the source of truth. Code is an artifact.** Humans review specs, not code. Every change starts at the spec level, and the tests are generated from the specs, so the code is verified against what was agreed rather than against what the agent happened to write.

### Two spec trees, linked both ways

Under `.specflow/` there are two parallel trees for two audiences:

| Tree | Audience | Contains |
|---|---|---|
| `specs-business/` | stakeholders, PMs, clients | the outcome, who it is for, the user journey, business rules, success metrics. No schemas, no APIs. |
| `specs/` | engineers and the agent | intent, entities (reads/writes/creates), numbered rules, dependencies, Given/When/Then acceptance criteria, `governs:` globs naming the source files the spec owns |

Every developer spec carries `implements:` pointing at exactly one business spec. Every business spec carries `implemented_by:` listing its developer specs. If a dev change invalidates the business promise, the business spec is updated in the same change. Drift between the trees is filed as a bug. Every folder in both trees has an `_overview.md` saying what the group is and why it exists, so a newcomer or a fresh agent can navigate without reading leaves.

Cortex's own tree today: 78 developer specs and 32 business specs, every feature in the CLI traced up to the outcome it serves.

### Four test layers

Every acceptance criterion becomes a test case. Tests are organised by what they prove:

1. **Atomic**: one per Given/When/Then, mocked.
2. **Spec**: one per developer spec, an integrated slice.
3. **Journey**: one per business spec, real infrastructure.
4. **Scenario**: full sandbox, end to end.

The testing skill has its own iron law: no test enters the suite until it has been watched failing for the right reason. A test that has only ever been seen passing is not evidence. Generation and verification are done by separate agents, and "blind reader" sub-agents review tests with no access to the specs so they cannot rationalise a weak assertion.

### The skill chain in a Claude Code session

Every request in a spec-managed project goes through an entry gate first, then a process skill, then an implementation skill:

- **`specflow-entry`** classifies every prompt into one of nine categories (standalone, bug, spec change, new feature, spec gap, exploration, ambiguous, drift between layers, unmapped spec), decides which tree it touches, and routes it. It does no work itself. Saying "no skill applies" is a valid answer; arriving there silently is not.
- **`specflow-brainstorm`** turns "I want to add X" into an agreed design that lands as a spec. One question at a time, two or three real approaches with a recommendation, and no implementation code until the spec exists. It first checks what the project already decided: neighbouring specs, atlas decisions, compass rules, and the insight entries for the files it would touch.
- **`specflow-plan`** turns the agreed spec into a plan file a fresh agent could execute blind: exact paths, the criterion each task satisfies, the command that verifies it. It writes no code.
- **`specflow-tests`** generates the four layers from the specs and folds compass rule predicates in as executed assertions.
- **`specflow-develop`** executes the plan test-first, at any scope (slice, domain, single spec), delegating to sub-agents and verifying them by running their tests, never by reading their code. Two stop rules: an untested edge case gets coded and logged, never blocked on; a reviewer-found defect that survives five fix rounds stops the work as blocked rather than shipping broken.
- **`specflow-request-review` / `specflow-receive-review`** review a task diff for craft anchored to its plan task and criterion (correctness belongs to the tests), and verify incoming feedback before applying it.
- **`specflow-bugs`** diagnoses to root cause and files the bug into the compass ledger so the nightly triage loop sees it.
- **`specflow-intent-reconcile`** pins a specific ask said in passing ("never log the token") with a verbatim failing anchor test, then checks later that the generalised spec would still fail without it. This catches the silent loss that happens when a spec generalises.
- **`specflow-ingest`** reconciles a client document against the specs. **`specflow-lint`** checks tree structure. **`specflow-onboard-codebase`** reverse-engineers specs from existing code. **`specflow-new-project`** builds both trees from scratch before any code exists.
- **`verification-before-completion`** is the last gate: no claim of "done", "fixed" or "passing" without fresh evidence from after the last edit, or the claim is narrowed to what was actually verified.

### The hardening pattern

Every skill opens with an Iron Law in capitals and a rationalisation table: the excuses an agent produces to skip the gate ("this one is too simple to need a spec", "I already know which skill this is") paired with why each is wrong. The skills are written against how models actually fail, not against how a process document imagines they behave. This is a good slide on its own for a Claude Code audience.

### Why it matters for the talk

- It is the discipline layer that makes an autonomous agent safe to leave alone: it cannot implement without a spec, cannot skip a test, and cannot change a spec without the human approving it.
- Cortex feeds it: brainstorm, plan and develop all query insight for the files they touch and check compass rules and atlas decisions before proposing anything. Knowledge and process are one system.
- Cortex itself was built this way. Its build order, every feature and every schema revision went through brainstorm, spec, plan, tests, develop. The repo is the proof.

## How it plugs into Claude Code (slide 7, the part the audience cares about)

This is a showcase of the Claude Code extension surface:

- **Skills** for every agentic step: extract, ingest, run a loop, and the whole SpecFlow chain above (about twenty skill bundles in total).
- **Hooks** at SessionStart, PreToolUse (Read, Write, Grep/Bash), PostToolUse, UserPromptSubmit, Stop and SessionEnd. All are pure Node file I/O, no network, warn-never-block, with hard token budgets (a SessionStart pointer under 100 tokens, a read summary under 50).
- **Recall (schema 3.4, the newest work):** SessionEnd writes a session record and opens "threads" for unanswered questions. A compiled recall index lets hooks annotate a Read or a search with "Decided: … · Evidence: … · Open: T-004" in one line, and the prompt hook resurfaces an open question from your last session. Claude picks up where you left off instead of re-asking.
- **Read-deferral experiment (on since 2026-09-16):** for large source files with a rich insight entry, the first Read is replaced by a 250-token summary. A second Read proceeds normally. Being measured now.
- **Scheduled tasks** in Claude Code Desktop for the maintenance loops.
- **Provenance:** every rule and spec carries `derives_from:` pointing at a source doc, session or decision, so the knowledge layer is an auditable citation graph and superseded sources flag downstream drift.

## Talking points and honest caveats

- Cortex is itself built and maintained with Cortex: its own `.cortex/` is live, its loops run nightly, and design decisions live in atlas. Good "eating your own dog food" story.
- It is young. Rough edges outside documented paths. macOS only because Desktop scheduled tasks are macOS/Windows only and v1 could not afford two backends.
- Registering the loops must happen from inside a Claude Code Desktop session; the CLI cannot do it headlessly.
- The strongest demo: drop into an unfamiliar repo, run the extraction skill, then ask Claude an architecture question and watch it answer from insight instead of grepping. See `onboarding.md`.

## Suggested slide order

1. The cold-start problem
2. Two layers, one contract
3. The five modules, gated vs. ungated
4. Insight: four levels, three queries
5. Loops propose, never mutate
6. SpecFlow: specs are the source of truth, four test layers
7. How it rides on Claude Code: skills, hooks, recall, scheduled tasks
8. Demo or screenshot, then caveats
