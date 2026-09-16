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
- Never let a Cortex loop or pulse mutate cerebrum/anatomy/atlas/specs directly — they write proposals to `.cortex/pulse/` only (the sole exception is the test-runner, which uses a writer/verifier split). Propose, don't mutate.
- Never let a hook block — hooks warn-never-block, are pure Node file I/O, and make no network calls (the sole, default-off, measured exception is RULES.md rule 6's read-deferral gate; nothing else may deny).
- Never break the `implements:`/`implemented_by:` links or delete an `_overview.md`.
- Never skip tests — every acceptance criterion becomes a test case.
- Never modify specs or the schema without user approval — they are the contract.
- Never ignore RULES.md.
- Never use npm — use pnpm.

<!-- cortex:start v3.4 -->
## Cortex

Cortex is active on **cortex**. The knowledge layer lives in `.cortex/`:

- `compass/` — rules, conventions, and the bug ledger. The "why" and the "must".
- `atlas/` — stakeholders, decisions (narrative), domain terms, source materials.
- `archive/` — ingested source documents (client specs, transcripts, contracts) and their structured extractions.
- `insight/` — inferred understanding of the codebase itself. See "Cortex Insight" below.

**Protocol:** before working a task, read the relevant `_index.md` first — they are
prompts that tell you what to read and when. For "why" questions, grep `compass/` and
`atlas/`. For unfamiliar terms, check `atlas/domain/`. Follow frontmatter
cross-references (the citation graph) to trace any claim to its source.

Specs are the source of truth: `.specflow/specs-business/` (outcomes) and
`.specflow/specs/` (implementation), linked by `implements:`/`implemented_by:`. Don't
let the trees drift.

Modules present: compass, atlas, archive, insight, pulse. Schema: 3.4.

## Cortex Insight

This project has a Cortex insight layer at .cortex/insight/ that
contains rich per-file understanding, concept extraction, and
semantic connections across the codebase. It is queryable via
the `cortex insight` CLI.

Read the file itself when you're going to modify it, need exact
syntax, or the change requires knowing every line. Query insight
instead when you're trying to understand what a file does, whether
it's relevant, how it relates, or what its main pieces are — a
richer resume than reading 500 lines and remembering fragments.
Consult insight first; read the file when you need exactness.

Before substantive work on any file, query its insight entry.
Before changes touching multiple files or a concept, query the
concept. This is not optional.

- cortex insight file <path>      — rich per-file understanding
- cortex insight concept <name>   — how a concept lives in the code
- cortex insight element <query>  — atomic element (may return
  "no rich entry"; still discoverable via the file entry)

Also check `insight/observations/` for session-learned context
(audience, scale, intent) the code alone can't show.

Insight is inferred, not curated. Where it conflicts with a compass
rule or a spec, the gated layer wins — context, not authority.
<!-- cortex:end -->
