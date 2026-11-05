---
id: loops.learn-task
status: draft
depends_on:
  - loops.session-reading
  - store.remember-skill
  - store.rules
  - store.layout
  - core-cli.tasks-register
implements: ../../promises/loops/developer-benefits-from-what-past-sessions-taught.business.md
governed_by: []
governs:
  - "src/tasks/collect-learn.ts"
  - "src/sessions/condense.ts"
  - "src/store/amendments.ts"
  - "skills/cortex-learn/SKILL.md"
  - ".claude/skills/cortex-learn/SKILL.md"
---

# `cortex-learn`: the daily task that mines sessions into the store

## Intent

In-session capture does not happen on its own: an audit of five sessions found about 365 facts spoken, 60 rule candidates and none filed in `world/`. `cortex-learn` is the backstop. Once a day it reads every finished session of this project that has no digest yet, and files what was told, corrected, discovered or decided, by the same placement discipline as `cortex-remember`. It also records `Specflow-Amends:` commit trailers in `history/changes/`. It may write anywhere in `cortex/` (P11, Pedro at the G2 sitting): a deep read of a conversation can yield rules and best practices nobody stated as such, so filing is not limited to quoted words. Specs stay out of reach: anything that would change a spec is a proposal. Every write follows the MAP filing rules. Deterministic work (finding sessions, condensing and redacting transcripts, reading trailers) is Core. Judgement on free text is the skill. It writes no code.

## Entities

- **READS:** this project's transcripts through `loops.session-reading`; `git worktree list` output and git log; `cortex/history/sources/`, `cortex/history/changes/`; the store, for search-first.
- **WRITES:** condensed transcripts in a scratch directory outside the repository (Core); `cortex/history/changes/<today>-spec-amendments.md` (Core); store files by the `store.remember-skill` steps, `cortex/world/rules/`, `cortex/now/proposals.md`, `cortex/history/sources/<today>-session-<id>.md` (skill).
- **CREATES:** `cortex tasks collect learn`, `cortex store amendments`, `condenseSession`, the constants in Rule 2, the skill bundle `cortex-learn`.

## Rules

1. **The bundle.** `skills/cortex-learn/SKILL.md`, mirrored byte for byte to `.claude/skills/cortex-learn/SKILL.md`. It is Tier D in `scaffolding.skill-listing-budget`: dispatched by name from the task payload or typed as `/cortex-learn`, so its description names the skill and carries no trigger phrases. It is 4.0-only: listed in `STORE_V4_BUNDLES`, and `store.migrate` Rule 18 step 2 installs it. The skill never spawns a nested `claude` process.
2. **`cortex tasks collect learn [--json] [--out <dir>] [--all] [--today YYYY-MM-DD] [--now <ISO datetime>]`** lists the sessions to mine and writes their condensed text. It reads nothing outside the transcripts, git and `cortex/history/`, and writes only under the out directory. `--now` is the clock for the quiet window, defaulting to real time; `--today` sets only the horizon and file names, defaulting to the date of `--now`. Default out directory: `<os tmpdir>/cortex-learn/<today>/`. An out directory inside the project root is refused with exit 1. A session is listed when all of these hold:
   - its transcript is under the slug of the project root, or of a path `git worktree list` prints for this repository (`loops.session-reading` Rule 1, called once per path);
   - no file in `cortex/history/sources/` ends in `-session-<id>.md`;
   - its last modification is at least `SESSION_QUIET_HOURS` (2) before `--now`, so a live session is left for the next run;
   - its last modification is within `LEARN_HORIZON_DAYS` (14) of `today`, unless `--all` is given;
   - it is not a scheduled session: its first user line does not match `isScheduledPromptText` (`pulse.distil` Rule 11(a)).

   Sessions are ordered oldest first and at most `LEARN_MAX_SESSIONS` (10) are listed; the JSON states `remaining`, the count left for later runs. Output shape: `{ today, outDir, remaining, sessions: [{ id, modified, parts: [<absolute path>], skippedLines, redactions }] }`. Exit 0, also when no session qualifies.
3. **Condensing** (`condenseSession`, deterministic, no LLM). One markdown file per session. It iterates the entries once, in transcript order; for each entry it emits the message block, then that entry's tool uses. `<timestamp>` is the entry's, or `-` when absent.
   - A user entry's text is tested in this order: containing `<cross-session-message` gives `PEER <timestamp>:`; `isHarnessText` gives `INJECTED <timestamp>:`; otherwise `USER <timestamp>:`, text the person typed.
   - `ASSISTANT <timestamp>:` for assistant text;
   - `TOOL <name> <filePath or command>` for each record `extractToolUses` gives for that entry; tool results are dropped.

   A file over `CONDENSE_PART_CHARS` (200,000) is split at an entry boundary into `<id>-part<n>.md`.
4. **Redaction, before anything is written.** Every match of `SECRET_PATTERNS` is replaced by `[redacted:<label>]`. The list is data and holds at least, as `label`: pattern: `private-key`: private key blocks; `api-key`: `sk-` keys; `github-token`: `ghp_`, `gho_`, `ghs_`, `github_pat_`; `aws-key`: AWS access key ids; `slack-token`: `xox[abprs]-`; `bearer`: `Bearer <token>`; `credential`: `password|passwd|secret|token|api[_-]?key` followed by `=` or `:` and a value. The count per session is `redactions` in the JSON.
5. **`cortex store amendments [--apply] [--json] [--today YYYY-MM-DD]`.** Reads every commit on `HEAD` carrying a `Specflow-Amends:` trailer, parsed per schema S10: target `\S+` split at the last `#` into spec id and item, then a separator of an em dash, `-` or `--`, then the reason. A short sha is the first 7 hex characters, and a commit date is the author date as `YYYY-MM-DD`. A commit is recorded when its short sha is in a file `history/changes/*-spec-amendments*.md`. Without `--apply` it lists the unrecorded trailers and the malformed ones. With `--apply`, when at least one is unrecorded, it writes a new file `history/changes/<today>-spec-amendments.md` (first free name by the `-2`, `-3` rule of `store.freshness` Rule 6) with `kind: spec-amendment`, `status: recorded`, `origin` one `commit:<sha>` per commit, and one body line per trailer: `- <short sha> <commit date> <spec id>#<item> — <reason>`. A malformed trailer is listed on stdout and not written, and only from commits after `specflow.since` when that key is set; well-formed trailers before it are recorded as usual. With nothing unrecorded it writes nothing. Exit 0. Outside a git repository it prints `not a git repository` and exits 0.
6. **The skill's steps, in order:**
   - (1) the write gate of `store.remember-skill`: unaccepted store, print the refusal line and stop;
   - (2) run `cortex store amendments --apply`;
   - (3) run `cortex tasks collect learn --json`;
   - (4) for each session, oldest first, read its parts and extract: facts told, corrections and the rules implicit in them, knowledge discovered that `cortex/` lacks, decisions made, open items;
   - (5) file each by Rules 7 to 9;
   - (6) write the digest (Rule 10) as the last act for that session;
   - (7) run `cortex store validate` and fix any error in a file this run wrote;
   - (8) run `cortex tasks heartbeat learn`.
7. **Facts.** Each fact is filed by `store.remember-skill` Rule 2 steps (1) to (5) and Rule 4, with `origin: session:<mined session id>`, never the id of the task's own session, and `verified: <today> (told|observed|inferred)`: `told` only for what a `USER` line states. An open item goes to `now/` with `until:`. Only `USER` lines count as told. `PEER`, `INJECTED`, `ASSISTANT` and `TOOL` lines are evidence of what happened, never of what the owner said.
8. **Rules.** A rule found in a `USER` line ("don't X", "always Y", a correction) is filed in `world/rules/<rule>.md` with `applies_when` written as a situation, `scope`, `source: user@<session date>`, `origin: session:<id>`, `verified: <today> (told)`, the rule text as the body, and as the body's last line a blockquote holding the verbatim quote. A correction of an existing rule updates that file and adds the new quote. A one-off instruction for the task at hand is not a rule and is skipped.
9. **Inferred rules and best practices.** A rule or best practice the session shows without anyone stating it is filed in `world/rules/` too, with `source: cortex-learn@<today>`, `origin: session:<id>`, `verified: <today> (inferred)`, and as the body's last line `Inferred from session <id>: <one-sentence evidence>`. `verified` is what tells it from a told rule: `(told)` only with a verbatim `USER` quote, never otherwise. Anything that would change a spec, and anything the task is unsure belongs in the store, goes to `now/proposals.md` by `store.remember-skill` Rule 8. `now/proposals.md` is only ever appended to.
10. **The digest.** One new file `history/sources/<today>-session-<id>.md` per session mined, also when nothing was filed. Frontmatter: `about`, `permanence: stable`, `verified: <today> (observed)`, `origin: session:<id>`, `captured: <today>`. Body, in this order: `## Filed` (each `<fact> → <path>`), `## Already there` (each `<fact> → <path>`), `## Skipped` (each `<fact>: <reason>`). It holds no transcript path and no secret. It is the idempotency marker: a session with a digest is never mined twice, and a run killed before the digest mines that session again, where search-first keeps it from filing twice. New content in a session after its digest is not mined; this is an accepted limit.
11. **Bounded commands.** Every `cortex` command the skill runs is started in the background and polled, with a limit of 10 minutes. A command past its limit is killed, named in the skill's final message and skipped. macOS has no `timeout` command.
12. **Nothing outside `cortex/`, no commit.** The task writes nothing outside `cortex/` and the scratch directory, never a spec, and neither stages nor commits (see Notes). Core makes no LLM call (RULES.md rule 3).

## Acceptance Criteria

### LOOPS-LEARN-TASK-1: Collect lists only unmined, finished, recent sessions

- **Given** a fake home with sessions `a` (modified 3 days ago), `b` (modified 3 days ago, and `history/sources/2026-11-01-session-b.md` exists), `c` (modified 30 minutes ago) and `d` (modified 20 days ago)
- **When** `cortex tasks collect learn --json --now 2026-11-04T12:00:00Z` runs
- **Then** `sessions` holds exactly `a`
- **And** with `--all` it holds `a` and `d`

### LOOPS-LEARN-TASK-2: Scheduled sessions are not mined

- **Given** a session whose first user line starts with `Base directory for this skill:` and one containing `<scheduled-task`
- **When** collect runs
- **Then** neither is listed

### LOOPS-LEARN-TASK-3: Worktree sessions are included, other projects are not

- **Given** a repository with a linked worktree, a session under the root's slug, one under the worktree's slug, and one under a slug sharing the root's prefix
- **When** collect runs
- **Then** the first two are listed and the third is not

### LOOPS-LEARN-TASK-4: The per-run limit is honest

- **Given** 13 qualifying sessions
- **When** collect runs
- **Then** the 10 oldest are listed and `remaining` is 3

### LOOPS-LEARN-TASK-5: An out directory inside the project is refused

- **Given** `--out <project root>/tmp`
- **When** collect runs
- **Then** it exits 1 and writes nothing

### LOOPS-LEARN-TASK-6: Collect leaves the repository untouched

- **Given** any run with a default out directory
- **Then** no file under the project root or the fake home's transcripts is created or changed

### LOOPS-LEARN-TASK-7: Condensing labels who spoke

- **Given** a session with a typed user message, a user entry holding a `<cross-session-message>`, a user entry of harness text, an assistant text with an `Edit` tool use on `a.ts`, and a tool result containing `RESULT-TEXT`
- **When** it is condensed
- **Then** the file has one `USER` block, one `PEER` block, one `INJECTED` block, one `ASSISTANT` block and a line `TOOL Edit a.ts`, in transcript order
- **And** `RESULT-TEXT` appears nowhere

### LOOPS-LEARN-TASK-8: Long sessions split at an entry boundary

- **Given** a session condensing to 450,000 characters
- **When** it is condensed
- **Then** there are three parts, none over 200,000 characters, and no entry is cut

### LOOPS-LEARN-TASK-9: Secrets are redacted before writing

- **Given** a user message holding `ghp_` followed by 36 letters, and `password: hunter2`
- **When** it is condensed
- **Then** the written file holds `[redacted:github-token]` and `[redacted:credential]`, holds neither original string, and that session's `redactions` is 2

### LOOPS-LEARN-TASK-10: Trailers are parsed per schema S10

- **Given** the values `core-cli.init#rule-7 — wording`, `a#b#c -- x y`, `a#b - why`, `core-cli.init wording`, `core-cli.init — wording` and `a#b —`
- **When** each is parsed
- **Then** the first three give spec id, item and reason, the target split at its last `#`, and the last three are malformed

### LOOPS-LEARN-TASK-11: Amendments are recorded once

- **Given** a repository with two commits carrying `Specflow-Amends: core-cli.init#rule-7 — wording` and `Specflow-Amends: core-cli.init#CORE-CLI-INIT-3 -- renamed`
- **When** `cortex store amendments --apply --today 2026-11-04` runs twice
- **Then** `history/changes/2026-11-04-spec-amendments.md` exists with `kind: spec-amendment`, two `commit:` origins and two body lines, and no second file is written

### LOOPS-LEARN-TASK-12: A later amendment gets a new file

- **Given** that record is committed, and a third trailer lands the same day
- **When** `--apply` runs
- **Then** only the third is written, to `2026-11-04-spec-amendments-2.md`, the first file is byte-identical, and `cortex store validate` gives no `check.append-only` warning

### LOOPS-LEARN-TASK-13: A malformed trailer is reported, not written

- **Given** a commit with `Specflow-Amends: core-cli.init wording`
- **When** `--apply` runs
- **Then** the output names the commit as malformed and no history file holds it

### LOOPS-LEARN-TASK-14: Malformed trailers before specflow.since are not listed

- **Given** `specflow.since` set to a commit, an older commit with a malformed trailer and a well-formed one, and a newer commit with a malformed trailer
- **When** `--apply` runs
- **Then** only the newer malformed trailer is listed, and the older well-formed one is recorded
- **And** with no `specflow.since`, or one git cannot resolve, every malformed trailer is listed

### LOOPS-LEARN-TASK-15: Without --apply nothing changes

- **Given** unrecorded trailers
- **When** `cortex store amendments` runs
- **Then** it lists them and writes nothing

### LOOPS-LEARN-TASK-16: Outside a git repository nothing happens

- **Given** a folder that is not a git repository
- **When** `cortex store amendments` runs
- **Then** it prints `not a git repository` and exits 0

### LOOPS-LEARN-TASK-17: The bundle is mirrored and Tier D

- **Given** the repository
- **Then** `.claude/skills/cortex-learn/SKILL.md` is byte-identical to `skills/cortex-learn/SKILL.md`, `scripts/measure-skill-descriptions.mjs` reports it as tier `D`, and its description has no trigger phrase

### LOOPS-LEARN-TASK-18: The skill carries its steps in order

- **Given** the SKILL.md text
- **Then** it names, in this order: the write gate, `cortex store amendments --apply`, `cortex tasks collect learn --json`, the five kinds of extraction, the digest, `cortex store validate`, `cortex tasks heartbeat learn`

### LOOPS-LEARN-TASK-19: The skill states who counts as told

- **Given** the SKILL.md text
- **Then** it says only `USER` lines are told, that `PEER` and `INJECTED` lines never are, and that `origin` is the mined session's id

### LOOPS-LEARN-TASK-20: The skill tells told rules from inferred ones

- **Given** the SKILL.md text
- **Then** it files a rule with a verbatim `USER` quote in `world/rules/` with `applies_when`, `scope`, `source: user@<date>`, `verified (told)` and the quote as a blockquote; files an inferred rule or best practice there with `source: cortex-learn@<today>`, `verified (inferred)` and the `Inferred from session` line; sends anything that would change a spec to `now/proposals.md`; and names the one-off instruction as not a rule

### LOOPS-LEARN-TASK-21: The skill specifies the digest

- **Given** the SKILL.md text
- **Then** it names `history/sources/<today>-session-<id>.md`, the headings `## Filed`, `## Already there`, `## Skipped` in that order, that the digest is written also when nothing was filed, and that it is the last act for a session

### LOOPS-LEARN-TASK-22: The skill bounds its commands

- **Given** the SKILL.md text
- **Then** it says every `cortex` command runs in the background and is polled with a 10-minute limit, and it forbids a nested `claude` process

## Notes

- **Acceptance test for the whole task (Pedro, 2026-10-21; journey layer).** A fixture repository with a 4.0 store and an empty `world/rules/`, plus a synthesized transcript in which the user states 5 to 10 rules in passing, in their own phrasing, among ordinary work: some with a clear trigger (worktree, pushing, pnpm), some general, one correction of an earlier statement, one one-off instruction. Run the skill. Score: rules filed against rules said (each told rule `(told)`, never `(inferred)`); wrong filings (the one-off, duplicates); every filed rule carries the quote, `origin: session:<id>`, `verified (told)` and a usable `applies_when`. The Senses half of that test is out of scope: Senses is not in 4.0.
- **The learn digests are the measurement of in-session capture.** The ratio of `## Already there` to `## Filed` says whether sessions capture on their own. `loops.quality-task` reports it.
- **Reinstated origin forms: none needed.** `session:<id>` already exists in schema S3. The draft's `origin: task:…` is dropped.
- **Worktree limit.** A session held in a worktree that was removed before the next run is not found, because its path no longer appears in `git worktree list`. Accepted for now: the task runs daily and worktrees usually outlive a day.
- **Committing (sitting item 17).** The tasks leave their writes unstaged and uncommitted in the checkout (`useWorktree: false`), so the next person commits them. The marker works either way, since the digest exists on disk.
- **Engineering calls, stated for G2:** `SESSION_QUIET_HOURS`, `LEARN_HORIZON_DAYS`, `LEARN_MAX_SESSIONS`, `CONDENSE_PART_CHARS` and the 10-minute limit. The horizon exists so a first run does not mine a project's whole history; `--all` does that by hand.
- Model: Opus (`core-cli.tasks-register` Rule 7).
