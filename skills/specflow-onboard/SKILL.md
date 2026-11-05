---
name: specflow-onboard
description: 'Bring existing work under the specs. Port mode: turn business specs into promises and tag every test. Onboard mode: write specs from code. Proposals for approval. "onboard this codebase", "port mode".'
---

# Specflow: Onboard

Two jobs that need agents and a person's approval, both starting from work that already exists. Nothing here is applied, and nothing is committed, without the person's go.

## Which mode, checked in this order

1. `.specflow/` exists and `specflow/` does not: stop and say `Run cortex specs port first.`
2. `specflow/` and `.cortex-port/report.json` exist: port mode.
3. `specflow/` exists with no report: ask the person which mode they mean.
4. Neither folder exists: onboard mode.

## Working folder

`cortex specs port` leaves its report in `.cortex-port/report.md` and `.cortex-port/report.json`. Proposals stay there until approved: `.cortex-port/promises/` (one draft per business spec, at the path it will take), `.cortex-port/tagging/<area>.jsonl`, and `.cortex-port/decisions.md` (what the person decided). Onboard mode works in `.cortex-port/onboard/<concern>/`. It runs with no port, so it creates the folder and its line in the repository's exclude file (`git rev-parse --git-path info/exclude`), never in `.gitignore`.

Never write `specflow/INDEX.md` or the `specflow.rules` key of `cortex/cortex.json`.

## Agents

Every spawned agent is awaited before its output is used. Every spawned agent writes its output to a file under `.cortex-port/`, which the skill reads: the file is the delivery, because a hand-back can fail after the agent has finished. Split the work so that one agent reads one area or one test folder. A test folder that spans several specs is still one agent, which reads those specs' criteria.

## Port mode

**Promises.** For each business spec under `specflow/promises/`, an agent drafts one promise of at most 40 lines in `.cortex-port/promises/`: frontmatter `id` (`P-<AREA>-<n>`: `<AREA>` is the uppercased first folder, `<n>` counts the area's promises from 1, in path order), `title` and `status`, a `#` title, and a `## Outcome` section. It keeps every commitment the business spec makes, including what the product does not promise, and drops journey and metric detail. Each spec's `implements:` link gives its frontmatter `serves: [<promise id>]`, mechanically, one entry per spec, and `implements:` is then removed. Reasoning that belongs to no promise is listed for `cortex/world/decisions/`, not dropped. This is the one text rewrite of a port.

**Retired specs are records.** A `status: retired` business spec gets no promise, and a retired spec gets no `serves:`. A live spec that implements a retired business spec is not converted: it keeps its `implements:`, stays `needs-edit` in the report, and the person decides where it belongs. A spec the report marks `needs-edit` for another reason is converted like any other: the mark is about its criteria.

**Tagging.** Agents read every test that `.cortex-port/report.json` or the `.untagged` list of `cortex specs index --json` names. Every untagged test gets exactly one JSON line in `.cortex-port/tagging/<area>.jsonl`, with `file`, `name`, `line`, `action` and `reason`. Each agent writes its lines straight into `.cortex-port/tagging/<area>.jsonl`. Its `action` is, in this order of preference:

- `tag`: with `criterion`, the criterion it proves;
- `new-criterion`: no criterion matches, so it gives the `title` and the `spec` it belongs in;
- `delete`: only when the behaviour is not wanted, with the reason.

A `tag` is proposed only after reading the test body against the criterion, never from a test's name or its place in the file: a wrong tag makes rule (c) trust the wrong thing. Its `reason` says in a few words what the body proves that the criterion requires. A tag may name a criterion in any live spec, inside the slice or not.

A test you cannot place is proposed as `new-criterion`, never left out and never proposed for deletion for lack of a match. No line names a retired spec's criterion; a test that proves only a retired spec's behaviour proposes `delete` and names that spec in `reason`. The pass is finished when `cortex specs port --verify` exits 0: run it before asking for approval. A run the person limits to a slice says so in its counts, and it is finished when `cortex specs port --verify` lists none of that slice's files.

**Approval, then application.** Show the person the counts per area and the lines that are not plain tags. Nothing is applied before the person's approval, per repository; approval may be per area. The person's decisions go in `.cortex-port/decisions.md`. Only after that does the main session apply the approved rows: a promise replaces its business spec; `serves:` is added to each spec and its `implements:` removed; a tag goes at the start of the test name (`[CRIT-ID]`, or `[A-1, B-2]` for several), or as `@pytest.mark.criterion("CRIT-ID")` in pytest, one marker per id; new criteria are added in commits of their own. Applying a tag adds that prefix or marker and nothing else.

**Going live.** When `specflow/INDEX.md` shows `Untagged tests: 0` (`.untagged` empty in `cortex specs index --json`), say so and tell the person that rules (b) and (c) can be switched on in the `specflow.rules` key of `cortex/cortex.json`. The person switches them on; this skill never does, and it never reports them live while an untagged test remains. A criterion still without a test stays `unverified`; that is the honest starting state.

## Onboard mode

This mode has not been tested. It runs on a client repository only after a blind run on one area of a repository has been reviewed.

Ask the person to confirm that before you start on a repository. Then, in order:

1. a **splitter** agent divides the codebase into concerns, in `.cortex-port/onboard/concerns.md`;
2. for each concern, **two independent elephants** each write a spec draft from the code into `.cortex-port/onboard/<concern>/`, neither seeing the other's output. An elephant here is a spawned agent with the concern and the code. It writes rules and criteria as steps 2 and 3 of `specflow-spec` say, and it does not run that skill: it names no test, and it commits nothing;
3. a **reconciler** per concern keeps what both agree on, and lists every disagreement as an open question in the spec;
4. a **goldfish** per concern reviews the reconciled spec in spec mode (`specflow-review`);
5. the person resolves the open questions and findings;
6. **a test per retained criterion**: each is tagged with its criterion, and a criterion left without a test shows `unverified`.

The approved spec files go under `specflow/impl/`, with their tests.

A disagreement between elephants is never settled by the reconciler. Only in a run told the user can't answer does the main session decide each open question, writing the decision and its reason under Open questions.
