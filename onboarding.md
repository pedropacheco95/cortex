# Onboarding to Cortex

How to bring Cortex onto a project and use it day to day. Assumes you've skimmed [`presentation.md`](./presentation.md) for what Cortex is and why.

> **Platform:** macOS only (v1). Scheduled loops depend on Claude Code Desktop's local scheduled tasks.
> **Runtime:** Node.js. Cortex is a global CLI (`cortex`) plus Claude Code skill bundles.

---

## 0. The mental model in 30 seconds

- `.cortex/` holds five modules: **atlas** (why), **compass** (rules/bugs), **archive** (ingested docs), **insight** (inferred understanding), **pulse** (transient loop output).
- **Core** (the `cortex` CLI) is deterministic and never calls an LLM. **Skills** (in Claude Code) do the thinking.
- **Insight** is the thing you'll use most: a queryable, per-file understanding of the code.
- Loops keep it fresh and **propose** improvements to a gate you approve — they never silently change your rules.
- **Specs are the source of truth** (`.specflow/`); code is derived from them.

---

## 1. Install & initialize

```bash
# Install the global CLI (once per machine)
pnpm add -g cortex        # or your published install path

# In your project root:
cortex init
```

`cortex init` scaffolds `.cortex/` (all five modules, each with an active-prompt `_index.md`), writes the managed **CLAUDE.md** block that teaches Claude how to use insight, installs the warn-never-block git/read/write hooks, updates `.gitignore`, and prepares the scheduled-task payloads.

It's safe to re-run: it merges and appends, never clobbering your curated content (overwrites are `--force`-gated). At the end it self-validates and prints next steps — including the scheduled-task activation instruction (see §6).

Verify any time:

```bash
cortex validate .     # Conformant: YES, 0 errors, 0 warnings — the goal state
```

## 2. Extract insight (the first real step)

An empty insight layer isn't useful. Populate it by running the extraction skill **inside a Claude Code session** on the project:

> **"run the initial extraction"** — or *"extract insight"*, *"map this codebase"*

This invokes `cortex-extract-insight`, which:
1. runs the deterministic **L1** structural pass (Core),
2. **plans** logically-coherent scopes and writes the plan to `.cortex/pulse/extraction/plan.md` (it presents the plan for review on large/ambiguous codebases; auto-runs on small ones),
3. extracts **L2** (purpose) for every file and **L3** (deep understanding) for the central ones, in parallel per scope,
4. runs the cross-scope **L4** unification pass (concepts, semantic graph, clusters).

It's resumable — if it's interrupted, re-invoking it picks up from the last checkpoint. Progress lands in `.cortex/pulse/extraction/progress.md`.

There is **no `cortex extract-insight` CLI command** — extraction is agentic, so it lives in a Skill, not in Core.

## 3. Query insight — your daily driver

Once extracted, three deterministic commands (fast, no LLM):

```bash
cortex insight file src/auth/session.ts     # the rich per-file entry
cortex insight concept authentication       # files touching a concept + related concepts
cortex insight element validateToken        # a function/class/constant, with connections
```

Add `--json` to any of them for structured output. `element` returns "no rich entry" for symbols that weren't identified as main players — those are still discoverable via their file entry.

For open-ended questions ("how does billing work here?"), just ask Claude in-session — it uses these primitives to gather what it needs and reasons over them.

## 4. Investigate an unfamiliar repo (the "understand anything" workflow)

The headline use case: you're dropped into a codebase you don't know — a client's, a legacy service, an acquisition — and need to *understand* it. This is the Understand-Anything / Graphify equivalent, except the output is persistent and stays fresh instead of being a one-shot artifact that rots.

The flow, start to finish:

**1 — Scaffold and extract.** `cortex init` in the repo (§1), then run the initial extraction (§2). On an unfamiliar codebase, **review the plan** the extraction presents before it runs — the scope tree *is* your first map: which subsystems exist, how large each is, what's shared between them. You've learned the shape of the repo before a single deep pass runs.

**2 — See the whole thing at once.**

```bash
cortex scan            # compile the map → .cortex/constellation.json
cortex constellation   # serve it read-only on localhost; prints a URL (never auto-opens)
```

The constellation is a visual map of the project — files, concepts, rules, and specs with the relationships between them. It's strictly read-only: it observes the knowledge layer, never edits it.

**3 — Start from what matters, not from file #1.** Extraction ranks files by **centrality** and surfaces the **concepts** that span the codebase, so you don't have to guess where to begin:

```bash
cortex insight concept authentication   # (or billing, retry, caching, …)
```

A concept entry tells you which files implement it, *how*, and which concepts relate to it — the fastest way in.

**4 — Follow the graph, along meaning.** From a concept, jump to its files; a file entry gives you Purpose, **Main players** (with line ranges), non-obvious **Insights**, and — the load-bearing part for navigation — **Connections** (uses / used-by / semantically-related) and **Query pointers** ("if you need to do X, also read Y"):

```bash
cortex insight file src/auth/session.ts
cortex insight element validateToken
```

Following Connections and Query pointers lets you traverse the codebase by *concern*, not just by imports — files that handle the same thing without importing each other are linked.

**5 — Just ask.** In a Claude Code session, ask in plain language:

> *"How does auth work in this repo?"* · *"Where's the retry logic?"* · *"What would I touch to add a new payment provider?"*

Claude answers by gathering the relevant insight entries and reasoning over them — grounded in the extracted understanding of *this* codebase, not in priors about how similar codebases usually work.

**6 — (Optional) Reverse-engineer specs for the deepest model.** To go from "I understand the code" to a durable, structural model of *what it's supposed to do*, turn the code into a spec tree — in a session: *"onboard this codebase"* (`specflow-onboard-codebase`), or *"deep onboard"* for a high-confidence 3-pass merge (`specflow-deep-onboard`). You get business + developer specs with acceptance criteria, bidirectionally linked.

**Why this beats a one-shot tool:** the understanding you just built is committed to `.cortex/insight/`, queryable by every future session, and kept current by the daily refresh loop as the code changes. You investigate once; it stays true. And because the query surface is deterministic Core, consulting it later costs no tokens.

## 5. How Claude uses it automatically

The CLAUDE.md block `cortex init` installed teaches the core discipline:

> **Consult insight to understand; read the file to modify.** The per-file entry is a far richer resume than reading 500 lines and remembering fragments. Query it first; open the file when you need exactness.
>
> Before substantive work on a file, query its insight entry. Before cross-file changes, query the concept. Where insight conflicts with a compass rule or a spec, **the gated layer wins** — insight is context, not authority.

You don't have to do anything for this — it's in every session's context. The skills (`specflow-develop`, `specflow-change-router`, `specflow-tests`, etc.) also query insight at the right moments.

## 6. Activate the scheduled loops (one-time, needs a Desktop session)

Cortex's self-maintenance runs as **five scheduled bundles**. Registering them with the Claude Desktop app is the one step Cortex can't do headlessly — the app only accepts task registration from a session it spawned. `cortex init` prints the instruction; here it is:

1. Open the project folder in **Claude Code Desktop** (a new session).
2. Say: **"run cortex-register-tasks"**
3. The app will ask you to **approve each task registration** (5 prompts) — "always allow" isn't offered for task creation, so stay at the keyboard and approve each.
4. Confirm: `cortex tasks verify` → *all five registered, enabled, backed by payloads.*

You'll then see them in the app's **Routines** list as "Cortex daily", "Cortex weekly curation", etc.

The five bundles:

| Shows as | When | What it tends |
|---|---|---|
| Cortex daily | 02:00 daily | health, bug triage, spec-drift, insight refresh, session observation |
| Cortex weekly curation | Sat 04:00 | distil sessions → rule/skill candidates; rule decay |
| Cortex weekly quality | Sun 04:00 | spec lint, verification, full insight regeneration |
| Cortex test runner | Sun 06:00 | the code-writing test-fix loop (isolated) |
| Cortex monthly review | 1st, 06:00 | project-memory & scaffolding staleness |

> **After a Desktop app update:** updates have been observed to wipe the app's task registry. If `cortex tasks verify` ever fails, just re-run **"run cortex-register-tasks"** in a Desktop session.

## 7. The weekly rhythm — the pulse gate

Loops **propose, they never mutate.** Anything they'd change to a gated layer (a compass rule, an atlas decision, a new skill) lands as a typed suggestion. Your part is a few minutes of review:

```bash
cortex pulse-list             # what's queued, by id
cortex pulse-accept S-007     # apply it (transactional write to the gated layer)
cortex pulse-reject S-007     # decline — remembered, so it won't be re-proposed
```

Loop reports (never gated, just informational) live in `.cortex/pulse/reports/` — one clean-named file per loop (`hygiene.md`, `spec-drift.md`, `insight-refresh.md`, …). The gate itself is `.cortex/pulse/suggestions.md`; rejection memory is `dismissed.md`. Everything else under `pulse/` is machine state (`state/`) or extraction artifacts (`extraction/`) — you never edit those by hand.

## 8. Bring documents into the system (archive)

When a document authorizes downstream content — a client spec, a contract, a meeting transcript, an RFC — ingest it so its derived rules and decisions stay traceable:

> In a session: **"ingest this client spec"** (or drop the document and ask to ingest it)

This invokes `cortex-archive-ingest`: it classifies the document type, stores the source verbatim under `.cortex/archive/documents/<slug>/`, extracts structured content into `extracted/`, and then asks whether you want a change plan drafted. If yes, the proposed rules/specs/decisions each carry `provenance: derives_from:` back to the source — and route through the pulse gate for your approval. Superseded versions are preserved for audit.

## 9. Working under SpecFlow (if the project is spec-managed)

Specs are the source of truth. The build loop for any change:

1. Read the **business spec** (via the dev spec's `implements:` link) — understand *why*.
2. Check `depends_on` — prerequisites first.
3. Read the **dev spec** — schema, API, Given/When/Then.
4. **Write tests first** — every acceptance criterion becomes a test.
5. Implement the minimum to satisfy the spec.
6. Run tests; update the spec's status.
7. Re-check the business spec for drift; fix it in the same change if the dev change invalidated it.

If a change is reported as broken, the `specflow-bugs` skill diagnoses it against a seven-type taxonomy and files it in `compass/bugs/` before anyone touches code. Onboarding an *existing* codebase into specs: `specflow-onboard-codebase` (or `specflow-deep-onboard` for high-confidence multi-pass).

## 10. Command cheat-sheet

```bash
cortex init                         # scaffold / re-scaffold .cortex/
cortex validate .                   # check conformance to the schema (aim: 0/0)
cortex scan                         # (re)compile the constellation view
cortex insight file|concept|element # query the understanding layer
cortex tasks plan                   # show the 5-bundle registration plan
cortex tasks verify                 # are the scheduled bundles registered?
cortex pulse-list | -accept | -reject   # the human gate
```

And in a Claude Code session (skills, not CLI):

```
run the initial extraction        → cortex-extract-insight
ingest this <document>            → cortex-archive-ingest
run cortex-register-tasks         → register the 5 bundles (Desktop session)
```

## 11. Troubleshooting

- **`cortex validate` reports errors** — read them; they name the file and the schema clause. Most are missing frontmatter or a broken cross-reference.
- **Scheduled tasks don't appear in the app** — they register only via a Desktop session (`run cortex-register-tasks`), not by file-drop, and the app loads its registry at launch. Fully quit and reopen if the list looks stale; re-run the skill if `cortex tasks verify` fails after an app update.
- **Insight looks stale after big changes** — say *"refresh insight for `<file>`"* in a session, or let the daily loop catch up. The daily refresh scales with meaningful change, so trivial edits won't trigger deep re-extraction.
- **A loop wants to change something you disagree with** — reject it (`cortex pulse-reject <id>`); it won't be proposed again.

---

*Cortex is spec-managed and self-hosting: it uses its own five modules, loops, and gate to maintain itself. If you want to see it work, `cortex insight file src/schema/validate.ts` on the Cortex repo returns an entry Cortex extracted about its own validator.*
