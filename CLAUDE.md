# Cortex

Cortex is a CLI and a set of Claude Code skills, written in TypeScript and macOS-only for v1. It keeps a project's knowledge in a plain `cortex/` folder and holds its specs and tests honest with a git check. This repo is at 4.0 (`package.json`); `cortex/cortex.json` marks the store, and clients on 3.x still use `.cortex/`, so 3.x code stays until those clients are accepted.

**Two layers.** Cortex Core is a deterministic Node.js binary: file I/O, schema enforcement, CLI, no LLM calls. Skills in `skills/` are agentic: they call LLMs and read and write the store, but don't own its format. `cortex-schema.md` is the contract between them.

## Project Structure

```
cortex/
├── cortex/              # this project's knowledge store; start at MAP.md
├── cortex-schema.md     # the contract: file formats and frontmatter
├── RULES.md             # hard project-wide constraints
├── specflow/            # promises/, impl/, generated INDEX.md (see Specs below)
├── skills/              # skill bundles; .claude/skills/ mirrors them
├── src/                 # Core: cli, store, specflow, tasks, schema, hooks, and 3.x modules
├── tests/               # atomic/, spec/, journey/, scenario/, fixtures/, setup/
├── .githooks/           # the git check, written by cortex hooks install
├── README.md            # what Cortex is and how to install it
└── onboarding.md        # setting up a project
```

`cortex-v3-design.md`, `build-order-v3.md` and `plans/` are records of earlier work, not current instructions.

## Build Loop

1. Read the promise the impl spec's `implements:` points to, to learn why the behaviour exists.
2. Read the impl spec: its rules and acceptance criteria. Check `depends_on`.
3. Write the test first, tagged with the criterion it proves.
4. Implement the minimum that satisfies the criterion.
5. Run the area's tests, then `pnpm test`, `cortex validate` and `cortex specs lint`.
6. If the change invalidates the promise, update the promise too.

## Commands

```bash
pnpm install
pnpm build                       # compile TypeScript to dist/
pnpm dev                         # run the CLI from dist/
pnpm test                        # full suite
pnpm test:atomic                 # tests/atomic
pnpm test:spec                   # tests/spec
pnpm exec vitest run tests/journey
pnpm exec vitest run tests/scenario
pnpm add -g "$PWD"               # install the cortex binary (not on npm)
cortex validate                  # check the store and specs
cortex specs lint                # check spec shape and cross-references
cortex specs index               # regenerate specflow/INDEX.md
```

## Key Decisions

- **Node.js and TypeScript** — one runtime for Core and the hooks.
- **macOS only for v1** — Claude Code Desktop scheduled tasks are macOS and Windows only, and v1 can't afford two scheduling backends. Windows is a v1.1 candidate; Linux is deferred.
- **Two-layer architecture** — Core is deterministic; Skills are agentic. The boundary is non-negotiable.
- **`cortex-schema.md` is the contract** — Core implements it, Skills consume it, both reference it by version.
- **Use pnpm** for all package operations.

## What NOT to Do

- Never implement without a spec. If none covers the behaviour, write it first, and the promise it implements if that is missing too.
- Never let promises and impl specs drift: update the promise in the same change when an impl change invalidates it.
- Never make LLM calls from Cortex Core. Agentic behaviour belongs in Skills.
- Never let a Cortex loop or pulse mutate cerebrum/anatomy/atlas/specs directly: on 3.x they write proposals to `.cortex/pulse/` only (the sole exception is the test-runner, which uses a writer/verifier split). At schema 4.0 the three scheduled tasks may write anywhere in `cortex/`, but specs stay proposals (RULES.md rule 7).
- Never let a session hook block. Claude Code session hooks warn-never-block, are pure Node file I/O, and make no network calls (the sole, default-off, measured exception is RULES.md rule 6's read-deferral gate; no other session hook may deny). The git commit and push check, `cortex check`, is a separate class and may refuse (RULES.md rule 6).
- Never break the `implements:`/`implemented_by:` links or delete an `_overview.md`.
- Never skip tests: every acceptance criterion becomes a test case.
- Never modify specs or the schema without user approval. They are the contract.
- Never ignore RULES.md.
- Never use npm. Use pnpm.

<!-- cortex:start v4.0 -->
## Cortex
This project keeps its knowledge in `cortex/` (plain files, one subject each). Start from the map:
@cortex/MAP.md

## Specs

`specflow/` holds the specs. `specflow/promises/<area>/` has short promises (`P-…` ids) on what the product guarantees.
`specflow/impl/<area>/` has implementation specs: their rules are numbered under a Rules heading, and their acceptance
criteria carry stable ids (`PAY-REFUND-3`). Spec text that points at `.specflow/specs/<a>/<b>.spec.md` or
`.specflow/specs-business/…` means the same file under `specflow/impl/` or `specflow/promises/`. A value more than one
spec uses is a constant in a `constants.md`; a spec sees its own folder's and its ancestors' constants, no others.
A test cites a criterion by its id: vitest `it('[PAY-REFUND-3] …')`, pytest `@pytest.mark.criterion("PAY-REFUND-3")`.
`specflow/INDEX.md` (criteria, their tests, `unverified` marks, constants) is generated; never edit it.

A finished change updates or adds the criterion for every behaviour it changes or adds, and a test that cites it.

If `core.hooksPath` is `.githooks`, a git hook checks every commit. It runs no tests. It refuses:

- a commit that changes code or config (anything outside `specflow/`, `cortex/`, tests, `.githooks/` and `.md` files) without changing a test;
- a commit that changes a spec's rules or criteria together with code or config. Commit the spec change on its own,
  before or after the code;
- a commit that changes the text of an existing rule or criterion without a trailer
  `Specflow-Amends: <spec-id>#<rule-7 or criterion id> — <reason>`, one per item. A new rule or criterion needs none.

Merge commits are checked the same way on what the merge itself changes.

Specs say what should hold; code says what does. Before changing code, find what produces the behaviour today and what depends on it. If a criterion describes what you change, change the criterion in the same change.

An unverified criterion is a claim about the code, not a fact; check the code.

If the request contradicts a rule, a 'Not this spec' line or a recorded decision the owner made, do not build it: write the spec with the conflict as an open question and stop.

If the request creates a behaviour no criterion covers, or touches more than one spec, do not write code: run specflow-spec first and stop for review.

If you were told the user can't answer during this run, don't wait: decide, write the decision and its reason under Open questions in the spec, and continue. This never applies to a conflict with a recorded owner decision; that always stops.
<!-- cortex:end -->
