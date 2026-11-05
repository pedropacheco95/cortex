---
name: specflow-review
description: 'Fresh-agent review of a spec against the code (before code, or weekly at rest) or of a diff against its criteria (on request). Read-only; findings only. "review the spec", "review this diff", "here is the feedback".'
---

# Specflow: Review (the goldfish)

## The Iron Law

NO FINDING WITHOUT A CRITERION OR SECTION, A LOCATION AND A PROPOSED CHANGE

Violating the letter of this law is violating the spirit. If you find yourself constructing a reading under which an observation is useful without being specific, that construction is the violation.

## What a goldfish is

A fresh agent that receives only what this skill hands it, and never the conversation that led here. The main session spawns it (the Agent tool, a new session, or a scheduled run). A fork of the current session, or the current session reviewing its own work, does not count. The goldfish reads; it never edits a spec, a test or code. Its output is a list of findings.

## Two modes

**Spec mode**, before code and at rest. Input: the spec file path(s) and the repository root. The goldfish reads the spec, then the code the spec describes. The weekly at-rest run is spec mode.

**Diff mode**, on request and never required. Input: the criterion ids a change claims to implement, the diff (a commit range or a patch file) and the repository root.

## How the main session runs it, in order

1. Decide the concerns: a spec spanning more than one area is split into concerns by area.
2. For each concern × lens, spawn one goldfish with this brief and nothing more: the mode, the input paths or ids of that concern, the repository root, the lens, and the finding format.
3. Wait for every goldfish.

   Spawn every goldfish in the foreground, or wait for every one to finish, before you merge. A session that ends with a goldfish still running loses its work.

4. Merge the findings: drop duplicates, keep the strongest severity, sort blockers first.
5. Hand the list to the person, who resolves it. A scheduled run hands the list to its caller and resolves nothing.

## Resolving

A finding is resolved by amending the spec in its own commit with `Specflow-Amends:` where existing text changes, or by recording why it is rejected under *Open questions*. In an interactive session the person decides. When the run was told the user can't answer, the main session resolves each finding itself this way and continues; a finding that shows a conflict with a recorded owner decision stops the run.

## Lenses

- **Comprehension.** Restate every criterion as the test that would prove it. A criterion that cannot be restated as a test, or two criteria that restate the same fact, is a finding.
- **Antagonistic.** Look for the input, state or sequence under which the criteria contradict each other, or under which today's code contradicts a criterion the spec presents as holding. Check every constant's value against every place in the code and copy that states it.
- **Readiness.** For each criterion: is it implementable in its wave alone, is its named test real or nameable, does it name every surface it touches, and which existing tests pin the behaviour it changes.
- **Codebase details.** For each criterion, the file and symbol where it lands, and the files that depend on them; anything the spec places in the wrong module.

## Diff mode's questions

Per criterion id: covered (which test cites it), not covered, or contradicted. For the diff as a whole: which changed files no listed criterion describes (a silent change).

## Finding format

```
[<criterion id> | spec:<file>#<rule or section> | diff:<file>] <blocker | should | nit>
<path>:<line> — <what is wrong, one sentence> — proposed: <the change, one sentence>
```

A finding about a rule or section rather than one criterion carries `spec:<file>#<rule or section>`. In diff mode, a finding with no criterion id is allowed only for a silent change, and carries `diff:<file>`.

## A review received from someone else

Verify each point of a review you received against the spec, a rule or the code before applying it, and reject what does not hold, with the reason.

A disagreement is settled by the spec, a rule or a command anyone can run, never by who said it or how sure they sounded. *Resolving* covers this skill's own findings; this section covers a review from a person or another agent.

## Rationalizations

| Thought/Excuse | Reality |
|---|---|
| "I wrote this spec, I can review it myself." | You remember the intent, so you read it into the text. The goldfish has only the text; that is the point. |
| "The code looks like it does this; no need to check." | Looking is what the spec's author did. Open the producer and quote the line. |
| "Minor wording, not worth a finding." | Wording is what a test is written from. If two readings exist, the test will pick one and the code the other. |
| "The diff is large; I will review the main files." | Silent changes live in the files you skip. List every changed file against the criteria. |
