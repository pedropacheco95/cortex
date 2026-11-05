---
id: specflow.git-hooks
status: implemented
depends_on:
  - specflow.check
  - specflow.index
implements: ../../specs-business/specflow/developer-knows-the-specs-stay-sound.business.md
governed_by: []
governs:
  - "src/specflow/hooks-install.ts"
---

# `cortex hooks install`: wiring the check into git

## Intent

The check only works if git calls it, and a hook that silently does not run reads as a pass. `cortex hooks install` points git at a tracked `.githooks/` folder without losing any hook the repository already has.

## Entities

- **READS:** `.git/hooks/`, git config `core.hooksPath`.
- **WRITES:** repository-local git config `core.hooksPath`, `.githooks/*`.
- **CREATES:** the `specflow.since` key, `.githooks/commit-msg`, `pre-commit`, `pre-merge-commit`, `prepare-commit-msg`, `pre-push`, and a passthrough for each existing hook of another name.

## Rules

1. `cortex hooks install` writes the hook files of Rules 3 to 6, makes them executable and sets repository-local `core.hooksPath` to `.githooks`. The second line of every file it writes is `# cortex-managed: cortex hooks install rewrites this file`. It prints each file written. Re-running it changes nothing and exits 0.
2. **Existing hooks are kept.** `core.hooksPath` makes git stop reading `.git/hooks/`, so each executable hook there, `*.sample` files excepted, keeps running. A Cortex hook of the same name first runs `.git/hooks/<name>` with the same arguments and stdin, and stops with its exit code if it fails. A hook with no Cortex counterpart, such as `post-commit`, gets a passthrough file doing only that.
3. **`commit-msg`** runs `cortex check --commit-msg "$1"`.
4. **`prepare-commit-msg`**, when `$2` is `commit` and `$3` is `HEAD` (an amend; `git commit -c <sha>` also passes `commit`), writes `HEAD`'s hash to `$(git rev-parse --git-path specflow-amend)`, and otherwise does nothing. It always exits 0. `cortex check` reads and deletes that marker, and uses `HEAD^` as its base only when the marker equals `HEAD`.
5. **`pre-commit` and `pre-merge-commit`** run `cortex specs index --staged`, which rewrites and stages `specflow/INDEX.md` when it differs. Their failures print a warning and exit 0: only the check may refuse (RULES.md rule 6). With no `specflow/` folder they exit 0 silently.
6. **`pre-push`** runs `cortex check --pre-push`. For each stdin line `<local ref> <local sha> <remote ref> <remote sha>`:
   - a deletion (local sha all zeros) is skipped;
   - an existing remote ref runs range mode over `<remote sha>..<local sha>`;
   - a new remote ref has no `@{u}`, so its base is the merge base of `<local sha>` and `origin/HEAD`; with no `origin/HEAD` or no merge base, the base is `specflow.since`, which is what a first push to an empty remote has; with no `since` either it prints `specflow: no base to compare for <ref>; nothing was checked` and skips that ref;
   - a remote sha not known locally (a force-push over commits never fetched) is treated as a new remote ref.

   **OPEN:** this hook is not in the plan; the owner decides it with `specflow.check` Rule 8.
7. **Missing binary.** Every hook that calls `cortex` first tests `command -v cortex`. If it is absent, `commit-msg` and `pre-push` print `specflow: cortex not found on PATH; the check cannot run. Install it, or use --no-verify and say so.` and exit 1. `pre-commit` and `pre-merge-commit` print a warning and exit 0. A check that cannot run never reads as a pass.
8. **A hooks path already set.** If `core.hooksPath` is set to anything other than `.githooks`, the command changes nothing, prints `specflow: core.hooksPath is already <value>; add these hooks there by hand`, lists what each hook must call, and exits 1.
9. **Limit.** The `pre-push` check runs only when something is pushed, so in a repository that rarely pushes its refusal arrives late: a commit made with `--no-verify`, or a rule (c) gap, can sit unnoticed for many commits. `cortex check --range` can be run at any time to see it sooner.
10. **Where judging starts.** On first install, the command writes `specflow.since` to `cortex/cortex.json`: the hash of `HEAD` at that moment. A later install leaves it unchanged, and `cortex sync`'s hook refresh (`core-cli.sync` Rule 21) never writes it, since sync writes nothing else under `cortex/`. Range mode skips that commit and its ancestors, because commits made before the hooks existed were never held to the rules. A repository with no commit gets no `since`, and neither does one with no `cortex/cortex.json`; the install still succeeds.
11. Outside a git repository it prints `specflow: not a git repository` and exits 1. `core.hooksPath` is not cloned, so every fresh clone runs this command again, and `cortex specs lint` warns when `specflow/` exists and it is unset (`lint.hooks-installed`).

12. **A hand-written hook in `.githooks/` is never overwritten.** Before any write, the command looks in `.githooks/` for each file it would write. One that exists with no `# cortex-managed` line is the project's own, and the command refuses: it changes nothing, sets no `core.hooksPath`, writes no `specflow.since`, prints `specflow: .githooks/<name> is not a Cortex hook; nothing was changed. Move it to .git/hooks/<name>, where it keeps running, and run this again.` for each such file, and exits 1. This holds whether or not `core.hooksPath` is set. Rule 8 is checked first. A file with the line is Cortex's and is rewritten. A file in `.githooks/` the command would not write is left alone.

## Acceptance Criteria

### Install points git at the hooks

- **Given** a git repository with a `specflow/` folder and no hooks
- **When** `cortex hooks install` runs
- **Then** it exits 0, `git config core.hooksPath` prints `.githooks`, and the five hook files exist and are executable

### Install is idempotent

- **Given** the hooks are installed
- **When** `cortex hooks install` runs again
- **Then** it exits 0 and `git status --porcelain` shows no change

### An existing post-commit keeps running

- **Given** an executable `.git/hooks/post-commit` that writes a marker file
- **When** `cortex hooks install` runs and a commit is made
- **Then** the marker file exists

### An existing hook of the same name runs first

- **Given** an executable `.git/hooks/commit-msg` that exits 1
- **When** `cortex hooks install` runs and a commit that the check would allow is attempted
- **Then** the commit is refused with that hook's exit code

### Sample hooks are ignored

- **Given** `.git/hooks/pre-rebase.sample`
- **When** `cortex hooks install` runs
- **Then** `.githooks/pre-rebase` does not exist

### A real commit is refused through the hook

- **Given** the hooks are installed and `src/a.ts` staged alone
- **When** `git commit -m x` runs
- **Then** git exits non-zero, no commit is created, and stderr carries the rule (a) line

### A missing binary refuses the commit

- **Given** the hooks are installed and `PATH` holds no `cortex`
- **When** `git commit -m x` runs
- **Then** git exits non-zero and stderr carries `specflow: cortex not found on PATH`

### A failed INDEX refresh does not stop a commit

- **Given** the hooks are installed and `cortex specs index --staged` fails
- **When** a commit the check allows is made
- **Then** the commit is created and stderr carries a warning

### The INDEX is refreshed in the commit

- **Given** the hooks are installed and a new criterion staged
- **When** the commit is made
- **Then** the committed `specflow/INDEX.md` lists that criterion

### A push of a bad range is refused

- **Given** the hooks are installed and a commit made with `--no-verify` that has code and no test
- **When** `git push` runs to an existing remote branch
- **Then** the push fails and stderr carries the rule (a) line

### A branch deletion is not judged

- **Given** the hooks are installed
- **When** `git push origin --delete old` runs
- **Then** the check judges nothing and the push proceeds

### A new branch is compared with its merge base

- **Given** a new local branch one commit ahead of `origin/HEAD`, that commit valid
- **When** `git push -u origin new` runs
- **Then** range mode judges that one commit and the push proceeds

### A hand-written hook stops the install

- **Given** `core.hooksPath` is `.githooks` and `.githooks/pre-commit` holds a hand-written script with no `# cortex-managed` line
- **When** `cortex hooks install` runs
- **Then** it exits 1, stderr names `.githooks/pre-commit` and `.git/hooks/pre-commit`, and no file in `.githooks/` changed or was added

### A hand-written hook stops the install with no hooks path set

- **Given** `core.hooksPath` is unset and `.githooks/commit-msg` holds a hand-written script
- **When** `cortex hooks install` runs
- **Then** it exits 1, `core.hooksPath` is still unset, `.githooks/commit-msg` is unchanged, and `specflow.since` was not written

### A passthrough does not overwrite a hand-written hook

- **Given** an executable `.git/hooks/post-commit` and a hand-written `.githooks/post-commit`
- **When** `cortex hooks install` runs
- **Then** it exits 1 and names `.githooks/post-commit`, which is unchanged

### Moving the hand-written hook lets the install finish

- **Given** the refused repository of the first case, with the file moved to `.git/hooks/pre-commit` as the message says
- **When** `cortex hooks install` runs and a commit is made
- **Then** it exits 0 and the moved hook runs first (Rule 2)

### A Cortex hook edited by hand is rewritten

- **Given** an installed `.githooks/pre-commit` with an extra line added below its `# cortex-managed` line
- **When** `cortex hooks install` runs
- **Then** it exits 0 and the file is back to Cortex's text

### A fresh clone installs over its tracked hooks

- **Given** a clone whose tracked `.githooks/` was written by Cortex, with `core.hooksPath` unset
- **When** `cortex hooks install` runs
- **Then** it exits 0, `core.hooksPath` is `.githooks`, and `git status --porcelain` is empty

### A hook of another name is left alone

- **Given** a hand-written `.githooks/pre-rebase`, and no `.git/hooks/pre-rebase`
- **When** `cortex hooks install` runs
- **Then** it exits 0 and `.githooks/pre-rebase` is unchanged

### A commit reusing another message is not an amend

- **Given** the hooks are installed
- **When** `git commit -C <sha>` makes a new commit
- **Then** no amend marker is written, and the commit is judged against `HEAD`

### A hook with no specflow folder stays quiet

- **Given** the hooks are installed in a repository with no `specflow/` folder
- **When** a commit is made
- **Then** `pre-commit` prints nothing

### No store means no since

- **Given** a git repository with no `cortex/cortex.json`
- **When** `cortex hooks install` runs
- **Then** it exits 0 and the hooks are installed

### A foreign hooks path is left alone

- **Given** `core.hooksPath` is `.husky`
- **When** `cortex hooks install` runs
- **Then** it exits 1, `core.hooksPath` is still `.husky`, no `.githooks/` file is written, and stdout lists what each hook must call

### A sync refresh leaves since alone

- **Given** `core.hooksPath` is `.githooks`, `.githooks/commit-msg` carries the `# cortex-managed` line, and `specflow.since` is absent
- **When** `cortex sync` refreshes the hooks
- **Then** `.githooks/` is up to date and `cortex/cortex.json` is unchanged

### A first push does not judge old commits

- **Given** 30 commits without tests on an unpushed `main`, then `cortex hooks install`, then one valid commit
- **When** `git push` runs
- **Then** only the last commit is judged and the push proceeds

### Install records where judging starts, once

- **Given** a repository at commit `A` with no `specflow.since`
- **When** `cortex hooks install` runs, a commit `B` is made, and it runs again
- **Then** `specflow.since` is `A`

### A new branch with no base says so

- **Given** a clone with no `origin/HEAD` and no `specflow.since`
- **When** a new branch is pushed
- **Then** stderr carries `specflow: no base to compare for <ref>; nothing was checked` and the push proceeds

### Outside git it refuses

- **Given** a directory that is not a git repository
- **When** `cortex hooks install` runs
- **Then** it exits 1 with `specflow: not a git repository`

## Notes

- Not an item of its own in the plan's batch: the plan lists this command in section 5 with no spec. It is split from `specflow.check` under RULES.md rule 13.
- Hooks are shell shims calling `cortex`, not the bench's `_node` finder: the bench's finder named a client's pinned Node version.
