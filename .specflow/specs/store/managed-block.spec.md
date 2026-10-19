---
id: store.managed-block
status: implemented
depends_on:
  - store.map
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/managed-block.ts"
---

# Managed blocks in `CLAUDE.md` and `AGENTS.md`

## Intent

The host loads MAP through a generated block (schema S8.3). Claude Code follows `@cortex/MAP.md`; Codex does not follow includes, so `AGENTS.md` gets a copy of MAP. Nothing outside the block is ever touched.

## Rules

1. The block is delimited by `<!-- cortex:start v4.0 -->` and `<!-- cortex:end -->`.
2. In `CLAUDE.md`, the block's body is exactly:
   ```
   ## Cortex
   This project keeps its knowledge in `cortex/` (plain files, one subject each). Start from the map:
   @cortex/MAP.md
   ```
3. In `AGENTS.md`, the block's body is `## Cortex` followed by the full `renderMap(store)` text.
4. Writing a block replaces an existing `cortex:start … cortex:end` block (any version) in place. If none exists, it appends the block after one blank line. A missing file is created holding only the block.
5. `cortex store map` writes both blocks. `--no-agents` skips `AGENTS.md`.
6. Before a project's migration is accepted (`store.migrate`), `cortex store map` does not touch a block whose version is 3.x. It writes `MAP.md` only and prints `managed block left at v3.x until migration is accepted`.
7. `check.map-fresh` also warns when a 4.0 block differs from what would be written.

## Acceptance Criteria

### CLAUDE.md gets the include block

- **Given** a `CLAUDE.md` with only a project title
- **When** `cortex store map` runs on an accepted 4.0 store
- **Then** `CLAUDE.md` keeps its title and ends with the 4.0 block containing `@cortex/MAP.md`

### AGENTS.md gets a copy of MAP

- **Given** no `AGENTS.md`
- **When** `cortex store map` runs
- **Then** `AGENTS.md` is created, holding only the block, whose body contains MAP's placement procedure

### Content outside the block is untouched

- **Given** `CLAUDE.md` has text before and after an existing 4.0 block
- **When** the block is rewritten
- **Then** the text before and after is byte-identical

### A 3.x block is left alone until acceptance

- **Given** `CLAUDE.md` holds a `<!-- cortex:start v3.4 -->` block and the migration is not accepted
- **When** `cortex store map` runs
- **Then** `CLAUDE.md` is unchanged, `MAP.md` is written, and the message says the block was left at v3.x

### `--no-agents` skips AGENTS.md

- **Given** no `AGENTS.md`
- **When** `cortex store map --no-agents` runs
- **Then** no `AGENTS.md` is created
