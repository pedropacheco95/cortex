---
name: specflow-spec
description: 'Turn a request that no criterion covers, or that touches more than one spec, into a spec: invariant criteria, constants, a named test per criterion, waves. Code-free. "spec this", "brainstorm", "plan this".'
---

# Specflow: Spec (the elephant)

## The Iron Law

NO CRITERION WITHOUT A NAMED TEST, AND NO CODE IN THIS SESSION

Violating the letter of this law is violating the spirit. If you find yourself constructing a reading under which this does not apply to your case, that construction is the violation.

## When to use

A request creates a behaviour no criterion covers, or touches more than one spec, or the person says "spec this". The output is the spec, which is the design document. There is no plan file, no code and no test code. In a project with no `specflow/` folder, create `specflow/impl/<area>/` by writing the spec there, and run `cortex specs index` before committing.

## Steps, in order

1. **Check for a conflict.** Compare the request with the `Rules` and `Not this spec` lines of every spec it touches, `specflow/promises/**`, and `cortex/world/decisions/**`. A promise counts as a recorded owner decision. On a conflict, go to *Owner decisions* below.
2. **Find what holds today.** From `specflow/INDEX.md` and `grep`, list every spec and criterion the request touches. Then read the code: for each behaviour the request changes, find what produces it today (the function, the constant, the template, the copy) and what depends on it (callers, other surfaces stating the same fact, tests pinning it). Write both in the spec's *Today* section with file paths. Specs say what should hold; code says what does.
3. **Write the criteria as invariants between surfaces, not as values.** A criterion states a relation that must hold, never a literal in two places. Any fact used by more than one surface becomes a constant.
4. **Name a test for every criterion.** Each criterion carries `test:` with a file path and a test name, existing or to be written. A criterion with no nameable test is rewritten or moved to *Open questions*.
5. **Mark what was not read.** A criterion that restates today's behaviour you did not read in the code carries the body line `not read in the code`. `specflow/INDEX.md` computes the `unverified` mark itself, from tags; you never write that mark.
6. **Cut the work into waves.** `Waves` lists ordered groups of criterion ids. Each wave can be implemented, tested and committed on its own, with constants and migrations first, and names the surfaces it touches.
7. **Record open questions and decisions.** Anything the request leaves open goes under *Open questions* with the options. In an interactive session, stop and ask. Before the spec is committed, check every quoted ask, including the ask of a spec request:

   Every ask quoted in the request maps to a criterion or is listed under Open questions.

8. **Commit the spec alone.** Spec files only, in their own commit, with a `Specflow-Amends:` trailer for every existing rule or criterion whose text changed. `specflow/INDEX.md` comes from the pre-commit hook, or from `cortex specs index` where no hook is installed; never edit it by hand. Then stop this skill and run `specflow-review` before any code is written.

## Owner decisions

If the request contradicts a rule, a 'Not this spec' line or a recorded decision the owner made, do not build it: write the spec with the conflict as an open question and stop.

The stop has no exception in any run. It holds *Today* and the open question, with no criteria and no waves. The spec holding the conflict is committed by step 8, with the conflict under *Open questions*; `specflow-review` does not follow and no wave starts.

If you were told the user can't answer during this run, don't wait: decide, write the decision and its reason under Open questions in the spec, and continue. This never applies to a conflict with a recorded owner decision; that always stops.

Such a run goes on to `specflow-review`, resolves its findings as that skill says, and develops wave by wave. An interactive session always asks.

## Where a constant lives

A constant lives in a `constants.md`, in the `constants:` map of its frontmatter, at the lowest folder under `specflow/` that covers every spec using it. A spec sees its own folder's constants and its ancestors', never a child's or a sibling's. A criterion refers to one as `const:NAME`.

## Starting from a spec request

When the input is a `Spec request:` item from `now/proposals.md`, the quoted ask is the request, and the spec's *Today* section cites the item's `source:`. Once the spec is committed, remove the item in a separate commit and say which spec holds the ask. An ask refused for a conflict keeps its item.

## Amending a criterion

Edit an existing criterion's text directly and commit it alone with its `Specflow-Amends:` trailer. Never edit a test. Where rule (c) is live, that commit gets a warning, not a refusal; the wave that follows changes the tagged test on the same branch, and `cortex check --range` holds the branch to it.

## Spec shape

New criteria go in the spec that already covers the behaviour, and an `implemented` spec drops to `implementing`. A new spec goes in `specflow/impl/<area>/<leaf>.spec.md`. Its frontmatter carries `serves: [<promise id>]` with exactly one entry; a project whose promises are not converted yet uses `implements:` instead.

```
---
id: <area>.<leaf>
status: draft
serves: [<promise id>]
---

### Rules
1. …

### Not this spec
- <what this spec deliberately does not do>

### Today
- <behaviour> is produced by `<file>:<symbol>`; stated again in `<file>`; pinned by `<test file>`.

### Acceptance Criteria

#### <CRITERION-ID>: <one-line invariant>
Given … When … Then …  (uses `const:<NAME>`)
test: `<path>` › `<test name>`

### Waves
1. <ids> — <surfaces>

### Open questions
- <question> — options: … — decision (if taken): … because …
```

## After review

The owner resolves the findings, and the main session then develops wave by wave under the `## Specs` rules. Each wave is ordinary quick-path work.

## Rationalizations

| Thought/Excuse | Reality |
|---|---|
| "The change is small, I can just write the code." | Then it was not routed here. Here the deliverable is the spec; code comes after review. |
| "The value is obvious, I will write it in each criterion." | Two copies of a value is how two surfaces come to disagree. One constant, in `constants.md`, referenced by name. |
| "I know what the code does, no need to read it." | The spec was written from the code once and nobody checked since. Read the producer; write the file path. |
| "I will name the tests later." | A criterion without a test stays unverified and is trusted by nobody. Name it now; it costs a line. |
