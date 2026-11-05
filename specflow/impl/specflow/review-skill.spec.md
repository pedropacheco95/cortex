---
id: specflow.review-skill
status: draft
depends_on:
  - specflow.spec-skill
  - scaffolding.skill-listing-budget
implements: ../../promises/specflow/nothing-is-built-before-it-is-agreed.business.md
governed_by: []
governs:
  - "skills/specflow-review/SKILL.md"
  - ".claude/skills/specflow-review/SKILL.md"
---

# `specflow-review`: fresh agents read the spec against the code (the goldfish)

## Intent

An author reads their intent into their own text. A goldfish is a fresh agent with only the spec (or a diff) and the code, so it can see only what is written. The main session splits the work by concern and lens, spawns the agents, and merges what they find for a person. It replaces request-review and receive-review as skills.

The skill starts from the owner-approved draft, with two required changes. Diff mode stops being a per-wave duty: on the bench a fresh implementer plus a diff review per wave tied on regressions, cost more, and lost one run. And every goldfish is awaited, because that lost run was a headless session that ended while a background agent was still working.

## Entities

- **READS:** spec files, the code and tests they describe, and in diff mode a commit range or patch.
- **WRITES:** each goldfish writes only its findings file, outside the repository (Rule 6). The main session writes only the resolutions in Rule 7.
- **NEVER WRITES:** a goldfish never edits a spec, a test or code.

## Rules

1. **Bundle.** The bundle is `skills/specflow-review/SKILL.md`, mirrored byte for byte to `.claude/skills/specflow-review/SKILL.md`. It is 4.0-only: it is listed in `STORE_V4_BUNDLES`, and `store.migrate` Rule 18 step 2 installs it. Its tier in `TIERS` is **B**, and its required trigger phrases are `review the spec`, `review this diff` and `here is the feedback`.
2. **Description**, exactly: `Fresh-agent review of a spec against the code (before code, or weekly at rest) or of a diff against its criteria (on request). Read-only; findings only. "review the spec", "review this diff", "here is the feedback".`
3. **The Iron Law**, exactly: `NO FINDING WITHOUT A CRITERION OR SECTION, A LOCATION AND A PROPOSED CHANGE`, followed by: `Violating the letter of this law is violating the spirit. If you find yourself constructing a reading under which an observation is useful without being specific, that construction is the violation.`
4. **What a goldfish is.** A fresh agent that receives only what this skill hands it, and never the conversation that led here. The main session spawns it (the Agent tool, a new session, or a scheduled run). A fork of the current session, or the current session reviewing its own work, does not count.
5. **Two modes.**
   - **Spec mode**, before code and at rest. Input: the spec file path(s) and the repository root. The goldfish reads the spec, then the code the spec describes. The weekly at-rest run (`loops.quality-task`) is spec mode.
   - **Diff mode**, available on request and never required. Input: the criterion ids a change claims to implement, the diff (a commit range or a patch file) and the repository root.
6. **How the main session runs it, in order:**
   1. decide the concerns: a spec spanning more than one area is split into concerns by area;
   2. for each concern × lens, spawn one goldfish with this brief and nothing more: the mode, the input paths or ids of that concern, the repository root, the lens, the finding format, and the file to write its findings to. Every goldfish writes its findings to a file outside the repository, which the main session names and reads: the file is the delivery, because a hand-back can fail after the agent has finished;
   3. **wait for every goldfish.** The SKILL.md says: `Spawn every goldfish in the foreground, or wait for every one to finish, before you merge. A session that ends with a goldfish still running loses its work.`;
   4. merge the findings: drop duplicates, keep the strongest severity, sort blockers first;
   5. hand the list to the person, who resolves it. A scheduled run hands it to its caller, which files it (`loops.quality-task`) and resolves nothing.
7. **Resolving.** A finding is resolved by amending the spec in its own commit with `Specflow-Amends:` where existing text changes, or by recording why it is rejected under *Open questions*. When the run was told the user can't answer, the main session resolves each finding itself this way and continues; a finding that shows a conflict with a recorded owner decision stops the run (`specflow.spec-skill` Rule 7). In an interactive session the person decides.
8. **Lenses.** Comprehension, Antagonistic, Readiness and Codebase details, as in the draft. Readiness asks whether each criterion is implementable in its wave alone. Antagonistic checks every constant's value against every place in the code and copy that states it.
9. **Diff mode's questions.** Per criterion id: covered (which test cites it), not covered, or contradicted. For the diff as a whole: which changed files no listed criterion describes (a silent change).
10. **Finding format**, exactly:
    ```
    [<criterion id> | spec:<file>#<rule or section> | diff:<file>] <blocker | should | nit>
    <path>:<line> — <what is wrong, one sentence> — proposed: <the change, one sentence>
    ```
    A finding about a rule or section rather than one criterion carries `spec:<file>#<rule or section>`. In diff mode, a finding with no criterion id is allowed only for a silent change, and carries `diff:<file>`.
11. **Rationalizations.** The SKILL.md has a `## Rationalizations` table with these four thoughts, each answered: `I wrote this spec, I can review it myself.`, `The code looks like it does this; no need to check.`, `Minor wording, not worth a finding.`, `The diff is large; I will review the main files.`
12. **A review received from someone else** (owner decision, sitting item 9). The SKILL.md carries this sentence verbatim: `Verify each point of a review you received against the spec, a rule or the code before applying it, and reject what does not hold, with the reason.` A disagreement is settled by the spec, a rule or a command anyone can run, never by who said it or how sure they sounded. Rule 7 covers this skill's own findings; this rule covers a review from a person or another agent. Applying what holds is ordinary work, not a write of this skill.

## Acceptance Criteria

### SPECFLOW-REVIEW-SKILL-1: The bundle exists, is mirrored and fits the budget

- **Given** the repository
- **When** the skill bundles are listed and `pnpm check:skill-budget` runs
- **Then** `skills/specflow-review/SKILL.md` and its `.claude/skills/` mirror are byte-identical, the tier is B, and the check passes with the three required phrases

### SPECFLOW-REVIEW-SKILL-2: 3.x init and sync never install it

- **Given** the skills source directory
- **When** `listSkillBundles` runs
- **Then** `specflow-review` is not listed

### SPECFLOW-REVIEW-SKILL-3: The description and the Iron Law are exact

- **Given** the SKILL.md text
- **When** it is read
- **Then** its `description` is the Rule 2 text and it contains the Rule 3 law

### SPECFLOW-REVIEW-SKILL-4: A fork is not a goldfish

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says a goldfish never gets the conversation, and that a fork or the current session does not count

### SPECFLOW-REVIEW-SKILL-5: Every goldfish is awaited before merging

- **Given** the SKILL.md text
- **When** it is read
- **Then** it contains the Rule 6 wait sentence byte for byte, and that step comes before the merge step

### SPECFLOW-REVIEW-SKILL-6: Concern × lens splitting is kept

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says one goldfish per concern and lens, names the four lenses, and lists the six items of the brief

### SPECFLOW-REVIEW-SKILL-7: Diff mode is optional

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names spec mode and diff mode, says diff mode is on request and never required, and does not contain `after each wave` or `per wave`

### SPECFLOW-REVIEW-SKILL-8: The finding format is exact

- **Given** the SKILL.md text
- **When** it is read
- **Then** it contains both lines of Rule 10, says a finding about a rule or section carries `spec:<file>#<rule or section>`, and says that in diff mode a finding with no criterion id is allowed only for a silent change

### SPECFLOW-REVIEW-SKILL-9: Resolving follows the owner's lines

- **Given** the SKILL.md text
- **When** its resolving section is read
- **Then** it says the person decides in an interactive session, that a run told the user can't answer resolves the findings itself, and that a conflict with a recorded owner decision stops the run, and it does not contain `nobody can answer`

### SPECFLOW-REVIEW-SKILL-10: Spec mode's inputs and the concern split are stated

- **Given** the SKILL.md text
- **When** it is read
- **Then** spec mode's input is spec file paths and the repository root, and a spec spanning more than one area is split by area

### SPECFLOW-REVIEW-SKILL-11: The merge is stated

- **Given** the SKILL.md text
- **When** it is read
- **Then** the merge step says drop duplicates, keep the strongest severity, and sort blockers first

### SPECFLOW-REVIEW-SKILL-12: The lenses are defined

- **Given** the SKILL.md text
- **When** it is read
- **Then** Readiness asks whether a criterion is implementable in its wave alone, and Antagonistic checks every constant against every place that states it

### SPECFLOW-REVIEW-SKILL-13: Diff mode's questions are stated

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names covered, not covered, contradicted, and silent change

### SPECFLOW-REVIEW-SKILL-14: A scheduled run hands its findings to its caller

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says a scheduled run hands the list to its caller and resolves nothing

### SPECFLOW-REVIEW-SKILL-15: The rationalizations are kept

- **Given** the SKILL.md text
- **When** it is read
- **Then** it has the four thoughts of Rule 11

### SPECFLOW-REVIEW-SKILL-16: A goldfish never edits

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says the goldfish reads and never edits a spec, a test or code

### SPECFLOW-REVIEW-SKILL-17: A received review is verified before it is applied

- **Given** the SKILL.md text
- **When** it is read
- **Then** it contains the Rule 12 sentence byte for byte on one line, and says a disagreement is settled by the spec, a rule or a command, never by who said it

### SPECFLOW-REVIEW-SKILL-18: The findings file is the delivery

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says every goldfish writes its findings to a file outside the repository, which the main session names and reads, and that step comes before the merge step
