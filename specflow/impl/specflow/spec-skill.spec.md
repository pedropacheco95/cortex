---
id: specflow.spec-skill
status: draft
depends_on:
  - store.managed-block
  - specflow.index
  - specflow.check
  - scaffolding.skill-listing-budget
implements: ../../promises/specflow/nothing-is-built-before-it-is-agreed.business.md
governed_by: []
governs:
  - "skills/specflow-spec/SKILL.md"
  - ".claude/skills/specflow-spec/SKILL.md"
---

# `specflow-spec`: the code-free session that writes the spec (the elephant)

## Intent

Big work takes the big path: a session with no code to write turns the request into a spec, a fresh agent reviews it (`specflow.review-skill`), the owner resolves the findings, and the main session develops wave by wave. On the bench this path delivered in 3 of 3 runs on a multi-spec ticket, where the quick path stopped in 2 of 3. It replaces brainstorm, plan, spec-editor, tests, new-project, ingest and intent-reconcile as skills.

The skill starts from the owner-approved draft. Its changes from that draft are the ones later decisions require: constants live in `constants.md`, the two owner lines replace its "nobody can answer" wording, and its paths are `specflow/`. The per-wave fresh implementer was dropped and is not in the draft's flow here.

## Entities

- **READS:** the request, `specflow/INDEX.md`, the specs and code it touches, `constants.md` files, `specflow/promises/**`, `cortex/world/decisions/**`, and a spec-request item in `now/proposals.md` when it starts from one.
- **WRITES:** files under `specflow/impl/`, `constants.md` files, and one commit holding only those and the regenerated `specflow/INDEX.md`; in a separate commit, the removal of the spec-request item it started from.
- **NEVER WRITES:** code, test code, or a plan file. `specflow/INDEX.md` is never edited by hand: it comes from the pre-commit hook, or from `cortex specs index` where no hook is installed.

## Rules

1. **Bundle.** The bundle is `skills/specflow-spec/SKILL.md`, mirrored byte for byte to `.claude/skills/specflow-spec/SKILL.md`. It is 4.0-only: it is listed in `STORE_V4_BUNDLES`, so the 3.x `init` and `sync` never install it, and `store.migrate` Rule 18 step 2 installs it. Its tier in `TIERS` is **B**, and its required trigger phrases are `spec this`, `brainstorm` and `plan this`.
2. **Description**, exactly: `Turn a request that no criterion covers, or that touches more than one spec, into a spec: invariant criteria, constants, a named test per criterion, waves. Code-free. "spec this", "brainstorm", "plan this".`
3. **The Iron Law**, exactly: `NO CRITERION WITHOUT A NAMED TEST, AND NO CODE IN THIS SESSION`, followed by: `Violating the letter of this law is violating the spirit. If you find yourself constructing a reading under which this does not apply to your case, that construction is the violation.`
4. **When to use.** A request creates a behaviour no criterion covers, or touches more than one spec, or the person says "spec this". The output is the spec, which is the design document. There is no plan file, no code and no test code. In a project with no `specflow/` folder, the skill creates `specflow/impl/<area>/` by writing the spec there, and runs `cortex specs index` before committing.
5. **Steps, in order:**
   1. **Check for a conflict.** Compare the request with the `Rules` and `Not this spec` lines of every spec it touches, `specflow/promises/**`, and `cortex/world/decisions/**`. On a conflict, apply Rule 7.
   2. **Find what holds today.** From `specflow/INDEX.md` and `grep`, list every spec and criterion the request touches. Read the code: for each behaviour the request changes, find what produces it today and what depends on it. Write both in the spec's *Today* section with file paths.
   3. **Write the criteria as invariants between surfaces, not as values.** Any fact used by more than one surface becomes a constant (Rule 6).
   4. **Name a test for every criterion.** Each criterion carries `test:` with a file path and a test name, existing or to be written. A criterion with no nameable test is rewritten or moved to *Open questions*.
   5. **Mark what was not read.** A criterion that restates today's behaviour the session did not read in the code carries the body line `not read in the code`. `specflow/INDEX.md` computes the `unverified` mark itself, from tags; the skill never writes that mark.
   6. **Cut the work into waves.** `Waves` lists ordered groups of criterion ids. Each wave can be implemented, tested and committed on its own, with constants and migrations first, and names the surfaces it touches.
   7. **Record open questions and decisions.** Anything the request leaves open goes under *Open questions* with the options. In an interactive session, stop and ask. Rule 8 covers a run told the user can't answer.
   8. **Commit the spec alone.** Spec files only, in their own commit, with a `Specflow-Amends:` trailer for every existing rule or criterion whose text changed. Then stop this skill and run `specflow-review` before any code is written.
6. **Constants.** A constant lives in a `constants.md`, in the `constants:` map of its frontmatter, at the lowest folder under `specflow/` that covers every spec using it. A spec sees its own folder's constants and its ancestors', never a child's or a sibling's. A criterion refers to one as `const:NAME`. The draft's `constants:` block in the spec and its `### Constants` section are not used.
7. **Owner decisions stop the work.** The SKILL.md carries this sentence verbatim: `If the request contradicts a rule, a 'Not this spec' line or a recorded decision the owner made, do not build it: write the spec with the conflict as an open question and stop.` Promises count as recorded owner decisions. The stop has no exception in any run. The spec holding the conflict holds *Today* and the open question, with no criteria and no waves. It is committed by step 8, with the conflict under *Open questions*; `specflow-review` is not run and no wave is started.
8. **Nobody to ask.** The SKILL.md carries this sentence verbatim: `If you were told the user can't answer during this run, don't wait: decide, write the decision and its reason under Open questions in the spec, and continue. This never applies to a conflict with a recorded owner decision; that always stops.` Such a run goes on to `specflow-review`, resolves its findings by `specflow.review-skill` Rule 7, and develops wave by wave. An interactive session always asks.
9. **Starting from a spec request.** When the input is a `Spec request:` item from `now/proposals.md` (`store.remember-skill` Rule 11), the quoted ask is the request, and the spec's *Today* section cites the item's `source:`. Once the spec is committed, the skill removes the item and says which spec holds the ask. An ask refused under Rule 7 keeps its item.
10. **Amending a criterion.** The skill edits an existing criterion's text directly and commits it alone with its trailer. It never edits a test. Where rule (c) is live, that commit gets a warning, not a refusal; the wave that follows changes the tagged test on the same branch, and `cortex check --range` holds the branch to it (`specflow.check` Rule 19).
11. **Spec shape.** New criteria go in the spec that already covers the behaviour, and an `implemented` spec drops to `implementing`. A new spec goes in `specflow/impl/<area>/<leaf>.spec.md`. Its frontmatter carries `serves: [<promise id>]` with exactly one entry; a project whose promises are not converted yet uses `implements:` instead (schema S12.1). The SKILL.md shows this shape:
    ```
    ---
    id: <area>.<leaf>
    status: draft
    serves: [<promise id>]
    ---

    ### Rules
    1. …

    ### Not this spec
    - <what this spec deliberately does not do>

    ### Today
    - <behaviour> is produced by `<file>:<symbol>`; stated again in `<file>`; pinned by `<test file>`.

    ### Acceptance Criteria

    #### <CRITERION-ID>: <one-line invariant>
    Given … When … Then …  (uses `const:<NAME>`)
    test: `<path>` › `<test name>`

    ### Waves
    1. <ids> — <surfaces>

    ### Open questions
    - <question> — options: … — decision (if taken): … because …
    ```
12. **After review.** The owner resolves the findings, and the main session then develops wave by wave under the `## Specs` rules. Each wave is ordinary quick-path work. The skill names no implementer agent and no required per-wave review.
13. **Rationalizations.** The SKILL.md has a `## Rationalizations` table with these four thoughts, each answered: `The change is small, I can just write the code.`, `The value is obvious, I will write it in each criterion.`, `I know what the code does, no need to read it.`, `I will name the tests later.` The answer to the second says one constant, in `constants.md`, referenced by name.
14. **Every quoted ask is accounted for.** The SKILL.md carries this sentence verbatim: `Every ask quoted in the request maps to a criterion or is listed under Open questions.` A quoted ask is one the request gives in the asker's own words, and that includes the ask of a Rule 9 spec request. The skill checks this at step 7, before the spec is committed.

## Acceptance Criteria

### SPECFLOW-SPEC-SKILL-1: The bundle exists, is mirrored and fits the budget

- **Given** the repository
- **When** the skill bundles are listed and `pnpm check:skill-budget` runs
- **Then** `skills/specflow-spec/SKILL.md` and its `.claude/skills/` mirror are byte-identical, the tier is B, and the check passes with the three required phrases

### SPECFLOW-SPEC-SKILL-2: 3.x init and sync never install it

- **Given** the skills source directory
- **When** `listSkillBundles` runs
- **Then** `specflow-spec` is not listed

### SPECFLOW-SPEC-SKILL-3: The description and the Iron Law are exact

- **Given** the SKILL.md text
- **When** it is read
- **Then** its `description` is the Rule 2 text and it contains the Rule 3 law

### SPECFLOW-SPEC-SKILL-4: The steps appear in order

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names, in this order: the conflict check, *Today* with file paths, invariants, a named test, `not read in the code`, waves, open questions, the spec-only commit, and `specflow-review`

### SPECFLOW-SPEC-SKILL-5: Both owner sentences are verbatim

- **Given** the SKILL.md text
- **When** it is searched
- **Then** it contains the Rule 7 and Rule 8 sentences byte for byte, each on one line

### SPECFLOW-SPEC-SKILL-6: A promise counts as an owner decision

- **Given** the SKILL.md text
- **When** its conflict step is read
- **Then** it names `specflow/promises/`, `cortex/world/decisions/`, and the `Not this spec` line

### SPECFLOW-SPEC-SKILL-7: Constants follow the folder rule

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names `constants.md`, the lowest folder covering every user, ancestors visible, `const:NAME`, and it has no `### Constants` section

### SPECFLOW-SPEC-SKILL-8: The code-free line holds

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says no plan file, no code and no test code, and does not contain `fresh implementer`, `per-wave` or `diff review`

### SPECFLOW-SPEC-SKILL-9: A criterion amendment commits alone

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says an amended criterion is committed alone with its `Specflow-Amends:` trailer, that the skill never edits a test, and that the commit may warn under rule (c) and the wave's tagged test follows on the same branch

### SPECFLOW-SPEC-SKILL-10: The unverified mark is left to INDEX

- **Given** the SKILL.md text
- **When** it is read
- **Then** it uses `not read in the code`, says `specflow/INDEX.md` computes `unverified`, and shows no `(unverified)` on a criterion heading

### SPECFLOW-SPEC-SKILL-11: A spec request is consumed only by a written spec

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says the item is removed once the spec is committed and stays when the ask is refused for a conflict

### SPECFLOW-SPEC-SKILL-12: The old paths are gone

- **Given** the SKILL.md text
- **When** it is searched
- **Then** it names `specflow/INDEX.md` and `specflow/impl/`, and does not match `(?<!specflow/)specs/` or contain `.specflow/`

### SPECFLOW-SPEC-SKILL-13: The spec shape is shown

- **Given** the SKILL.md text
- **When** it is read
- **Then** its shape block shows `serves:`, `### Rules`, `### Not this spec`, `### Today`, `### Acceptance Criteria`, `test:`, `### Waves` and `### Open questions`, in that order

### SPECFLOW-SPEC-SKILL-14: A conflict is committed but not reviewed

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says a spec holding an owner-decision conflict is committed with the conflict under *Open questions*, and that `specflow-review` and the waves do not follow

### SPECFLOW-SPEC-SKILL-15: The rationalizations are kept

- **Given** the SKILL.md text
- **When** it is read
- **Then** it has the four thoughts of Rule 13, and the answer on constants names `constants.md`

### SPECFLOW-SPEC-SKILL-16: Every quoted ask is accounted for

- **Given** the SKILL.md text
- **When** it is read
- **Then** it contains the Rule 14 sentence byte for byte on one line, says that covers the ask of a spec request, and places the check before the spec is committed

### SPECFLOW-SPEC-SKILL-17: A conflict spec holds no criteria

- **Given** the SKILL.md text
- **When** its owner section is read
- **Then** it says a spec holding a conflict has *Today* and the open question, with no criteria and no waves

### SPECFLOW-SPEC-SKILL-18: New criteria join the spec that covers the behaviour

- **Given** the SKILL.md text
- **When** its spec shape section is read
- **Then** it says new criteria go in the spec that covers the behaviour, and an `implemented` spec drops to `implementing`
