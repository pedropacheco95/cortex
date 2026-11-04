---
id: specflow.onboard-skill
status: draft
depends_on:
  - specflow.port
  - specflow.index
  - specflow.review-skill
  - scaffolding.skill-listing-budget
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "skills/specflow-onboard/SKILL.md"
  - ".claude/skills/specflow-onboard/SKILL.md"
---

# `specflow-onboard`: bring existing work under the specs

## Intent

Two jobs need agents and a person's approval, and both start from work that already exists. **Port mode** finishes what `cortex specs port` cannot do deterministically: it turns business specs into short promises, and it tags every existing test with the criterion it proves. **Onboard mode** is the owner's method for a codebase with no specs: split into concerns, write each concern twice independently, keep what agrees, and put the rest to the owner. It replaces onboard-codebase and deep-onboard as skills.

`specflow.port` says what each port-mode output must be. This spec says how agents produce it and how it reaches approval. Onboard mode has never run; port mode's two jobs are new too.

## Entities

- **READS:** `specflow/**`, `.cortex-port/report.md` and `.cortex-port/report.json`, `specflow/INDEX.md` (or `cortex specs index --json`), test files, code, `cortex/cortex.json`.
- **WRITES, before approval:** under `.cortex-port/` only (Rule 3). `cortex specs port` creates that folder and its exclude line. Onboard mode, which runs with no port, creates them itself in the repository's exclude file (`git rev-parse --git-path info/exclude`), never in `.gitignore`.
- **WRITES, after approval:** the approved promise files and `serves:` links, approved tags in test files, approved new criteria, and deletions of approved tests (port mode); the approved spec files under `specflow/impl/` and their tests (onboard mode).
- **NEVER WRITES:** `specflow/INDEX.md`, the `specflow.rules` key of `cortex/cortex.json`, or any commit in a repository without the person's go.

## Rules

1. **Bundle.** The bundle is `skills/specflow-onboard/SKILL.md`, mirrored byte for byte to `.claude/skills/specflow-onboard/SKILL.md`. It is 4.0-only: it is listed in `STORE_V4_BUNDLES`, and `store.migrate` Rule 18 step 2 installs it. Its tier in `TIERS` is **B**, and its required trigger phrases are `onboard this codebase` and `port mode`.
2. **Description**, exactly: `Bring existing work under the specs. Port mode: turn business specs into promises and tag every test. Onboard mode: write specs from code. Proposals for approval. "onboard this codebase", "port mode".`
3. **Working folder.** `cortex specs port` leaves its report in `.cortex-port/report.md` and `.cortex-port/report.json`. Port-mode proposals live in `.cortex-port/`: `promises/<area>/<name>.md` (one draft per business spec), `tagging/<area>.md` (one table per test folder), `decisions.md` (what the person decided). Onboard-mode work lives in `.cortex-port/onboard/<concern>/`.
4. **Agents.** Every spawned agent is awaited before its output is used (`specflow.review-skill` Rule 6). Work is split so that one agent reads one area or one test folder.
5. **Mode choice.** A `specflow/` tree with a `.cortex-port/report.json` means port mode. A project with no `specflow/` means onboard mode. If `.specflow/` still exists and `specflow/` does not, the skill stops and says: `Run cortex specs port first.`

### Port mode

6. **Promise conversion.** For each business spec under `specflow/promises/`, an agent drafts one short owner-level promise that keeps every commitment the business spec makes and drops journey and metric detail. The draft is written to `.cortex-port/promises/`, carrying `id: P-<AREA>-<n>`, `title`, `status`, and a `## Outcome` section. Each impl spec's `implements:` link gives its `serves:` value, mechanically: frontmatter `serves: [P-…]` with exactly one entry, per spec and not per criterion. The reasoning a business spec holds that belongs to no promise is listed for `cortex/world/decisions/`, not dropped. This is the one text rewrite of a port.
7. **Tagging pass.** Agents read every test that `.cortex-port/report.json` or the `.untagged` list of `cortex specs index --json` names. Each test gets exactly one proposal row in `.cortex-port/tagging/<area>.md`, in this order of preference:
   - **tag**: the criterion id(s) it proves;
   - **new criterion**: no criterion matches, so propose its text and the spec it belongs in;
   - **delete**: only when the person-visible behaviour is not wanted, with the reason.

   A row reads `<file> › <test name> | tag|new-criterion|delete | <ids or text> | <one-line reason>`. A test the agent cannot place is proposed as **new criterion**, never left out and never proposed for deletion for lack of a match.
8. **Approval, then application.** The skill shows the person the counts per area and the rows that are not plain tags. Nothing is applied without the person's approval, per repository; approval may be per area. The person's decisions go in `.cortex-port/decisions.md`. The main session then applies approved rows: a promise replaces its business spec; `serves:` links are added; a tag goes at the start of the test name, or as `@pytest.mark.criterion("CRIT-ID")` in pytest; new criteria are added in commits of their own. Applying a tag changes a test's name and nothing else in it.
9. **Going live.** When `specflow/INDEX.md` shows `Untagged tests: 0` (`.untagged` empty in `cortex specs index --json`), the skill says so and tells the person that rules (b) and (c) can be switched on in the `specflow.rules` key of `cortex/cortex.json`, an owner-approved edit. It never switches them on, and it never reports them live while an untagged test remains. A criterion still without a test stays `unverified`; that is the honest starting state.

### Onboard mode

10. **Untested.** The SKILL.md says, at the top of this mode: `This mode has not been tested. It runs on a client repository only after a blind run on one area of a repository has been reviewed.` It asks the person to confirm that before it starts on a repository.
11. **Steps, in order:**
    1. a **splitter** agent divides the codebase into concerns;
    2. for each concern, **two independent elephants** each write a spec from the code, neither seeing the other's output;
    3. a **reconciler** per concern keeps what both agree on, and lists every disagreement as an open question in the spec;
    4. a **goldfish** per concern reviews the reconciled spec in spec mode (`specflow.review-skill`);
    5. the person resolves the open questions and findings;
    6. **a test per retained criterion**: each is tagged with its criterion, and a criterion left without a test shows `unverified`.
12. **Owner lines.** A disagreement between elephants is never settled by the reconciler. The rule of `specflow.spec-skill` Rule 8 applies to a run told the user can't answer.

## Acceptance Criteria

### The bundle exists, is mirrored and fits the budget

- **Given** the repository
- **When** the skill bundles are listed and `pnpm check:skill-budget` runs
- **Then** `skills/specflow-onboard/SKILL.md` and its `.claude/skills/` mirror are byte-identical, the tier is B, and the check passes with the two required phrases

### 3.x init and sync never install it

- **Given** the skills source directory
- **When** `listSkillBundles` runs
- **Then** `specflow-onboard` is not listed

### The description is exact and names both modes

- **Given** the SKILL.md text
- **When** it is read
- **Then** its `description` is the Rule 2 text, and the body has a section for port mode and one for onboard mode

### The mode choice is stated

- **Given** the SKILL.md text
- **When** it is read
- **Then** it states the Rule 5 conditions and contains `Run cortex specs port first.`

### Proposals stay outside the repository's history

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names `.cortex-port/report.json`, `.cortex-port/promises/`, `.cortex-port/tagging/` and `.cortex-port/decisions.md`, and says onboard mode uses the exclude file, never `.gitignore`

### A promise keeps every commitment

- **Given** the SKILL.md text
- **When** its promise step is read
- **Then** it says the draft keeps every commitment, names `id: P-<AREA>-<n>` and `## Outcome`, derives one frontmatter `serves:` entry per spec from `implements:`, and sends leftover reasoning to `cortex/world/decisions/`

### Every untagged test gets one proposal

- **Given** the SKILL.md text
- **When** its tagging step is read
- **Then** it says every untagged test gets exactly one row, in the order tag, new criterion, delete, gives the row format, and says a test with no match proposes a new criterion

### Deletion is the last resort

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says delete applies only when the behaviour is not wanted, never for lack of a match

### Nothing is applied before approval

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says approval comes from the person, per repository, that decisions go in `.cortex-port/decisions.md`, and that application happens only after it

### Tags use the two conventions

- **Given** the SKILL.md text
- **When** it is read
- **Then** it shows `[CRIT-ID]` at the start of a test name and `@pytest.mark.criterion("CRIT-ID")`, and says a tag changes nothing else in the test

### The skill never switches on rules (b) and (c)

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names `Untagged tests: 0` and `.untagged` as the test for no untagged test, names `specflow.rules`, and says the person switches the rules on and the skill never does

### Agents are awaited

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says every spawned agent is awaited before its output is used

### Onboard mode is marked untested

- **Given** the SKILL.md text
- **When** its onboard section is read
- **Then** it contains the Rule 10 sentence byte for byte and asks the person to confirm before starting

### Onboard mode keeps the owner's method in order

- **Given** the SKILL.md text
- **When** its onboard section is read
- **Then** it names, in this order: splitter, two independent elephants per concern, reconciler, goldfish per concern, the person, and a test per retained criterion, and it says disagreements become open questions
