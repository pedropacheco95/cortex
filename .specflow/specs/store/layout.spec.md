---
id: store.layout
status: implemented
depends_on: []
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/layout.ts"
  - "src/store/frontmatter.ts"
  - "src/store/init.ts"
---

# Store layout and file shape

## Intent

Define the 4.0 store as code: the folder set, the frontmatter model and the naming rules of schema Part II S1–S3, S6 and S7. Every other `store.*` spec reads the store through this model. It also provides `cortex store init`, which creates an empty, valid 4.0 store.

## Entities

- **READS:** `cortex/**`.
- **WRITES:** `cortex/cortex.json`, the empty module folders, and the `history/sources/raw/` line in `.gitignore` (`init` only).
- **CREATES:** the `StoreFile` model: `{ path, module, folder, frontmatter, body }`.

## Rules

1. `loadStore(root)` returns every file under `cortex/` as a `StoreFile`, classifying `module` (`code` | `world` | `history` | `now`) and `folder` (`world/terms`, `code/hooks`, …) from its path.
2. Frontmatter is parsed with the existing YAML dependency. A file without frontmatter is loaded with `frontmatter: null`, never thrown on. Judging it is the validator's job.
3. `verified` parses into `{ date, method }`. `origin` (a string or a list) parses into a list of `{ form, ref }`, one per value, with `form` one of the S3 origin forms. Anything else, in either field, is reported as malformed, not coerced.
4. The `now/` item parser splits a file into items (list items, or `##`/`###` headings with the lines under them), each with its `until` date or `null`.
5. `cortex store init` creates `cortex/cortex.json` (`schemaVersion: "4.0"`, `visibility` copied from `.cortex/cortex.config.json` when it exists, else `unknown`) and the S1 folders. It is idempotent and never overwrites an existing file.
6. Core makes no network or model calls (RULES.md rule 3).

## Acceptance Criteria

### Files are classified by module and folder

- **Given** a store with `code/hooks/pre-read.md`, `world/terms/fare.md` and `history/incidents/2026-09-01-x.md`
- **When** the store is loaded
- **Then** their modules are `code`, `world` and `history`, and their folders are `code/hooks`, `world/terms` and `history/incidents`

### A file without frontmatter loads without throwing

- **Given** `world/people/rui.md` has no frontmatter
- **When** the store is loaded
- **Then** it is returned with `frontmatter: null`

### `origin` is parsed into forms, as a string or a list

- **Given** `origin: session:3f2a9c1e-7b4d-4e8a-9f60-2c1d5e8b7a94` in one file, and `origin: [migrated:compass/preferences.md#1@d7ed910, migrated:compass/preferences.md#3@d7ed910]` in another
- **When** the store is loaded
- **Then** the first parses to one `{ form: "session", ref: "3f2a9c1e-…" }`, the second to two `{ form: "migrated", … }` values in that order, and `origin: somewhere` is reported as malformed

### `verified` is parsed into a date and a method

- **Given** `verified: 2026-10-12 (told)`
- **When** the file is loaded
- **Then** `verified` is `{ date: "2026-10-12", method: "told" }`
- **And** a value `last week` is reported as malformed

### `now/` items carry their until dates

- **Given** `now/team.md` holds `- Rui away until: 2026-10-20` and `## Release freeze` with `until: 2026-11-01` on the line below
- **When** its items are parsed
- **Then** there are 2 items, with until dates 2026-10-20 and 2026-11-01

### `store init` creates a valid empty store and keeps visibility

- **Given** a repo whose `.cortex/cortex.config.json` says `visibility.repo: public`
- **When** `cortex store init` runs
- **Then** `cortex/cortex.json` has `schemaVersion: "4.0"` and `visibility.repo: "public"`, every S1 folder exists, and `.gitignore` contains `cortex/history/sources/raw/`

### `store init` is idempotent

- **Given** `cortex store init` has run and `cortex/world/terms/fare.md` was then added
- **When** `cortex store init` runs again
- **Then** no file changes
