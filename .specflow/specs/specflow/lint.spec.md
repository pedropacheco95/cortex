---
id: specflow.lint
status: draft
depends_on:
  - specflow.index
  - schema.validator
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "src/specflow/lint.ts"
---

# `cortex specs lint`: tree checks and the literal-to-constant rule

## Intent

The specflow-lint skill mostly ran checks a machine can run. They move to Core, so they cost no tokens and give the same answer every time. Lint also holds the constants rules (P6): a fact used in more than one place is declared once. What needed judgement leaves lint; the quality task's at-rest review covers it.

## Entities

- **READS:** the `specflow.index` model, `specflow/**`, `cortex/cortex.json`, git config `core.hooksPath`.
- **WRITES:** with `--fix` only, the files named in Rule 5.
- **CREATES:** with `--fix` only, a stub `_overview.md`. Check names and levels are in schema S12.7.

## Rules

1. `cortex specs lint [--json] [--fix]` prints one line per finding: `<level> <check> <path>: <message>`. Exit 0 with no `error` findings, warnings allowed. Exit 1 with any `error`, or when `specflow/` does not exist. Exit 2 on a usage error. `--json` prints `{ "findings": [{ level, check, path, message }], "counts": { error, warning } }`.
2. **Carried checks.** Lint runs the existing checks over `specflow/`, unchanged in meaning: `check.overview-present`, `check.overview-shape`, `check.id-matches-path`, `check.dev-spec`, `check.business-spec`, `check.xref-symmetry`, `check.xref-unique`, `check.xref-acyclic`, `check.xref-resolve`, with `specflow/impl` standing for the dev tree and `specflow/promises` for the business tree. When `specflow/` exists, `cortex validate` runs its spec-tree checks there too, and `check.specs-index` is not run: INDEX replaces `_index.md`. A spec with `serves:` needs no `implements:`, and its `serves:` must name a promise.
3. **New tree checks** (each deterministic):
   - `lint.layout` (error): a spec file not under `specflow/impl/<area>/` or `specflow/promises/<area>/`, a file named just `spec.md`, or a leaf spec in a folder of its own.
   - `lint.body` (warning): a dev spec missing a non-empty Intent, Entities, Rules or Acceptance Criteria section, at level 2 or 3; a Rules section with no numbered item.
   - `lint.entity-table` (warning): a Markdown table whose header has both `Field` and `Type`.
   - `lint.criterion-id` (error): a heading without an id in a spec with any id; a duplicate id in the tree; an id whose prefix differs from its spec's when the spec's other ids use the Rule 3 prefix of `specflow.index`. A spec with no ids at all is a warning.
   - `lint.criterion-then` (warning): a criterion with no `Then` clause.
   - `lint.orphan` (warning): a spec with no `implements:` and no `serves:`; a promise that nothing serves.
   - `lint.promise-size` (warning): a promise body over 40 lines.
   - `lint.tests-config` (error): `specflow.tests` missing, or an unknown runner. Warning: an include matching no file.
   - `lint.rules-early` (error): `specflow.rules.b` or `.c` is not `off` while `Untagged tests` is above 0.
   - `lint.orphan-tag` (error): a tag naming no criterion.
   - `lint.hooks-installed` (warning): `core.hooksPath` is not `.githooks`.
4. **Constants.**
   - `lint.constant-unresolved` (error): `const:NAME` resolves to nothing visible from that spec. If it exists in a folder the spec cannot see, the message names that file and says to move it up.
   - `lint.constant-shadow` (error): a name declared in a folder and in an ancestor.
   - `lint.constant-unused` (warning): a constant no spec names.
   - `lint.constant-placement` (warning): a constant whose users all sit below a lower common folder.
   - `lint.literal` (warning): see Rule 6.
5. **`--fix`** applies only these, then reports what remains: writes a stub `_overview.md` with TODO markers where one is missing; turns a one-item `implements:` list into a scalar; adds a missing reverse link when the forward link resolves; adds the next free id to a criterion heading without one (highest number in that file plus one); moves a constant up to the lowest folder covering every user, or down under `lint.constant-placement`. It never removes a link, renumbers a rule, or edits rule or criterion text.
6. **`lint.literal`.** A literal is a double-quoted string of 8 or more characters, or a number with a unit (`ms`, `s`, `min`, `h`, `day`, `days`, `tokens`, `lines`, `KB`, `MB`, `%`), in a criterion's `Then` clause. A literal in the `Then` clauses of two or more specs that is not already `const:` is a finding, naming the value and each spec. Code spans are not literals: on this repository 477 of them repeat across specs, and they are nearly all paths and commands, while this definition finds 3. `specflow.literals.ignore` lists exact values to skip.
7. **Dropped from the skill.** Persona-prefix filenames, the jargon word list, and the overview-quality and "answers the three questions" checks are not ported: each needed judgement or applied only to business specs, which become promises. The Given/When/Then "concrete values" judgement goes too. Removing a broken link and renumbering rules were auto-fixes and are not ported: both change meaning.

## Acceptance Criteria

### A clean tree exits 0

- **Given** a ported tree with no findings
- **When** `cortex specs lint` runs
- **Then** it exits 0 and prints no finding lines

### Warnings alone exit 0

- **Given** a tree whose only finding is `lint.constant-unused`
- **When** `cortex specs lint` runs
- **Then** it exits 0 and prints `warning lint.constant-unused <path>: …`

### An error exits 1

- **Given** a duplicate criterion id in two specs
- **When** `cortex specs lint` runs
- **Then** it exits 1 and prints `error lint.criterion-id` naming both files

### No folder exits 1

- **Given** a repository with no `specflow/`
- **When** `cortex specs lint` runs
- **Then** it exits 1 with `specflow: no specflow/ folder here`

### JSON has the stated shape

- **Given** a tree with one error and one warning
- **When** `cortex specs lint --json` runs
- **Then** stdout parses, `counts` is `{ "error": 1, "warning": 1 }`, and each finding has `level`, `check`, `path`, `message`

### Carried checks run on the new tree

- **Given** `specflow/impl/billing/` with no `_overview.md`, and a spec whose `id` does not match its path
- **When** `cortex specs lint` runs
- **Then** it reports `check.overview-present` and `check.id-matches-path`

### Validate follows the tree

- **Given** a 4.0 project with `specflow/` and no `.specflow/`
- **When** `cortex validate` runs
- **Then** it reports the spec-tree checks against `specflow/` and does not report `check.specs-index`

### Serves replaces implements

- **Given** a spec with `serves: [P-BILLING-1]`, no `implements:`, and that promise present
- **When** `cortex specs lint` runs
- **Then** there is no `check.dev-spec` finding on it

### A serves naming nothing is an error

- **Given** a spec with `serves: [P-BILLING-99]` and no such promise
- **When** `cortex specs lint` runs
- **Then** it exits 1 naming `P-BILLING-99`

### Layout breaks are found

- **Given** `specflow/impl/spec.md`
- **When** `cortex specs lint` runs
- **Then** `lint.layout` reports it

### Missing sections are found on both layouts

- **Given** a spec with no Rules section, and another with an empty `### Intent`
- **When** `cortex specs lint` runs
- **Then** `lint.body` reports both

### A field table is found

- **Given** a spec holding `| Field | Type |`
- **When** `cortex specs lint` runs
- **Then** `lint.entity-table` reports it

### A criterion with no Then is found

- **Given** a criterion with only Given and When lines
- **When** `cortex specs lint` runs
- **Then** `lint.criterion-then` reports its id

### A heading missing its id is an error beside ids

- **Given** a spec with one heading with an id and one without
- **When** `cortex specs lint` runs
- **Then** it exits 1 with `lint.criterion-id`

### A spec with no ids at all only warns

- **Given** a spec with no ids in its criterion headings
- **When** `cortex specs lint` runs
- **Then** `lint.criterion-id` is a warning

### Orphans are found

- **Given** a spec with neither link and a promise nothing serves
- **When** `cortex specs lint` runs
- **Then** `lint.orphan` reports both

### A long promise is found

- **Given** a promise with a 41-line body
- **When** `cortex specs lint` runs
- **Then** `lint.promise-size` reports it

### Missing test config is an error

- **Given** no `specflow.tests`
- **When** `cortex specs lint` runs
- **Then** it exits 1 with `lint.tests-config`

### Rules on early is an error

- **Given** `specflow.rules.b` is `refuse` and one untagged test
- **When** `cortex specs lint` runs
- **Then** it exits 1 with `lint.rules-early`

### Rules on with no untagged test passes

- **Given** `specflow.rules.b` is `refuse` and every test tagged
- **When** `cortex specs lint` runs
- **Then** there is no `lint.rules-early` finding

### An orphan tag is an error

- **Given** a case tagged `[BILLING-REFUNDS-99]` and no such criterion
- **When** `cortex specs lint` runs
- **Then** it exits 1 with `lint.orphan-tag`

### Hooks not installed warns

- **Given** `core.hooksPath` is unset
- **When** `cortex specs lint` runs
- **Then** it reports `lint.hooks-installed` as a warning

### An unresolved constant is an error

- **Given** a criterion with `const:NOPE`
- **When** `cortex specs lint` runs
- **Then** it exits 1 with `lint.constant-unresolved`

### A sibling's constant says to move it

- **Given** `specflow/impl/billing/constants.md` declaring `REFUND_DAYS`, used by a spec in `specflow/impl/shipping/`
- **When** `cortex specs lint` runs
- **Then** the finding names `specflow/impl/billing/constants.md` and says to move it up

### Fix moves a constant up

- **Given** the same tree
- **When** `cortex specs lint --fix` runs
- **Then** `REFUND_DAYS` is declared in `specflow/impl/constants.md`, no longer in the billing file, and the finding is gone

### A shadowed name is an error

- **Given** `REFUND_DAYS` in `specflow/constants.md` and `specflow/impl/billing/constants.md`
- **When** `cortex specs lint` runs
- **Then** it exits 1 with `lint.constant-shadow`

### A constant placed too high warns

- **Given** `specflow/constants.md` declaring a constant used only by specs in `specflow/impl/billing/`
- **When** `cortex specs lint` runs
- **Then** `lint.constant-placement` names `specflow/impl/billing/`

### A repeated literal is found

- **Given** two specs whose `Then` clauses both hold `30 days`
- **When** `cortex specs lint` runs
- **Then** `lint.literal` names `30 days` and both specs

### A quoted string repeated is found

- **Given** two specs whose `Then` clauses hold `"Refund refused"`
- **When** `cortex specs lint` runs
- **Then** `lint.literal` names it

### One spec repeating a literal is not found

- **Given** one spec with `30 days` in two criteria
- **When** `cortex specs lint` runs
- **Then** there is no `lint.literal` finding

### A code span is not a literal

- **Given** two specs whose `Then` clauses hold `` `cortex validate` ``
- **When** `cortex specs lint` runs
- **Then** there is no `lint.literal` finding

### A short quoted string is not a literal

- **Given** two specs whose `Then` clauses hold `"error"`
- **When** `cortex specs lint` runs
- **Then** there is no `lint.literal` finding

### Literals outside Then are not read

- **Given** two specs with `30 days` only in `Given` lines
- **When** `cortex specs lint` runs
- **Then** there is no `lint.literal` finding

### The ignore list works

- **Given** `specflow.literals.ignore` is `["30 days"]` and two specs holding it
- **When** `cortex specs lint` runs
- **Then** there is no `lint.literal` finding

### Fix adds a stub overview, a reverse link and a missing id

- **Given** a folder with no `_overview.md`, a forward link with no reverse link, and a heading without an id in a spec whose highest id is 4
- **When** `cortex specs lint --fix` runs
- **Then** the stub exists with TODO markers, the reverse link is added, and the heading has id 5

### Fix turns a one-item list into a scalar

- **Given** `implements:` as a one-item list
- **When** `cortex specs lint --fix` runs
- **Then** it is a scalar

### Fix never touches meaning

- **Given** a broken link, a gap in rule numbers and a criterion with no Then
- **When** `cortex specs lint --fix` runs
- **Then** those files are unchanged and the findings remain

## Notes

- `lint.literal` is a warning although the plan says "must become a constant": the rule is new, and the review decides whether it earns an error.
- `specflow.literals.ignore` is an extra key (schema S12.6).
- `src/loops/lint-scheduled.ts` and the weekly-quality payload (`src/cli/templates.ts`) name the skill. Replacing them belongs to `loops.quality-task`.
