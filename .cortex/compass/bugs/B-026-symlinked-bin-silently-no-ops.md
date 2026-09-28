---
id: B-026
title: Invoked through a symlinked bin, every `cortex` verb (hooks included) prints nothing and exits 0
type: incomplete-rule
severity: high
status: open
affects:
  - core-cli.init
  - src/cli/cli.ts
  - src/hooks/cli.ts
  - src/schema/cli.ts
proposed_fix: >-
  Add an entry-point rule to core-cli.init next to Rule 18. When the package bin is
  executed, directly or through any chain of symlinks, it reaches the dispatcher. Implement
  it by comparing realpath(process.argv[1]) with fileURLToPath(import.meta.url) instead of
  a string suffix match, in all three copies of the guard. Add ACs for a symlinked bin
  running a verb, and for a symlinked bare `cortex` getting Rule 18's usage text and exit 2.
opened: 2026-09-28T17:58:48Z
found_at_commit: d7ed910
---

# B-026 — A symlinked bin silently no-ops

**Source:** new-machine setup, 2026-09-28. `pnpm link` hangs on pnpm 12.6, so `cortex` was
installed as a symlink to `dist/cli/cli.js`. `cortex validate` then printed nothing and
exited 0. That silent run was first read as a pass.

**What happens:** `src/cli/cli.ts` ends with a guard that runs the CLI only when
`import.meta.url` ends with `process.argv[1]`. Node resolves symlinks for `import.meta.url`
but leaves `argv[1]` as the path that was typed, the link. The two never match, the module
loads, and it exits 0 without dispatching. `src/hooks/cli.ts` and `src/schema/cli.ts` use the
same guard.

The old machine never saw this because pnpm's bin shim is a shell script that execs
`node <real path>`, so `argv[1]` was always the real file. A symlinked bin is the normal
case elsewhere: `npm i -g` and Homebrew-style installs link `bin/cortex` into the package.
There, every verb, and every Claude Code hook (`.claude/settings.json` runs
`cortex hook …`), would do nothing, exit 0 and warn about nothing. Hooks are
warn-never-block, so the whole runtime layer would be silently off.

**What should happen:** a verb runs the same way whether the bin is executed directly or
through a symlink. A bare `cortex` gets Rule 18's usage text and exit 2 either way.

**Evidence:** the dispatcher is never reached, which is the first place anything goes wrong.
- Through a symlink to `dist/cli/cli.js`: `validate` wrote 0 lines of output and exited 0.
- `node dist/cli/cli.js validate` wrote 98 lines.
- A shell shim that execs `node <real path>` also works: Conformant YES.

`git log -S` dates the guard to `84ca2bd`, the v1 foundation.

**Root cause:** Type 2, an incomplete rule. `core-cli.init` governs `src/cli/**` and Rule 18
(B-018) fixes what happens once the dispatcher runs. No rule says the installed bin must
reach the dispatcher, so the entry guard was never specified or tested. B-018's tests call
`run([...])` directly, which is the one path that skips the guard.

**Affected specs:**
- Dev: `.specflow/specs/core-cli/init.spec.md` (new rule + ACs next to Rule 18)
- Business: `.specflow/specs-business/core-cli/developer-sets-up-cortex-in-one-command.business.md`.
  Its promise stands and the code breaks it, so there is no drift.

### Change Plan

**Spec to modify:** `.specflow/specs/core-cli/init.spec.md`
**Change type:** add a rule and acceptance criteria

**Add this rule (after Rule 18):**
19. **Entry point.** The package bin reaches the dispatcher whenever it is executed,
directly or through any chain of symlinks. The "run only when executed, not when imported"
test compares the resolved real path of `process.argv[1]` with the module's own file path.
It never compares a string suffix. The same applies to every module with its own
executable guard (`src/hooks/cli.ts`, `src/schema/cli.ts`).

**Add these criteria:**
### Symlinked bin runs a verb
- **Given** a symlink `<tmp>/bin/cortex` → `dist/cli/cli.js`
- **When** `<tmp>/bin/cortex validate <valid fixture>` is executed as a child process
- **Then** stdout carries the validator report and the exit code is 0

### Symlinked bare bin gets usage
- **Given** the same symlink
- **When** it is executed with no arguments
- **Then** stdout carries the Rule 18 usage text and the exit code is 2

**Then:**
1. Coherence check against Rule 18. It is a precondition, not a conflict.
2. Write the two tests as spec-layer child-process tests against the built `dist/`. They
   should fail.
3. Replace the guard in all three modules.
4. Run the tests, then the full-suite regression.
5. Resolve B-026.

### Resolution

_Open._
