---
name: specflow-ingest
description: 'Reconcile an external document against the specs. "the client sent this", "ingest this".'
---

# Specflow: Document Ingest

## When to use

Read external documents (client briefs, meeting notes, requirements updates, stakeholder
emails, technical specs, product docs, or any free-form input) and reconcile them against the
existing spec trees to produce a structured change manifest. Uses parallel agent plans,
section-based processing with delegation for large documents, internal conflict detection, and
temporal/version awareness. This skill proposes changes — it does not execute them. Approved
changes are routed through the change-router for execution. Trigger on: "here are the new
requirements", "update specs from this", "the client sent this", "ingest this", "reconcile this
with specs", "what changed from this brief", or any document drop in a Specflow-managed
project.

## What this skill does

Turn external documents into structured spec change proposals. This skill is the intake
layer — it reads what humans and clients produce and translates them into the language of
the spec tree.

**This skill proposes. It does not execute.** The output is a change manifest. Each
approved proposal is handed to the change-router for execution.

## Cortex Awareness

When the project has a `.cortex/` directory:

- **The sibling boundary (both directions).** This skill owns requirement-shaped
  sources: material that changes what the product should do becomes spec change
  proposals. The memory-shaped remainder — stakeholders, decisions, domain terms, and
  the verbatim source itself — is NOT dropped: hand it off to the
  `cortex-archive-ingest` skill, which preserves the source under
  `.cortex/archive/documents/<slug>/` and extracts schema-conformant atlas entries
  via its atlas strategy. Conversely, when `cortex-archive-ingest` encounters
  requirement-shaped material, it hands off here.
- **Business specs alongside atlas cross-references (design §8.4 bridge 2).** A
  manifest entry that proposes a new business spec also names the
  `.cortex/atlas/decisions/` entry it corresponds to (created via the
  `cortex-archive-ingest` handoff), so the outcome ("what user outcome we serve") and the decision ("why we
  chose this approach") cross-reference each other.
- **Query insight before proposing spec changes (when `.cortex/insight/` exists).**
  Before a manifest entry proposes changing a spec, run `cortex insight file <path>`
  on the code the spec governs and `cortex insight concept <name>` on the concept the
  document touches — check whether the proposed change contradicts how the code
  actually works per insight. A contradiction doesn't veto the proposal (the document
  may be right and the code wrong); record it on the manifest entry as a conflict for
  the human to resolve. Insight is inferred context, not authority — the gated layers
  (compass rules, specs) win on conflict. If `.cortex/insight/` is absent or a query
  returns nothing, propose without it — never block on missing insight.

## How It Works: Six Phases

### Phase 1: Read and Pre-Process the Documents

Accept one or more documents. Read ALL documents before any analysis — cross-document
context matters.

**For large or multi-section documents (more than ~100 lines or 3+ distinct sections):**
break the document into logical sections. Each section will be processed against the
relevant spec domain independently. This prevents context overload and ensures deep
reading per section.

**For multiple documents:** read all, cross-reference between them. If document 1 says
"add waitlist" and document 2 says "waitlist should support priority booking," they are
about the same feature. If document 1 says "lockout after 5 attempts" and document 2
says "lockout after 3 attempts," that's a conflict to flag.

#### Internal conflict detection

Before matching against the spec tree, check the document(s) for internal contradictions:

- Does the document describe the same behavior differently in two places?
- Does it reference both an old and new approach without clarifying which is current?
- Does it contain version history where a later section supersedes an earlier one?
- Do multiple documents contradict each other on the same point?

Flag every internal conflict. Do NOT silently pick one side — present both to the human
with the question: "Which of these is the intended behavior?"

#### Temporal/version awareness

Documents often describe evolution ("V1 did X, V2 changed to Y"). Identify:

- **Historical context** — statements describing what the system used to do (not
  actionable — the spec tree should reflect current/target state, not history)
- **Current behavior** — statements describing what the system does now
- **Target behavior** — statements describing what the system should do going forward
- **Supersession** — where a later statement explicitly replaces an earlier one

Only current and target behavior statements become document items. Historical context
is noted for understanding but does not generate change proposals.

**Output of Phase 1:** A structured list of document items, each tagged with: source
document, section, classification (current/target/historical/ambiguous), and any internal
conflicts flagged.

### Phase 2: Read the Spec Trees Deeply

Read the existing spec trees thoroughly — not just domains and overviews, but rules and
acceptance criteria. Spec gaps and conflicts hide in the criteria.

- `.specflow/specs/_index.md` for domain structure and dependency graph
- `.specflow/specs-business/` — read each business spec's outcome, journey steps, and business rules
- `.specflow/specs/` — read each dev spec's intent, entity references, rules, AND acceptance criteria
- `_overview.md` files for domain boundaries

**Agent delegation for large spec trees (30+ specs):** Spawn one agent per domain to
read that domain's specs deeply and produce a structured summary: entities referenced,
rules in effect, criteria covered, business outcomes linked. The orchestrator uses these
summaries for matching without holding every spec in context.

**Output of Phase 2:** A working model of the spec tree: domains, outcomes, rules,
criteria, entities — enough to match incoming document items with confidence.

### Phase 3: Generate Two Independent Plans (parallel)

Spawn 2 independent planning agents via the Agent tool. Each receives the document items
from Phase 1 and the spec tree model from Phase 2. Each independently produces a full
change manifest.

**Agent A:**
```
Agent tool call:
  prompt: "You have a list of document items and a spec tree summary. For each document
           item, classify it (redundant, spec change, new feature, spec gap, drift signal,
           ambiguous, out of scope) and produce a change manifest with concrete proposals.
           Write your manifest to onboarding-scratch/ingest-plan-a.md."
```

**Agent B:**
```
Agent tool call:
  prompt: "You have a list of document items and a spec tree summary. For each document
           item, classify it and produce a change manifest with concrete proposals.
           Write your manifest to onboarding-scratch/ingest-plan-b.md."
```

Both agents work independently. They do not see each other's output.

### Phase 4: Compare Plans

Read both plans from disk. Categorize every item:

**Convergent:** Both plans classified the same document item the same way and proposed
the same change. High confidence — take as-is.

**Similar:** Both plans identified the same item but differ on classification (one says
"spec change," the other says "spec gap") or on the proposed change details. Merge by
taking the better-evidenced version.

**Divergent:** One plan has a change the other doesn't mention, or they propose
fundamentally different changes for the same item.

#### If plans are mostly convergent (>80% agreement):

Merge directly. For the divergent items, the orchestrator reads the relevant specs and
document sections and makes a judgment call. Produce the final manifest.

#### If plans diverge significantly (<80% agreement):

Spawn Agent C — a third planning agent that receives:
- The document items and spec tree model (same as A and B)
- A summary of where A and B disagreed (but NOT their full plans — C should form its
  own opinion, informed by what's contentious but not biased by A or B's reasoning)

```
Agent tool call:
  prompt: "You have document items, a spec tree summary, and a list of contentious items
           where two previous analyses disagreed. Pay particular attention to these
           contentious items. Produce your own independent change manifest. Write to
           onboarding-scratch/ingest-plan-c.md."
```

Then compare all three. For each divergent item, spawn a focused investigation agent
that reads the specific document section and specific spec(s) in question and produces
a verdict with evidence.

### Phase 5: Produce the Change Manifest

Assemble the final manifest from the merged/resolved plans. The manifest must be:

**Ordered by dependency.** If CHANGE-03 creates a spec that CHANGE-07 references, 03
comes first. If CHANGE-01 modifies an entity that CHANGE-04 depends on, 01 comes first.
Topologically sort the changes.

**Grouped by priority.** Within dependency constraints, group by: critical changes first
(things that are wrong right now), then new features, then spec gaps, then cosmetic/naming
changes.

**Concrete.** Every change proposal includes the actual spec content — not "update the
spec" but the exact rules, criteria, and entity references to add or modify.

#### Change manifest format

```markdown
# Change Manifest

**Source documents:**
- [document 1 name/description]
- [document 2 name/description]

**Generated:** [date]
**Spec tree state:** [X business specs, Y dev leaf specs across Z domains]
**Planning approach:** [2-plan merge / 3-plan with investigation]
**Plan agreement:** [N]% convergent

---

## Summary

| Classification | Count |
|---|---|
| Redundant (already in specs) | N |
| Spec changes | N |
| New features | N |
| Spec gaps | N |
| Drift signals | N |
| Ambiguous (need clarification) | N |
| Out of scope | N |
| Internal document conflicts | N |

---

## Internal Document Conflicts (resolve before proceeding)

### CONFLICT-01: [description]
**Document says (section A):** [statement]
**Document says (section B):** [contradictory statement]
**Need from human:** Which is the intended behavior?

---

## Proposed Changes (ordered by dependency, then priority)

### CHANGE-01: [Short description]

**Source:** [document name], section [N], [paraphrase of relevant content]
**Classification:** Spec change / New feature / Spec gap / Drift signal
**Layer:** Dev-only / Business-only / Both
**Priority:** Critical / Normal / Low
**Plan agreement:** Convergent / Resolved from plans A+B / Investigated

**Current state:**
- Spec: `.specflow/specs/{path}`
- Rule N: "[current text]"

**Proposed state:**
- Rule N: "[proposed text]"
- Add criterion: [Given/When/Then]

**Impact:**
- Dependencies affected: [list]
- Entity references changed: [list]
- Cross-layer: [business spec still aligned? / needs update]
- Overview impact: [which _overview.md needs updating]

**Action for change-router:** Category [N] ([name]), [layer]

---

### CHANGE-02: [Short description]
**Depends on:** CHANGE-01 (creates the entity this spec references)
...

---

### AMBIG-01: [Short description]

**Source:** [document name], [paraphrase]
**Possible interpretations:**
1. [interpretation A] → would be [classification] to `.specflow/specs/{path}`
2. [interpretation B] → would be [classification] to `.specflow/specs/{path}`

**Need from human:** Which interpretation is correct?

---

## Redundant Items (already covered by specs)

[List for confidence — the human sees that the spec tree covers these]

- "[document statement]" → covered by `.specflow/specs/{path}`, Rule N
- "[document statement]" → covered by `.specflow/specs-business/{path}`, Journey step 3

---

## Out of Scope Items

- "[statement]" — timeline, not spec content
- "[statement]" — budget, not spec content

---

## Planning Notes

[If 3-plan investigation was needed, summarize what diverged and how it was resolved]
```

### Phase 6: Verification (optional, for high-stakes changes)

For change proposals that modify existing behavior (spec changes, drift signals), the
orchestrator can optionally verify against the codebase:

- Does the code currently implement what the existing spec says? (If not, this may be
  a bug, not a spec change — route to specflow-bugs)
- Does the code already implement what the document describes? (If so, the spec tree is
  behind the code — this is a spec gap, not a new feature)

This step prevents misclassification. It's optional because it requires code access and
adds time — use it when the stakes are high or when classification is uncertain.

## Handling Redundant Items

The "redundant" classification has nuance:

| Situation | Classification |
|---|---|
| Document says exactly what the spec says | Redundant — note for confidence |
| Document says the same intent but different threshold | Spec change (threshold needs updating) |
| Document says the same intent but more specific | Spec gap (missing criterion or rule detail) |
| Document says the same intent but less specific | Redundant — the spec is more precise |
| Document uses different vocabulary for the same concept | Redundant — note the vocabulary translation |

When in doubt between redundant and spec-gap, lean toward spec-gap. A false redundant
hides a real difference; a false spec-gap just produces a "no change needed" on review.

## What This Skill Does NOT Do

- **Does not execute changes.** It proposes. The change-router executes after approval.
- **Does not modify the bug ledger (`.cortex/compass/bugs/`).** If the document reveals a bug, classify the item and note
  that specflow-bugs should diagnose it.
- **Does not generate tests directly.** Tests are triggered after spec changes are applied
  (see "Post-Apply Test Sweep" below).
- **Does not resolve internal document conflicts.** It flags them for the human.

## Post-Apply Test Sweep

After the human approves the manifest and all changes are applied via the change-router,
the ingest flow is NOT complete until tests are generated for every affected spec.

The manifest includes a **test sweep section** at the bottom:

```markdown
## Test Sweep (after all changes applied)

**Affected dev specs requiring test generation/update:**
- .specflow/specs/cardinality/update-cardinality.spec.md (CHANGE-03: new rules added)
- .specflow/specs/cardinality/create-portions.spec.md (CHANGE-04: new spec)
- .specflow/specs/families/assign-family.spec.md (CHANGE-05: new spec)
- .specflow/specs/navigation/step-gating.spec.md (CHANGE-08: criteria modified)

**Affected business specs requiring journey test generation/update:**
- .specflow/specs-business/form-authoring/user-adjusts-cardinality.business.md (CHANGE-03)
- .specflow/specs-business/form-authoring/user-groups-into-families.business.md (CHANGE-05: new)

**Scenario coverage check needed:**
- New business spec user-groups-into-families must appear in at least one scenario's
  covers: list.

**Action:** After the last CHANGE is applied, run specflow-tests targeting ONLY the
specs listed above. The test skill generates atomic + spec tests for each affected dev
spec, journey tests for each affected business spec, and checks scenario coverage for
any new business specs. The verification pass runs on the new/updated tests only.
```

This section is generated automatically from the manifest's CHANGE entries — every
CHANGE that modifies or creates a dev spec adds its path to the test sweep list. Every
CHANGE that modifies or creates a business spec adds it to the journey test list.

## Agent Instructions

- **Read ALL documents before analysis.** Cross-document context matters.
- **Break large documents into sections.** Process each section against the relevant
  domain, not the whole document as a flat list.
- **Check for internal conflicts first.** Before matching against specs, find
  contradictions within the document(s).
- **Identify temporal layers.** Distinguish historical context from current/target behavior.
  Only current and target statements generate change proposals.
- **Draft concrete specs, not descriptions.** Every new-feature proposal includes the
  actual spec content with rules and criteria.
- **Use the project's vocabulary.** Translate the document's terms to the spec tree's
  terms and note the translation.
- **Flag every ambiguity.** Don't guess between interpretations.
- **Order changes by dependency.** If CHANGE-03 depends on CHANGE-01, say so explicitly.
- **Group related items.** Multiple document statements about the same feature merge into
  one CHANGE entry.
- **Note what the document DOESN'T say.** If an existing spec covers something the document
  conspicuously omits, flag it: "Should this spec be deprecated?"
- **Be generous with redundant classification.** It reassures the human that the spec tree
  is already complete where it is.
