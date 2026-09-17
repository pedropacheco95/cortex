# Cortex — Project Rules

These are hard, project-wide constraints. They are non-negotiable architectural and process invariants; each is justified by a one-line **Why:**. When in doubt, follow these over convenience.

## 1. Package manager is pnpm — never npm or yarn.

Use `pnpm` for all package operations; commit `pnpm-lock.yaml`; CI runs `pnpm install --frozen-lockfile`.

**Why:** a single consistent lockfile and deterministic CI installs.

## 2. New or upgraded dependencies must be released ≥7 days ago and CVE-checked before install.

Before adding/upgrading any dependency, confirm the chosen version is at least 7 days old and search for active CVEs or supply-chain advisories affecting it.

**Why:** avoid bleeding-edge regressions and supply-chain compromise of fresh releases.

## 3. Cortex Core makes NO LLM calls.

Core is deterministic: file I/O, schema enforcement, CLI only. All agentic/LLM work lives in Skills.

**Why:** the deterministic/agentic split is the architecture.

## 4. `cortex-schema.md` is the single source of truth for all file formats and frontmatter.

Core implements it, Skills consume it, both reference it by version.

**Why:** without one contract the two layers drift.

## 5. macOS only for v1.

Don't add Linux or Windows code paths.

**Why:** the scheduling backend constraint keeps v1 scope shippable.

## 6. Hooks warn-never-block, are pure Node.js file I/O, and make no network calls — with one measured exception.

A hook may surface a warning but must never fail, block, or stall a session. **The one exception:** the Read-deferral gate of `hooks.pre-read-writeback` Rule 7 — `hooks.readDefer`, default **off**, one `deny` per session per file (the second Read of that file always proceeds), never for a spec, rule, decision, evidence file, the schema or scaffolding, never in a scheduled session, capped at 25 deferrals per session, fail-open on every path (any failure inside the rule falls through to the ordinary payload), and shipped for **measurement** (`pulse.usage` Rule 13, "Read deferrals"), not as policy. No other hook, and no other decision of that hook, may deny, ask, or exit non-zero.

**Why:** a hook must never break or slow the user's session. The exception exists to measure, once and reversibly, whether a summary can stand in for a read; if the proceed-rate says it cannot, the exception is removed, not widened.

## 7. Loops and pulse write ONLY to `.cortex/pulse/` and propose changes for human approval.

They never mutate compass/anatomy/atlas/specs directly. Sole exception: the test-runner, which writes code behind a writer/verifier split.

**Why:** the persistence layer stays a curated artefact.

## 8. Every artefact carries YAML frontmatter conforming to the schema.

**Why:** the citation graph and validator depend on it.

## 9. Every directory in `.cortex/`, `specs/`, and `specs-business/` has an active index/overview.

Each carries an `_index.md` or `_overview.md` written as a prompt, not a passive placeholder.

**Why:** it's the primary scaffolding that makes Cortex used, not just installed.

## 10. `implements:` is strictly single-valued.

A many-to-one mapping signals a spec-decomposition problem to fix, not a frontmatter style choice.

**Why:** it's a SpecFlow diagnostic, not just a frontmatter style.

## 11. Respect token budgets for all scaffolding.

CLAUDE.md Cortex section <400 tokens, each `_index.md` <300 (a generated recall block counts toward the file's budget and collapses to fit it), SessionStart injection <100, PreRead injection <50 for the insight summary plus at most 50 for the recall marker line — combined ceiling 100, or 125 with the writeback invitation (one extended figure, not a second pool), search-time annotation (PreToolUse Grep/Bash) ≤60 and at most two lines, emitted only on a match, SessionEnd and Stop inject nothing.

**Why:** scaffolding is read every session; tokens must buy grounding.

## 12. `environment.md` and compass hold pointers, never secrets.

Store aliases and profile names only — no credentials. (Rule 20 covers the aggregate of non-secret operational specifics in a public repository.)

**Why:** this layer may be committed.

## 13. One behaviour per leaf spec; entities are defined once and referenced by name elsewhere.

**Why:** keeps specs atomic and tests sharp.

## 14. Build spec-per-piece in dependency order, reviewed each step.

Never "here are the specs, build it all."

**Why:** silent implementation choices surface later as bugs.

## 15. Separate regenerable working state from durable knowledge in git.

`.cortex/atlas/sources/` and `.cortex/pulse/` are gitignored (sensitive/transient); `.cortex/compass/` and atlas (minus sources) are committable durable knowledge, and `.cortex/insight/` is committed in full (machine-owned AND committed — the fourth git-policy quadrant, schema Decision 1).

**Why:** separate regenerable working state from durable project knowledge.

## 16. The constellation is read-only.

The CLI is the source of truth; the visualisation observes, it never acts.

**Why:** avoids a second mutation path.

## 17. TypeScript runs in strict mode.

`strict: true` in `tsconfig.json`; no implicit `any`, no unchecked nulls.

**Why:** a deterministic Core depends on the type system catching errors before runtime.

## 18. tree-sitter (Node bindings) is the only parser dependency for the insight L1 structural pass.

Don't introduce a second parsing stack.

**Why:** one runtime and one parser keep the L1 structural schema stable and owned by Cortex.

## 19. Any change to a shared contract surface reports every clause touched.

When a change — human- or agent-made — modifies validator checks, schema clauses, hook payloads, or any other contract-enforcing surface, the change report must enumerate **every** check/clause touched, not just the primary target. Reviewers verify the report against the actual diff.

**Why:** silent scope creep in contract-enforcing code erodes auditability. "Reported 3, made 5" is only safe when someone catches it.

## 20. Declare the repository's visibility; a public repository's knowledge layer carries no operational map.

`cortex.config.json` `visibility.repo` is `public`, `private` or `unknown` (default). When it is `public`, tracked files under `.cortex/compass/` and `.cortex/atlas/` carry no hosts, addresses, ports, SSH targets or account identifiers — `check.visibility` warns on each line it finds (schema §10.1, `schema.visibility`), and a file the human has judged goes on `visibility.allow` or its contents move to an untracked note. Rule 12 covers secrets; this rule covers the aggregate.

**Why:** an external team's `environment.md` accumulated a production map by reasonable increments — no secret in any line, reconnaissance in the whole — in a public repository. Nothing in Cortex knew the repository was public, so nothing could warn.
