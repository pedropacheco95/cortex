---
id: specflow.check
status: implemented
depends_on:
  - specflow.index
  - core-cli.init
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "src/specflow/check/**/*.ts"
---

# `cortex check`: the commit and range check

## Intent

Code, tests and specs drift apart one commit at a time. `cortex check` judges the shape of a commit, or of a range of commits, and refuses the shapes that cause drift. It runs no tests, makes no LLM call and uses no network. It is the only Cortex check that may refuse (RULES.md rule 6): session hooks still only warn.

It is a port of the bench's variant B check, which refused 4 times in 94 commits, each refusal followed by a correct commit. Every rule is labelled **measured** (ran on the bench) or **new** (never ran), and the 2026-11-17 review reads the two groups separately.

## Entities

- **READS:** the staged tree, `HEAD` and its parent, the commit message file, `cortex/cortex.json` key `specflow` (schema S12.6), the spec and test model of `specflow.index`.
- **WRITES:** `<git-common-dir>/specflow/events.jsonl`, `<git-common-dir>/specflow/amendments.jsonl`. These sit outside the working tree, so every worktree of a clone shares them.
- **CREATES:** nothing tracked. The check never edits a file git tracks.

## Rules

1. **Modes.** `cortex check --commit-msg <file>` judges the staged commit (the git `commit-msg` hook). `cortex check --range <base>..<head>` judges every commit in that range. `cortex check --pre-push` reads git's pre-push lines from stdin and runs range mode for each pushed ref (`specflow.git-hooks`). Any other argument shape prints usage and exits 2.
2. **Exit codes.** 0: allowed, warnings included. 1: refused. 2: usage error, or an internal error. An internal error prints `specflow: internal error in the check (not a verdict on your change): <message>`. Git treats 1 and 2 alike, so a broken check stops the commit and says so; it never reads as a pass.
3. **Path classes.** Each changed path gets the first class that fits:
   - `generated`: `specflow/INDEX.md`
   - `spec`: anything under `specflow/`
   - `hook`: anything under `.githooks/`
   - `store`: anything under `cortex/`, so `cortex/cortex.json` included. New: Cortex's own config and knowledge are not product code, and `specflow.since` and `specflow.rules` live there.
   - `test`: matches a `specflow.tests` include, or the generic test patterns of schema S12.6
   - `docs`: ends in `.md`
   - `code`: everything else, config included

   `generated` paths are ignored by every rule.
4. **The diff.** The commit's changes are `git diff --cached --name-only --no-renames <base>`, where `<base>` is `HEAD`. A rename counts as a delete and an add. With `git commit --amend`, `<base>` is `HEAD^` (the marker of `specflow.git-hooks` Rule 4). A repository with no `HEAD` is allowed unjudged.
5. **Rule items.** A spec's *rules* are the numbered items under its heading titled exactly `Rules`, at any heading level. Its *criteria* are as `specflow.index` Rule 2 defines them. Text is compared after collapsing whitespace and removing `**`. Only files under `specflow/impl/` count; promises are outside the check (P7). An item is:
   - **A criterion** is matched by id: **added** when its id is new, **changed** when the same id has different text, **removed** when its id is gone.
   - **A rule** is matched by text, so renumbering alone changes nothing. A base rule whose text no longer appears anywhere in the staged list is **changed** if its base number still exists, and **removed** if not. It is always named by its base number. A staged rule whose text is not in the base is **added**. New: the bench keyed rules by number, which made every rule after an insertion an amendment.
   - **Specs are paired by `id`,** not path, so moving a spec file changes no item.
   - An **amendment** is a changed or removed item. A commit that edits a rule and inserts another still needs the trailer for the edited rule's base number.
   - **A retired spec has no items.** A spec with `status: retired` in both the base and the staged tree is never judged, so correcting a record needs no trailer. A commit that sets `status: retired` removes every item the spec had, and a commit that clears it adds them. So retiring a spec cannot share a commit with code (Rule 9).
6. **Rule (a) code-needs-test.** A commit with a `code` path and no `test` path is refused. Measured. Always on.
7. **Rule (b) test-needs-tag.** Each test case added or changed in the commit must carry a tag naming a criterion that resolves in the staged tree. A case changed means its title or body differs from the base after collapsing whitespace. A helper or import change changes no case. New. Controlled by `specflow.rules.b`.
8. **Rule (c) criterion-needs-test.** Each changed criterion needs a test tagged with it, added or changed. Added and removed criteria are not judged. Text is compared as in Rule 5, so whitespace and emphasis edits never fire it. New, reasoned and not run. Controlled by `specflow.rules.c`.
   - **In `--commit-msg` mode** it can see only one commit, so it never refuses. It passes silently when the tagged test changed in this commit or in `HEAD`, and otherwise warns. A spec committed ahead of its code is normal.
   - **In range mode** it judges the range as a whole and refuses when no commit in the range changed a test tagged with that criterion.
   - **Limit:** the refusal comes at push, not at commit. In a repository that rarely pushes it arrives late, after many commits; until then (c) is a warning only.
   - **OPEN:** that commit mode never refuses (c) is a recommendation awaiting the owner, who also decides the `pre-push` hook. The plan's wording was "refuses".
9. **Rule (d) spec-commit-alone.** A commit with any added, changed or removed rule or criterion and any `code` path is refused. Edits to other sections of a spec (Intent, Notes) may share a commit with code. Measured. Always on.
10. **Rule (e) amend-needs-trailer.** Each amendment needs a `Specflow-Amends:` trailer in the commit message that names it exactly: `<spec-id>#rule-<n>` or `<spec-id>#<criterion-id>`, with a non-empty reason (schema S10). An added item needs none (A14). One trailer `<spec-id>#retired` covers every item a commit removes by retiring that spec. Measured as a record; the refusal is new. Always on.
11. **Rule (f) touched-criteria.** For each `code` path, the check lists the criteria whose tagged test files statically reach it, by following relative imports transitively from each tagged test file (JS and TS `import`, `export … from`, `require`; Python `import` and `from … import`, resolved against the test file's folder and the repository root). Unresolved imports are skipped. It lists at most 20 criteria and then `… and <n> more`. New. Warns only. Needs tags, so it lists nothing where no test is tagged.
12. **Rule (g) stale-literal.** For each constant whose value changed in a `constants.md`, the check lists tracked files outside `specflow/` that still hold the old value as a whole word (`git grep -w -F`), at most 20. An old value shorter than 2 characters is not searched, and the warning says so. New. Warns only.
13. **Rule levels.** Rules (a), (d), (e) always refuse and (f), (g) always warn. `specflow.rules.b` and `.c` take `off`, `warn` or `refuse`, and an absent key means `off` (A11). The config cannot turn off a measured rule. The lint rule `lint.rules-early` guards turning (b) or (c) on early.
14. **Merge commits.** In `--commit-msg` mode, when `MERGE_HEAD` exists, the check judges only what the merge adds beyond the automatic merge: the staged tree against the `git merge-tree --write-tree` result of merging each `MERGE_HEAD` in turn, minus files that conflicted. A conflict resolution is not judged. A clean merge therefore passes.
15. **Range mode.** Commits come from `git rev-list --reverse <base>..<head>`, leaving out `specflow.since` and its ancestors when that key is set (`specflow.git-hooks` Rule 10): commits made before the hooks existed are never judged. Each non-merge commit is judged against its first parent, using its own message. A merge commit is judged as in Rule 14, from its parents. Rule (c) then runs once over the whole range. Output has one block per commit with a verdict, headed by its short hash and subject. Each block ends `specflow: allowed (<short hash>)` or the refusal. An empty range prints `specflow: 0 commits in range` to stderr and exits 0. Range mode exits 1 if any commit is refused.
16. **No `specflow/` folder.** `cortex/cortex.json` is read from the working tree in every mode. With no `specflow/` folder, the check prints `specflow: no specflow/ folder here; nothing was checked` to stderr and exits 0. It never passes silently.
17. **Messages.** Verdicts go to stderr. A refusal prints `specflow: REFUSED (<commit|merge commit|<short hash>>)` and then one line per refused rule, exactly as in the table below. A warning prints `specflow: warning: <text>`. At most 8 paths or items are named, then ` …`.

    | Rule | Line |
    |---|---|
    | (a) | `- rule (a) code-needs-test: changes code or config with no test change: <paths>. Change or add the test that proves it.` |
    | (b) | `- rule (b) test-needs-tag: test case without a resolving criterion tag: <file> › <name>. Start its name with [CRIT-ID]; see specflow/INDEX.md.` |
    | (c) | `- rule (c) criterion-needs-test: criterion text changed with no tagged test changed: <ids>. Change the test that proves it.` |
    | (d) | `- rule (d) spec-commit-alone: changes spec rules or criteria (<items>) together with code or config (<paths>). Commit the spec change on its own, before or after the code.` |
    | (e) | `- rule (e) amend-needs-trailer: changes existing spec text with no trailer for: <items>. Add one line each: Specflow-Amends: <spec-id>#<item> — <reason>` |

    Rule (c)'s commit-mode warning is `criterion text changed with no tagged test changed yet: <ids>. The range check refuses this if the change ends without one.`
18. **Event log.** Every verdict appends one JSON line to `events.jsonl`: `ts`, `subject`, `kind` (`commit`, `merge`, `range`), `outcome` (`allowed`, `refused`, `error`), `rules` (letters refused), `warned` (letters that warned), `reasons` (the printed lines). Each allowed commit appends one line per amendment to `amendments.jsonl`: `ts`, `subject`, `spec`, `file`, `item`, `change`, `trailer`. Refused commits leave no trace in git, so this log is the only record for review metric 2. `amendments.jsonl` is written in commit mode only: a range replays commits the hook already saw, so a `--no-verify` commit leaves no amendment record. A failed write prints a warning and never changes the verdict.
19. **What passes and what refuses.** The table is the contract for commit order. It assumes (b) and (c) are on at `refuse`.

    | Work | Commits, in order | Verdict |
    |---|---|---|
    | New behaviour | {spec adds criterion}, then {code + tagged test} | passes |
    | Amend a criterion, test first | {spec + tagged test}, then {code + another tagged test change} | passes |
    | Amend a criterion, test first, one test only | {spec + tagged test}, then {code} | second commit refused by (a) |
    | Amend a criterion, code first | {code + tagged test}, then {spec} | passes; (c) sees the test in `HEAD` |
    | Amend a criterion, spec first, at commit | {spec}, then {code + tagged test} | both allowed; the first warns under (c) |
    | Amend a criterion, spec first, at range | the same two commits | passes |
    | Amend a criterion, tagged test never changed, at commit | {spec}, then {code + a test not tagged with it} | both allowed; the first warns under (c) |
    | Amend a criterion, tagged test never changed, at range | the same two commits | refused by (c) |
    | Everything at once | {spec + code + test} | refused by (d) |
    | Code only | {code} | refused by (a) |
    | Install the hooks, or turn rule (b) on | {`cortex/cortex.json`} | passes |
    | Amendment without a trailer | {spec} | refused by (e) |
    | Reword Intent or Notes with code | {spec Intent + code + test} | passes |

    Every spec row with an amendment assumes its trailer is present.

## Acceptance Criteria

### Code with no test change is refused

- **Given** a repository with a `specflow/` folder and `src/a.ts` staged alone
- **When** `cortex check --commit-msg <file>` runs
- **Then** it exits 1 and stderr carries `specflow: REFUSED (commit)` and the rule (a) line naming `src/a.ts`

### Code with a test change is allowed

- **Given** `src/a.ts` and `tests/a.test.ts` staged
- **When** the check runs
- **Then** it exits 0

### Config counts as code

- **Given** `package.json` staged alone
- **When** the check runs
- **Then** it exits 1 with the rule (a) line naming `package.json`

### The store's own config needs no test

- **Given** `cortex/cortex.json` staged alone, with `specflow.rules.b` changed
- **When** the check runs
- **Then** it exits 0

### Docs, specs and hooks need no test

- **Given** `README.md`, `specflow/impl/billing/refunds.spec.md` (Notes section only) and `.githooks/pre-commit` staged
- **When** the check runs
- **Then** it exits 0

### A rename counts as a code change

- **Given** `src/a.ts` renamed to `src/b.ts` with no other change, staged
- **When** the check runs
- **Then** it exits 1 with the rule (a) line naming both paths

### A criterion edit with code is refused

- **Given** a staged change to the text of `BILLING-REFUNDS-3`, its trailer in the message, plus `src/a.ts` and `tests/a.test.ts`
- **When** the check runs
- **Then** it exits 1 with the rule (d) line naming `BILLING-REFUNDS-3` and `src/a.ts`

### A rule edit with code is refused

- **Given** a staged change to rule 2 of `billing.refunds` under a `## Rules` heading, its trailer, plus `src/a.ts` and `tests/a.test.ts`
- **When** the check runs
- **Then** it exits 1 with the rule (d) line naming rule 2

### An Intent edit may share a commit with code

- **Given** a staged change to the Intent section only of `billing.refunds`, plus `src/a.ts` and `tests/a.test.ts`
- **When** the check runs
- **Then** it exits 0

### A promise edit is outside the check

- **Given** a staged edit to the text of `specflow/promises/billing/refunds.md` plus `src/a.ts` and `tests/a.test.ts`
- **When** the check runs
- **Then** it exits 0

### An amendment without a trailer is refused

- **Given** the text of `BILLING-REFUNDS-3` changed and staged alone, with a message having no trailer
- **When** the check runs
- **Then** it exits 1 with the rule (e) line naming `billing.refunds#BILLING-REFUNDS-3`

### An amendment with its trailer is allowed and recorded

- **Given** the same change and the message line `Specflow-Amends: billing.refunds#BILLING-REFUNDS-3 — refund window is now 30 days`
- **When** the check runs with rules (b) and (c) off
- **Then** it exits 0 and `amendments.jsonl` gains one line with `item` `BILLING-REFUNDS-3` and `change` `changed`

### A trailer for another item does not count

- **Given** rules 2 and 3 of `billing.refunds` changed and a trailer naming only `billing.refunds#rule-2`
- **When** the check runs
- **Then** it exits 1 with the rule (e) line naming `billing.refunds#rule-3` and not `rule-2`

### A trailer with no reason does not count

- **Given** the changed criterion and the line `Specflow-Amends: billing.refunds#BILLING-REFUNDS-3`
- **When** the check runs
- **Then** it exits 1 with the rule (e) line

### Removing a criterion is an amendment

- **Given** `BILLING-REFUNDS-3` deleted from the spec and no trailer
- **When** the check runs
- **Then** it exits 1 with the rule (e) line naming it

### Adding a criterion needs no trailer

- **Given** a new criterion `BILLING-REFUNDS-9` staged alone, no trailer
- **When** the check runs
- **Then** it exits 0

### Retiring a spec with code is refused

- **Given** a staged change setting a spec to `status: retired`, and a `code` path
- **When** the check runs
- **Then** it refuses under rule (d)

### Retiring a spec needs one trailer

- **Given** a staged change setting a spec with 2 rules and 3 criteria to `status: retired`, and no `code` path
- **When** the check runs with `Specflow-Amends: billing.old#retired — replaced by billing.new`, and again with no trailer
- **Then** the first is allowed, and the second is refused under rule (e)

### Editing a retired spec is not judged

- **Given** a spec retired in the base, with one criterion's text changed and no trailer, and a `code` path in the same commit
- **When** the check runs
- **Then** it passes rules (c), (d) and (e)

### Moving a spec file changes no item

- **Given** a spec moved to another path with its text unchanged
- **When** the check runs with no trailer
- **Then** it exits 0

### Inserting a rule mid-list amends nothing

- **Given** a spec with rules 1 to 3, and a new rule inserted as 2 so the old 2 and 3 become 3 and 4 with unchanged text
- **When** the check runs with no trailer
- **Then** it exits 0

### Inserting a rule and editing a shifted one needs the base number

- **Given** a spec with rules 1 to 3, a new rule inserted as 2, and the old rule 3, now 4, reworded, with no trailer
- **When** the check runs
- **Then** it exits 1 with the rule (e) line naming `billing.refunds#rule-3`, and a trailer for `rule-3` makes it exit 0

### Rules are found on both heading layouts

- **Given** one spec with `## Rules` and `## Acceptance Criteria` with `###` criteria, and another with `### Rules` and `### Acceptance Criteria` with `####` criteria
- **When** a rule and a criterion change in each, staged with no trailer
- **Then** it exits 1 and the rule (e) line names all four items

### An untagged changed test is refused when rule (b) is on

- **Given** `specflow.rules.b` is `refuse` and a staged new case `it('adds up')` in `tests/a.test.ts`
- **When** the check runs
- **Then** it exits 1 with the rule (b) line naming `tests/a.test.ts › adds up`

### A tag that resolves passes rule (b)

- **Given** `specflow.rules.b` is `refuse` and a staged new case `it('[BILLING-REFUNDS-3] adds up')`, with that criterion in the staged tree
- **When** the check runs
- **Then** it exits 0

### A tag naming no criterion is refused

- **Given** `specflow.rules.b` is `refuse` and a staged new case tagged `[BILLING-REFUNDS-99]`, which does not exist
- **When** the check runs
- **Then** it exits 1 with the rule (b) line

### A helper change is not a changed case

- **Given** `specflow.rules.b` is `refuse`, and only a helper function outside any `it` changed in an untagged test file
- **When** the check runs
- **Then** it exits 0

### Rule (b) is off by default

- **Given** no `specflow.rules` key and a staged untagged new case
- **When** the check runs
- **Then** it exits 0 with no rule (b) output

### Rule (b) at warn does not refuse

- **Given** `specflow.rules.b` is `warn` and a staged untagged new case
- **When** the check runs
- **Then** it exits 0 and stderr carries a `specflow: warning:` line naming the case

### The config cannot switch a measured rule off

- **Given** `specflow.rules` has `"a": "off"`
- **When** a commit with `src/a.ts` alone is checked
- **Then** it exits 1 with the rule (a) line

### A changed criterion with no test warns at commit

- **Given** `specflow.rules.c` is `refuse`, and the text of `BILLING-REFUNDS-3` changed, staged alone with its trailer, and `HEAD` touched no test tagged with it
- **When** `--commit-msg` runs
- **Then** it exits 0 and stderr carries the rule (c) warning naming `BILLING-REFUNDS-3`

### A test changed in HEAD settles rule (c) at commit

- **Given** `specflow.rules.c` is `refuse`, `HEAD` changed a test tagged `BILLING-REFUNDS-3`, and the criterion text is now changed, staged alone with its trailer
- **When** `--commit-msg` runs
- **Then** it exits 0 with no rule (c) output

### A whitespace edit does not fire rule (c)

- **Given** `specflow.rules.c` is `refuse` and a criterion re-wrapped across lines with the same words
- **When** the check runs
- **Then** it exits 0 with no rule (c), (d) or (e) output

### A range with no tagged test change is refused by rule (c)

- **Given** `specflow.rules.c` is `refuse` and a branch of two commits: the text of `BILLING-REFUNDS-3` changed with its trailer, then code plus a test not tagged with it
- **When** `cortex check --range main..HEAD` runs
- **Then** it exits 1 with the rule (c) line naming `BILLING-REFUNDS-3`

### A range with the tagged test later in the branch passes rule (c)

- **Given** the same two commits, but the second changes a test tagged `BILLING-REFUNDS-3`
- **When** `cortex check --range main..HEAD` runs
- **Then** it exits 0

### Range mode replays each commit

- **Given** a branch of three commits where only the second has code with no test change
- **When** `cortex check --range main..HEAD` runs
- **Then** it exits 1, and the output has three blocks with only the second marked refused by rule (a)

### Range mode reads each commit's own trailer

- **Given** a branch where the first commit amends a criterion with its trailer and the second amends another with none
- **When** `cortex check --range main..HEAD` runs
- **Then** only the second commit is refused by rule (e)

### Commits before the hooks are not judged

- **Given** `specflow.since` is commit `S`, and `main..HEAD` holds a code-only commit before `S` and a valid commit after it
- **When** `cortex check --range main..HEAD` runs
- **Then** it exits 0 and judges only the later commit

### An empty range is a pass that says so

- **Given** `HEAD` equal to `main`
- **When** `cortex check --range main..HEAD` runs
- **Then** it exits 0 and prints `specflow: 0 commits in range`

### A clean merge passes

- **Given** a merge in progress, with no conflicts and nothing staged beyond the automatic merge, of a branch whose commits changed code and no test
- **When** `--commit-msg` runs
- **Then** it exits 0

### A merge's own code change is judged

- **Given** a merge in progress where a cleanly merged file was then edited by hand and staged, with no test change
- **When** `--commit-msg` runs
- **Then** it exits 1 with the rule (a) line naming that file

### A conflict resolution is not judged

- **Given** a merge in progress where the only difference from the automatic merge is the resolution of a conflicted `src/a.ts`
- **When** `--commit-msg` runs
- **Then** it exits 0

### An amend compares against the parent

- **Given** `HEAD` added `src/a.ts` and `tests/a.test.ts`, and `git commit --amend` is running with only the message changed, the amend marker present
- **When** `--commit-msg` runs
- **Then** it exits 0

### The first commit is not judged

- **Given** a repository with no `HEAD` and `src/a.ts` staged
- **When** `--commit-msg` runs
- **Then** it exits 0

### No specflow folder says so

- **Given** a git repository with no `specflow/` folder and `src/a.ts` staged
- **When** `--commit-msg` runs
- **Then** it exits 0 and stderr carries `specflow: no specflow/ folder here; nothing was checked`

### An internal error is not a pass

- **Given** a `cortex/cortex.json` that does not parse
- **When** `--commit-msg` runs
- **Then** it exits 2, stderr starts `specflow: internal error in the check (not a verdict on your change):`, and `events.jsonl` gains a line with `outcome` `error`

### Bad arguments are a usage error

- **Given** any repository
- **When** `cortex check` runs with no arguments, and separately `cortex check --range main`
- **Then** each prints usage and exits 2

### Touched criteria are listed through imports

- **Given** a test tagged `BILLING-REFUNDS-3` importing `src/b.ts`, which imports `src/a.ts`, and `src/a.ts` and an untagged test staged
- **When** the check runs
- **Then** it exits 0 and stderr carries a warning naming `BILLING-REFUNDS-3`

### A Python import counts

- **Given** a pytest test marked `BILLING-REFUNDS-3` in `backend/tests/test_a.py` with `from backend.app.pay import x`, and `backend/app/pay.py` and a test staged
- **When** the check runs
- **Then** stderr carries a warning naming `BILLING-REFUNDS-3`

### A changed constant lists stale files

- **Given** `constants.md` changing `REFUND_DAYS` from `14` to `30`, and a tracked `src/a.ts` holding `14` as a whole word and `src/b.ts` holding `140`
- **When** the check runs
- **Then** it exits 0 and the warning names `src/a.ts` and not `src/b.ts`

### A very short old value is not searched

- **Given** `constants.md` changing `RETRIES` from `3` to `5`
- **When** the check runs
- **Then** it exits 0 and a warning says the old value `3` is too short to search

### Every verdict is logged

- **Given** one refused and one allowed commit attempt
- **When** the check runs for each
- **Then** `events.jsonl` under the git common dir has two lines whose `outcome` values are `refused` and `allowed`, the first with `rules` `["a"]`

### A range writes no amendment record

- **Given** a commit made with `--no-verify` that amends a criterion with its trailer
- **When** `cortex check --range` judges it
- **Then** it is allowed, and `amendments.jsonl` gains no line

### The log is shared by worktrees

- **Given** a linked worktree of the repository
- **When** a commit is checked there
- **Then** the line lands in the main repository's `.git/specflow/events.jsonl`, and no tracked file changed

### An unwritable log does not change the verdict

- **Given** `<git-common-dir>/specflow` is a file, so the log cannot be written
- **When** an allowed commit is checked
- **Then** it exits 0 and stderr carries a warning

### The commit order table holds in real commits

- **Given** a real repository with the hooks installed and (b) and (c) at `refuse`
- **When** each row of the Rule 19 table is committed in order with `git commit`, and each branch is then checked with `--range`
- **Then** every commit and range gets the verdict its row states, in both orders of the amend rows

## Notes

- Labels for the review: (a), (d) measured; (e) measured as a record, new as a refusal; (b), (c), (f), (g) new.
- Phases: (a), (d), (e) in phase 1; the rest in phase 2.
- If refusals cluster on (b) or (c), set them to `warn` and record it (plan section 10). Do not drop the measured rules.
- `--no-verify` skips the hook. The `pre-push` range check is what notices.
- A changed constant is not a rule edit: rules (d) and (e) do not apply to `constants.md`. OPEN: a value change alters what criteria mean with no trailer. It stays this way until the review shows it matters.
- OPEN: Rule 8's commit-mode behaviour, and `specflow.git-hooks`' `pre-push`, await the owner.
