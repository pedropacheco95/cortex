# Cortex

Cortex is a holistic, owned-end-to-end system for understanding a codebase, distributed as a globally-installed Node.js CLI binary written in TypeScript (npm, **macOS-only for v1**). It links code structure (anatomy), conventions/rules plus a unified bug ledger (cerebrum), project knowledge (atlas), specs across two trees (`specs/` + `specs-business/`), tests across four layers, and runtime scaffolding (hooks, CLAUDE.md, `_index.md`). It serves both interactive Claude Code sessions and autonomous "loops", and absorbs SpecFlow as its spec-and-test lineage. **Two layers:** Cortex Core is a deterministic Node.js binary (NO LLM calls — file I/O, schema enforcement, CLI); Skills are agentic Claude Code skill bundles (call LLMs, read/write `.cortex/` but don't own its schema). The load-bearing artefact is `cortex-schema.md` — the contract Core implements and Skills consume, referenced by version.

## Specflow

This project uses Specflow — specs are the source of truth, code is an artifact. There are **two parallel spec trees**:

- `specs-business/` — high-level outcomes, user journeys, and success metrics for stakeholders. **Read this first** to understand *why* something exists.
- `specs/` — developer-facing specs with schemas, APIs, dependency chains, and Given/When/Then acceptance criteria. **Read this when you're about to write code.**

Every directory in both trees has an `_overview.md` explaining what it groups and why. Start there if you're new to a folder.

The two trees are bidirectionally linked:
- Each developer leaf spec's frontmatter has `implements:` pointing to the one business spec it serves (strictly single-valued).
- Each business spec's frontmatter has `implemented_by:` listing every developer spec that contributes to it.

If you change a developer spec in a way that invalidates the business spec it implements, update the business spec in the same change. Drift between the two trees is a bug.

The build order in `build-order-v3.md` defines implementation sequence (see also the design doc `cortex-v3-design.md` §10). NOTE: the spec trees are currently SCAFFOLDED STRUCTURE ONLY — no specs have been written yet.

## Build Loop

1. Read the business spec via the dev spec's `implements:` link — understand *why* the behaviour exists.
2. Check `depends_on` — make sure prerequisite specs are implemented first.
3. Read the dev spec — schema, API, and Given/When/Then acceptance criteria.
4. Load the relevant Skills for the work.
5. Write tests first — every acceptance criterion becomes a test case.
6. Implement the minimum needed to satisfy the spec.
7. Run the tests.
8. Update the spec's status.
9. Re-read the business spec to check for drift; if the dev change invalidated it, update it in the same change.
10. Update the build log.

## Project Structure

```
cortex/
├── cortex-design.md         # design doc (architecture, decisions, §16.2 build order)
├── cortex-schema.md         # THE CONTRACT — file formats + frontmatter, versioned (to be written)
├── CLAUDE.md                # this file
├── RULES.md                 # hard project-wide constraints
├── build-order.md           # implementation sequence
├── specs-business/          # stakeholder outcomes, journeys, metrics (_overview.md per dir)
├── specs/                   # developer specs + _index.md (_overview.md per dir)
└── tests/                   # four-layer test taxonomy
    ├── setup/               # harness + smoke
    ├── fixtures/            # factories + seeds
    ├── atomic/              # 1 per Given/When/Then, mocked
    ├── spec/                # 1 per dev leaf spec, integrated slice
    ├── journey/             # 1 per business spec, real infra
    └── scenario/specs/      # scenario specs + scenario tests
```

NOTE: `.cortex/` is created per-project by `cortex init` at runtime — it is NOT part of this repo's source.

## Commands

CLI tool. Use pnpm. No code exists yet — placeholders:

### Development
```bash
pnpm install
pnpm build      # compile TypeScript
pnpm dev        # run the CLI locally
```

### Testing
```bash
pnpm test                 # full suite
pnpm test:atomic          # atomic layer (mocked)
pnpm test:spec            # spec layer (integrated slice)
pnpm test:journey         # journey layer (real infra)
pnpm test:scenario        # scenario layer (full sandbox)
```

## Key Decisions

- **Node.js + TypeScript CLI, distributed via npm** — single runtime; the native anatomy scanner uses tree-sitter Node bindings (one dependency).
- **macOS only for v1** — Claude Code Desktop scheduled tasks (used by autonomous loops) are macOS/Windows only; v1 can't afford two scheduling backends. Windows is a v1.1 candidate; Linux deferred.
- **Two-layer architecture** — Cortex Core is deterministic (no LLM calls); Skills are agentic. The boundary is non-negotiable.
- **`cortex-schema.md` is the contract** — Core implements it, Skills consume it, both reference it by version. Without it the layers drift.
- **Native anatomy scanner, not Graphify** — one runtime, schema stability owned by Cortex, no dependency on capabilities anatomy doesn't need.
- **Use pnpm** for all package operations.

## What NOT to Do

- Never implement without a dev spec — if the spec doesn't exist, create it first (and the business spec it implements, if missing too).
- Never let the dev and business trees drift — update the business spec in the same change when a dev change invalidates the promise.
- Never make LLM calls from Cortex Core — Core is deterministic. Agentic behaviour belongs in Skills.
- Never let a Cortex loop or pulse mutate cerebrum/anatomy/atlas/specs directly — they write proposals to `.cortex/pulse/` only (the sole exception is the test-runner, which uses a writer/verifier split). Propose, don't mutate. At schema 4.0 the three scheduled tasks may write anywhere in `cortex/`, but specs stay proposals (RULES.md rule 7).
- Never let a session hook block — Claude Code session hooks warn-never-block, are pure Node file I/O, and make no network calls (the sole, default-off, measured exception is RULES.md rule 6's read-deferral gate; no other session hook may deny). The git commit and push check, `cortex check`, is a separate class and may refuse (RULES.md rule 6).
- Never break the `implements:`/`implemented_by:` links or delete an `_overview.md`.
- Never skip tests — every acceptance criterion becomes a test case.
- Never modify specs or the schema without user approval — they are the contract.
- Never ignore RULES.md.
- Never use npm — use pnpm.

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

A git hook (`.githooks/commit-msg`) checks every commit. It runs no tests. It refuses:

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
