# Onboarding to Cortex

How to use Cortex on a project, start to finish. For what it is, see [`README.md`](./README.md).

## 1. The idea

An agent can reread your code. It can't reread why the code is this way, who asked for it, or how you like to work. Cortex keeps those in `cortex/`, a folder of plain notes you can read and correct yourself. Only `cortex/MAP.md` is loaded every session.

Core (the CLI) never calls an LLM. It validates, generates, expires and reports. Judgment belongs to the skills, and to you.

## 2. Set up a project

```bash
cortex init
cortex store validate
```

`cortex init` is safe to rerun: on a project already set up it runs the update. Later, `cortex sync` updates a project to the Cortex you have installed, and `cortex sync --dry-run` shows what it would do.

Commit what it created: `cortex/`, `.claude/`, `CLAUDE.md`, `AGENTS.md` and `.gitignore`.

## 3. Turn on the scheduled tasks

Once per project, open it in **Claude Code Desktop** and type:

```
/cortex-register-tasks
```

It has to be typed; plain words won't run it. Then check:

```bash
cortex tasks verify
```

`cortex-learn` runs daily, `cortex-fresh` on Saturdays and `cortex-quality` on Sundays. Each writes only inside `cortex/` and commits nothing, so their changes appear in your working tree for you to read and commit. A change to a spec, or anything that needs a person, is only proposed, in `cortex/now/proposals.md`.

## 4. Day to day

Work as usual. When you say something worth keeping, the agent files it with `cortex-remember` and shows you one line:

```
Filing: <fact> → <path> (origin: <origin>)
```

Correct it on the spot if it's wrong. You can also ask directly:

- *"remember this"*, *"from now on…"*: a fact, or a rule in `cortex/world/rules/`.
- *"file this bug"*: an open item in `cortex/code/<area>/`, moved to `history/` when it is fixed.
- A document you hand over: a dated digest in `cortex/history/sources/`, the original copied beside it (gitignored), and every ask in it filed as a spec request in `cortex/now/proposals.md`.

To look something up, the agent starts from the map. So can you: it's plain markdown, and `rg` works.

## 5. Add specs

Specs are optional. To start with an empty tree:

1. Create `specflow/promises/` and `specflow/impl/`. Every folder under them needs an `_overview.md`.
2. Add a `specflow` key to `cortex/cortex.json`:

   ```json
   "specflow": {
     "tests": [{ "runner": "vitest", "include": ["tests/**/*.test.ts"], "exclude": [] }],
     "testCommand": "pnpm test"
   }
   ```

3. Run `cortex sync`, which adds a `## Specs` section to the managed blocks.
4. Run `cortex hooks install`, then `cortex specs lint`.

`core.hooksPath` isn't cloned, so everyone who clones the repository runs `cortex hooks install` once.

If the project has an old `.specflow/` tree, run `cortex specs port --dry-run`, then `cortex specs port`. To bring existing code or tests under specs, say *"onboard this codebase"* (`specflow-onboard`). It proposes promises, specs and tags, and applies nothing until you approve.

## 6. Work with specs

**Small work** is an ordinary change. It updates or adds the criterion for each behaviour it touches, and a test that cites the criterion. The commit check holds it honest.

**Big work** is a request no criterion covers, or one that touches more than one spec:

1. `specflow-spec` writes the spec, with a named test per criterion, and no code.
2. `specflow-review` has fresh agents read it against the code.
3. You resolve the findings.
4. The main session builds it wave by wave, each wave an ordinary change.

A request that contradicts a rule or a recorded decision isn't built: the conflict is written down as an open question and the work stops.

**When the commit check refuses**, it says why:

- Code or config changed with no test changed: change a test.
- A spec's rules changed together with code: commit the spec on its own.
- Existing rule or criterion text changed: add `Specflow-Amends: <spec-id>#<rule-7 or criterion id> — <reason>`.

`cortex specs view` writes one HTML page for browsing the specs. `specflow/INDEX.md` is generated, so never edit it.

## 7. Coming from 3.x

A project with a `.cortex/` folder has to migrate first; `cortex init` and `cortex sync` refuse it.

```bash
cortex migrate                # dry run: every entry and where it would go
cortex migrate --apply        # writes cortex/; .cortex/ stays
cortex migrate --accept       # after you've checked the result
```

The dry run prints the path of the `cortex-migrate` skill in the package. Ask the agent to read and follow it: it decides the working files Core can't judge and writes the plan for `--plan <file>`. Accepting retires the old hooks and tasks, and leaves `.cortex/` on disk.

## 8. Troubleshooting

- **`cortex store validate` reports errors:** they name the file. Most are missing frontmatter or a broken link.
- **"managed block is out of date":** run `cortex store map`.
- **Tasks don't appear in the app:** type `/cortex-register-tasks` in a Desktop session for the project, then run `cortex tasks verify`. If the session can't register them, fully quit the app and run `cortex tasks register`.
- **The commit hook says `cortex` isn't found:** install Cortex on that machine, or use `--no-verify` and say so.
