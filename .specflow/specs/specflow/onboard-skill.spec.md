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
3. **Working folder.** `cortex specs port` leaves its report in `.cortex-port/report.md` and `.cortex-port/report.json`. Port-mode proposals live in `.cortex-port/`: `promises/` (one draft per business spec, at the path it will take), `tagging/<area>.jsonl` (`specflow.port` Rule 12), `decisions.md` (what the person decided). Onboard-mode work lives in `.cortex-port/onboard/<concern>/`.
4. **Agents.** Every spawned agent is awaited before its output is used (`specflow.review-skill` Rule 6). Every spawned agent writes its output to a file under `.cortex-port/`, which the skill reads: the file is the delivery, because a hand-back can fail after the agent has finished. Work is split so that one agent reads one area or one test folder. A test folder that spans several specs is still one agent, which reads those specs' criteria.
5. **Mode choice**, checked in this order:
   1. `.specflow/` exists and `specflow/` does not: the skill stops and says `Run cortex specs port first.`
   2. `specflow/` and `.cortex-port/report.json` exist: port mode.
   3. `specflow/` exists with no report: the skill asks the person which mode they mean.
   4. Neither folder exists: onboard mode.

### Port mode

6. **Promise conversion.** `specflow.port` Rule 11 and schema S12.1 say what the output must be. For each business spec under `specflow/promises/`, an agent drafts one promise of at most 40 lines, with frontmatter `id` (`P-<AREA>-<n>`: `<AREA>` is the uppercased first folder, `<n>` counts the area's promises from 1, in path order), `title` and `status`, a `#` title, and a `## Outcome` section. It keeps every commitment the business spec makes, including what the product does not promise, and drops journey and metric detail. The draft goes in `.cortex-port/promises/`. Each impl spec's `implements:` link gives its frontmatter `serves: [<promise id>]`, mechanically, one entry per spec. Reasoning that belongs to no promise is listed for `cortex/world/decisions/`, not dropped. This is the one text rewrite of a port. A `status: retired` file is a record (`specflow.port` Rule 15): a retired business spec gets no promise and a retired spec gets no `serves:`. A live spec that implements a retired business spec is not converted: it keeps its `implements:`, stays `needs-edit` in the report, and the person decides where it belongs. A spec the report marks `needs-edit` for another reason is converted like any other: the mark is about its criteria.
7. **Tagging pass.** `specflow.port` Rule 12 gives the line format. Agents read every test that `.cortex-port/report.json` or the `.untagged` list of `cortex specs index --json` names. Each case gets exactly one JSON line in `.cortex-port/tagging/<area>.jsonl`, with `file`, `name`, `line`, `action` and `reason`. Each agent writes its lines straight into that file. Its `action` is, in this order of preference:
   - `tag`: with `criterion`, the criterion it proves;
   - `new-criterion`: no criterion matches, so it gives the `title` and the `spec` it belongs in;
   - `delete`: only when the behaviour is not wanted, with the reason.

   A test the agent cannot place is proposed as `new-criterion`, never left out and never proposed for deletion for lack of a match. No line names a retired spec's criterion; a test that proves only a retired spec's behaviour proposes `delete` and names that spec in `reason` (`specflow.port` Rules 12 and 15). The pass is finished when `cortex specs port --verify` exits 0, and the skill runs that before asking for approval. A run the person limits to a slice says so in its counts, and it is finished when `cortex specs port --verify` lists none of that slice's files.
8. **Approval, then application.** The skill shows the person the counts per area and the lines that are not plain tags. Nothing is applied without the person's approval, per repository; approval may be per area. The person's decisions go in `.cortex-port/decisions.md`. The main session then applies approved rows: a promise replaces its business spec; `serves:` is added to each spec and its `implements:` removed; a tag goes at the start of the test name (`[CRIT-ID]`, or `[A-1, B-2]` for several), or as `@pytest.mark.criterion("CRIT-ID")` in pytest, one marker per id; new criteria are added in commits of their own. Applying a tag adds that name prefix or marker and nothing else.
9. **Going live.** When `specflow/INDEX.md` shows `Untagged tests: 0` (`.untagged` empty in `cortex specs index --json`), the skill says so and tells the person that rules (b) and (c) can be switched on in the `specflow.rules` key of `cortex/cortex.json`, an owner-approved edit. It never switches them on, and it never reports them live while an untagged test remains. A criterion still without a test stays `unverified`; that is the honest starting state.

### Onboard mode

10. **Untested.** The SKILL.md says, at the top of this mode: `This mode has not been tested. It runs on a client repository only after a blind run on one area of a repository has been reviewed.` It asks the person to confirm that before it starts on a repository.
11. **Steps, in order:**
    1. a **splitter** agent divides the codebase into concerns, in `.cortex-port/onboard/concerns.md`;
    2. for each concern, **two independent elephants** each write a spec draft from the code into `.cortex-port/onboard/<concern>/`, neither seeing the other's output. An elephant here is a spawned agent with the concern and the code. It writes rules and criteria as `specflow.spec-skill` Rule 5 steps 2 and 3 say, and it does not run that skill: it names no test, and it commits nothing;
    3. a **reconciler** per concern keeps what both agree on, and lists every disagreement as an open question in the spec;
    4. a **goldfish** per concern reviews the reconciled spec in spec mode (`specflow.review-skill`);
    5. the person resolves the open questions and findings;
    6. **a test per retained criterion**: each is tagged with its criterion, and a criterion left without a test shows `unverified`.
12. **Owner lines.** A disagreement between elephants is never settled by the reconciler. In a run told the user can't answer, the main session decides each open question as `specflow.spec-skill` Rule 8 says.

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
- **Then** it states the four Rule 5 cases in order, contains `Run cortex specs port first.`, and says the skill asks when `specflow/` exists with no report

### Proposals stay outside the repository's history

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names `.cortex-port/report.json`, `.cortex-port/promises/`, `.cortex-port/tagging/<area>.jsonl` and `.cortex-port/decisions.md`, and says onboard mode uses the exclude file, never `.gitignore`

### A promise keeps every commitment

- **Given** the SKILL.md text
- **When** its promise step is read
- **Then** it says the draft keeps every commitment and is at most 40 lines, names `P-<AREA>-<n>`, `title` and `## Outcome`, derives one frontmatter `serves:` entry per spec from `implements:`, says `implements:` is then removed, and sends leftover reasoning to `cortex/world/decisions/`

### Retired specs are left as records

- **Given** the SKILL.md text
- **When** its promise and tagging steps are read
- **Then** it says a `status: retired` business spec gets no promise, a retired spec gets no `serves:`, a live spec implementing a retired business spec is not converted, keeps `implements:` and is left for the person to decide, and no tagging line names a retired spec's criterion

### Every untagged test gets one proposal

- **Given** the SKILL.md text
- **When** its tagging step is read
- **Then** it says every untagged test gets exactly one JSON line in `.cortex-port/tagging/<area>.jsonl` with the Rule 7 fields, in the order `tag`, `new-criterion`, `delete`, says a test with no match proposes `new-criterion`, and says `cortex specs port --verify` must exit 0 before approval is asked

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
- **Then** it shows `[CRIT-ID]`, `[A-1, B-2]` and `@pytest.mark.criterion("CRIT-ID")` with one marker per id, and says a tag adds that prefix or marker and nothing else

### The skill never switches on rules (b) and (c)

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names `Untagged tests: 0` and `.untagged` as the test for no untagged test, names `specflow.rules`, and says the person switches the rules on and the skill never does

### Agents are awaited

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says every spawned agent is awaited before its output is used, and that one agent reads one area or one test folder

### Onboard mode is marked untested

- **Given** the SKILL.md text
- **When** its onboard section is read
- **Then** it contains the Rule 10 sentence byte for byte and asks the person to confirm before starting

### Onboard mode keeps the owner's method in order

- **Given** the SKILL.md text
- **When** its onboard section is read
- **Then** it names, in this order: splitter, two independent elephants per concern, reconciler, goldfish per concern, the person, and a test per retained criterion; it says an elephant writes into `.cortex-port/onboard/<concern>/` and commits nothing

### The reconciler settles nothing

- **Given** the SKILL.md text
- **When** its onboard section is read
- **Then** it says a disagreement becomes an open question, the reconciler never settles it, and the main session decides only in a run told the user can't answer

### Every agent delivers through a file

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says every spawned agent writes its output to a file under `.cortex-port/`, names `.cortex-port/onboard/concerns.md` for the splitter, and says a tagging agent writes straight into its `.jsonl` file

### A needs-edit spec on a live promise is converted

- **Given** the SKILL.md text
- **When** its promise step is read
- **Then** it says a spec marked `needs-edit` for a reason other than a retired business spec is converted like any other

### A test folder spanning several specs is one agent

- **Given** the SKILL.md text
- **When** it is read
- **Then** it says such a folder is one agent, which reads those specs' criteria

### A limited run says what it covered

- **Given** the SKILL.md text
- **When** its tagging step is read
- **Then** it says a run limited to a slice says so in its counts, and is finished when `--verify` lists none of that slice's files
