# Cortex

**Every Claude Code session starts cold.** Claude reads files, reconstructs context, pattern-matches to how codebases *usually* work, and forgets it all when the session ends. Cortex fixes that: it builds a persistent, queryable, actively-refreshed understanding of your codebase — per-file purpose, deep insights, a cross-file concept graph — so Claude behaves like it already knows the code, even a codebase you've never worked in yourself.

It's a globally-installed CLI plus a set of Claude Code skill bundles. The CLI (Cortex Core) is deterministic TypeScript that never calls an LLM; the skills do the actual understanding.

## Status

- **v1.0**, shipped, schema 3.0.
- **macOS only.** Cortex's scheduled self-maintenance loops depend on Claude Code Desktop's local scheduled tasks, which are macOS/Windows-only; v1 doesn't support two scheduling backends. Windows is a v1.1 candidate.
- **Requires Claude Code** (CLI and/or Desktop). Cortex is built to be used *from* a Claude Code session — the extraction, querying-in-natural-language, and self-maintenance loops all run there.
- **Requires Node.js >= 20.**

This is a real, working system, not a toy — but it's young. Expect rough edges outside the paths this README documents.

## Install

```bash
npm i -g @pedropacheco95/cortex
```

(the unscoped name `cortex` was already taken on npm). If you use pnpm:

```bash
pnpm add -g @pedropacheco95/cortex
```

Either way you get a `cortex` binary on your `PATH`.

## Quick start

Run these inside the project you want Cortex to understand.

```bash
# 1. Scaffold .cortex/ — five modules, managed CLAUDE.md block, hooks, gitignore.
cortex init

# 2. Check it landed cleanly.
cortex validate .
```

`cortex init` only scaffolds an *empty* insight module — it never runs LLM extraction itself (Core makes no LLM calls, ever). To actually build the understanding layer, open the project in a **Claude Code session** and say:

> **"run the initial extraction"**

That invokes the `cortex-extract-insight` skill: a deterministic structural pass, then a scope plan, then parallel per-file extraction, then a cross-file unification pass. It's resumable if interrupted.

Once it's done, query it — no LLM at query time, so these are instant:

```bash
cortex insight file src/auth/session.ts     # the rich per-file entry
cortex insight concept authentication       # files touching a concept + related concepts
cortex insight element validateToken        # a function/class/constant, with connections
```

Add `--json` to any of them for structured output. Or just ask Claude in-session — *"how does auth work here?"* — and it uses these same primitives to gather context and reason over it.

`cortex init` also prints a one-time instruction to register Cortex's scheduled self-maintenance loops — that step needs a Claude Code Desktop session and can't run headlessly (see [How it stays fresh](#how-it-stays-fresh) below). It's easy to miss if you don't read the summary output, so don't skip it.

For the full walkthrough — including "drop into an unfamiliar codebase and understand it," Cortex's flagship use case — see [`onboarding.md`](./onboarding.md).

## What it gives you

Everything lands under `.cortex/` in your project, organized into five modules:

- **atlas** — reference knowledge: stakeholders, decisions, domain terms. The "why" behind the project.
- **compass** — enforceable rules, conventions, and a bug ledger. What the project *must* do.
- **archive** — ingested source documents (client specs, transcripts, contracts) and what was extracted from them.
- **insight** — the flagship: inferred per-file understanding, a concept graph, cluster assignments. Queried via `cortex insight`.
- **pulse** — transient loop output and working state. Machine-owned; never hand-edit it.

## Gated vs. ungated

The idea most worth understanding before you use Cortex: **compass, atlas, and the two spec trees are gated** — nothing lands there without a human approving it. **Insight is ungated** — it's inferred and lands directly, no review step. Where the two disagree, the gated layer always wins: insight is context for Claude to consult, never authority it can cite instead of a rule or a spec.

## Command reference

| Command | What it does |
|---|---|
| `cortex init [path]` | Scaffold `.cortex/` in a project (five modules, CLAUDE.md block, hooks, gitignore, scheduled-task payloads). Refuses if `.cortex/` already exists (use `sync` or `--force`). |
| `cortex sync [path]` | Repair/upgrade an *existing* Cortex project — merges and appends, never clobbers curated content. |
| `cortex validate [path] [--json]` | Check the project's conformance to the schema. |
| `cortex scan` | (Re)compile the read-only citation graph to `.cortex/constellation.json`. |
| `cortex constellation [--port N]` | Serve a read-only visual map of the project on localhost (prints the URL; never auto-opens). |
| `cortex insight file <path> [--json]` | The rich per-file understanding entry. |
| `cortex insight concept <name> [--json]` | Which files touch a concept, how, and related concepts. |
| `cortex insight element <query> [--json]` | A function/class/constant, with its connections. |
| `cortex pulse-list` | List pending loop proposals awaiting your review. |
| `cortex pulse-accept <id>` | Apply a proposal to the gated layer it targets. |
| `cortex pulse-reject <id>` | Decline a proposal — remembered, so it won't be re-proposed. |
| `cortex tasks plan [--json]` | Show the five-bundle scheduled-task registration plan. |
| `cortex tasks verify` | Check whether the scheduled bundles are registered with Claude Code Desktop. |

There's no `cortex extract-insight` command — extraction is agentic, so it lives in the `cortex-extract-insight` **skill**, invoked from a Claude Code session instead of the CLI. The same is true of document ingestion (`cortex-archive-ingest`) and every scheduled loop's judgment step.

## How it stays fresh

Refresh scales with *meaningful* change, not commit volume. A git post-commit hook flags changed files (no LLM); a daily loop re-extracts affected files and re-verifies cross-file edges; a weekly loop regenerates the full concept graph as ground truth.

Maintenance runs as **five scheduled bundles** registered with Claude Code Desktop: daily (hygiene, bug triage, spec-drift, insight refresh, session observation), weekly-curation (session distillation into rule/skill candidates, rule-decay audit), weekly-quality (spec lint, verification, full insight regeneration), test-runner (the only code-writing loop, kept isolated), and monthly-review (project-memory and scaffolding staleness).

The one inviolable rule: **loops propose, they never mutate.** Anything a loop wants to change in a gated layer lands as a typed suggestion instead — review it with `cortex pulse-list` / `pulse-accept` / `pulse-reject`. The sole exception is the test-runner, which writes code behind a writer/verifier split.

Registering the five bundles is a one-time step that has to happen from inside a Claude Code Desktop session (say *"run cortex-register-tasks"*) — the app only accepts task registration from a session it spawned, so `cortex init`/`cortex tasks verify` can't do it headlessly.

## Architecture

Cortex splits into two layers with a non-negotiable boundary. **Cortex Core** is a deterministic Node.js/TypeScript binary — file I/O, schema enforcement, the CLI, hooks — and never makes an LLM call. **Skills** are agentic Claude Code bundles that do the extraction, judgment, and proposal work. The contract between them is **`cortex-schema.md`**, a versioned spec that Core implements and Skills consume, both referencing it by version — without it, the two layers drift.

## Docs

- [`onboarding.md`](./onboarding.md) — start here for hands-on usage, including the "investigate an unfamiliar repo" workflow.
- [`presentation.md`](./presentation.md) — the fuller pitch: the problem, the architecture, the design decisions and why.
- [`cortex-schema.md`](./cortex-schema.md) — the contract: every file format and frontmatter shape Core and Skills share.
- [`cortex-v3-design.md`](./cortex-v3-design.md) — the current architecture and design rationale.
- [`RULES.md`](./RULES.md) — the hard, project-wide constraints (pnpm-only, no LLM calls in Core, macOS-only, etc.).

## Development

```bash
pnpm install
pnpm build      # compile TypeScript
pnpm test       # full test suite
pnpm test:atomic  # atomic layer — one test per Given/When/Then, mocked
pnpm test:spec    # spec layer — one test per dev spec, integrated slice
```

Tests span four tiers overall: atomic, spec, journey (real infra), and scenario (full sandbox) — see [`RULES.md`](./RULES.md) and [`onboarding.md`](./onboarding.md) §9 for the spec-driven build loop.

This repo dogfoods itself: `.cortex/` and `.specflow/` here are real Cortex output, maintained by Cortex's own loops. If you want to see it work, `cortex insight file src/schema/validate.ts` on this repo returns an entry Cortex extracted about its own schema validator.

## License

MIT
