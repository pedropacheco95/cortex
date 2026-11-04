---
id: specflow.port
status: draft
depends_on:
  - specflow.index
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
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
2. **Source layouts.** Layout A is `.specflow/specs/` with `.specflow/specs-business/`. Layout B is `specs/impl/` with `specs/promises/`. Refuse (exit 1, nothing written) when neither exists, when both exist, when `specflow/impl/` or `specflow/promises/` already exists, when `cortex/cortex.json` does not exist, or when `git status --porcelain` shows a change under the source tree.
3. **The move.** Each file moves by `git mv` with its path below the root unchanged: `.specflow/specs/<p>` and `specs/impl/<p>` to `specflow/impl/<p>`; `.specflow/specs-business/<p>` and `specs/promises/<p>` to `specflow/promises/<p>`. `_overview.md` and `_index.md` files move too. Layout A's emptied `.specflow/` folder goes; Layout B's `specs/INDEX.md` is deleted, since it is regenerated.
4. **Criterion ids.** In each file under `specflow/impl/`, each criterion heading (`specflow.index` Rule 2) with no id gains `<ID>: ` before its title, numbered from 1 in file order. Numbering continues past the highest id already in the file. Heading level and title text do not change. **OPEN (owner, G2):** this is a text change. The bench's tree carried ids in headings, and positional ids are not stable.
5. **Frontmatter links.** Relative `implements:` and `implemented_by:` values are rewritten to the new relative paths. **OPEN (owner, G2):** a second narrow text change; without it every link breaks.
6. **Nothing else changes.** After removing the Rule 4 prefixes and reversing the Rule 5 rewrites, each file is byte-identical to its source. Body text that cites an old path stays as written; the managed block says such paths mean the same file under `specflow/`. The command verifies this for every file before staging and refuses if it fails.
7. **Test config.** If `specflow.tests` is absent, the command writes default entries, one for each runner with at least one matching file, and prints them for review: `{ "runner": "vitest", "include": ["**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}"], "exclude": ["**/e2e/**"] }` and `{ "runner": "pytest", "include": ["**/test_*.py", "**/*_test.py"], "exclude": [] }`. `node_modules`, `.venv` and `dist` are always excluded. It writes `"rules": { "b": "off", "c": "off" }`. A present key is left alone.
8. **Spec classes.** Each spec gets one class, in this order of precedence:
   - `no-ACs`: no criterion heading.
   - `not-mappable`: the spec id, its path, and any ticket it cites appear in no test file.
   - `needs-edit`: a criterion has no `Then` clause (case-insensitive), or the Acceptance Criteria section has text outside any criterion, or two headings repeat, or the link to tests runs only through a ticket other specs also cite.
   - `clean`: the rest.

   Tickets are matches of `--ticket-pattern`; with none given, there are no tickets. A ticket cited by exactly this spec counts as a link to it.
9. **Report.** `.cortex-port/report.md` has: source layout, HEAD, counts of specs, criteria, test files and test cases, specs per class, each non-clean spec with its class and reason, and untagged cases per test file. `.cortex-port/report.json` holds the same and the full untagged list (`file`, `name`, `line`). `.cortex-port/` is added to `.git/info/exclude`. A spec that is not `clean` still moves; the class says what the check cannot yet rely on.
10. **Next steps.** On success the command writes `specflow/INDEX.md` and prints, in order: review and commit the move; `cortex store map`; `cortex hooks install`; then the two agentic steps in `specflow-onboard`. It runs none of them.
11. **Promise conversion (agentic; output contract).** Each business spec becomes one promise of schema S12.1, with `serves: [<promise id>]` added to the frontmatter of every spec that implements it, and `implements:` removed from those specs. This is the one text rewrite, and the owner approves it per repository. Drafts sit in `.cortex-port/promises/` at the path they will take. Reasoning a promise drops goes to `cortex/world/decisions/`, not nowhere.
12. **Tagging pass (agentic; output contract).** The files `.cortex-port/tagging/<area>.jsonl` together have one line for every untagged case: `file`, `name`, `line`, `action` (`tag`, `new-criterion` or `delete`), `reason`, plus `criterion` for `tag` and `spec` and `title` for `new-criterion`. A case matching no criterion proposes `new-criterion` first; `delete` is only for behaviour nobody wants (P5). The owner approves the proposals, and the skill applies them.
13. **`cortex specs port --verify`** reads `.cortex-port/tagging/*.jsonl` and the current tests, and prints each untagged case with no proposal, each `tag` proposal naming no criterion, and each malformed line. Exit 1 if any, 0 otherwise. It writes nothing.
14. **Going live.** Rules (b) and (c) are switched on by editing `specflow.rules`, and only once `Untagged tests: 0` holds. `lint.rules-early` enforces it (A11).

## Acceptance Criteria

### A two-tree project moves

- **Given** a clean repository with `.specflow/specs/billing/refunds.spec.md`, `.specflow/specs-business/billing/refunds-are-fair.business.md` and an `_overview.md` in each folder
- **When** `cortex specs port` runs
- **Then** it exits 0, the files sit at `specflow/impl/billing/refunds.spec.md` and `specflow/promises/billing/refunds-are-fair.business.md` with their overviews, `.specflow/` is gone, and `git status` shows them staged as renames with no commit made

### A bench-layout project moves

- **Given** `specs/impl/billing/refunds.spec.md` with stamped ids, `specs/promises/billing/x.md` and `specs/INDEX.md`
- **When** `cortex specs port` runs
- **Then** the files sit under `specflow/`, no heading changed, `specs/` is gone, and `specflow/INDEX.md` exists

### Ids are written into headings at either level

- **Given** one spec with `## Acceptance Criteria` and `### Refund is issued`, and another with `### Acceptance Criteria` and `#### Refund is issued`
- **When** `cortex specs port` runs
- **Then** the headings read `### BILLING-REFUNDS-1: Refund is issued` and `#### BILLING-OTHER-1: Refund is issued`, at their original levels

### Existing ids are kept and numbering continues

- **Given** a spec with headings `BILLING-REFUNDS-4: A` and `B`
- **When** `cortex specs port` runs
- **Then** the headings read `BILLING-REFUNDS-4: A` and `BILLING-REFUNDS-5: B`

### Frontmatter links still resolve

- **Given** a moved spec and business spec linked both ways
- **When** `cortex specs port` runs and `cortex specs lint` follows
- **Then** lint reports no link error

### Everything else is byte-identical

- **Given** a spec whose body cites `.specflow/specs/billing/other.spec.md`
- **When** `cortex specs port` runs
- **Then** that text is unchanged, and a diff against the source shows only heading prefixes and link values

### Both layouts present is refused

- **Given** `.specflow/specs/` and `specs/impl/`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### No tree is refused

- **Given** neither layout
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing was written

### An existing target is refused

- **Given** `.specflow/specs/` and `specflow/impl/`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### A dirty source is refused

- **Given** an uncommitted edit under `.specflow/specs/`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### No store is refused

- **Given** a spec tree and no `cortex/cortex.json`
- **When** `cortex specs port` runs
- **Then** it exits 1 and nothing moved

### A dry run writes nothing

- **Given** a portable repository
- **When** `cortex specs port --dry-run` runs
- **Then** it exits 0, the report is on stdout, and `git status --porcelain` is empty

### Test config defaults are written

- **Given** `tests/a.test.ts`, `backend/tests/test_b.py` and no `specflow` key
- **When** `cortex specs port` runs
- **Then** `specflow.tests` has a vitest and a pytest entry, `specflow.rules` has `b` and `c` set to `off`, and both are printed

### Only runners with files are written

- **Given** only `tests/a.test.ts`
- **When** `cortex specs port` runs
- **Then** `specflow.tests` has no pytest entry

### An existing test config is kept

- **Given** a `specflow.tests` naming one include
- **When** `cortex specs port` runs
- **Then** it is unchanged

### Each class is reported

- **Given** a spec with no criteria; one cited by no test; one whose criterion has no Then; one with text between criteria; one with repeated headings; and one clean and cited by a test
- **When** `cortex specs port` runs
- **Then** `report.json` gives them `no-ACs`, `not-mappable`, `needs-edit`, `needs-edit`, `needs-edit` and `clean`, each non-clean one with a reason, and all six moved

### Precedence holds

- **Given** a spec with no criteria and no test citing it
- **When** `cortex specs port` runs
- **Then** its class is `no-ACs`

### A ticket cited by one spec links it

- **Given** `--ticket-pattern 'TKT-[0-9]+'`, a spec citing `TKT-7`, cited by no other spec, and a test citing only `TKT-7`
- **When** `cortex specs port` runs
- **Then** its class is `clean`

### A ticket shared by two specs does not link

- **Given** two specs citing `TKT-7` and a test citing only `TKT-7`
- **When** `cortex specs port` runs
- **Then** both are `needs-edit`

### Untagged tests are listed

- **Given** 3 test cases, none tagged
- **When** `cortex specs port` runs
- **Then** `report.json` lists all 3 with file, name and line, and `report.md` gives the per-file count

### The working folder stays out of git

- **Given** a port has run
- **When** `git status --porcelain` runs
- **Then** nothing under `.cortex-port/` is listed

### Next steps are printed and not run

- **Given** a successful port
- **When** its output is read
- **Then** it names `cortex store map` and `cortex hooks install`, `core.hooksPath` is unset, and `MAP.md` is unchanged

### Verify finds a case with no proposal

- **Given** 2 untagged cases and `.cortex-port/tagging/billing.jsonl` with one line
- **When** `cortex specs port --verify` runs
- **Then** it exits 1 and names the other case

### Verify finds a tag proposal naming no criterion

- **Given** one untagged case and a line with `action` `tag` and `criterion` `BILLING-REFUNDS-99`, which does not exist
- **When** `cortex specs port --verify` runs
- **Then** it exits 1 and names that line

### Verify passes on a full set

- **Given** every untagged case has a valid line
- **When** `cortex specs port --verify` runs
- **Then** it exits 0

## Notes

- Promise conversion and the tagging pass are tested in `specflow.onboard-skill`; only their output contracts are here.
- This repository's own paths in Core (`src/paths.ts`, the validator) must read `specflow/` once ported; `specflow.lint` Rule 2 covers it.
