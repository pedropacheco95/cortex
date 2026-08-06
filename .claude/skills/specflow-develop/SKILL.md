---
name: specflow-develop
description: 'Execute a plan into code, verified by tests. "implement this spec", "build this slice".'
---

# Specflow: Develop

## When to use

Execute a plan into code and verify it by test — the last stage of the spec-first spine
(brainstorm → plan → develop). Runs the test cascade: atomic tests at spec level, spec tests at
domain level, journey tests at slice level. Self-similar at every scope — the same skill runs
at slice, domain, and spec granularity, delegating per its depth calibration. Parent agents
verify children via tests, not by reading their code. Codes ALL gaps (including edge cases and
missing validation) and documents them — never stops for a gap; but a load-bearing review
finding that survives five fix rounds stops the work as BLOCKED rather than shipping it broken.
Use this skill when the user says "implement this spec", "build this slice", "code this
domain", "develop from specs", or hands over a plan from specflow-plan. Planning itself lives
in specflow-plan, not here.

## What this skill does

Execute a plan into code. The skill is recursive — it works at any scope (vertical slice,
domain, individual spec) using the same execute-or-delegate → verify → review pattern.

**Planning lives in `specflow-plan`.** Explore, gap analysis, research, the implementation
plan, and the size check moved there; this skill starts from the plan that produced. At
**Minimal** depth — one spec, ≤ 3 criteria, ≤ 1 file — you may run from the spec and its test
with no plan artefact. Above Minimal, a plan artefact is required; if there isn't one, run
`specflow-plan` first rather than improvising one in your head where nobody can review it.

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

## Two stop-rules, and why both hold

These fire on different things, so they never conflict. State them together because each one
sounds like an exception to the other:

**(a) Code all gaps, never block.** Fires *while implementing*, on an **untested edge case you
discover**. Write a sensible fix, log a one-line gap note, keep going. You are not blocked
because nobody knows about this case yet — you are the first to see it, and stopping to ask
would trade a documented decision for a stalled run.

**(b) Stop after 5 rounds.** Fires *after* implementing, on a **known defect a reviewer found
that resists fixing**. Five rounds, escalating; then BLOCKED. You are blocked because the
defect is understood, the fix has failed repeatedly, and a sixth attempt from the same place is
not new information.

Undiscovered-and-untested → implement and record. Known-and-resisting-fix → stop and report.

## Prerequisites

Before this skill runs:

- **A plan exists** — from `specflow-plan`, at any depth above Minimal
- **Specs exist** — developer specs with rules, acceptance criteria, entity references
- **Tests exist and run** — specflow-tests has been run, including Phase 0 (infrastructure).
  Smoke tests pass. Atomic and spec tests exist (they may be failing — the code doesn't
  exist yet).
- **Coding conventions exist** — RULES.md and/or project-specific coding skills define
  HOW to write code. This skill defines WHAT to implement and HOW MUCH.

## Cortex Awareness

When the project has a `.cortex/` directory, ground every run in the knowledge layer
before coding (skip this section cleanly when `.cortex/` is absent):

1. **Index first.** Read `.cortex/_index.md` to learn which Cortex modules exist and
   what they hold. Never bulk-read module contents.
2. **Insight for the touched files.** Match the task-relevant files via the specs'
   `governs:` globs, then run `cortex insight file <path>` for each (when
   `.cortex/insight/` exists). Use the entry's Purpose line to decide what NOT to
   read: a purpose that answers the question replaces a whole-file read; the entry's
   Connections section replaces a manual import walk.
3. **Compass rules.** Collect the applicable rules from `.cortex/compass/rules/R-*.md`:
   every rule whose `governs` globs match the files being touched AND every rule whose
   `check:` predicate applies to them. Honour them while coding — a `check:` predicate
   is a mechanical constraint the written code must satisfy.
4. **Atlas decisions.** Consult the `.cortex/atlas/decisions/` entries relevant to the
   touched domain — they record why the current approach was chosen; never undo a
   recorded decision silently.
5. **Insight queries (when `.cortex/insight/` exists).** A first-class workflow step,
   not a footnote — it recurs at Step 4a below (the planning-time queries moved
   to `specflow-plan` with the Explore step). Before writing code for ANY
   file the plan will modify, run `cortex insight file <path>` — the rich per-file
   entry (purpose, main players, connections) is the resume; still read the file
   itself when modifying it, because modification needs exact syntax, not a summary.
   Before cross-file changes that touch a concept (auth, session, billing, …), run
   `cortex insight concept <name>`. For a specific function/class/constant, run
   `cortex insight element <query>` — it may return "no rich entry" for elements not
   surfaced as main players; those stay discoverable via the file entry. All three
   support `--json`. Insight is inferred context, not authority — the gated layers
   (compass rules, specs) win on conflict. If `.cortex/insight/` is absent or a query
   returns nothing, proceed without it — never block on missing insight.
6. **Validate before finishing.** Run `cortex validate` before reporting completion and
   resolve (or explicitly surface) anything it flags.
7. **Gap documentation home (design §8.5).** Gap entries and the final gap report land
   at `.cortex/pulse/gaps.md` — never a root `gaps.md` — where they are reviewed and
   dismissed like other pulse outputs.

## Depth Calibration

Before starting the recursive flow, assess the scope and set the depth level. The depth
determines how far the work delegates and which test layer verifies it — a one-spec fix
doesn't need a delegation tree.

**Assess automatically based on what was received:**

| Signal | Depth | What it means |
|---|---|---|
| 1 spec, ≤ 3 criteria, ≤ 1 file to change | **Minimal** | Read the spec, the test, and the one file. Implement. Run atomic tests. No delegation, and no plan artefact required. |
| 2-3 specs, 1 domain | **Light** | Execute the plan's tasks directly — no delegation. Run spec tests to verify. |
| 4+ specs, 1 domain | **Standard** | Delegate per-spec, per the plan's decomposition. Spec tests verify cross-spec. |
| Multiple domains | **Full** | Delegate per-domain, which delegates per-spec. Journey tests verify cross-domain. |

The depth level affects every subsequent step:

| Step | Minimal | Light | Standard | Full |
|---|---|---|---|---|
| Plan artefact | Optional | Required | Required | Required |
| Execute | Implement + atomic tests | Implement + atomic + spec tests | Delegate per-spec | Delegate per-domain |
| Verify | Atomic tests only | Spec tests | Spec tests | Journey tests |
| Review ladder | Per task | Per task | Per task, per child | Per task, per child |
| Gaps | Document inline | Document inline | Collect from children | Collect + cross-domain gaps |

**Orchestration cap (temporary).** Until the writer/verifier harness ships (build-order-v3
step 11), sub-agents cannot spawn sub-agents, so depth stays capped at **Minimal or Light**: if
a scope would trigger Standard or Full, split the batch rather than retrying at a lower depth
mid-run. The review ladder's round-4 escalation is unaffected — a fresh implementer is a
sibling agent, not another level of recursion.

**The depth is set once at the start and flows to all children.** A Full-depth slice
agent spawns Standard-depth domain agents, which spawn Minimal or Light spec agents.
Children never escalate above the depth their parent set for them.

## The Recursive Flow

### Step 1: Take the plan

Read the plan artefact from `specflow-plan`. It already holds the exploration summary, the gap
analysis, the implementation plan, and the decomposition — do not redo that work here.

Check it before executing:

- Does every task name exact paths, the criterion it satisfies, and a verification command?
  If not, send it back to `specflow-plan` rather than filling the gaps by guessing.
- Do the tasks' verification commands exist and run?

At **Minimal** depth you may skip the artefact and work from the spec and its test directly.

### Step 2: Execute or delegate

The plan already decided where the work splits (its size check). Follow it.

**If executing directly** (Minimal/Light, or a leaf scope): proceed to Step 4.

**If delegating** (Standard/Full): spawn one sub-agent per child scope the plan names —

- Slice agent → one agent per domain
- Domain agent → one agent per spec (or per small group of related specs)

Each sub-agent receives: its tasks from the plan, its specs and tests, the coding conventions,
the plan's exploration summary, and file paths to relevant existing code.

Sub-agents run this same skill recursively. When they complete, proceed to Step 5.

### Step 3: Watch the test fail first

Before implementing a task, run its test and **read the failure**. It must fail for the reason
it exists to check — the assertion the test makes, failing on the value it checks.

A test that fails on an import error, a missing fixture, a misspelled symbol, or a crash in
setup is **broken, not red**: it will go green the moment the breakage is fixed, regardless of
whether the behaviour is right. Fix it and observe the right failure before writing code
against it. (`specflow-tests` owns this mechanism in full.)

**Delete premature code.** If implementation code was written before its test, delete it and
rewrite after the test is red. Do not adapt it — code that already exists pulls the test toward
describing what the code does rather than what the spec requires.

### Step 4: Execute (leaf agents only)

Runs at the level that's small enough to implement directly.

#### 4a. Implement spec code

Write the minimum code that makes the failing tests pass.

When `.cortex/insight/` exists: before modifying any file, run
`cortex insight file <path>` — the entry is the resume; the read is for exactness
(leaf agents query even when the parent already explored). Insight is inferred
context, not authority — gated layers win; proceed if there is no entry.

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

### Step 6: The review ladder

After a task is implemented and its tests pass, it is reviewed. Findings get up to five rounds
of fixing. Then the work stops.

#### Two stages, in order

**Stage 1 — spec compliance.** Does the code satisfy the criterion it claims? Does it implement
every numbered rule it touches? Does it violate a compass rule?

**Stage 2 — quality.** Craft: naming, structure, duplication, whether it matches the patterns
around it.

**Stage 1 gates stage 2.** There is no point reviewing the craft of code that does not do what
it must — you would be polishing something that is about to be rewritten.

#### What is load-bearing

A finding is **load-bearing** when it makes the code:

- fail a spec acceptance criterion, or
- break an existing behaviour, or
- violate a compass rule.

Everything else — style, naming, a cleaner structure someone would prefer — is recorded and
does **not** block. Craft feedback never gates correctness; tests do that.

#### The rounds

| Round | Who fixes it |
|---|---|
| 1–3 | The implementer that wrote the code, resumed with the finding |
| 4–5 | A **fresh** implementer on a stronger model, given the finding, the code, and what rounds 1–3 tried |
| after 5 | Nobody. Stop. |

Escalation at round 4 is not a formality. Three failures from one context means that context
has a wrong assumption in it, and the same reasoning re-run produces the same fix in new
clothes. A fresh agent does not inherit the assumption; a stronger one is likelier to see past
it. Hand it the history so it does not repeat rounds 1–3.

#### The terminal state

If a **load-bearing** finding is still unresolved after round 5:

**STOP. Report BLOCKED.** Include: the finding, the criterion or rule it violates, what each
round attempted, why each attempt failed, and the current state of the code.

**BLOCKED is a successful outcome.** It is the run doing its job. The alternatives are a sixth
round burning context on a defect that has already resisted five, or a completion claim over a
defect you know about — and the second one is worse than the first, because it is discovered by
someone else, later, who trusted you.

Non-load-bearing findings that survive five rounds are recorded as gaps and the work continues.

#### Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "One more round will do it — I can see the problem now." | You could see the problem on rounds 2, 3, and 4 as well. The ladder counts rounds precisely because "I've got it this time" is what the previous four felt like from the inside. |
| "It's not *really* load-bearing." | Check it against the three-item definition rather than against how tired you are. If it fails a criterion, breaks a behaviour, or violates a rule, it is load-bearing, and reclassifying it to keep going is the failure this ladder exists to catch. |
| "The reviewer is being pedantic about something that doesn't matter." | Then it is not load-bearing by the definition, so record it and move on — you do not need to win the argument or fix it. What you cannot do is dismiss a criterion failure as pedantry. |
| "Reporting BLOCKED looks like I failed." | Reporting green over a known defect *is* failing, just later and to someone who acted on it. A blocked report with five documented attempts is the most useful artefact available at that point. |
| "Starting a fresh agent at round 4 wastes everything I've learned." | Everything you learned is in the three failed attempts you hand over. What does not transfer is the assumption that caused them, which is the entire point. |
| "The tests pass, so the review finding must be wrong." | Passing tests mean the code satisfies the tests. A spec-compliance finding usually means a criterion has no test yet — which is a missing-criterion signal (`specflow-bugs` Type 1), not a reason to dismiss the finding. |

### Step 7: Collect Gaps and Report

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

1. **Working code** — all atomic, spec, and journey tests pass — or a **BLOCKED** report when
   a load-bearing review finding survived five fix rounds (Step 6), naming the finding, the
   rounds attempted, and why each failed
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

- **Does not plan.** Explore, gap analysis, research, the implementation plan, and the size
  check belong to `specflow-plan`. This skill executes a plan.
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

Planning references moved to `specflow-plan` (`references/planning-protocol.md`).
