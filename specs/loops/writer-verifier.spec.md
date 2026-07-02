---
id: loops.writer-verifier
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
implements: ../../specs-business/loops/developer-trusts-changes-the-system-writes.business.md
governed_by:
  - R-001
governs:
  - "src/harness/**/*.ts"
---

# Writer/Verifier Sub-Agent Harness

## Intent

The writer/verifier harness is the safety mechanism required before any Cortex automation may write code (design §11.4, §16.2 step 11): a deterministic Core orchestrator that runs two agentic roles as **independent** headless subprocesses — a writer that produces a change in an isolated workspace, and a verifier that judges the change against the brief and the checks without ever seeing the writer's reasoning. It is a **generic capability**: the test-runner loop is the v1 consumer, but any future code-mutating loop uses the same harness (same discipline as `pulse.review-cli` being the generic gate). The independence of the two roles is the load-bearing property.

## Entities

- **READS:** the consumer-supplied brief (spec excerpts, failing-check output); the project tree (to seed the isolated workspace); `.cortex/cortex.config.json` (`harness.maxIterations`, default 3).
- **WRITES:** an **isolated workspace only** — a git worktree when the project is a git repo, a temp copy otherwise. The main working tree is never mutated, pass or fail. Consumers receive a changeset and decide what to apply where, under their own specs.
- **CREATES:** a structured `HarnessResult` in-process: `outcome` (`pass | fail | unavailable`), `iterations`, the final `diff`, and per-iteration `verdicts` (each: `pass|fail` + the verifier's reasoning text). No artefact is written by the harness itself.

## Rules

1. **Generic API.** `runWriterVerifier({ root, brief, testCommand, maxIterations?, claudeBin?, timeoutMs?, home? })`. `brief` is the requirement (spec excerpts + failing context); `testCommand` is the consumer's check (e.g. a scoped `pnpm test` invocation) run *inside the workspace*. Nothing in the harness is test-runner-specific.
2. **Isolation.** All writer activity happens in a fresh isolated workspace seeded from `root` — `git worktree` when `root` is a git repo (cleaned up afterwards), a temp copy otherwise. The main tree is byte-identical after any run, including a passing one. The result carries the diff; applying it is the consumer's decision.
3. **The writer role.** Per iteration, the harness spawns the Claude CLI headless (the sanctioned Core/agentic subprocess boundary, `core-cli.init` Rule 6 precedent) with: the brief, the current check output, and the workspace. The writer edits the workspace. **The writer never receives the verifier's reasoning** — on a retry it gets the brief, the fresh failing-check output, and at most a bare "previous attempt failed independent verification" flag. This blindness is deliberate: it prevents the writer from optimising against the judge instead of the requirement; improvement pressure comes from the checks.
4. **The verifier role.** After the writer's change and a `testCommand` run, the harness spawns a **separate** headless subprocess with: the brief, the change as a diff, and the check results — **never the writer's reasoning, transcript, or prompt**. It must return a machine-parseable verdict (`pass`/`fail`) plus free-text reasoning. A verifier response that cannot be parsed to a verdict counts as `fail` for that iteration (conservative), with the raw response preserved as reasoning.
5. **The gate and the loop.** Checks failing after the writer's change → the iteration is a fail without consulting the verifier (checks gate first, cheaply). Checks passing → the verifier rules. Verifier `pass` → stop, `outcome: pass`. Verifier `fail` → next iteration, up to the limit.
6. **Iteration limit as first-class config.** Precedence: per-invocation `maxIterations` override → `cortex.config.json` `harness.maxIterations` → default 3 (design §17 question 14). The limit is a hard ceiling on *writer attempts*; reaching it yields `outcome: fail` with all verdicts preserved.
7. **Unavailability is not failure.** `claudeBin` absent → `outcome: unavailable`, zero iterations recorded, workspace cleaned up, no litter. Per-role subprocess timeout (bounded by `timeoutMs`) or crash → that iteration counts as a failed attempt; the loop continues to the limit. Auth-failure output (the `core-cli.init` Rule 6 detection pattern) → `outcome: unavailable` with the auth condition named.
8. **Deterministic Core.** The harness's own logic — workspace management, sequencing, gating, verdict parsing, result assembly — is deterministic Core code (`src/harness/`, governed by R-001): no LLM calls from the harness process itself, no network; the two subprocesses are the only agentic touch.
9. **Crash recovery (B-002).** `finally`-cleanup cannot survive a process kill, so every `runWriterVerifier` invocation begins with a **stale-workspace sweep**: remove leftover `cortex-harness-*` workspace directories older than a staleness threshold (engineering-call constant, ~2h) and `git worktree prune` orphaned registrations for `root`, before creating its own workspace. A killed harness therefore self-heals on the next run.
10. **Full audit trail.** The result preserves every iteration's verdict and reasoning, pass or fail — consumers surface these to humans (e.g. the test-runner writing `pulse/test-failures.md`). The harness never discards a verdict.

## Acceptance Criteria

### Independence: writer prompt carries no verifier reasoning

- **Given** a recording writer stub and a verifier stub that fails with reasoning text `VERDICT-REASONING-ALPHA`
- **When** the harness runs two iterations
- **Then** the writer's second-iteration prompt contains the brief and fresh check output but not `VERDICT-REASONING-ALPHA`
- **And** contains at most a bare previous-attempt-failed-verification flag

### Independence: verifier prompt carries no writer reasoning

- **Given** a writer stub that emits marker text `WRITER-REASONING-BETA` on stdout while editing the workspace
- **When** the verifier is consulted
- **Then** the verifier's prompt contains the brief, the diff, and the check results, and not `WRITER-REASONING-BETA`

### First-iteration pass

- **Given** a writer stub that fixes the failing check and a verifier stub that passes
- **When** the harness runs
- **Then** `outcome: pass` with `iterations: 1`, exactly one writer and one verifier invocation, and a non-empty diff

### Checks gate before the verifier

- **Given** a writer stub whose change still fails `testCommand`
- **When** the iteration completes
- **Then** the verifier stub was not invoked for that iteration and the loop proceeded to the next attempt

### Iteration limit honored, config precedence respected

- **Given** a verifier stub that always fails
- **When** the harness runs with config `harness.maxIterations: 2` and no override
- **Then** exactly 2 writer attempts occur and `outcome: fail` carries 2 verdicts
- **And** with a per-invocation `maxIterations: 1` override against the same config, exactly 1 attempt occurs

### Main tree is never mutated

- **Given** any run, including a passing one
- **When** the harness finishes
- **Then** every file under `root` outside the workspace is byte-identical to before
- **And** the workspace has been cleaned up

### Worktree isolation on a git repo

- **Given** `root` is a git repository
- **When** the harness runs
- **Then** the workspace was a git worktree of `root` (and is removed afterwards), and the returned diff reflects the writer's changes

### Unavailable is distinct from fail

- **Given** no `claudeBin` on PATH
- **When** the harness runs
- **Then** `outcome: unavailable` with `iterations: 0`, no workspace left behind, and no verdicts
- **And** an auth-failing stub yields `outcome: unavailable` naming authentication

### Unparseable verdict is a conservative fail

- **Given** a verifier stub that returns prose with no parseable verdict
- **When** the iteration completes
- **Then** it counts as `fail` and the raw response is preserved as that iteration's reasoning

### Stale workspace from a killed run is swept (B-002 regression)

- **Given** a planted stale `cortex-harness-*` workspace directory registered as a worktree of `root`, with an old mtime
- **When** a new harness run starts
- **Then** the stale directory is removed and `git worktree list` shows no orphaned entries before the new workspace is created

### Full audit trail on failure

- **Given** three failing iterations
- **When** the harness returns
- **Then** `outcome: fail` carries three verdicts in order, each with its reasoning text

## Notes

- **The writer's blindness on retry is deliberate and pinned** (Rule 3): passing the verifier's reasoning to the writer would let it optimise against the judge rather than the requirement, collapsing the independence that makes the verdict trustworthy. Improvement pressure comes from the checks; the verifier only gates. (Pedro's directive: "Neither sees the other's reasoning. The independence is the load-bearing property.")
- Consumers own everything after the verdict: branch/PR creation, `pulse/` reporting, applying the diff. The harness is verdict-and-changeset only.
- `harness.maxIterations` added to schema §10.1 this round (standing authority: schema addition unblocking the current spec).
- Also supports: `cortex-loop-test-runner` (v1 consumer, design §11.4 item 11) and any future code-mutating loop. Primary parent remains `loops.developer-trusts-changes-the-system-writes`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
