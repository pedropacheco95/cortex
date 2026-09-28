---
path: src/insight/query.ts
extracted_at: 2026-09-22T09:55:19Z
extraction_level: 3
size_lines: 533
size_tokens: 5277
centrality: medium
built_at_commit: "a66041b"
source_sha256: "d8fa2b954d4b84c41110c2d5bc599d485737860f4af022f5e719d33052dd2847"
---
# src/insight/query.ts

## Purpose

The pure, deterministic query engine behind the three `cortex insight` subcommands (`file`, `concept`, `element`), superseding the entire v2 query/get/neighbors/list engine. It resolves the scoped-vs-flat layout difference entirely internally — no caller (including the CLI) ever needs to know whether a project uses `scope-registry.yaml` — and reads per-file entries, concept docs, and graph.json (top-level and scope-local) with strict determinism: a miss is always an explicit not-found result, never a crash or a silent empty success. It also owns the Rule 9 staleness computation (`entryStaleness`) comparing a found entry's `source_sha256` against the live source body, entirely in-process (no git, no ledger).

## Main players

- `locateInsight` (lines 61–71) — finds `.cortex/insight/`, detects scoped vs flat layout via `scope-registry.yaml` presence, returns null when the module is entirely absent. [critical]
- `fileQuery` (lines 215–236) — resolves a source path to its entry across scoped/flat candidates in owning-scope-first priority order, parses it, and returns canonically-ordered sections. [critical]
- `entryStaleness` (lines 263–275) — hashes the live source body and compares it to the entry's stored `source_sha256`; `reason` is `fresh`/`changed`/`missing`, never a crash on an unreadable source. [critical]
- `conceptQuery` (lines 330–393) — resolves a concept doc (global `concepts/` first, then per-scope) plus every graph edge touching `concept:<slug>` across the unified graph. [critical]
- `elementQuery` (lines 465–532) — matches `element:` graph nodes by plain name or `path#name`, attaches all touching connections, and — when the owning file's entry names it under Main players — attaches rich description + query pointers. [critical]
- `loadUnifiedGraph` (lines 125–137) — merges the top-level `graph.json` with every scope-local `graph.json`, first-writer-wins on both nodes and edges. [critical]
- `entryCandidates` (lines 203–213) — the priority-ordered candidate entry paths (owning scope, top-level, then every other scope) that `fileQuery` walks. [supporting]
- `mainPlayers` (lines 437–463) — parses a `## Main players` section's bullets into a name → bullet-text map, keyed on each bullet's first backticked token. [supporting]
- `owningScope` (lines 87–102) — longest-registry-prefix match resolving which declared scope owns a source path. [supporting]
- `sectionContents` / `orderedSections` (lines 146–179) — splits an entry body into H2-titled sections and reorders them into the §4.10.2 canonical order, extras sorted after. [supporting]

## Insights

The scoped-vs-flat resolution is deliberately isolated to this module — per the module header this hiding is a load-bearing design decision, never delegated to the CLI or any other caller. `fileQuery`'s owning-scope candidate is tried first but every OTHER scope is still checked as a fallback (lines 209–211) — an entry can technically be found under a scope that doesn't nominally own its source path. This module never calls `process.exit` (explicit in the header) — that responsibility belongs exclusively to the CLI layer, keeping the engine a pure, embeddable function set. `mainPlayers` keys strictly off the FIRST backticked token in each bullet — the exact convention every hand-written `## Main players` entry (including this extraction pass) must follow for `element` queries to find rich detail at all. `entryStaleness` deliberately reuses `refresh-fast.ts`'s `sha256Of` rather than reimplementing hashing — a small but real cross-module coupling: a change to that hashing function silently changes what counts as "fresh" here too.

## Connections

Uses:
- src/insight/entry.ts: `parseEntry` + `ENTRY_SECTIONS` to load and canonically order an entry's sections.
- src/insight/refresh-fast.ts: `sha256Of` to hash the live source body for `entryStaleness` — reuses the fast tier's own hashing helper rather than duplicating it.
- src/insight/storage.ts: `parseGraphV3` + `parseScopeRegistry` to load graph and scope-registry artefacts.

Used by:
- src/constellation/server.ts: imports `locateInsight`, `loadUnifiedGraph`, `fileQuery`, `conceptQuery`, `mainPlayers` to serve the constellation UI (outside this scope).
- src/hooks/pre-read.ts: imports `fileQuery` and `entryStaleness` to surface a file's insight purpose/staleness before a read (outside this scope) — the same staleness computation `cortex insight file` prints.
- src/insight/cli.ts: calls `fileQuery`/`conceptQuery`/`elementQuery`/`entryStaleness` to implement the three CLI subcommands and Rule 9's staleness stamp.

## Query pointers

If you need to change how scoped vs flat layouts are resolved, this is the only file to touch — read `locateInsight`/`owningScope`/`entryCandidates` together. For CLI-facing rendering, read src/insight/cli.ts. For the entry/section contract this engine depends on, read src/insight/entry.ts. If you need to change what counts as "fresh", read `entryStaleness` here together with `sha256Of` in src/insight/refresh-fast.ts.
