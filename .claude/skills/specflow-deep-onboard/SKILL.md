---
name: specflow-deep-onboard
description: 'Multi-pass codebase onboarding.'
---

# Specflow: Deep Onboarding

## When to use

**This skill is callable-only** — it carries no trigger surface in the skill listing and is not
routed into automatically. Run it when the developer invokes `/specflow-deep-onboard`. Three
parallel onboarding passes over a whole codebase is an expensive, deliberate choice, not
something a resembling sentence should trip. What follows is its scope, not its triggers.

Deep onboarding for codebases where confidence matters. Orchestrates 3 parallel
specflow-onboard-codebase passes by spawning separate subagents via the Agent tool, then reads
their outputs from disk, compares structurally, investigates disagreements with focused agents,
and produces a final merged spec tree. This skill runs in the main Claude Code session (which
has access to the Agent tool) — it must NOT be invoked as a subagent itself. For a quick
single-pass onboarding, use specflow-onboard-codebase directly instead. Trigger on: "deep
onboard", "high-confidence onboarding", "run 3 passes", "multi-pass onboarding", "I need
confident specs for this codebase".

## What this skill does

Orchestrate 3 parallel specflow-onboard-codebase passes, compare their outputs, investigate
disagreements, and produce a final merged spec tree with high confidence.

## Why This Is a Skill, Not an Agent

This orchestration requires spawning subagents via the Agent tool. The Agent tool is
available to the main Claude Code session but may not be available inside a subagent.
By running as a skill (instructions to the main session), the orchestrator always has
access to the Agent tool.

## Cortex Awareness

When the project has a `.cortex/` directory:

- **Insight-first input (design §8.4 bridge 5).** Each pass inherits
  specflow-onboard-codebase's insight-first behaviour: passes build from the insight
  per-file entries (`.cortex/insight/anatomy/<path>.md`) and
  `.cortex/insight/graph.json` instead of re-walking the tree.
- **Pulse output homes (design §8.5).** The transient process outputs live under
  `.cortex/pulse/`: write `onboarding-scratch/` (the `atoms/` and `pass-{a,b,c}/`
  directories) to `.cortex/pulse/onboarding-scratch/`, `deep-onboard-report.md` to
  `.cortex/pulse/deep-onboard-report.md`, and `proposed-notes.md` / `corrections.md`
  to `.cortex/pulse/`. Substitute these homes wherever the instructions below name the
  project-root equivalents. On a non-Cortex project the root paths below stand as-is.
- **Bug findings live in the ledger, never `bugs.md` files.** Each pass files its bugs
  as ledger files (`compass/bugs/B-NNN-<slug>.md`, cortex-schema §4.3) inside its own
  pass directory; the merge step files the confirmed set in the project's
  `.cortex/compass/bugs/` ledger — never per-pass or root `bugs.md` files.

## Execution Model

This skill produces hundreds of markdown files across 3 passes. Each pass MUST run as a
separate subagent with its own context window.

**Use the Agent tool to spawn each pass.** Do not attempt to run passes sequentially in
your own context — that defeats the purpose of independent perspectives.

### How to spawn each pass

Use the Agent tool three times. Each invocation creates a subagent with its own context
window that works independently and returns results when done.

**Pass A:**
```
Agent tool call:
  prompt: "You have the specflow-onboard-codebase skill. Run the full 8-phase onboarding
           against [scope]. Write ALL output — .specflow/specs/, .specflow/specs-business/, _overview.md files,
           bug ledger files (compass/bugs/B-NNN-*.md), proposed-notes.md,
           onboarding-scratch/atoms/ — to
           onboarding-scratch/pass-a/. Do not write anything outside that directory.
           When done, return a summary: atom count, domain list, dev spec count, business
           spec count, bug count by severity, dead code count, unmapped spec count."
```

**Pass B:**
```
Agent tool call:
  prompt: "You have the specflow-onboard-codebase skill. Run the full 8-phase onboarding
           against [scope]. Write ALL output to onboarding-scratch/pass-b/.
           Do not write anything outside that directory.
           When done, return a summary: atom count, domain list, dev spec count, business
           spec count, bug count by severity, dead code count, unmapped spec count."
```

**Pass C:**
```
Agent tool call:
  prompt: "You have the specflow-onboard-codebase skill. Run the full 8-phase onboarding
           against [scope]. Assume nothing is intentional until you can prove it is.
           Write ALL output to onboarding-scratch/pass-c/.
           Do not write anything outside that directory.
           When done, return a summary: atom count, domain list, dev spec count, business
           spec count, bug count by severity, dead code count, unmapped spec count."
```

Replace [scope] with whatever the user asked to onboard.

**Background the subagents.** All three can run in parallel — they write to separate
directories and do not need to see each other's output. Check /tasks to monitor progress.

**Wait for all 3 to complete before proceeding to Step 2.**

Each subagent returns only a summary. You do NOT receive their full spec files in your
context — you read them from disk in Step 2.

## The Flow

### Step 1: Spawn 3 Parallel Onboarding Passes

Spawn 3 subagents as described in the Execution Model above.

**Pass differentiation:**

- **Pass A:** Standard onboarding. No additional directives.
- **Pass B:** Standard onboarding. Natural non-determinism produces a different perspective.
- **Pass C:** Same scope, with one additional directive: "Assume nothing is intentional
  until you can prove it is." This inverts the default assumption of the adversarial
  investigation protocol, making this pass harder to convince that code is correct.

All 3 passes must complete before proceeding.

### Step 2: Compare Pass Outputs from Disk

Read the pass output directories to compare. Do NOT load all files into context — use
targeted reads.

**Structural comparison:**

```bash
# List specs from each pass
find onboarding-scratch/pass-a/.specflow/specs -name "*.spec.md" | sort
find onboarding-scratch/pass-b/.specflow/specs -name "*.spec.md" | sort
find onboarding-scratch/pass-c/.specflow/specs -name "*.spec.md" | sort

# Compare domain structures
diff <(find onboarding-scratch/pass-a/.specflow/specs -type d | sort) \
     <(find onboarding-scratch/pass-b/.specflow/specs -type d | sort)

# Compare bug ledgers
diff -r onboarding-scratch/pass-a/compass/bugs onboarding-scratch/pass-b/compass/bugs

# Compare business spec lists
find onboarding-scratch/pass-a/.specflow/specs-business -name "*.business.md" | sort
find onboarding-scratch/pass-b/.specflow/specs-business -name "*.business.md" | sort
```

**Content comparison** — for specs that exist in multiple passes, diff the file contents:

```bash
# For each spec that exists in all 3 passes, check if content differs
for spec in $(find onboarding-scratch/pass-a/.specflow/specs -name "*.spec.md"); do
  base=$(echo $spec | sed 's|onboarding-scratch/pass-a/||')
  if [ -f "onboarding-scratch/pass-b/$base" ] && [ -f "onboarding-scratch/pass-c/$base" ]; then
    if ! diff -q "$spec" "onboarding-scratch/pass-b/$base" > /dev/null 2>&1 || \
       ! diff -q "$spec" "onboarding-scratch/pass-c/$base" > /dev/null 2>&1; then
      echo "CONTENT DIFFERS: $base"
    fi
  fi
done
```

Categorize into three buckets:

#### 2a. Structural convergence

Same file exists in all 3 passes, same domain folders. Note: structural convergence
does NOT mean content convergence — the same endpoint specced three times may produce
different rules, criteria, and entity references.

#### 2b. Content differences

Specs where the file exists in multiple passes but the content differs — different
rules, different acceptance criteria, different entity references, different level of
completeness. These go to the spec content merge step (Step 3).

#### 2c. Structural disagreements

- A spec exists in one pass but not another
- Different domain boundaries (same atom under different domains)
- Different granularity (one pass splits what another keeps as one spec)
- Different business groupings
- Bug found by only one pass (a disagreement, not an automatic confirmation)

These go to the disagreement investigation step (Step 4).

### Step 3: Merge Spec Content (parallel)

For every dev spec and business spec where the content differs between passes, spawn
a merge agent via the Agent tool. **These agents are independent and can all run in
parallel.**

Each merge agent receives:

- All versions of the spec (from whichever passes produced it)
- The source code file(s) the spec describes
- Instructions: "Read all versions and the source code. Produce one merged spec that
  takes the best rules, the most complete acceptance criteria, and the most accurate
  entity references from each version. Verify every rule and criterion against the
  actual code. Write the merged spec to [output path]."

**What the merge agent does:**

1. Reads all versions of the spec
2. Reads the actual source code the spec describes
3. For each rule: which version has the most accurate, complete rule? Does the code
   actually implement what the rule says? Take the best version, correcting against code.
4. For each acceptance criterion: which version has the most concrete, testable criterion?
   Are there criteria in one version that other versions missed? Include the union of
   valid criteria.
5. For entity references: which version has the most accurate READS/WRITES/CREATES?
   Verify against the actual code.
6. For Intent, Notes, dependencies: take the most informative version.
7. Write the merged spec to the output path.

**What the merge agent returns:**

```markdown
## MERGE: [spec-id]

**Versions compared:** Pass A (3 rules, 2 criteria), Pass B (5 rules, 4 criteria),
Pass C (4 rules, 3 criteria)

**Merged result:** 5 rules, 4 criteria

**Decisions:**
- Rules 1-3: identical across all passes
- Rule 4 (from Pass B): "concurrent booking must be atomic" — verified in code at
  line 234, missing from A and C
- Rule 5 (from Pass C): "reject booking when capacity is zero" — verified, missing
  from A and B
- Criterion "full class rejected" (from Pass B): more concrete values than A's version
- Criterion "concurrent last-slot" (from Pass C): not present in A or B, verified
  against code
```

**For business specs:** same approach — merge Outcome, User Journey steps, Business
Rules, and Success Metrics. The version with the most complete journey steps and the
most concrete business rules wins, verified against the dev specs listed in
`implemented_by:`.

**Scale:** A typical onboarding produces 30-50 specs with content differences. Each
merge agent is small (reads 3 short markdown files + one code section). Running 40
merge agents in parallel completes in minutes.

### Step 4: Investigate Structural Disagreements (parallel)

For each structural disagreement from Step 2c, spawn a focused investigation agent via
the Agent tool. These agents are also independent and can run in parallel.

Each investigation agent receives ONLY the specific files relevant to that disagreement.

**What each investigation agent receives:**

- The disagreement description: what each pass says
- File paths to read: the specific spec files, code files, and investigation records
  from each pass that are relevant
- A specific question: "Is this a bug or correct behavior?", "Should this be 3 specs
  or 9?", "Does this atom belong in domain A or domain B?"

**What each investigation agent does:**

1. Reads the relevant code fresh (not from any pass's context)
2. Reads the relevant specs and investigation records from each pass
3. Traces callers and callees if relevant
4. Checks for systemic patterns if relevant
5. Returns a verdict with evidence

**What each investigation agent returns:**

```markdown
## DISAGREE-[N]: [title]

**Pass A says:** [summary]
**Pass B says:** [summary]
**Pass C says:** [summary]

**Investigation:** [what the agent found by reading the code]

**Verdict:** [which position is correct, or a new position supported by evidence]

**Rationale:** [why this verdict, citing specific code evidence]
```

**Bug reconciliation:** A bug found by only one pass survives investigation only if the
investigation agent finds supporting evidence in the code. A bug found by only one pass
that the investigation agent cannot independently confirm is dismissed.

### Step 5: Produce Final Merged Output

Write the final merged output to the project root (not to a pass directory). Build it by:

1. **Use merged specs from Step 3** — these are the three-pass-quality specs
2. **Apply structural resolutions from Step 4** — domain boundaries, granularity decisions
3. **Merge the bug ledgers** — include only bugs that are either convergent (all passes
   agree) or confirmed by investigation, filing the confirmed set in the project's
   `.cortex/compass/bugs/` ledger (cortex-schema §4.3). Do not include dismissed bugs.
4. **Merge investigation trails** — combine proposed-notes.md from all passes plus the
   merge records from Step 3 and investigation records from Step 4
5. **Produce a unified build order** as a phased remediation plan
6. **Run specflow-lint** on the final merged output to catch structural issues

### deep-onboard-report.md

Write this file at the project root:

```markdown
# Deep Onboarding Report

## Configuration
- Passes run: 3
- Pass A: unbiased
- Pass B: unbiased
- Pass C: skeptical (assume nothing intentional until proven)

## Pass Summaries
- Pass A: [N] dev specs, [N] business specs, [N] bugs, [N] domains
- Pass B: [N] dev specs, [N] business specs, [N] bugs, [N] domains
- Pass C: [N] dev specs, [N] business specs, [N] bugs, [N] domains

## Convergence Summary
- Items where all passes agreed: [N]
- Specs with content differences merged: [N]
- Structural disagreements investigated: [N]

## Spec Content Merge Summary
- Total specs merged from multiple versions: [N]
- Rules added from non-primary passes: [N]
- Acceptance criteria added from non-primary passes: [N]
- Entity references corrected during merge: [N]

## Disagreement Resolutions

### DISAGREE-001: [title]
[Full investigation record]

### DISAGREE-002: [title]
...

## Bug Reconciliation
- Bugs confirmed by all 3 passes: [N]
- Bugs confirmed by 2 passes + investigation: [N]
- Bugs found by 1 pass, confirmed by investigation: [N]
- Bugs found by 1 pass, dismissed by investigation: [N]
- Total confirmed bugs in final output: [N]

## What Each Pass Contributed
- Pass A: [summary of unique findings]
- Pass B: [summary of unique findings]
- Pass C (skeptical): [summary of unique findings]

## Confidence Assessment
- Domains with high confidence (all passes agreed): [list]
- Domains with medium confidence (resolved disagreements): [list]
- Items still needing human judgment: [list]
```

## Final Output Structure

```
project-root/
├── deep-onboard-report.md
├── CLAUDE.md
├── RULES.md
├── build-order.md
├── corrections.md
├── implicit-behaviors.md
├── dead-features.md
├── link-map.md
├── proposed-notes.md
├── onboarding-scratch/
│   ├── atoms/
│   ├── pass-a/
│   │   ├── .specflow/specs/
│   │   ├── .specflow/specs-business/
│   │   ├── compass/bugs/
│   │   └── proposed-notes.md
│   ├── pass-b/
│   │   └── ...
│   └── pass-c/
│       └── ...
├── .specflow/specs/
│   ├── _overview.md
│   ├── _index.md
│   └── {domain}/...
└── .specflow/specs-business/
    ├── _overview.md
    └── {domain}/...
```

Raw pass outputs are retained in `onboarding-scratch/pass-{a,b,c}/` so the human can
see what each pass produced independently. Confirmed bugs are filed in the
`.cortex/compass/bugs/` ledger, not at the project root.

## Critical Rules

- **Each pass is a separate subagent spawned via the Agent tool.** Do not write pass
  output yourself. Each subagent writes to its own directory in its own context.
- **Merge spec content, don't pick a winner.** For specs that exist in multiple passes,
  spawn merge agents that combine the best rules, criteria, and entity references from
  all versions — verified against the actual code.
- **Merge agents and investigation agents run in parallel.** They are independent — no
  agent needs another's output. Spawn them all at once.
- **Read from disk, not from context.** Use file system operations to compare pass outputs.
  Pull specific files into context only when needed for a decision.
- **Every disagreement gets investigated.** Including bugs found by only one pass. A
  finding is confirmed or dismissed based on evidence, not based on how many passes
  flagged it.
- **Never average between passes.** Investigate and pick the better-evidenced answer.
- **Keep the full trail.** Raw pass outputs, merge records, investigation records, and
  deep-onboard-report.md all persist so the human can audit every decision.
- **Be honest about confidence.** If an investigation did not produce a clear verdict,
  mark it as "needs human judgment" rather than picking arbitrarily.
- **Run specflow-lint on the final output.** Catch any structural issues introduced
  during the merge.
