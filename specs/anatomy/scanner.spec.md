---
id: anatomy.scanner
status: implemented
depends_on:
  - schema.validator
implements: ../../specs-business/anatomy/contributor-gets-a-legible-codebase.business.md
governed_by: []
governs:
  - "src/anatomy/**/*.ts"
---

# Native Anatomy Scanner

## Intent

The native anatomy scanner (`cortex scan`) builds the per-file code-structure index Claude reads to understand a codebase without hand-written documentation. It lists files, estimates tokens, parses top-level structure and imports with tree-sitter, resolves a one-line purpose per file (docstring-first, with a delegated LLM fallback), cross-links governing specs, and emits the anatomy artefacts (`files.md`, `graph.json`, `layers.md`) defined in `cortex-schema.md` §4.1. This is the artefact that makes the outcome in `anatomy.contributor-gets-a-legible-codebase` real (design §7).

## Entities

The scanner operates on files. It writes the anatomy artefacts and reads the prior scan for caching.

- **READS:** project files (globbed from the root); `.gitignore`; `.cortex/cortex.config.json` (`anatomy.exclude` globs); `specs/_index.md` and dev specs (for spec cross-linking); the prior `anatomy/files.md` (the SHA256 purpose cache).
- **WRITES:** `.cortex/anatomy/files.md`, `.cortex/anatomy/graph.json`, `.cortex/anatomy/layers.md`.
- **CREATES:** the anatomy artefacts per `cortex-schema.md` §4.1 — `files.md` rows, `graph.json` nodes/edges, `layers.md` layer assignments. The schema is the source of truth for their shape; this spec does not redefine fields.

## Rules

1. **File listing.** Glob the project root, excluding any path matched by `.gitignore` and by `cortex.config.json` `anatomy.exclude` globs. (§7.2 step 1)
2. **Token estimate.** Per file, `tokens = ceil(charCount / 4)`. Deterministic. (§7.2 step 2)
3. **Structure parse.** Tree-sitter (Node bindings — the one parser dependency, RULES.md) extracts top-level definitions (functions, classes, exports) and imports per file; language is inferred from the file extension. (§7.2 step 3)
4. **Change detection.** Compute SHA256 of file content. A file whose hash is unchanged since the last scan is not re-parsed for purpose; its cached purpose line and `needs_purpose_refresh` flag are retained. (§7.2 step 4)
5. **Purpose line — docstring-first, LLM-fallback** (resolves design open-question #8). If a file has a usable doc comment per the per-language table below, derive its one-line purpose from it deterministically and set `needs_purpose_refresh: false`; the purpose is the first non-empty line of that doc comment, trimmed to its first sentence if a period appears and capped at ~120 chars. Otherwise leave the purpose as a placeholder and set `needs_purpose_refresh: true`. What counts as a usable doc comment is fixed per language — it is never a judgment call at scan time:

   | Language | Usable doc comment |
   |---|---|
   | JS / TS | A leading `/** … */` JSDoc block at the top of the file, or immediately above the first top-level declaration/export |
   | Python | The module docstring — a triple-quoted string as the first statement in the file |
   | Rust | A leading `//!` inner doc comment (module level), or the `///` doc comment above the first item |
   | Go | The comment block immediately above the `package` clause, or above the first top-level declaration |
   | any other extension | none defined → treated as no usable doc comment (`needs_purpose_refresh: true`) |

   A plain line comment that is not one of the forms above (e.g. a bare `// note` in TS) does **not** count.
6. **Architectural boundary — Core issues no LLM calls** (resolves the §3.1-vs-§7.2 tension; RULES.md rule 3). The scanner proper is deterministic Cortex Core and makes no LLM calls. The batched LLM purpose-line pass (~20–30 files per batch, reusing the SHA256 cache so unchanged files never re-run) is the **agentic** step, performed by the anatomy Skill (`cortex-loop-anatomy-refresh`, deep tier) for entries flagged `needs_purpose_refresh`. The Skill runs **inline as part of `cortex init`** (so day-1 anatomy is complete), and thereafter on its **scheduled cadence** (§11.4). **`cortex scan` never invokes the Skill — it only produces the flags**, which keeps `cortex scan` deterministic and fast forever after init. Core marks; the Skill fills.
7. **Spec cross-link.** When `specs/_index.md` exists, match each file path against dev-spec frontmatter (the `governs:`/`implements:` chain) and populate that file's `spec_links` with the matching dev-spec IDs. When `specs/_index.md` is absent, `spec_links` is empty. (§7.2 step 5)
8. **Layer assignment.** Infer each file's architectural layer from directory structure plus heuristics; emit `layers.md`. (§7.2 step 6)
9. **Schema-conformant output.** Emitted artefacts MUST satisfy the validator's `check.anatomy-files` and `check.anatomy-graph` (`cortex-schema.md` §4.1): `files.md` is a frontmatter header plus one table row per file (`path`, `purpose`, `tokens`, `sha256`, `last_seen`, `spec_links`, `needs_purpose_refresh`); `graph.json` is `{ nodes, edges:[{from,to,kind}] }` covering imports/exports only. The scanner validates its own output via `schema.validator` before the scan is considered successful.
10. **Incremental by default; `--full` ignores the cache** and re-derives every file. (design §15)
11. **Deterministic and offline.** Every Core stage runs without network; the only LLM/network touch is the delegated purpose pass (Rule 6), which is not Core.

## Acceptance Criteria

### Lists files, honouring .gitignore and config exclusions

- **Given** a project containing `src/a.ts`, `dist/a.js`, and `.gitignore` listing `dist/`, with `cortex.config.json` `anatomy.exclude: ["**/*.snap"]` and a file `src/a.snap`
- **When** the scanner runs
- **Then** `files.md` has a row for `src/a.ts`
- **And** has no row for `dist/a.js` (gitignored) or `src/a.snap` (config-excluded)

### Token estimate is charCount ÷ 4

- **Given** a file `src/a.ts` containing exactly 400 characters
- **When** the scanner runs
- **Then** that file's `tokens` value is `100`

### Tree-sitter extracts definitions and imports

- **Given** `src/a.ts` with `import { x } from "./b"` and `export function foo() {}`
- **When** the scanner runs
- **Then** `graph.json` has an edge `{ from: "src/a.ts", to: "src/b.ts", kind: "import" }`
- **And** the file's parsed top-level definitions include `foo`

### Unchanged files are not re-purposed (SHA256 cache)

- **Given** a prior `files.md` where `src/a.ts` has purpose "Does A." and an unchanged SHA256
- **When** the scanner runs again without `--full`
- **Then** `src/a.ts` keeps purpose "Does A." and is not queued for a purpose refresh

### Docstring-first purpose, no LLM call from Core

- **Given** `src/a.ts` beginning with a JSDoc block `/** Bootstraps the CLI. */` and `src/b.ts` whose only comment is a plain line comment `// internal helper`
- **When** the scanner runs
- **Then** `src/a.ts` has purpose "Bootstraps the CLI." with `needs_purpose_refresh: false`
- **And** `src/b.ts` (no qualifying JSDoc block) has a placeholder purpose with `needs_purpose_refresh: true`
- **And** the Core scan makes zero LLM/network calls

### Spec cross-link when specs/_index.md is present

- **Given** `specs/_index.md` exists and a dev spec governs `src/a.ts`
- **When** the scanner runs
- **Then** that file's `spec_links` contains the governing dev-spec ID
- **And** when `specs/_index.md` is absent, every `spec_links` is empty

### Emitted anatomy passes the schema validator

- **Given** any project the scanner has scanned
- **When** `schema.validator` runs `check.anatomy-files` and `check.anatomy-graph` over the emitted `.cortex/anatomy/`
- **Then** there are zero `error`-severity violations

### `--full` ignores the cache

- **Given** a prior `files.md` with cached purposes and unchanged files
- **When** the scanner runs with `--full`
- **Then** every file is re-listed, re-estimated, and re-evaluated for purpose regardless of cached SHA256

## Notes

- **Decision (resolves design open-question #8):** purpose lines are docstring-first with LLM-fallback, for cost — only files lacking a usable docstring, and only when changed, reach the LLM pass. May become configurable via `cortex.config.json` later; not in this spec.
- **Decision (resolves §3.1 vs §7.2 / §13.5):** the LLM purpose pass is agentic, not Core. This spec defines only the deterministic scanner plus the `needs_purpose_refresh` handoff contract. The batched-pass details (batch size, prompt, cache reuse) belong to the anatomy Skill spec (`cortex-loop-anatomy-refresh`, deep tier), to be written.
- OPEN (implementation-time, not locked): which tree-sitter grammars ship in v1. Lean for v1: TS + JS (required) + Python + Rust; add Go and Ruby only if trivial; skip the long tail. Final call made at implementation. Files whose extension has no grammar are still listed and token-estimated, with structure/imports left empty and `needs_purpose_refresh: true` (no doc-comment rule applies).
- Also supports: `core-cli` (`cortex scan` / `cortex init` invoke this) and the anatomy-refresh loops. Primary parent remains `anatomy.contributor-gets-a-legible-codebase`.
