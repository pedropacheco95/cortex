---
id: store.managed-block
status: draft
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

Amendment 2026-11-04 (Specflow): the quick path has no skills. What it knows about specs comes from this block and the commit check, so the block gains a `## Specs` section (Rules 8–12). The section appears only in a project that has specs, and its two lines that send work to `specflow-spec` appear only once that skill is there to run.

## Rules

1. The block is delimited by `<!-- cortex:start v4.0 -->` and `<!-- cortex:end -->`.
2. In `CLAUDE.md`, the block's body is exactly:
   ```
   ## Cortex
   This project keeps its knowledge in `cortex/` (plain files, one subject each). Start from the map:
   @cortex/MAP.md
   ```
   followed, when Rule 8 applies, by one blank line and the `## Specs` section.
3. In `AGENTS.md`, the block's body is `## Cortex` followed by the full `renderMap(store)` text, followed, when Rule 8 applies, by one blank line and the same `## Specs` section.
4. Writing a block replaces an existing `cortex:start … cortex:end` block (any version) in place. If none exists, it appends the block after one blank line. A missing file is created holding only the block.
5. `cortex store map` writes both blocks. `--no-agents` skips `AGENTS.md`.
6. Before a project's migration is accepted (`store.migrate`), `cortex store map` does not touch a block whose version is 3.x. It writes `MAP.md` only and prints `managed block left at v3.x until migration is accepted`.
7. `check.map-fresh` also warns when a 4.0 block differs from what would be written. What would be written follows Rules 8 and 9, so a block goes stale when `specflow/` or the `specflow-spec` bundle appears.
8. **When the section appears.** The `## Specs` section is written when a directory `specflow/` exists at the project root. Without one, the block is exactly as Rules 2 and 3 give it, with no section.
9. **Its two stages.** Stage 1 is the text of Rule 10. Stage 2 is that text, one blank line, and the two paragraphs of Rule 11. `src/store/managed-block.ts` exports them as `SPECS_SECTION_STAGE1` (string) and `SPECS_SECTION_STAGE2` (a two-item array). Stage 2 applies when `.claude/skills/specflow-spec/SKILL.md` exists at the project root, and stage 1 otherwise. There is no flag or phase setting: installing the skill (`store.migrate` Rule 18 step 2) and rerunning `cortex store map` is what moves a project to stage 2.
10. **Stage 1 text**, exactly:
    ```
    ## Specs

    `specflow/` holds the specs. `specflow/promises/<area>/` has short promises (`P-…` ids) on what the product guarantees.
    `specflow/impl/<area>/` has implementation specs: their rules are numbered under a Rules heading, and their acceptance
    criteria carry stable ids (`PAY-REFUND-3`). Spec text that points at `.specflow/specs/<a>/<b>.spec.md` or
    `.specflow/specs-business/…` means the same file under `specflow/impl/` or `specflow/promises/`. A value more than one
    spec uses is a constant in a `constants.md`; a spec sees its own folder's and its ancestors' constants, no others.
    A test cites a criterion by its id: vitest `it('[PAY-REFUND-3] …')`, pytest `@pytest.mark.criterion("PAY-REFUND-3")`.
    `specflow/INDEX.md` (criteria, their tests, `unverified` marks, constants) is generated; never edit it.

    A finished change updates or adds the criterion for every behaviour it changes or adds, and a test that cites it.

    A git hook (`.githooks/commit-msg`) checks every commit. It runs no tests. It refuses:

    - a commit that changes code or config (anything outside `specflow/`, `cortex/`, tests, `.githooks/` and `.md` files) without changing a test;
    - a commit that changes a spec's rules or criteria together with code or config. Commit the spec change on its own,
      before or after the code;
    - a commit that changes the text of an existing rule or criterion without a trailer
      `Specflow-Amends: <spec-id>#<rule-7 or criterion id> — <reason>`, one per item. A new rule or criterion needs none.

    Merge commits are checked the same way on what the merge itself changes.

    Specs say what should hold; code says what does. Before changing code, find what produces the behaviour today and what depends on it. If a criterion describes what you change, change the criterion in the same change.

    An unverified criterion is a claim about the code, not a fact; check the code.

    If the request contradicts a rule, a 'Not this spec' line or a recorded decision the owner made, do not build it: write the spec with the conflict as an open question and stop.
    ```
    The last three paragraphs are the owner's wording (plan section 6, lines 1–3) and change only at the owner's word. The rest adapts the bench's paragraph: it names `specflow/`, the pytest marker in place of the docstring, and the trailer as a refusal. It does not mention rules (b), (c), (f) or (g): (b) and (c) go live per repository after its tagging pass, and each explains itself when it fires. "The same change" means the same branch or pull request, never the same commit.
11. **Stage 2 lines**, each its own paragraph after the stage 1 text, exactly:
    ```
    If the request creates a behaviour no criterion covers, or touches more than one spec, do not write code: run specflow-spec first and stop for review.

    If you were told the user can't answer during this run, don't wait: decide, write the decision and its reason under Open questions in the spec, and continue. This never applies to a conflict with a recorded owner decision; that always stops.
    ```
12. **Final wording is the owner's.** The text of Rules 10 and 11 is approved at the G2 sitting, and tests compare it byte for byte. A change to it is a change to this spec.

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

## Acceptance Criteria: the Specs section (amendment 2026-11-04)

Each of these builds a fixture project with an accepted 4.0 store.

### No specs, no section

- **Given** a project with no `specflow/` folder
- **When** `cortex store map` runs
- **Then** the `CLAUDE.md` and `AGENTS.md` blocks hold no `## Specs` line, and the `CLAUDE.md` block body is exactly the Rule 2 text

### A project with specs gets stage 1

- **Given** a project with a `specflow/` folder and no `.claude/skills/specflow-spec/SKILL.md`
- **When** `cortex store map` runs
- **Then** the `CLAUDE.md` block body is the Rule 2 text, one blank line, and the Rule 10 text byte for byte, and it does not contain `run specflow-spec first`

### A project with the skill gets stage 2

- **Given** a project with a `specflow/` folder and `.claude/skills/specflow-spec/SKILL.md`
- **When** `cortex store map` runs
- **Then** the block body is the stage 1 text followed by the two Rule 11 paragraphs, byte for byte, in that order, and the block still ends with `<!-- cortex:end -->`

### AGENTS.md carries the same section

- **Given** a project with a `specflow/` folder and the skill
- **When** `cortex store map` runs
- **Then** the `AGENTS.md` block holds MAP's text and then the same `## Specs` section as `CLAUDE.md`, byte for byte

### Content outside the block stays untouched with the section

- **Given** a `CLAUDE.md` with text before and after a 4.0 block without the section, and a `specflow/` folder
- **When** `cortex store map` runs
- **Then** the block holds the section, and the text before and after it is byte-identical

### The owner's lines are the plan's lines

- **Given** `SPECS_SECTION_STAGE1` and `SPECS_SECTION_STAGE2`
- **When** they are split on newlines
- **Then** the last three non-empty lines of `SPECS_SECTION_STAGE1` are the last three paragraphs of Rule 10, and the two items of `SPECS_SECTION_STAGE2` are the paragraphs of Rule 11, each byte for byte

### A new folder or skill makes the block stale

- **Given** a 4.0 block written at stage 1
- **When** `.claude/skills/specflow-spec/SKILL.md` is added and `check.map-fresh` runs
- **Then** it warns that the block differs, and after `cortex store map` it no longer warns

### A new `specflow/` folder makes the block stale

- **Given** a 4.0 block with no section
- **When** a `specflow/` folder is added and `check.map-fresh` runs
- **Then** it warns that the block differs

### A 3.x block is still left alone

- **Given** a `specflow/` folder, a `<!-- cortex:start v3.4 -->` block and a migration that is not accepted
- **When** `cortex store map` runs
- **Then** `CLAUDE.md` is byte-identical
