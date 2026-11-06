# Cortex

**Every Claude Code session starts cold.** The code can be read again. Why it is that way, who asked for it, what was tried and how you like to work cannot. Cortex keeps that in a plain folder in your repository, and keeps your specs and tests honest with a git check.

It has two parts. **Core** is a deterministic TypeScript CLI that never calls an LLM. **Skills** are Claude Code bundles that do the judgment.

## Status

- Schema 4.0.
- **macOS only.** The scheduled tasks use Claude Code Desktop.
- Requires Claude Code, Node.js 20 or later, and [pnpm](https://pnpm.io/installation).
- Not published to npm yet. Install from source.

## Install

```bash
git clone https://github.com/pedropacheco95/cortex.git
cd cortex
pnpm install
pnpm build
pnpm add -g "$PWD"
```

If `pnpm add -g` says the global bin directory is not in `PATH`, run `pnpm setup`, open a new terminal, and run it again.

You now have a `cortex` binary on your `PATH`. It runs from this clone, so keep the folder.

## Quick start

In the project you want Cortex in:

```bash
cortex init
```

That creates the `cortex/` store and `cortex/MAP.md`, installs nine skills under `.claude/skills/`, writes a managed block into `CLAUDE.md` and `AGENTS.md`, and prepares the scheduled tasks. Then, in a Claude Code Desktop session for the project, type `/cortex-register-tasks` to register them.

[`onboarding.md`](./onboarding.md) walks through the rest.

## What it gives you

**The store, `cortex/`.** Plain markdown, one subject per file. Only `MAP.md` is loaded every session; the rest is read when needed.

| Folder | Holds | Goes stale with |
|---|---|---|
| `code/<area>/` | How to work in one code area: pitfalls, commands, open bugs | The code |
| `world/` | People, orgs, terms, systems, agreements, decisions, rules | People and the outside world |
| `history/` | Sources, changes, incidents, measurements. Dated and append-only | Never |
| `now/` | True only for now. Every item has an `until:` date | Its date |

**Specs, `specflow/`** (optional). Short promises in `promises/`, implementation specs with stable criterion ids in `impl/`, and a generated `INDEX.md` showing which criteria have a test. A test cites its criterion by id, for example `it('[PAY-REFUND-3] …')`.

**The commit check, `cortex check`.** Git hooks that run no tests and may refuse a commit: code changed with no test changed, a spec's rules changed together with code, or the text of an existing criterion changed without a `Specflow-Amends:` trailer.

**Three scheduled tasks.** None of them changes code, tests or specs, and none commits.

| Task | When | What it does |
|---|---|---|
| `cortex-learn` | Daily, 02:00 | Files what finished sessions taught the project |
| `cortex-fresh` | Saturday, 04:00 | Fixes what has gone stale in the store, and records every change |
| `cortex-quality` | Sunday, 04:00 | Runs the tests, reports failures, and reviews a rotation of specs against the code |

## Skills

| Skill | Use it to |
|---|---|
| `cortex-remember` | File a fact, a rule, a bug or a document |
| `specflow-spec` | Turn a big request into a spec before any code |
| `specflow-review` | Have a fresh agent review a spec or a diff |
| `specflow-onboard` | Bring existing work under specs |
| `verification-before-completion` | Check the evidence before saying something is done |
| `cortex-learn`, `cortex-fresh`, `cortex-quality` | The scheduled tasks |
| `cortex-register-tasks` | Register the tasks. Runs only when typed |
| `cortex-migrate` | Move a 3.x project to 4.0. Stays in the package, not the project |

## Commands

| Command | What it does |
|---|---|
| `cortex init [path]` | Set up a project |
| `cortex sync [path] [--dry-run]` | Update a project to this version of Cortex |
| `cortex store validate` | Check the store |
| `cortex store map` | Regenerate `MAP.md` and the managed blocks |
| `cortex store stale` / `expire` | List facts that may be stale, and expired `now/` items |
| `cortex hooks install` | Install the git hooks |
| `cortex specs index` / `lint` / `view` | Generate the index, check the spec tree, write a browsable page |
| `cortex specs port` | Move an old `.specflow/` tree into `specflow/` |
| `cortex tasks plan` / `verify` | Show the tasks, and check they are registered |
| `cortex migrate` | Move a 3.x project to 4.0 |

`cortex --help` lists every verb. The ones it lists beyond these serve 3.x projects.

## Coming from 3.x

`cortex init` and `cortex sync` refuse a project with a `.cortex/` folder. Run `cortex migrate` for a dry run, then `--apply`, then `--accept`. Nothing is lost, and the old store stays until you accept. See [`onboarding.md`](./onboarding.md#7-coming-from-3x).

## Docs

- [`onboarding.md`](./onboarding.md): hands-on use.
- [`cortex-schema.md`](./cortex-schema.md): every file format Core and Skills share.
- [`RULES.md`](./RULES.md): the hard project-wide constraints.
- `specflow/`: this repository's own specs. `cortex/` here is its own store.

`presentation.md` and `cortex-v3-design.md` describe 3.x and are kept as history.

## Development

```bash
pnpm install
pnpm build
pnpm test         # full suite
pnpm test:atomic  # atomic layer
pnpm test:spec    # spec layer
```

## License

MIT
