---
name: specflow-plan
description: 'Turn an agreed spec into an executable plan. "plan this", "break this down", "what are the steps".'
---

# Specflow: Plan

## When to use

Turn an agreed spec into a durable, executable plan — bite-sized tasks with exact paths, the
acceptance criterion each satisfies, and the command that verifies it, written to a file a
fresh agent could execute without ever seeing the conversation. The middle of the spec-first
spine (brainstorm → plan → develop); it holds the planning half that used to live inside
specflow-develop: explore, gap analysis, research, implementation plan, and the size check. Use
when the user says "plan this", "how would we build this spec", "break this down", "what are
the steps", or when a spec is agreed and implementation is next. Writes no code.

## The Iron Law

NO PLAN THAT A FRESH AGENT COULD NOT EXECUTE BLIND

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this plan is clear enough as it stands, that construction is the violation.

The test is literal: an agent with no memory of the conversation that produced this plan, given
only the plan and the repository, must be able to execute every task without asking you a
question. That is what makes it an artefact instead of a summary.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## What this produces

A plan file — the project's plan directory if one exists, else `plans/<YYYY-MM-DD>-<slug>.md`
created at the project root. It is durable and reviewable: a plan that lives only in a
transcript dies with the session, which is the failure this skill exists to fix.

It writes **no code**. It hands the plan to `specflow-develop`.

## Prerequisites

- **An agreed spec exists.** If the design has not been agreed, run `specflow-brainstorm`
  first — planning an unagreed design is planning the wrong thing carefully.
- **Its business spec is linked** via `implements:`, so the plan can trace tasks up to the
  outcome as well as down to the code.

## Step 1: Ground in the knowledge layer

Skip cleanly where `.cortex/` is absent.

1. **Index first.** Read `.cortex/_index.md` to learn which modules exist. Never bulk-read
   module contents.
2. **Insight for the files the plan will touch.** Match them via the specs' `governs:` globs,
   then run `cortex insight file <path>` for each — the Purpose line decides what you do *not*
   need to read, and the Connections section replaces a manual import walk. For work spanning a
   named concept (auth, session, billing, …) run `cortex insight concept <name>`. For a
   specific function or constant, `cortex insight element <query>` — it may return "no rich
   entry", which is fine; the file entry still finds it. Insight is inferred context, not
   authority — the gated layers (compass rules, specs) win on conflict, and if insight is
   absent or empty you plan without it.
3. **Compass rules.** Collect every rule whose `governs` globs match the files to be touched
   AND every rule whose `check:` predicate applies. A `check:` predicate is a mechanical
   constraint the planned code must satisfy — write it into the task that must satisfy it, not
   into a preamble nobody re-reads.
4. **Atlas decisions.** Read the `.cortex/atlas/decisions/` entries for the touched domain.
   Never plan work that silently undoes a recorded decision.

## Step 2: Explore

**Insight first (all depths):** query `cortex insight file <path>` for each candidate file
before deciding to read it — the entry answers "what is this, is it relevant, what are its main
pieces" more cheaply than a whole-file read. Read the file itself when you need exactness.

**Depth Minimal:** read the single file to change. No exploration agents.

**Depth Light:** read the domain's existing code directly — `ls` the directory, read the
relevant files. No agents needed.

**Depth Standard/Full:** spawn exploration agents in parallel:

- **Architecture and structure:** directory layout, framework, language, build system.
  Identify where new code should live based on existing conventions.
- **Related existing code:** modules, components, services, utilities the specs depend on or
  interact with. Read them — don't assume.
- **Established patterns:** naming conventions, error handling, validation approach, dependency
  injection, state management, API response shapes already in the codebase. The implementation
  MUST follow these.
- **Tech stack and dependencies:** key libraries, frameworks, tools in use, and available
  utilities the implementation can leverage.

Produce an exploration summary:

```markdown
### Exploration Summary
- **Relevant existing code:** [files/modules with brief purpose]
- **Established patterns:** [conventions the implementation must follow]
- **Tech stack:** [libraries/tools relevant to this scope]
```

**Depth Full only:** produce an ASCII component diagram showing where the feature fits within
the existing architecture — which modules it touches, how data flows, where new components go.

Read `references/planning-protocol.md` for the complete process at each scope level.

## Step 3: Gap analysis

When the planned change spans files or touches a named concept and `.cortex/insight/` exists,
run `cortex insight concept <name>` first — it says which files touch the concept and how it is
implemented, so the analysis starts from how the code actually works rather than from priors.
Inferred context, not authority; skip cleanly when absent.

```markdown
### Gap Analysis
**Can reuse:** [existing code/patterns that directly support the implementation]
**Must create:** [new files, modules, functions needed]
**Must modify:** [existing files that need changes, and why]
**Open questions:** [ambiguities — state assumptions explicitly, proceed]
```

## Step 4: Research (slice and domain scope only)

Use web search to ground implementation decisions in the project's stack: best practices for
this kind of feature in the framework, known pitfalls with the libraries involved, how similar
projects solve it. Skip at spec scope — the parent's plan already incorporates the findings.

## Step 5: Size check

Does the work fit one agent's context — all the specs, their tests, the relevant existing code,
with room left to write the implementation?

**Heuristic:** ≤ 3 specs and ≤ 2,000 lines of relevant existing code → one executing agent.
Otherwise → split, and say in the plan where the split falls and what each part receives.

This is a planning judgment, which is why it lives here: the plan decides the decomposition,
and `specflow-develop` executes it and delegates per its depth calibration.

**Orchestration cap:** until the writer/verifier harness ships (build-order-v3 step 11),
sub-agents cannot spawn sub-agents. A plan whose execution would need Standard or Full
recursive delegation is **split into batches** instead. Do not plan a fan-out that cannot run.

## Step 6: Write the plan

**At slice scope:** strategic — shared patterns across domains, data access approach,
implementation order, cross-domain utilities. Produces constraints all child agents follow.

**At domain scope:** tactical — shared patterns within the domain, spec implementation order,
shared utilities. Constrained by the parent's slice plan.

**At spec scope:** concrete — specific files to create/modify, rule-to-code mapping, data flow
through the handler.

Every task takes this shape:

```markdown
### Task N: [what it does, in five words]

**Criterion:** <spec id> — "<the acceptance criterion this satisfies, by name>"
**Files:** `exact/path/one.ts` (modify), `exact/path/two.test.ts` (create)
**Change:** [what to do — concrete enough that there is nothing to infer]
**Verify:** `pnpm vitest run tests/atomic/domain/thing.test.ts`
```

Four rules about tasks:

1. **Bite-sized.** Roughly 2–5 minutes each, and each leaves the project in a working state.
   A task that cannot be verified on its own is two tasks.
2. **Every task cites its criterion.** If a task satisfies no acceptance criterion, stop: either
   the spec is missing a criterion — route it to `specflow-bugs` as a possible Type 1 — or the
   task is work nobody asked for. Do not plan it silently.
3. **Every task names its verification command.** The exact command. "Run the tests" is not a
   verification command; `pnpm vitest run tests/atomic/insight/cli.test.ts` is.
4. **Exact paths, real content.** "Update the validator" is not a task. Name the file, name the
   function, say what changes.

Order the tasks so that each one's verification can actually run when it is reached.

## Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "The implementer will figure out the details." | The implementer is often a fresh agent with none of this conversation. Every detail you leave out is either re-derived differently or invented. That is where inconsistent implementations come from. |
| "Writing exact paths is tedious — the file is obvious." | It is obvious to you, right now, holding the exploration summary in your head. It is one grep to write down and one wrong guess to get wrong. |
| "This task doesn't map to a criterion but it's clearly needed." | Then the spec is incomplete and that is a finding, not a footnote. File it as a possible missing criterion. Planning unspecified work is how scope arrives without anyone agreeing to it. |
| "'Run the tests' is a fine verification step." | It is fine until the suite takes four minutes and the implementer runs a subset, or runs the wrong subset, and reports green. Name the command that proves *this* task. |
| "I'll keep the plan in the conversation instead of a file." | Then it dies with the session, cannot be reviewed before execution, and cannot be resumed. A plan you cannot hand to someone is a train of thought. |
| "The size check says split, but it'll probably fit." | "Probably fits" fails by running out of context halfway through task 7, with half the work done and no record of which half. Split it; two clean batches beat one truncated one. |

## What this skill does NOT do

- **Does not write code.** It hands the plan to `specflow-develop`.
- **Does not write or edit specs.** That is `specflow-spec-editor`; an unagreed design goes
  back to `specflow-brainstorm`.
- **Does not write tests.** That is `specflow-tests`.
- **Does not decide whether the work should happen.** The spec settled that.

## Reference Files

| File | Read when |
|---|---|
| `references/planning-protocol.md` | Step 2–6 — planning at each scope level |
