---
id: specflow.index
status: draft
depends_on:
  - core-cli.init
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "src/specflow/model/**/*.ts"
  - "src/specflow/index.ts"
---

# `cortex specs index`: the spec and test model

## Intent

Specs, tests and constants are parsed once, by text, into one model. The check, lint and viewer all read it, and `specflow/INDEX.md` is its readable form. The index shows which criteria have a test and marks the rest `unverified`: a criterion with no test is a claim about the code, not a fact.

## Entities

- **READS:** `specflow/impl/**/*.spec.md`, `specflow/promises/**/*.md`, every `constants.md` under `specflow/`, the test files `specflow.tests` selects (schema S12.6).
- **WRITES:** `specflow/INDEX.md`.
- **CREATES:** nothing else. Formats are in schema S12.

## Rules

1. `cortex specs index` writes `specflow/INDEX.md` from the working tree. `--staged` reads the git index, and writes and stages the file only when it differs. `--json` writes nothing and prints the model to stdout (schema S12.5). Exit 0 on success, 1 when `specflow/` does not exist (`specflow: no specflow/ folder here`).
2. **Criteria.** A spec's Acceptance Criteria section is the first heading titled exactly `Acceptance Criteria`, at level 2 or 3, up to the next heading of that level or higher. Its criteria are the headings exactly one level below it. So `## Acceptance Criteria` holds `###` criteria, and `### Acceptance Criteria` holds `####` criteria. A criterion runs to the next heading of its own level or higher. Deeper headings inside it are part of its text.
3. **Criterion ids.** A criterion heading reads `<ID>: <title>`. `<ID>` is the spec's prefix, `-`, and a positive integer. The prefix is the spec id uppercased with each run of other characters replaced by `-`: `core-cli.init` gives `CORE-CLI-INIT`. Ids are written in the heading, so adding a criterion never renumbers another (schema S12.2). The bench's shorter prefixes (`ATT-ABSENCES-3` for `attendance.absences`) are accepted when already present: any id matching `[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]+` is an id, unique across the tree.
4. A heading with no id is a criterion without an id. It has no entry in the criteria list, and its spec is listed under `Specs without criterion ids`. A spec with some ids and some not is listed too. The check does not govern a criterion without an id.
5. **Tags, vitest, jest, node.** A test case is a call to `it` or `test`, with any of `.skip`, `.todo`, `.only`, `.concurrent`, `.sequential`, `.fails`, whose first argument is a string literal. A tag is `[ID]` or `[ID, ID]` at the very start of that string. The `describe` title is not read for tags. Calls inside comments or strings are not cases.
6. **Tags, pytest.** A test case is a `def test_*` or `async def test_*`, at module level or in a class. Its tags are the string arguments of `@pytest.mark.criterion(...)` decorators directly above it, in any order among other decorators. Parsing is by text in Node, with no Python. A parametrized test is one case.
7. **Skipped cases.** A case is skipped when it uses `.skip` or `.todo`, sits in a `describe.skip` or `describe.todo`, or has a `@pytest.mark.skip` or `@pytest.mark.skipif` decorator. Skipped cases are listed with `(skipped)`.
8. **`unverified`.** A criterion is `unverified` when no non-skipped case carries its id. Only the index computes the mark; nothing parses a hand-written one.
9. **Untagged and orphans.** An untagged test is a case with no tag, skipped or not. An orphan tag is a tag naming no criterion in the model.
10. **Constants.** A `constants.md` declares constants in its frontmatter (schema S12.4). The model records each one's name, value and file. A criterion names a constant as `const:NAME`. A name resolves in the spec's own folder or the nearest ancestor up to `specflow/`, never in a child or sibling folder (P6).
11. **Promises.** A spec belongs to the promise its `serves:` names, or, before promise conversion, to the business spec its `implements:` names. A spec with neither is under `Specs without a promise`.
12. **INDEX text.** The format is in schema S12.3. Output is deterministic: sorted by id with numbers in numeric order, no dates, so the same tree gives the same bytes. The first lines say it is generated.
13. **Test selection.** Files come from `specflow.tests` only. With no `specflow.tests`, the index still writes, counts no tests and prints `specflow: warning: specflow.tests is not set; no tests were read`.

## Acceptance Criteria

### Criteria are found under a level-2 section

- **Given** `specflow/impl/billing/refunds.spec.md` with `## Acceptance Criteria` and two `###` headings `BILLING-REFUNDS-1: A` and `BILLING-REFUNDS-2: B`
- **When** `cortex specs index --json` runs
- **Then** the spec has criteria `BILLING-REFUNDS-1` and `BILLING-REFUNDS-2` with titles `A` and `B`

### Criteria are found under a level-3 section

- **Given** a spec with `### Acceptance Criteria`, two `####` criteria with ids, and `### Notes` after them
- **When** `cortex specs index --json` runs
- **Then** the spec has exactly those two criteria

### A deeper heading stays inside its criterion

- **Given** a `###` criterion containing a `####` heading
- **When** the model is built
- **Then** it is one criterion and its text holds the `####` line

### Headings of the right level outside the section are not criteria

- **Given** a spec with a `### Mobile` heading under `## Rules`
- **When** the model is built
- **Then** `Mobile` is no criterion

### A heading with no id is listed, not numbered

- **Given** a spec whose only criterion heading is `### A`
- **When** `cortex specs index` runs
- **Then** the spec appears under `Specs without criterion ids` and the criteria count is 0

### Adding a criterion in the middle moves no id

- **Given** a spec with `BILLING-REFUNDS-1` and `BILLING-REFUNDS-2`, and a test tagged `[BILLING-REFUNDS-2]`
- **When** `BILLING-REFUNDS-3: C` is inserted between them and the index runs
- **Then** the test is still listed under the criterion titled as before

### A test name tag is read

- **Given** `specflow.tests` selects `tests/a.test.ts`, holding `it('[BILLING-REFUNDS-1] adds up', …)`
- **When** the model is built
- **Then** `BILLING-REFUNDS-1` lists that case and is not `unverified`

### Two tags on one test are read

- **Given** `it('[BILLING-REFUNDS-1, BILLING-REFUNDS-2] x', …)`
- **When** the model is built
- **Then** both criteria list the case

### A tag not at the start is no tag

- **Given** `it('adds up [BILLING-REFUNDS-1]', …)`
- **When** the model is built
- **Then** the case is untagged

### A describe tag is not read

- **Given** `describe('[BILLING-REFUNDS-1] group', () => { it('x', …) })`
- **When** the model is built
- **Then** the case is untagged

### A commented-out test is no case

- **Given** `// it('[BILLING-REFUNDS-1] x', …)`
- **When** the model is built
- **Then** no case exists for that line

### A pytest marker is read

- **Given** `specflow.tests` selects a file with `@pytest.mark.criterion("BILLING-REFUNDS-1")` above `def test_x():`, and another with two ids above `async def test_y` in a class
- **When** the model is built, on a machine with no Python
- **Then** the criteria list both cases

### A marker with other decorators between is read

- **Given** `@pytest.mark.criterion("BILLING-REFUNDS-1")`, then `@pytest.mark.slow`, then `def test_x():`
- **When** the model is built
- **Then** the criterion lists the case

### A docstring tag is not a pytest tag

- **Given** `def test_x():` with docstring `"""[BILLING-REFUNDS-1] x"""`
- **When** the model is built
- **Then** the case is untagged

### A criterion with no test is unverified

- **Given** a criterion no case cites
- **When** `cortex specs index` runs
- **Then** its INDEX line ends `· unverified`, and the JSON has `unverified: true`

### A criterion with only a skipped test is unverified

- **Given** `it.skip('[BILLING-REFUNDS-1] x', …)` as its only case
- **When** the model is built
- **Then** the criterion is `unverified` and its test line ends `(skipped)`

### A case inside a skipped describe is skipped

- **Given** `describe.skip('g', () => { it('[BILLING-REFUNDS-1] x', …) })`
- **When** the model is built
- **Then** the case is skipped

### A hand-written mark is ignored

- **Given** a heading `BILLING-REFUNDS-1: A (unverified)` with a passing tagged case
- **When** the model is built
- **Then** the title is `A (unverified)` and `unverified` is false

### Untagged tests are counted

- **Given** three cases, one tagged
- **When** `cortex specs index` runs
- **Then** the INDEX header has the line `Untagged tests: 2`, and the JSON `untagged` list has both with file, name and line

### An orphan tag is listed

- **Given** a case tagged `[BILLING-REFUNDS-99]` with no such criterion
- **When** `cortex specs index` runs
- **Then** the INDEX lists it under `Tags naming no criterion`

### Constants are listed

- **Given** `specflow/impl/billing/constants.md` declaring `REFUND_DAYS: 30`
- **When** `cortex specs index` runs
- **Then** the INDEX `Constants` section has `REFUND_DAYS` with value `30` and that file

### A constant resolves from an ancestor and not from a sibling

- **Given** `specflow/constants.md` with `A: 1`, `specflow/impl/billing/constants.md` with `B: 2`, and a spec in `specflow/impl/shipping/` using `const:A` and `const:B`
- **When** the model is built
- **Then** `const:A` resolves and `const:B` does not

### A spec is grouped under its promise

- **Given** a promise `P-BILLING-1` and a spec with `serves: [P-BILLING-1]`
- **When** `cortex specs index` runs
- **Then** the spec is listed under `### P-BILLING-1: <title>`

### An unconverted spec is grouped under its business spec

- **Given** a spec with `implements:` resolving to `specflow/promises/billing/x.business.md` and no `serves:`
- **When** `cortex specs index` runs
- **Then** the spec is listed under that file

### The same tree gives the same bytes

- **Given** a tree
- **When** `cortex specs index` runs twice, on different days
- **Then** the two files are identical

### Numbers sort as numbers

- **Given** criteria ending `-2` and `-10`
- **When** `cortex specs index` runs
- **Then** `-2` comes first

### Staged mode reads the git index

- **Given** a staged criterion and an unstaged one
- **When** `cortex specs index --staged` runs
- **Then** the staged `specflow/INDEX.md` lists only the staged criterion

### Staged mode leaves an unchanged file alone

- **Given** an INDEX already matching the git index
- **When** `cortex specs index --staged` runs
- **Then** `git status --porcelain` is unchanged

### A missing folder is an error

- **Given** a repository with no `specflow/`
- **When** `cortex specs index` runs
- **Then** it exits 1 with `specflow: no specflow/ folder here`

### No test config warns

- **Given** a `specflow/` folder and no `specflow.tests`
- **When** `cortex specs index` runs
- **Then** it exits 0, `Untagged tests: 0` is written, and stderr carries the warning

## Notes

- **OPEN (owner, G2):** ids in headings. The port writes them there (`specflow.port` Rule 4); positional ids would silently re-point tags when a criterion is inserted. The bench's measured tree had them in the heading.
- **OPEN (owner, G2):** a tag on a `describe` covering its cases. This spec stays per test case (A7).
- pytest's marker is new; the bench used a docstring tag. The G2 sitting confirms it (plan section 10).
- A repository using pytest registers the `criterion` marker itself. Core does not edit `pytest.ini`.
