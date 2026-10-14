---
id: store.validate
status: draft
depends_on:
  - store.layout
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/validate.ts"
  - "src/store/checks/**/*.ts"
---

# `cortex store validate`: the 4.0 validator and placement lint

## Intent

One command that tells whether a 4.0 store keeps its contract (schema S11): structure, frontmatter, naming, the placement lint, and near-duplicate detection. The checks with their own specs (`check.rule`, `check.applies-when`, `check.now-until`, `check.stale`, `check.map-*`) are owned there; this spec owns the runner and the structural checks.

## Rules

1. `cortex store validate [--json]` runs every S11 check and prints one line per finding: `<level> <check> <path>: <message>`. It exits 1 if any finding is an `error`, 0 otherwise.
2. `check.store-config`, `check.store-layout`, `check.frontmatter`, `check.naming`, `check.decision`, `check.change`, `check.aliases`, `check.links`, `check.append-only`, `check.visibility` and `check.trailers` follow S11 as written.
3. `check.near-duplicate` compares `about` lines after lower-casing, removing punctuation and the stop-word list in `src/store/checks/stopwords.ts`. Two files sharing ≥ 0.8 token Jaccard, or two files with the same name in different folders, give one warning naming both.
4. `check.append-only` compares each committed `history/` file with its first committed version. Text added after the old content inside a `## Correction <date>` section is allowed; any other difference warns. Outside git, it is skipped.
5. Without a `cortex/` folder, the command prints `no 4.0 store (cortex/cortex.json not found)` and exits 1.
6. `check.visibility` also warns on a line containing the literal text `(private)` when `visibility.repo` is `public`: a public store that calls something private is either wrong about the repository or leaking a private pointer.
7. Checks are pure functions over the loaded store (plus git reads for append-only, stale and trailers), so each is tested alone.

## Acceptance Criteria

### A clean store validates with exit 0

- **Given** a store created by `cortex store init` plus one well-formed term file (with `origin`)
- **When** `cortex store validate` runs
- **Then** it prints no findings and exits 0

### Missing required frontmatter is an error

- **Given** `world/terms/fare.md` lacks `verified`
- **When** the store is validated
- **Then** there is an `error` from `check.frontmatter` naming that file and `verified`, and the exit code is 1

### A file without an origin is an error

- **Given** `world/terms/fare.md` with every other required field but no `origin`
- **When** the store is validated
- **Then** `check.frontmatter` reports an `error` naming that file and `origin`, and the exit code is 1

### A malformed or misplaced origin is an error

- **Given** `world/terms/fare.md` with `origin: /Users/someone/.claude/projects/x.jsonl`, and `world/terms/tide.md` with `origin: "external:a client email"`
- **When** the store is validated
- **Then** `check.frontmatter` reports an `error` for each: the first is no known form, the second uses `external:` outside `history/sources/`

### A folder outside the layout is an error

- **Given** a file `world/misc/x.md`
- **When** the store is validated
- **Then** `check.store-layout` reports an `error` for `world/misc`

### Naming: ids and dates are refused where they don't belong

- **Given** `world/rules/R-002.md` and `world/terms/2026-10-01-fare.md`
- **When** the store is validated
- **Then** `check.naming` reports an `error` for each

### Near-duplicates are flagged

- **Given** `code/hooks/read-hook-latency.md` (about: "The read hook adds latency to every read") and `world/systems/read-hook.md` (about: "Every read gets latency added by the read hook")
- **When** the store is validated
- **Then** `check.near-duplicate` warns once, naming both files

### An alias shared by two files is an error

- **Given** two files both list alias `B-019`
- **When** the store is validated
- **Then** `check.aliases` reports an `error` naming both files

### An edited history file is flagged; an appended correction is not

- **Given** a committed `history/incidents/2026-09-01-x.md`
- **When** a line of its original text is changed and the store is validated
- **Then** `check.append-only` warns
- **And when** instead only a `## Correction 2026-10-14` section is appended, there is no warning

### A public store that says "(private)" is flagged

- **Given** `cortex.json` has `visibility.repo: public` and `world/systems/github-remote.md` contains `the repository (private)`
- **When** the store is validated
- **Then** `check.visibility` warns on that line

### No store, clear failure

- **Given** a repo with no `cortex/` folder
- **When** `cortex store validate` runs
- **Then** it prints `no 4.0 store (cortex/cortex.json not found)` and exits 1
