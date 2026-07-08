---
name: specflow-develop
description: >
  Implement code from specs using a recursive orchestration model. Explores the codebase,
  researches best practices, plans the minimum implementation, codes it, and verifies via
  the test cascade: atomic tests at spec level, spec tests at domain level, journey tests
  at slice level. Self-similar at every scope — the same skill runs at slice, domain, and
  spec granularity. At each level: explore, plan, check size, either execute or delegate.
  Parent agents verify children via tests, not code review. Codes ALL gaps (including edge
  cases and missing validation) and documents them for human review — never stops for gaps.
  Use this skill when the user says "implement this spec", "build this slice", "code this
  domain", "develop from specs", or any request to generate code from an existing spec tree.
---

# Specflow: Develop

Implement code from specs. The skill is recursive — it works at any scope (vertical slice,
domain, individual spec) using the same explore → plan → size-check → execute-or-delegate
pattern.

## Core Principles

1. **A test that passes means the code is correct.** Parent agents verify children by
   running tests, not by reading their code.

2. **Write the minimum code that passes the tests.** No features beyond what's tested.
   No speculative abstractions. No "while I'm here" improvements.

3. **Code ALL gaps, then document them.** When the agent sees something that should be
   handled but isn't tested, it codes the solution AND documents the gap. The agent never
   stops or blocks on a gap — it always implements and continues. Severity is informational
   for the human's review, not a control flow mechanism.

4. **The skill is self-similar.** A slice agent, a domain agent, and a spec agent all run
   the same logic. The only difference is scope and which test layer verifies the result.

## Prerequisites

Before this skill runs:

- **Specs exist** — developer specs with rules, acceptance criteria, entity references
- **Tests exist and run** — specflow-tests has been run, including Phase 0 (infrastructure).
  Smoke tests pass. Atomic and spec tests exist (they may be failing — the code doesn't
  exist yet).
- **Coding conventions exist** — RULES.md and/or project-specific coding skills define
  HOW to write code. This skill defines WHAT to implement and HOW MUCH.

## Cortex Awareness

When the project has a `.cortex/` directory, ground every run in the knowledge layer
before planning or coding (skip this section cleanly when `.cortex/` is absent):

1. **Index first.** Read `.cortex/_index.md` to learn which Cortex modules exist and
   what they hold. Never bulk-read module contents.
2. **Anatomy for the touched files.** Pull the `.cortex/anatomy/files.md` rows for the
   task-relevant files — match rows via `spec_links` (the specs being implemented) and
   the specs' `governs:` globs. Use each row's one-line purpose to decide what NOT to
   read: a purpose line that answers the question replaces a whole-file read.
3. **Compass rules.** Collect the applicable rules from `.cortex/compass/rules/R-*.md`:
   every rule whose `governs` globs match the files being touched AND every rule whose
   `check:` predicate applies to them. Honour them while coding — a `check:` predicate
   is a mechanical constraint the written code must satisfy.
4. **Atlas decisions.** Consult the `.cortex/atlas/decisions/` entries relevant to the
   touched domain — they record why the current approach was chosen; never undo a
   recorded decision silently.
5. **Insight leads (when `.cortex/insight/` exists).** Before planning or coding, run
   `cortex insight query <topic>` for the task's domain (setup / testing / conventions /
   deploy prose) and `cortex insight neighbors <node-id>` for inferred related code.
   Treat every hit as an ungated lead to confirm against anatomy/compass before it
   drives a decision — never a gated rule. Insight is **ungated/unreviewed**; the gated
   layers (compass/atlas/`RULES.md`) win.
6. **Validate before finishing.** Run `cortex validate` before reporting completion and
   resolve (or explicitly surface) anything it flags.
7. **Gap documentation home (design §8.5).** Gap entries and the final gap report land
   at `.cortex/pulse/gaps.md` — never a root `gaps.md` — where they are reviewed and
   dismissed like other pulse outputs.

## Depth Calibration

Before starting the recursive flow, assess the scope and set the depth level. The
depth determines how thorough each step is — a one-spec fix doesn't need exploration
agents and web research.

**Assess automatically based on what was received:**

| Signal | Depth | What it means |
|---|---|---|
| 1 spec, ≤ 3 criteria, ≤ 1 file to change | **Minimal** | Read the spec, the test, and the one file. Implement. Run atomic tests. No exploration agents, no research, no planning document, no delegation. |
| 2-3 specs, 1 domain | **Light** | Read the domain's existing code directly (no exploration agents). Brief plan: implementation order + shared patterns. Execute all specs directly — no delegation. Run spec tests to verify. |
| 4+ specs, 1 domain | **Standard** | Explore with agents. Domain-level plan with shared utilities. Delegate per-spec. Spec tests verify cross-spec. |
| Multiple domains | **Full** | Explore with agents + component diagram. Web research for best practices and pitfalls. Slice plan constraining all domains. Delegate per-domain, which delegates per-spec. Journey tests verify cross-domain. |

The depth level affects every subsequent step:

| Step | Minimal | Light | Standard | Full |
|---|---|---|---|---|
| Explore | Read the one file | Read the domain's files | Spawn exploration agents | Agents + component diagram |
| Plan | None — implement directly | Brief: order + patterns | Domain plan | Slice plan + research |
| Size check | Skip — always execute | Skip — always execute | Check per-spec | Check per-domain |
| Execute | Implement + atomic tests | Implement + atomic + spec tests | Delegate per-spec | Delegate per-domain |
| Verify | Atomic tests only | Spec tests | Spec tests | Journey tests |
| Gaps | Document inline | Document inline | Collect from children | Collect + cross-domain gaps |

**The depth is set once at the start and flows to all children.** A Full-depth slice
agent spawns Standard-depth domain agents, which spawn Minimal or Light spec agents.
Children never escalate above the depth their parent set for them.

## The Recursive Flow

### Step 1: Explore

**Depth Minimal:** Read the single file to change. No exploration agents.

**Depth Light:** Read the domain's existing code directly — `ls` the directory, read
the relevant files. No agents needed.

**Depth Standard/Full:** Spawn exploration agents in parallel:

- **Architecture and structure:** Directory layout, framework, language, build system.
  Identify where new code should live based on existing conventions.
- **Related existing code:** Modules, components, services, utilities that the specs
  depend on or interact with. Read them — don't assume.
- **Established patterns:** Naming conventions, error handling, validation approach,
  dependency injection, state management, API response shapes already in the codebase.
  The implementation MUST follow these.
- **Tech stack and dependencies:** Key libraries, frameworks, tools in use. Available
  utilities that the implementation can leverage.

Produce an exploration summary:

```markdown
### Exploration Summary
- **Relevant existing code:** [files/modules with brief purpose]
- **Established patterns:** [conventions the implementation must follow]
- **Tech stack:** [libraries/tools relevant to this scope]
```

**Depth Full only:** Produce an ASCII component diagram showing where the feature fits
within the existing architecture — which modules it touches, how data flows, where
new components go.

### Step 2: Plan

**Depth Minimal:** Skip — implement directly from the spec and test.

**Depth Light:** Brief plan only — implementation order and shared patterns within the
domain. No gap analysis document, no research.

**Depth Standard/Full:** Full planning. Read `references/planning-protocol.md` for the
complete process at each scope level.

Three sub-steps, adapted from the plan-feature pattern:

#### 2a. Gap analysis

Compare what the specs require against what already exists:

```markdown
### Gap Analysis
**Can reuse:** [existing code/patterns that directly support the implementation]
**Must create:** [new files, modules, functions needed]
**Must modify:** [existing files that need changes, and why]
**Open questions:** [ambiguities — state assumptions explicitly, proceed]
```

#### 2b. Research (slice and domain scope only)

Use web search to ground implementation decisions in the project's stack:

- Best practices for this type of feature in [framework]
- Known pitfalls with the libraries involved
- Ecosystem patterns — how similar projects solve this problem

Skip this at spec scope — the parent's plan already incorporates research findings.

#### 2c. Implementation plan

**At slice scope:** Strategic — shared patterns across domains, data access approach,
implementation order, cross-domain utilities. Produces constraints that all child agents
must follow.

**At domain scope:** Tactical — shared patterns within the domain, spec implementation
order, shared utilities. Constrained by the parent's slice plan.

**At spec scope:** Concrete — specific files to create/modify, rule-to-code mapping,
data flow through the handler.

### Step 3: Size Check

Can I hold all the specs, their tests, the relevant existing code, AND have room to
write the implementation in my context?

**Heuristic:** ≤ 3 specs and ≤ 2,000 lines of relevant existing code → execute directly.
Otherwise → delegate.

**If executing:** Proceed to Step 4.

**If delegating:** Spawn one sub-agent per child scope:

- Slice agent → one agent per domain
- Domain agent → one agent per spec (or per small group of related specs)

Each sub-agent receives: its specs and tests, the plan for its scope, the coding
conventions, the exploration summary, and file paths to relevant existing code.

Sub-agents run the same skill recursively. When they complete, proceed to Step 5.

### Step 4: Execute (leaf agents only)

Runs at the level that's small enough to implement directly.

#### 4a. Implement spec code

Write the minimum code that makes the failing tests pass.

Rules:
- Follow the coding conventions from RULES.md and project-specific coding skills
- Follow the plan from the parent agent — do not contradict parent decisions
- Match existing code patterns discovered in Step 1
- No features beyond what the tests verify
- No abstractions for single-use code
- Implement general behavior, not test-specific behavior — if the test uses
  `alice@example.com`, do NOT hardcode that value
- Touch only what you must — don't improve adjacent code, comments, or formatting

#### 4b. Run atomic tests

Run the atomic tests for the spec. Fix the code until all atomic tests pass. Fix the
CODE, not the tests — if a test seems wrong, document it as a gap but make it pass.

#### 4c. Implement gap code

While implementing, the agent will notice things that should be handled but aren't
tested. For each gap:

1. **Code the solution** — write the code that handles the gap
2. **Keep gap code isolated** — structure it so it can be cleanly removed without
   breaking spec-passing code (see `references/gap-documentation.md`)
3. **Document the gap** with severity (CRITICAL / NORMAL / MINOR), what was seen, what
   was coded, files touched, suggested spec addition, and removal instructions
4. **Continue** — never stop or block on a gap, regardless of severity

#### 4d. Post-implementation checks

- **Hardcoded test values:** Grep the implementation for values from test fixtures.
  If found, the implementation is degenerate — rewrite to implement general behavior.
- **Surgical changes:** Every changed line should trace to a spec rule or a documented
  gap. If a line doesn't trace to either, remove it.

#### 4e. Return results to parent

Return:
- List of files created/modified
- Atomic test results (all passing)
- Gap report for this spec

### Step 5: Verify (parent agents only)

After all children complete, run the tests for THIS level:

| Parent scope | Test layer | What it catches |
|---|---|---|
| Domain agent | Spec tests | Cross-spec rule interactions, entity write accuracy |
| Slice agent | Journey tests | Cross-domain integration, end-to-end user flows |

**If tests pass:** The children's code is correct. Do NOT read the code — proceed to
Step 6.

**If tests fail:** Read ONLY the failing test and the relevant code. Diagnose and fix.
The fix might be a cross-spec consistency issue, a missing integration piece, or a test
error (document as a gap). Re-run until tests pass.

### Step 6: Collect Gaps and Report

Collect gaps from all children and add any gaps discovered at this level:

- **Spec-level gaps:** Edge cases, missing validation, unhandled errors
- **Domain-level gaps:** Cross-spec consistency issues, shared patterns missing
- **Slice-level gaps:** Cross-domain integration gaps, missing event propagation

Produce the gap report at `.cortex/pulse/gaps.md` (design §8.5 — never a root
`gaps.md`). See `references/gap-documentation.md` for format and examples.

## The Verification Cascade

```
Spec Agent
  implements → runs ATOMIC tests → passes
  returns code + gaps to Domain Agent

Domain Agent
  receives all spec code
  runs SPEC tests → passes? → domain is integrated
                  → fails? → reads failing code, fixes, re-runs
  returns domain code + domain gaps to Slice Agent

Slice Agent
  receives all domain code
  runs JOURNEY tests → passes? → slice is integrated
                     → fails? → reads failing code, fixes, re-runs
  collects all gaps
  presents gap report to human
```

## What the Human Receives

1. **Working code** — all atomic, spec, and journey tests pass
2. **Gap report** — every gap coded by the agents, with:
   - The gap code (already in the codebase, isolated and removable)
   - Severity (CRITICAL / NORMAL / MINOR) — informational, not blocking
   - Suggested spec addition if the human wants to keep it
   - Removal instructions if not
3. **Test results** — per-layer, per-spec

For each gap the human decides: **keep** (add to specs, write the test), **different
approach** (write spec differently, replace gap code), **remove** (delete gap code),
or **defer** (leave for now, review later).

## What This Skill Does NOT Do

- **Does not write specs.** Specs exist before this skill runs.
- **Does not write tests.** Tests exist before this skill runs.
- **Does not set up test infrastructure.** That's specflow-tests Phase 0.
- **Does not run scenario tests.** Scenarios cross multiple slices — run after all slices.
- **Does not modify tests.** If a test seems wrong, the code still makes it pass.
- **Does not stop for gaps.** Gaps are coded and documented, always.

## Reference Files

| File | Read when |
|---|---|
| `references/gap-documentation.md` | Step 4c — documenting gaps with code |
| `references/planning-protocol.md` | Step 2 — planning at each scope level |
