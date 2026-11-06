---
id: store.validate
status: implementing
depends_on:
  - store.layout
implements: ../../promises/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/validate.ts"
  - "src/store/checks/**/*.ts"
---

# `cortex store validate`: the 4.0 validator and placement lint

## Intent

One command that tells whether a 4.0 store keeps its contract (schema S11): structure, frontmatter, naming, the placement lint, and near-duplicate detection. The checks with their own specs (`check.rule`, `check.applies-when`, `check.now-until`, `check.stale`, `check.map-*`) are owned there; this spec owns the runner and the structural checks.

## Rules

1. `cortex store validate [--json]` runs every S11 check and prints one line per finding: `<level> <check> <path>: <message>`. It exits 1 if any finding is an `error`, 0 otherwise. With no findings it prints `store: no findings`; `--json` is unchanged.
2. `check.store-config`, `check.store-layout`, `check.frontmatter`, `check.naming`, `check.decision`, `check.change`, `check.aliases`, `check.links`, `check.append-only`, `check.visibility` and `check.trailers` follow S11 as written.
3. `check.near-duplicate` compares `about` lines after lower-casing, removing punctuation and the stop-word list in `src/store/checks/stopwords.ts`. Two files sharing ≥ 0.8 token Jaccard, or two files with the same name in different folders, give one warning naming both.
4. `check.append-only` compares each committed `history/` file with its first committed version. Text added after the old content inside a `## Correction <date>` section is allowed; any other difference warns. Outside git, it is skipped. **Status transitions** (2026-10-19, schema S5): in `history/changes/` only, the frontmatter `status` value may differ from the original when the body ends with one appended transition line per change, `- <YYYY-MM-DD>: <from> → <to>, <reason>`. The check compares both versions with the `status` value masked, and the text after the original body must be transition lines and `## Correction` sections only. A changed `status` with no transition line, an edit to any other field, or a transition line outside `history/changes/` still warns.
5. Without a `cortex/` folder, the command prints `no 4.0 store (cortex/cortex.json not found)` and exits 1.
6. `check.visibility` also warns on a line containing the literal text `(private)` when `visibility.repo` is `public`: a public store that calls something private is either wrong about the repository or leaking a private pointer.
7. Checks are pure functions over the loaded store (plus git reads for append-only, stale and trailers), so each is tested alone.
8. **Specflow additions (4.0 batch).** `specflow` is a known key of `cortex/cortex.json` (S9.1, S12.6). `spec-amendment` is a known `kind` (S5). `check.trailers` also reads `Specflow-Amends:`, taking the spec id before the `#` (S10).

## Acceptance Criteria

### STORE-VALIDATE-1: A clean store validates with exit 0

- **Given** a store created by `cortex store init` plus one well-formed term file (with `origin`)
- **When** `cortex store validate` runs
- **Then** it prints `store: no findings` and exits 0

### STORE-VALIDATE-2: Missing required frontmatter is an error

- **Given** `world/terms/fare.md` lacks `verified`
- **When** the store is validated
- **Then** there is an `error` from `check.frontmatter` naming that file and `verified`, and the exit code is 1

### STORE-VALIDATE-3: A file without an origin is an error

- **Given** `world/terms/fare.md` with every other required field but no `origin`
- **When** the store is validated
- **Then** `check.frontmatter` reports an `error` naming that file and `origin`, and the exit code is 1

### STORE-VALIDATE-4: A malformed or misplaced origin is an error

- **Given** `world/terms/fare.md` with `origin: /Users/someone/.claude/projects/x.jsonl`, and `world/terms/tide.md` with `origin: "external:a client email"`
- **When** the store is validated
- **Then** `check.frontmatter` reports an `error` for each: the first is no known form, the second uses `external:` outside `history/sources/`

### STORE-VALIDATE-5: A folder outside the layout is an error

- **Given** a file `world/misc/x.md`
- **When** the store is validated
- **Then** `check.store-layout` reports an `error` for `world/misc`

### STORE-VALIDATE-6: Naming: ids and dates are refused where they don't belong

- **Given** `world/rules/R-002.md` and `world/terms/2026-10-01-fare.md`
- **When** the store is validated
- **Then** `check.naming` reports an `error` for each

### STORE-VALIDATE-7: Near-duplicates are flagged

- **Given** `code/hooks/read-hook-latency.md` (about: "The read hook adds latency to every read") and `world/systems/read-hook.md` (about: "Every read gets latency added by the read hook")
- **When** the store is validated
- **Then** `check.near-duplicate` warns once, naming both files

### STORE-VALIDATE-8: An alias shared by two files is an error

- **Given** two files both list alias `B-019`
- **When** the store is validated
- **Then** `check.aliases` reports an `error` naming both files

### STORE-VALIDATE-9: An edited history file is flagged; an appended correction is not

- **Given** a committed `history/incidents/2026-09-01-x.md`
- **When** a line of its original text is changed and the store is validated
- **Then** `check.append-only` warns
- **And when** instead only a `## Correction 2026-10-14` section is appended, there is no warning

### STORE-VALIDATE-10: A status transition in a change file is allowed; other edits are not

- **Given** a committed `history/changes/2026-09-01-x.md` with `status: pending`
- **When** `status` becomes `reconciled` and `- 2026-10-19: pending → reconciled, spec test fails on the probe` is appended, there is no `check.append-only` warning
- **And when** a transition line follows an appended `## Correction` section, there is no warning
- **And when** `status` changes with no transition line, or the `spec` field changes, or the same edit is made to a `history/incidents/` file, `check.append-only` warns

### STORE-VALIDATE-11: A public store that says "(private)" is flagged

- **Given** `cortex.json` has `visibility.repo: public` and `world/systems/github-remote.md` contains `the repository (private)`
- **When** the store is validated
- **Then** `check.visibility` warns on that line

### STORE-VALIDATE-12: No store, clear failure

- **Given** a repo with no `cortex/` folder
- **When** `cortex store validate` runs
- **Then** it prints `no 4.0 store (cortex/cortex.json not found)` and exits 1

### STORE-VALIDATE-13: The specflow config key is known

- **Given** `cortex.json` with a `specflow` key
- **When** the store is validated
- **Then** `check.store-config` reports no unknown key

### STORE-VALIDATE-14: The spec-amendment kind is known

- **Given** a `history/changes/` file with `kind: spec-amendment`
- **When** the store is validated
- **Then** `check.change` reports nothing for that field

### STORE-VALIDATE-15: A Specflow-Amends trailer naming no spec warns

- **Given** a commit in the last 50 with `Specflow-Amends: nope.nothing#rule-1 — x`
- **When** the store is validated
- **Then** `check.trailers` warns naming `nope.nothing`

### STORE-VALIDATE-16: A Spec: trailer resolves under specflow/

- **Given** a ported project with one `Spec:` trailer naming a spec under `specflow/impl/` and one naming nothing
- **When** `cortex store validate` runs
- **Then** `check.trailers` warns once, on the one naming nothing
