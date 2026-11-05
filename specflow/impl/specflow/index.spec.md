---
id: specflow.index
status: implemented
depends_on:
  - core-cli.init
implements: ../../promises/specflow/developer-knows-the-specs-stay-sound.business.md
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
2. **Headings and fences.** A heading may be closed (`## Rules ##`) and indented up to 3 spaces. A code fence closes only on a bare line of its own character and at least its length, and a fence never closed fences nothing, so a stray line cannot hide the rest of a spec. Frontmatter is YAML or JSON: a `---js` block is never run and parses as no frontmatter.
   **Criteria.** A spec's Acceptance Criteria sections are the headings titled exactly `Acceptance Criteria`, or starting `Acceptance Criteria:`, at level 2 or 3, each up to the next heading of that level or higher. A spec may have several, and ids run on through the file. A section's criteria are the headings exactly one level below it. So `## Acceptance Criteria` holds `###` criteria, and `### Acceptance Criteria` holds `####` criteria. A criterion runs to the next heading of its own level or higher. Deeper headings inside it are part of its text.
3. **Criterion ids.** A criterion heading reads `<ID>: <title>`. `<ID>` is the spec's prefix, `-`, and a positive integer. The prefix is the spec id uppercased with each run of other characters replaced by `-`: `core-cli.init` gives `CORE-CLI-INIT`. Ids are written in the heading, so adding a criterion never renumbers another (schema S12.2). The bench's shorter prefixes (`PAY-REFUND-3` for `payments.refund`) are accepted when already present: any id matching `[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]+` is an id, unique across the tree.
4. A heading with no id is a criterion without an id. It has no entry in the criteria list, and its spec is listed under `Specs without criterion ids`. A spec with some ids and some not is listed too. The check does not govern a criterion without an id.
5. **Tags, vitest, jest, node.** A test case is a call to `it`, `test`, `fit`, `xit` or `xtest`, with any of `.skip`, `.todo`, `.only`, `.concurrent`, `.sequential`, `.fails`, `.failing`, `.skipIf(…)`, `.runIf(…)`, whose first argument is a string literal. `xit` and `xtest` are skipped. A tag is `[ID]` or `[ID, ID]` at the very start of that string. The `describe` title is not read for tags. Calls inside comments or strings are not cases.
   - **Names built at run time.** A template literal holding `${…}`, the name passed to the call `.each(…)` or `.for(…)` returns, and any other non-literal first argument give a name the text cannot read in full. When the name's source text starts with a static tag, it is a tagged case, one case however many it expands to, named by that source text. Otherwise it is not a case: it is counted in the model and reported by `specflow.port` Rule 9.
6. **Tags, pytest.** A test case is a `def test_*` or `async def test_*`, at module level or in a class. Its tags are the string arguments of `@pytest.mark.criterion(...)` decorators directly above it, in any order among other decorators. Parsing is by text in Node, with no Python. A parametrized test is one case.
7. **Skipped cases.** A case is skipped when it uses `.skip` or `.todo`, sits in a `describe.skip` or `describe.todo`, or has a `@pytest.mark.skip` or `@pytest.mark.skipif` decorator. Skipped cases are listed with `(skipped)`.
8. **`unverified`.** A criterion is `unverified` when no non-skipped case carries its id. Only the index computes the mark; nothing parses a hand-written one.
9. **Untagged and orphans.** An untagged test is a case with no tag, skipped or not. An orphan tag is a tag naming no criterion in the model.
10. **Constants.** A `constants.md` declares constants in its frontmatter (schema S12.4). The model records each one's name, value and file. A criterion names a constant as `const:NAME`. A name resolves in the spec's own folder or the nearest ancestor up to `specflow/`, never in a child or sibling folder (P6).
11. **Promises.** A spec belongs to the promise its `serves:` names, or, before promise conversion, to the business spec its `implements:` names. A spec with neither is under `Specs without a promise`.
12. **INDEX text.** The format is in schema S12.3. Output is deterministic: sorted by id with numbers in numeric order, no dates, so the same tree gives the same bytes. The first lines say it is generated.
13. **Test selection.** Files come from `specflow.tests` only. With no `specflow.tests`, the index still writes, counts no tests and prints `specflow: warning: specflow.tests is not set; no tests were read`.
14. **Retired.** A spec, business spec or promise with `status: retired` is a record, listed only under `## Retired` (schema S12.3) and in the JSON `retired` list. It counts in no total, its criteria are not in the model, and none is `unverified`. So a tag naming one of its criteria is an orphan tag (Rule 9), and a live spec serving a retired promise is under `Specs without a promise`. Its ids stay taken: Rule 3's uniqueness still reads retired files.

## Acceptance Criteria

### SPECFLOW-INDEX-1: Criteria are found under a level-2 section

- **Given** `specflow/impl/billing/refunds.spec.md` with `## Acceptance Criteria` and two `###` headings `BILLING-REFUNDS-1: A` and `BILLING-REFUNDS-2: B`
- **When** `cortex specs index --json` runs
- **Then** the spec has criteria `BILLING-REFUNDS-1` and `BILLING-REFUNDS-2` with titles `A` and `B`

### SPECFLOW-INDEX-2: Criteria are found under a level-3 section

- **Given** a spec with `### Acceptance Criteria`, two `####` criteria with ids, and `### Notes` after them
- **When** `cortex specs index --json` runs
- **Then** the spec has exactly those two criteria

### SPECFLOW-INDEX-3: Several sections are all read

- **Given** a spec with `## Acceptance Criteria` holding `BILLING-REFUNDS-1: A`, `## Notes`, and `## Acceptance Criteria: the 2026 amendment` holding `BILLING-REFUNDS-2: B`
- **When** the model is built
- **Then** the spec has both criteria

### SPECFLOW-INDEX-4: A deeper heading stays inside its criterion

- **Given** a `###` criterion containing a `####` heading
- **When** the model is built
- **Then** it is one criterion and its text holds the `####` line

### SPECFLOW-INDEX-5: Headings of the right level outside the section are not criteria

- **Given** a spec with a `### Mobile` heading under `## Rules`
- **When** the model is built
- **Then** `Mobile` is no criterion

### SPECFLOW-INDEX-6: A heading with no id is listed, not numbered

- **Given** a spec whose only criterion heading is `### A`
- **When** `cortex specs index` runs
- **Then** the spec appears under `Specs without criterion ids` and the criteria count is 0

### SPECFLOW-INDEX-7: Adding a criterion in the middle moves no id

- **Given** a spec with `BILLING-REFUNDS-1` and `BILLING-REFUNDS-2`, and a test tagged `[BILLING-REFUNDS-2]`
- **When** `BILLING-REFUNDS-3: C` is inserted between them and the index runs
- **Then** the test is still listed under the criterion titled as before

### SPECFLOW-INDEX-8: A test name tag is read

- **Given** `specflow.tests` selects `tests/a.test.ts`, holding `it('[BILLING-REFUNDS-1] adds up', …)`
- **When** the model is built
- **Then** `BILLING-REFUNDS-1` lists that case and is not `unverified`

### SPECFLOW-INDEX-9: Two tags on one test are read

- **Given** `it('[BILLING-REFUNDS-1, BILLING-REFUNDS-2] x', …)`
- **When** the model is built
- **Then** both criteria list the case

### SPECFLOW-INDEX-10: A template with a static tag is a tagged case

- **Given** ``it(`[BILLING-REFUNDS-1] pays ${x}`, …)`` in a loop
- **When** the model is built
- **Then** `BILLING-REFUNDS-1` lists one case and is not `unverified`

### SPECFLOW-INDEX-11: An each name with a static tag is a tagged case

- **Given** `it.each([1, 2])('[BILLING-REFUNDS-1] pays %s', …)`
- **When** the model is built
- **Then** `BILLING-REFUNDS-1` lists one case

### SPECFLOW-INDEX-12: A name built at run time with no static tag is only counted

- **Given** ``it(`${x} pays`, …)``, `it.each([1])('pays %s', …)` and `it(name, …)`
- **When** the model is built
- **Then** there is no case and no untagged test, and the model counts 3

### SPECFLOW-INDEX-13: A tag not at the start is no tag

- **Given** `it('adds up [BILLING-REFUNDS-1]', …)`
- **When** the model is built
- **Then** the case is untagged

### SPECFLOW-INDEX-14: A describe tag is not read

- **Given** `describe('[BILLING-REFUNDS-1] group', () => { it('x', …) })`
- **When** the model is built
- **Then** the case is untagged

### SPECFLOW-INDEX-15: A commented-out test is no case

- **Given** `// it('[BILLING-REFUNDS-1] x', …)`
- **When** the model is built
- **Then** no case exists for that line

### SPECFLOW-INDEX-16: A pytest marker is read

- **Given** `specflow.tests` selects a file with `@pytest.mark.criterion("BILLING-REFUNDS-1")` above `def test_x():`, and another with two ids above `async def test_y` in a class
- **When** the model is built, on a machine with no Python
- **Then** the criteria list both cases

### SPECFLOW-INDEX-17: A marker with other decorators between is read

- **Given** `@pytest.mark.criterion("BILLING-REFUNDS-1")`, then `@pytest.mark.slow`, then `def test_x():`
- **When** the model is built
- **Then** the criterion lists the case

### SPECFLOW-INDEX-18: A docstring tag is not a pytest tag

- **Given** `def test_x():` with docstring `"""[BILLING-REFUNDS-1] x"""`
- **When** the model is built
- **Then** the case is untagged

### SPECFLOW-INDEX-19: A criterion with no test is unverified

- **Given** a criterion no case cites
- **When** `cortex specs index` runs
- **Then** its INDEX line ends `· unverified`, and the JSON has `unverified: true`

### SPECFLOW-INDEX-20: A criterion with only a skipped test is unverified

- **Given** `it.skip('[BILLING-REFUNDS-1] x', …)` as its only case
- **When** the model is built
- **Then** the criterion is `unverified` and its test line ends `(skipped)`

### SPECFLOW-INDEX-21: A case inside a skipped describe is skipped

- **Given** `describe.skip('g', () => { it('[BILLING-REFUNDS-1] x', …) })`
- **When** the model is built
- **Then** the case is skipped

### SPECFLOW-INDEX-22: A hand-written mark is ignored

- **Given** a heading `BILLING-REFUNDS-1: A (unverified)` with a passing tagged case
- **When** the model is built
- **Then** the title is `A (unverified)` and `unverified` is false

### SPECFLOW-INDEX-23: Untagged tests are counted

- **Given** three cases, one tagged
- **When** `cortex specs index` runs
- **Then** the INDEX header has the line `Untagged tests: 2`, and the JSON `untagged` list has both with file, name and line

### SPECFLOW-INDEX-24: An orphan tag is listed

- **Given** a case tagged `[BILLING-REFUNDS-99]` with no such criterion
- **When** `cortex specs index` runs
- **Then** the INDEX lists it under `Tags naming no criterion`

### SPECFLOW-INDEX-25: Constants are listed

- **Given** `specflow/impl/billing/constants.md` declaring `REFUND_DAYS: 30`
- **When** `cortex specs index` runs
- **Then** the INDEX `Constants` section has `REFUND_DAYS` with value `30` and that file

### SPECFLOW-INDEX-26: A constant resolves from an ancestor and not from a sibling

- **Given** `specflow/constants.md` with `A: 1`, `specflow/impl/billing/constants.md` with `B: 2`, and a spec in `specflow/impl/shipping/` using `const:A` and `const:B`
- **When** the model is built
- **Then** `const:A` resolves and `const:B` does not

### SPECFLOW-INDEX-27: A spec is grouped under its promise

- **Given** a promise `P-BILLING-1` and a spec with `serves: [P-BILLING-1]`
- **When** `cortex specs index` runs
- **Then** the spec is listed under `### P-BILLING-1: <title>`

### SPECFLOW-INDEX-28: An unconverted spec is grouped under its business spec

- **Given** a spec with `implements:` resolving to `specflow/promises/billing/x.business.md` and no `serves:`
- **When** `cortex specs index` runs
- **Then** the spec is listed under that file

### SPECFLOW-INDEX-29: A retired spec is listed and counts nowhere else

- **Given** a live spec with one criterion, a retired spec with two ids and no tests, and a retired spec with no ids
- **When** `cortex specs index` runs
- **Then** the header has `specs: 1 · criteria: 1`, both retired specs are under `## Retired` and in the JSON `retired` list, and neither is under `Specs without criterion ids` or `Specs without a promise`

### SPECFLOW-INDEX-30: A retired promise is listed and its spec loses its home

- **Given** a promise `P-BILLING-1` with `status: retired` and a live spec with `serves: [P-BILLING-1]`
- **When** `cortex specs index` runs
- **Then** the header has `Promises: 0`, `P-BILLING-1` is under `## Retired`, and the spec is under `Specs without a promise`

### SPECFLOW-INDEX-31: A tag on a retired criterion is an orphan

- **Given** a retired spec holding `BILLING-OLD-1` and `it('[BILLING-OLD-1] x', …)`
- **When** `cortex specs index` runs
- **Then** the INDEX lists it under `Tags naming no criterion`

### SPECFLOW-INDEX-32: The same tree gives the same bytes

- **Given** a tree
- **When** `cortex specs index` runs twice, on different days
- **Then** the two files are identical

### SPECFLOW-INDEX-33: Numbers sort as numbers

- **Given** criteria ending `-2` and `-10`
- **When** `cortex specs index` runs
- **Then** `-2` comes first

### SPECFLOW-INDEX-34: Staged mode reads the git index

- **Given** a staged criterion and an unstaged one
- **When** `cortex specs index --staged` runs
- **Then** the staged `specflow/INDEX.md` lists only the staged criterion

### SPECFLOW-INDEX-35: Staged mode leaves an unchanged file alone

- **Given** an INDEX already matching the git index
- **When** `cortex specs index --staged` runs
- **Then** `git status --porcelain` is unchanged

### SPECFLOW-INDEX-36: A missing folder is an error

- **Given** a repository with no `specflow/`
- **When** `cortex specs index` runs
- **Then** it exits 1 with `specflow: no specflow/ folder here`

### SPECFLOW-INDEX-37: No test config warns

- **Given** a `specflow/` folder and no `specflow.tests`
- **When** `cortex specs index` runs
- **Then** it exits 0, `Untagged tests: 0` is written, and stderr carries the warning

### SPECFLOW-INDEX-38: Every listed test modifier is a case; a regex test call and a variable name are not

- **Given** a test file holding `it.only('a')`, `test.concurrent('b')`, `it.sequential('c')`, `test.fails('d')`, the line `const r = /x(/.test('e');` and `it(name, f);`
- **When** the index model is built
- **Then** the untagged cases are `a`, `b`, `c` and `d`, in that order

### SPECFLOW-INDEX-39: A function nested in a test and a def in a docstring are no case

- **Given** a pytest file holding `def test_x():` with a nested `def test_inner():`, and a `def test_doc():` inside a triple-quoted string
- **When** the index model is built
- **Then** the untagged cases are `test_x` alone

### SPECFLOW-INDEX-40: A spec with neither link is listed under Specs without a promise

- **Given** a spec `billing.refunds` with no promise link and no business link
- **When** `cortex index` runs
- **Then** the index has a `## Specs without a promise` section listing `- spec **billing.refunds**`

### SPECFLOW-INDEX-41: --json writes nothing and prints the model

- **Given** a spec `billing.refunds` with two criteria and no promise
- **When** `cortex index --json` runs
- **Then** `INDEX.md` is not written (its text is empty), and stdout is the model whose `counts` are `promises` 0, `specs` 1, `criteria` 2, `tagged` 0, `unverified` 2, `untagged` 0

## Notes

- **OPEN (owner, G2):** ids in headings. The port writes them there (`specflow.port` Rule 4); positional ids would silently re-point tags when a criterion is inserted. The bench's measured tree had them in the heading.
- **OPEN (owner, G2):** a tag on a `describe` covering its cases. This spec stays per test case (A7).
- pytest's marker is new; the bench used a docstring tag. The G2 sitting confirms it (plan section 10).
- A repository using pytest registers the `criterion` marker itself. Core does not edit `pytest.ini`.
