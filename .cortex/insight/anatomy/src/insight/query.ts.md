---
path: src/insight/query.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 3
size_lines: 493
size_tokens: 4796
centrality: high
built_at_commit: "8248c76"
source_sha256: "8ad8bdf197c318f1455f730071f38834b1d5c91bdaaf222089efad55e97bc5c4"
---
# src/insight/query.ts

## Purpose

The pure, deterministic query engine behind the three `cortex insight` subcommands (`file`, `concept`, `element`), superseding the entire v2 query/get/neighbors/list engine. It resolves the scoped-vs-flat layout difference entirely internally — no caller (including the CLI) ever needs to know whether a project uses `scope-registry.yaml` — and reads per-file entries, concept docs, and graph.json (top-level and scope-local) with strict determinism: a miss is always an explicit not-found result, never a crash or a silent empty success.

## Main players

- `locateInsight` (lines 60–70) — finds `.cortex/insight/`, detects scoped vs flat layout via `scope-registry.yaml` presence, returns null when the module is entirely absent. [critical]
- `fileQuery` (lines 214–235) — resolves a source path to its entry across scoped/flat candidates in owning-scope-first priority order, parses it, and returns canonically-ordered sections. [critical]
- `conceptQuery` (lines 290–353) — resolves a concept doc (global `concepts/` first, then per-scope) plus every graph edge touching `concept:<slug>` across the unified graph. [critical]
- `elementQuery` (lines 425–492) — matches `element:` graph nodes by plain name or `path#name`, attaches all touching connections, and — when the owning file's entry names it under Main players — attaches rich description + query pointers. [critical]
- `loadUnifiedGraph` (lines 124–136) — merges the top-level `graph.json` with every scope-local `graph.json`, first-writer-wins on both nodes and edges. [critical]
- `entryCandidates` (lines 202–212) — the priority-ordered candidate entry paths (owning scope, top-level, then every other scope) that `fileQuery` walks. [supporting]
- `mainPlayers` (lines 397–423) — parses a `## Main players` section's bullets into a name → bullet-text map, keyed on each bullet's first backticked token. [supporting]
- `owningScope` (lines 86–101) — longest-registry-prefix match resolving which declared scope owns a source path. [supporting]

## Insights

The scoped-vs-flat resolution is deliberately isolated to this module — per the module header this hiding is a load-bearing design decision (schema §4.10.1 / design §5.8), never delegated to the CLI or any other caller. `fileQuery`'s owning-scope candidate is tried first but every OTHER scope is still checked as a fallback (lines 208–210) — an entry can technically be found under a scope that doesn't nominally own its source path. This module never calls `process.exit` (explicit in the header) — that responsibility belongs exclusively to the CLI layer, keeping the engine a pure, embeddable function set. `mainPlayers` keys strictly off the FIRST backticked token in each bullet — the exact convention every hand-written `## Main players` entry (including this extraction pass) must follow for `element` queries to find rich detail at all.

## Connections

Uses:
- src/insight/entry.ts: `parseEntry` + `ENTRY_SECTIONS` to load and canonically order an entry's sections.
- src/insight/storage.ts: `parseGraphV3` + `parseScopeRegistry` to load graph and scope-registry artefacts.

Used by:
- src/hooks/pre-read.ts: consumes this engine's results before a read hook (outside this scope).
- src/insight/cli.ts: calls `fileQuery`/`conceptQuery`/`elementQuery` to implement the three CLI subcommands.

## Query pointers

If you need to change how scoped vs flat layouts are resolved, this is the only file to touch — read `locateInsight`/`owningScope`/`entryCandidates` together. For CLI-facing rendering, read src/insight/cli.ts. For the entry/section contract this engine depends on, read src/insight/entry.ts.
