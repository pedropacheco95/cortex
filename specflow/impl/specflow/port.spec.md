---
id: specflow.port
status: implemented
depends_on:
  - specflow.index
implements: ../../promises/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "src/specflow/port.ts"
  - "src/paths.ts"
---

# `cortex specs port`: moving an existing spec tree into `specflow/`

## Intent

Existing projects keep their specs. The port moves a tree into the visible `specflow/` folder and gives each criterion a stable id, so the check and the index can govern it. It says exactly what it could not govern, instead of pretending to cover it. Core does the mechanical part only. The two judgement steps, promise conversion and the tagging pass, are defined here by their outputs and run in `specflow-onboard`'s port mode (A10).

## Entities

- **READS:** the source tree, the repository's tests, `cortex/cortex.json`.
- **WRITES:** `specflow/impl/**`, `specflow/promises/**`, `specflow/INDEX.md`, `cortex/cortex.json` key `specflow`, `.git/info/exclude`.
- **CREATES:** `.cortex-port/report.md`, `.cortex-port/report.json`.

## Rules

1. `cortex specs port [--dry-run] [--ticket-pattern <regex>]`. `--dry-run` writes nothing and prints the report. The command stages its moves and commits nothing. Exit 0 on success, 1 on a refusal, and it never fails half-way: all checks run before the first move.
2. **Source layouts.** Layout A is `.specflow/specs/` with `.specflow/specs-business/`. Layout B is `specs/impl/` with `specs/promises/`. The dev tree is what identifies a layout; a missing business tree moves nothing. Refuse (exit 1, nothing written) when neither exists, when both exist, when `specflow/impl/` or `specflow/promises/` already exists, when `cortex/cortex.json` does not exist, when it cannot be parsed, when it has a `migration` field whose `accepted` is not a date, when it has no `migration` field and a `.cortex/` folder exists (the 3.x hooks are still live and would stop seeing the specs), or when `git status --porcelain` shows a change under the source tree.
3. **The move.** Each file moves by `git mv` with its path below the root unchanged: `.specflow/specs/<p>` and `specs/impl/<p>` to `specflow/impl/<p>`; `.specflow/specs-business/<p>` and `specs/promises/<p>` to `specflow/promises/<p>`. `_overview.md` and `_index.md` files move too. Layout A's emptied `.specflow/` folder goes; Layout B's `specs/INDEX.md` is deleted, since it is regenerated.
4. **Criterion ids.** In each file under `specflow/impl/` that is not retired (Rule 15), each criterion heading (`specflow.index` Rule 2) with no id gains `<ID>: ` before its title, numbered from 1 in file order. Numbering continues past the highest id already in the file. Heading level and title text do not change. **OPEN (owner, G2):** this is a text change. The bench's tree carried ids in headings, and positional ids are not stable.
5. **Frontmatter links.** Relative `implements:` and `implemented_by:` values are rewritten to the new relative paths. **OPEN (owner, G2):** a second narrow text change; without it every link breaks.
6. **Nothing else changes.** After removing the Rule 4 prefixes and reversing the Rule 5 rewrites, each file is byte-identical to its source. Body text that cites an old path stays as written; the managed block says such paths mean the same file under `specflow/`. The command verifies this for every file before staging and refuses if it fails.
7. **Test config.** If `specflow.tests` is absent, the command writes default entries, one for each runner with at least one matching file, and prints them for review: `{ "runner": "vitest", "include": ["**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}"], "exclude": ["**/e2e/**"] }` and `{ "runner": "pytest", "include": ["**/test_*.py", "**/*_test.py"], "exclude": [] }`. `node_modules`, `.venv` and `dist` are always excluded. It writes `"rules": { "b": "off", "c": "off" }`. A present key is left alone.
8. **Spec classes.** Each spec gets one class, in this order of precedence:
   - `retired`: `status: retired`.
   - `no-ACs`: no criterion heading.
   - `not-mappable`: the spec id, its path, and any ticket it cites appear in no test file.
   - `needs-edit`: a criterion has no `Then` clause (case-insensitive), or the Acceptance Criteria section has text outside any criterion, or two headings repeat, or the link to tests runs only through a ticket other specs also cite, or it implements a retired business spec.
   - `clean`: the rest.

   Tickets are matches of `--ticket-pattern`; with none given, there are no tickets. A ticket cited by exactly this spec counts as a link to it.
9. **Report.** `.cortex-port/report.md` has: source layout, HEAD, counts of specs, criteria, test files, test cases and names built at run time (`specflow.index` Rule 5), every heading in a live spec that holds `acceptance` or `criteria` in any case and is not a counted section or inside one, so a section cannot hide by its spelling, specs per class, each non-clean spec with its class and reason, and untagged cases per test file. `.cortex-port/report.json` holds the same and the full untagged list (`file`, `name`, `line`). `.cortex-port/` is added to `.git/info/exclude`. A spec that is not `clean` still moves; the class says what the check cannot yet rely on.
10. **Next steps.** On success the command writes `specflow/INDEX.md` and prints, in order: review and commit the move; `cortex store map`; `cortex hooks install`; then the two agentic steps in `specflow-onboard`. It runs none of them.
11. **Promise conversion (agentic; output contract).** Each business spec that is not retired becomes one promise of schema S12.1, with `serves: [<promise id>]` added to the frontmatter of every live spec that implements it, and `implements:` removed from those specs. This is the one text rewrite, and the owner approves it per repository. Drafts sit in `.cortex-port/promises/` at the path they will take. Reasoning a promise drops goes to `cortex/world/decisions/`, not nowhere.
12. **Tagging pass (agentic; output contract).** The files `.cortex-port/tagging/<area>.jsonl` together have one line for every untagged case: `file`, `name`, `line`, `action` (`tag`, `new-criterion` or `delete`), `reason`, plus `criterion` for `tag` and `spec` and `title` for `new-criterion`. A case matching no criterion proposes `new-criterion` first; `delete` is only for behaviour nobody wants (P5), and a case that proves only a retired spec's behaviour proposes it, naming that spec in `reason`. The owner approves the proposals, and the skill applies them.
13. **`cortex specs port --verify`** reads `.cortex-port/tagging/*.jsonl` and the current tests, and prints each untagged case with no proposal, each `tag` proposal naming no criterion, and each malformed line. A proposal matches a case by file and name, not line, so an edit above a test breaks nothing. Exit 1 if any, 0 otherwise. It writes nothing.
14. **Going live.** Rules (b) and (c) are switched on by editing `specflow.rules`, and only once `Untagged tests: 0` holds. `lint.rules-early` enforces it (A11).
15. **Retired specs are records.** A dev or business spec with `status: retired` moves like any other (Rule 3), and its links are rewritten (Rule 5). Nothing else happens to it, now or in the agentic steps:
    - it gains no criterion ids, and an id it already has stays;
    - a retired business spec becomes no promise and keeps its file name;
    - a retired dev spec gains no `serves:` and keeps its `implements:`, even after the file it names is converted;
    - no tagging proposal may name it, since its criteria are not in the model (`specflow.index` Rule 14).

    A live dev spec that implements a retired business spec is not converted either. It keeps its `implements:`, is reported as `needs-edit`, and the owner decides where it belongs.

## Acceptance Criteria

### SPECFLOW-PORT-1: A two-tree project moves

- **Given** a clean repository with `.specflow/specs/billing/refunds.spec.md`, `.specflow/specs-business/billing/refunds-are-fair.business.md` and an `_overview.md` in each folder
- **When** `cortex specs port` runs
- **Then** it exits 0, the files sit at `specflow/impl/billing/refunds.spec.md` and `specflow/promises/billing/refunds-are-fair.business.md` with their overviews, `.specflow/` is gone, and `git status` shows them staged as renames with no commit made

### SPECFLOW-PORT-2: A bench-layout project moves

- **Given** `specs/impl/billing/refunds.spec.md` with stamped ids, `specs/promises/billing/x.md` and `specs/INDEX.md`
- **When** `cortex specs port` runs
- **Then** the files sit under `specflow/`, no heading changed, `specs/` is gone, and `specflow/INDEX.md` exists

### SPECFLOW-PORT-3: Ids are written into headings at either level

- **Given** one spec with `## Acceptance Criteria` and `### Refund is issued`, and another with `### Acceptance Criteria` and `#### Refund is issued`
- **When** `cortex specs port` runs
- **Then** the headings read `### BILLING-REFUNDS-1: Refund is issued` and `#### BILLING-OTHER-1: Refund is issued`, at their original levels

### SPECFLOW-PORT-4: Existing ids are kept and numbering continues

- **Given** a spec with headings `BILLING-REFUNDS-4: A` and `B`
- **When** `cortex specs port` runs
- **Then** the headings read `BILLING-REFUNDS-4: A` and `BILLING-REFUNDS-5: B`

### SPECFLOW-PORT-5: Frontmatter links still resolve

- **Given** a moved spec and business spec linked both ways
- **When** `cortex specs port` runs and `cortex specs lint` follows
- **Then** lint reports no link error

### SPECFLOW-PORT-6: Everything else is byte-identical

- **Given** a spec whose body cites `.specflow/specs/billing/other.spec.md`
- **When** `cortex specs port` runs
- **Then** that text is unchanged, and a diff against the source shows only heading prefixes and link values

### SPECFLOW-PORT-7: A retired dev spec moves and stays as it was

- **Given** `.specflow/specs/billing/old.spec.md` with `status: retired`, `### Refund is issued` under its Acceptance Criteria, and an `implements:` link
- **When** `cortex specs port` runs
- **Then** it sits at `specflow/impl/billing/old.spec.md`, its heading has no id, only the link value differs from the source, and `report.json` gives its class as `retired`

### SPECFLOW-PORT-8: A retired business spec moves and keeps its name

- **Given** `.specflow/specs-business/billing/old.business.md` with `status: retired`
- **When** `cortex specs port` runs
- **Then** it sits at `specflow/promises/billing/old.business.md`, unchanged but for its link values

### SPECFLOW-PORT-9: A retired spec outranks every other class

- **Given** a spec with `status: retired`, no criteria, and no test citing it
- **When** `cortex specs port` runs
- **Then** its class is `retired`

### SPECFLOW-PORT-10: A live spec on a retired business spec is flagged

- **Given** a live spec cited by a test, whose `implements:` names a business spec with `status: retired`
- **When** `cortex specs port` runs
- **Then** its class is `needs-edit`, and the reason names that business spec

### SPECFLOW-PORT-11: A tag proposal naming a retired spec's criterion fails verify

- **Given** a retired spec holding `BILLING-OLD-1`, one untagged case, and a line with `action` `tag` and `criterion` `BILLING-OLD-1`
- **When** `cortex specs port --verify` runs
- **Then** it exits 1 and names that line

### SPECFLOW-PORT-12: Both layouts present is refused

- **Given** `.specflow/specs/` and `specs/impl/`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### SPECFLOW-PORT-13: No tree is refused

- **Given** neither layout
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing was written

### SPECFLOW-PORT-14: An existing target is refused

- **Given** `.specflow/specs/` and `specflow/impl/`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### SPECFLOW-PORT-15: A 3.x project beside a bare store is refused

- **Given** `.specflow/specs/`, a `.cortex/` folder with or without its config, and a `cortex/cortex.json` with no `migration` field
- **When** `cortex specs port` runs
- **Then** it exits 1, names `cortex migrate`, and nothing moved

### SPECFLOW-PORT-16: A migration with no accepted date is refused

- **Given** `.specflow/specs/` and a `cortex/cortex.json` whose `migration` has no `accepted`, or one that is not a date
- **When** `cortex specs port` runs
- **Then** it exits 1, names `cortex migrate --accept`, and nothing moved

### SPECFLOW-PORT-17: An unreadable store file is refused

- **Given** `.specflow/specs/` and a `cortex/cortex.json` that does not parse
- **When** `cortex specs port` runs
- **Then** it exits 1, names `cortex/cortex.json`, and nothing moved

### SPECFLOW-PORT-18: An unaccepted migration is refused

- **Given** `.specflow/specs/`, `.cortex/cortex.config.json`, and a `cortex/cortex.json` whose `migration.accepted` is `null`
- **When** `cortex specs port` runs
- **Then** it exits 1, names `cortex migrate --accept`, and nothing moved

### SPECFLOW-PORT-19: A dirty source is refused

- **Given** an uncommitted edit under `.specflow/specs/`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### SPECFLOW-PORT-20: No store is refused

- **Given** a spec tree and no `cortex/cortex.json`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### SPECFLOW-PORT-21: A dry run writes nothing

- **Given** a portable repository
- **When** `cortex specs port --dry-run` runs
- **Then** it exits 0, the report is on stdout, and `git status --porcelain` is empty

### SPECFLOW-PORT-22: Test config defaults are written

- **Given** `tests/a.test.ts`, `backend/tests/test_b.py` and no `specflow` key
- **When** `cortex specs port` runs
- **Then** `specflow.tests` has a vitest and a pytest entry, `specflow.rules` has `b` and `c` set to `off`, and both are printed

### SPECFLOW-PORT-23: Only runners with files are written

- **Given** only `tests/a.test.ts`
- **When** `cortex specs port` runs
- **Then** `specflow.tests` has no pytest entry

### SPECFLOW-PORT-24: An existing test config is kept

- **Given** a `specflow.tests` naming one include
- **When** `cortex specs port` runs
- **Then** it is unchanged

### SPECFLOW-PORT-25: Each class is reported

- **Given** a spec with no criteria; one cited by no test; one whose criterion has no Then; one with text between criteria; one with repeated headings; and one clean and cited by a test
- **When** `cortex specs port` runs
- **Then** `report.json` gives them `no-ACs`, `not-mappable`, `needs-edit`, `needs-edit`, `needs-edit` and `clean`, each non-clean one with a reason, and all six moved

### SPECFLOW-PORT-26: Precedence holds

- **Given** a spec with no criteria and no test citing it
- **When** `cortex specs port` runs
- **Then** its class is `no-ACs`

### SPECFLOW-PORT-27: A ticket cited by one spec links it

- **Given** `--ticket-pattern 'TKT-[0-9]+'`, a spec citing `TKT-7`, cited by no other spec, and a test citing only `TKT-7`
- **When** `cortex specs port` runs
- **Then** its class is `clean`

### SPECFLOW-PORT-28: A ticket shared by two specs does not link

- **Given** two specs citing `TKT-7` and a test citing only `TKT-7`
- **When** `cortex specs port` runs
- **Then** both are `needs-edit`

### SPECFLOW-PORT-29: Untagged tests are listed

- **Given** 3 test cases, none tagged
- **When** `cortex specs port` runs
- **Then** `report.json` lists all 3 with file, name and line, and `report.md` gives the per-file count

### SPECFLOW-PORT-30: Names built at run time are counted

- **Given** a test file with ``it(`${x} pays`, …)`` and `it('a', …)`
- **When** `cortex specs port` runs
- **Then** `report.json` has `dynamicNames` 1 and `report.md` states it

### SPECFLOW-PORT-31: Ids run on through several sections

- **Given** a spec with `## Acceptance Criteria` holding `A`, and `## Acceptance Criteria: more` holding `B`
- **When** `cortex specs port` runs
- **Then** the headings read `BILLING-REFUNDS-1: A` and `BILLING-REFUNDS-2: B`

### SPECFLOW-PORT-32: A heading that nearly matches is reported

- **Given** a spec with `## Acceptance Criteria` and `## Acceptance criteria for mobile`
- **When** `cortex specs port` runs
- **Then** `report.json` `nearHeadings` lists that heading with file and line, and `report.md` shows it

### SPECFLOW-PORT-33: The working folder stays out of git

- **Given** a port has run
- **When** `git status --porcelain` runs
- **Then** nothing under `.cortex-port/` is listed

### SPECFLOW-PORT-34: Next steps are printed and not run

- **Given** a successful port
- **When** its output is read
- **Then** it names `cortex store map` and `cortex hooks install`, `core.hooksPath` is unset, and `MAP.md` is unchanged

### SPECFLOW-PORT-35: Verify finds a case with no proposal

- **Given** 2 untagged cases and `.cortex-port/tagging/billing.jsonl` with one line
- **When** `cortex specs port --verify` runs
- **Then** it exits 1 and names the other case

### SPECFLOW-PORT-36: Verify finds a tag proposal naming no criterion

- **Given** one untagged case and a line with `action` `tag` and `criterion` `BILLING-REFUNDS-99`, which does not exist
- **When** `cortex specs port --verify` runs
- **Then** it exits 1 and names that line

### SPECFLOW-PORT-37: Verify passes on a full set

- **Given** every untagged case has a valid line
- **When** `cortex specs port --verify` runs
- **Then** it exits 0

## Notes

- Promise conversion and the tagging pass are tested in `specflow.onboard-skill`; only their output contracts are here. That includes Rule 15 inside those two steps.
- This repository's own paths in Core (`src/paths.ts`, the validator) must read `specflow/` once ported; `specflow.lint` Rule 2 covers it.
