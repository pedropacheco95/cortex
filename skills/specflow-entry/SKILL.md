---
name: specflow-entry
description: >
  Classify every incoming user request against the project's spec tree (developer specs in `.specflow/specs/`, business specs in `.specflow/specs-business/`, and `_overview.md` folder docs) and route it to the correct action before any work begins. This skill is the mandatory entry point for ALL user interactions in a Specflow-managed project (any project with a `.specflow/specs/` directory, with or without a parallel `.specflow/specs-business/`). PROACTIVELY use this skill whenever the user says anything in a project under spec management — bug reports, feature requests, behavior changes, stakeholder questions, "what does this group do?", outcome/journey/metric talk, or anything that might touch a developer spec, a business spec, or a folder overview. Also triggers on "add a feature", "fix this bug", "change this behavior", "what does X do", "what's the goal of X", "why do we have X", and on requests that may have drifted between business and developer layers (e.g., a dev change that invalidates the business description, or vice versa). If the project has specs, this skill runs first — no exceptions.
---

# Specflow: Entry

**This is the entry gate.** In a spec-managed project every request passes through here first —
it decides *which skill should run*, then that skill does the work. Nothing else starts until
this has.

## The Iron Law

FIND AND RUN THE RIGHT SKILL BEFORE DOING THE WORK YOURSELF

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this request is too small, too obvious, or too urgent to classify, that
construction is the violation.

Hardening mechanisms per `skills/_conventions/hardening.md`.

Every request in a spec-managed project must be classified before any work begins. This prevents ad-hoc code changes that bypass the spec tree and ensures all changes flow through specs first.

The core principle: **specs are the source of truth**. Code is an artifact of specs. Humans review specs, not code. Every change starts at the spec level.

## Priority: process skills before implementation skills

When more than one skill could apply, the **process** skill runs first. Process skills decide
what should happen; implementation skills carry it out. Running them in the other order means
the implementation has already chosen the answer the process skill existed to determine.

| Situation | Runs first | Then |
|---|---|---|
| An idea that is not yet a spec | `specflow-brainstorm` | spec-editor → plan → develop |
| An agreed spec, no plan yet | `specflow-plan` | `specflow-develop` |
| Something is broken | `specflow-bugs` | whatever its change plan names |
| A specific verbatim ask worth pinning | `specflow-intent-reconcile` | the normal flow, then reconcile |
| About to claim work is done | `verification-before-completion` | the claim, with its evidence |
| Tests to generate | `specflow-tests` | `specflow-develop` |

This gate does **not** do the downstream work itself. It classifies and routes. When the right
answer is "no skill applies", say so explicitly — that is a routing decision, not a bypass.

## Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "This request is too small to classify." | Classification is two sentences. The cost you are avoiding is smaller than the cost of discovering, three files later, that this was a spec change wearing a typo's clothes. |
| "I already know which skill this is." | Then say which, in one line, and run it. Knowing and routing are the same act here; skipping the sentence is what lets the *unstated* choice go unexamined. |
| "The user asked me to just do it, not to route." | Routing is not ceremony that delays the work — it is how the work reaches the skill that does it properly. The user asked for the outcome, not for a particular path to it. |
| "I'll classify after I look at the code." | Reading the code first anchors you to a code-shaped answer, which is exactly how a missing acceptance criterion gets fixed as a one-line patch. |
| "No skill fits this perfectly, so I'll handle it directly." | 'No skill applies' is a legitimate classification — state it and proceed. What is not legitimate is arriving there silently, which is indistinguishable from never having asked. |
| "It's a question, not a change — the gate is for changes." | Questions route too (Category 6, Exploration). A question about *why* something exists is answered from the specs and the atlas, not from the code, and the gate is what sends you there. |

## The two-layer spec model (read this first)

A modern Specflow project has two parallel spec layers plus a folder-overview layer. The router must understand all three.

| Layer | Lives in | Audience | Contains | Frontmatter link |
|---|---|---|---|---|
| **Business specs** | `.specflow/specs-business/` | Stakeholders, PMs, clients | Outcomes, user journeys, business rules, success metrics, KPIs. No schema, no API, no Given/When/Then. | `implemented_by: [path, …]` (points down to dev specs) |
| **Developer specs** | `.specflow/specs/` | Engineers, AI builders | Entities, schemas, API contracts, rules, Given/When/Then acceptance criteria. | `implements: path` (points up to exactly one business spec) |
| **Folder overviews** | `_overview.md` in every directory under `.specflow/specs/` and `.specflow/specs-business/` (root, every domain folder, every capability folder, sub-folders) | Anyone navigating the tree | What this group of specs IS, what it COVERS, WHY it exists as a group. No criteria, no rules — just orientation. | None |

> **Filename note.** This skill uses `_overview.md` (underscore prefix sorts to the top of the folder) and `.specflow/specs-business/` as the canonical names. Some projects may use `README.md` for overviews — accept those too. Some may use a different business-specs directory name (`business-specs/`, `specs/_business/`); check `.specflow/specs/_index.md` for the configured location and substitute throughout.

The two layers are joined by **bidirectional frontmatter links**:

```yaml
# .specflow/specs-business/booking/waitlist.md
---
id: business.booking.waitlist
implemented_by:
  - .specflow/specs/booking/waitlist/queue-join.md
  - .specflow/specs/booking/waitlist/notification.md
---
```

```yaml
# .specflow/specs/booking/waitlist/queue-join.md
---
id: booking.waitlist.queue-join
implements: .specflow/specs-business/booking/waitlist.md
---
```

When these links are missing or stale, the router must flag it (see Categories 8 and 9 below).

## Cortex Awareness

When the project has a `.cortex/` directory, classification includes the knowledge layer
(design §8.4 bridge 6) — route by checking **which Cortex module the request touches**
(skip this section cleanly when `.cortex/` is absent):

- As part of classification, grep the module indexes alongside the spec tree:
  the insight layer (which files the request maps to — `cortex insight file <path>` /
  `cortex insight concept <name>`, plus the specs' own `governs:` globs for the
  spec mapping), `.cortex/compass/_index.md` and
  `.cortex/compass/rules/` (is the request already governed by a rule — is it a rule
  change rather than a spec change?), and `.cortex/atlas/_index.md` (does a recorded
  decision or stakeholder context reframe the request?).
- **Query insight for what the change touches (when `.cortex/insight/` exists).** As
  part of classification and impact analysis, run `cortex insight file <path>` for the
  files the request appears to touch and `cortex insight concept <name>` for any
  concept it names (auth, session, billing, …) — the entries say what the code
  actually does and what connects to it, which sharpens the category, layer, and risk
  assessment (see `references/impact-analysis.md`). Insight is inferred context, not
  authority — the gated layers (compass rules, specs) win on conflict. If
  `.cortex/insight/` is absent or a query returns nothing, classify without it —
  never block on missing insight.
- **Bug-shaped reports route toward the ledger flow (cortex-schema §4.3):** diagnosis
  goes through specflow-bugs, and the bug is filed as
  `.cortex/compass/bugs/B-NNN-<slug>.md` — never a root `bugs.md` — so the daily
  bug-triage loop finds it.

## How to Use This Skill

When a user says something in a project that has a `.specflow/specs/` directory:

1. **Read the spec tree shape** — Scan `.specflow/specs/_index.md` (and `.specflow/specs-business/_index.md` if present) for the domain list and dependency graph. Note which business-specs directory name the project uses and whether overviews are `_overview.md` or `README.md`.
2. **Classify the request along three axes** (see "Classification dimensions" below).
3. **Output your classification** — Tell the user the category, which layer(s) it touches, which specs are relevant, whether any folder overview needs updating, whether mapping is missing, and what action you propose.
4. **Get confirmation** — Wait for the user to approve before executing.

## Classification dimensions

Every request gets classified along **three axes** simultaneously. The category (axis 1) drives the action; the layer (axis 2) and overview-impact (axis 3) refine the scope.

### Axis 1 — Category (what kind of request is it?)

The 9 categories below. Evaluate in order; first match wins.

### Axis 2 — Layer (which spec layer does it touch?)

- **Business-only** — the request is about outcome, journey, business rule, KPI. The dev spec(s) it links to don't need to change. Example: a stakeholder reframes the success metric for waitlist.
- **Dev-only** — the request is about implementation detail that doesn't change observable behavior or outcome. Example: swap bcrypt for argon2; the business spec on "secure passwords" still describes reality correctly.
- **Both** — the request changes observable behavior or outcome AND its implementation. Most feature requests, most spec changes, most bug reports of the "wrong behavior" kind. Example: "add SSO" needs a business spec (new outcome / journey) AND dev specs (new entities, endpoints, criteria).

**Default heuristic:** if you're unsure, lean **Both** and let the user narrow it. A dev change that *might* invalidate the business spec is a drift-detection case (Category 8), not a dev-only change.

### Axis 3 — Overview impact (does a folder `_overview.md` need updating?)

A folder overview describes what a group of specs IS as a group. It needs updating when:

- **A new capability is added to a domain** → the domain folder's `_overview.md` likely needs to mention it.
- **A capability is removed or renamed** → same.
- **The grouping rationale shifts** — e.g., what used to be "auth" is now "auth + identity"; the overview needs rewording.
- **A whole new domain is created** → the root `_overview.md` and the new domain's `_overview.md` are both needed.

For pure leaf-spec edits (changing a rule inside one capability spec), overviews usually don't need to change. Flag overview impact explicitly in your classification output so the human can confirm.

## Classification Categories

Evaluate these in order. First match wins.

### Category 1: Standalone

The request has nothing to do with the project's spec tree.

**Signals:**
- Doesn't reference any entity, domain, flow, outcome, or behavior in either spec layer
- General programming question ("how do I center a div?")
- Question about Specflow itself (methodology, not project-specific)

**Action:** Answer directly. No spec involvement.

### Category 2: Bug Report

Something is broken — behavior contradicts an existing **developer spec's** acceptance criteria.

**Signals:**
- "X is broken", "X returns wrong result", "X crashes"
- User describes behavior that contradicts a dev spec's Given/When/Then
- Error messages, 500s, wrong data, missing responses

**Action flow:**
1. Identify which dev spec defines the correct behavior
2. Find the acceptance criterion that covers this case
3. If criterion exists and code violates it → fix the code. No spec changes needed.
4. If no criterion covers this case → reclassify as Spec Gap (Category 5)
5. Check `implements:` link — does the linked business spec still describe correct behavior? Usually yes (the business outcome is fine; it was the implementation that drifted). If the bug suggests the business spec was always wrong about reality, also flag drift (Category 8).
6. Write the missing test, fix code, run regression for the domain, and file the bug in
   the `.cortex/compass/bugs/` ledger (via specflow-bugs)

**Layer:** usually Dev-only. Overview impact: usually none.

### Category 3: Spec Change

The user wants existing behavior to work differently. Nothing is broken — they want it changed.

**Signals:**
- "Change X from A to B"
- "I want X to work like Y instead"
- "Can we increase/decrease/modify the [parameter]?"

**Action flow:**
1. Determine the layer:
   - **Business change** (outcome/metric/journey shifts) → start in `.specflow/specs-business/`, then check `implemented_by:` dev specs to see whether they still satisfy the new business shape.
   - **Dev change** (rule/threshold/criterion shifts) → start in `.specflow/specs/`, then check `implements:` business spec to see whether the user-facing description is still accurate.
   - **Both** → write/update both layers, in the order the human prefers (usually business first).
2. Read the affected spec(s) on the relevant layer(s).
3. Show the current rules/criteria/outcomes; draft the proposed modification.
4. **Impact analysis** — see `references/impact-analysis.md`. Compute: direct dev-spec dependents (`depends_on`), entity-sharing specs, **and the cross-layer counterpart**.
5. **Drift check** — does the change break the business↔dev mapping? If yes, flag and propose updating the counterpart in the same change set.
6. Present impact: "This change affects N dev specs, M business specs, K folder overviews."
7. After approval: coherence check, regenerate affected slices, run tests for ALL affected specs.

### Category 4: New Feature

The user wants something that doesn't exist — no spec covers it on either layer.

**Signals:**
- "Add a waitlist", "We need X", "Can we add Y?"
- Describes a capability that has no matching spec in either tree

**Action flow:**
1. Determine where the feature belongs (which domain, which capability — or does it need a new domain folder?).
2. Decide the layering:
   - Most features need **both** a business spec (outcome/journey) and one or more dev specs (entities/endpoints/criteria). Default to both.
   - A pure-internal change (e.g., "add a debug-only health endpoint") may only need a dev spec.
   - A pure-strategic statement with no implementation yet (e.g., "we want to expand into corporate accounts next quarter") may only need a business spec, marked `status: draft`.
3. Draft the new spec(s) with bidirectional `implements:` / `implemented_by:` links from the start.
4. **Overview impact** — if this adds a new capability to a domain (or a new domain), draft the `_overview.md` update too. Surface this in the proposal.
5. Set dev-spec dependencies (`depends_on`).
6. Coherence check on the updated tree (both layers + overviews).
7. Present for approval; on approval, insert into build order and implement.

### Category 5: Spec Gap

A scenario that should be handled but no acceptance criteria address it.

**Signals:**
- "What happens when X?" (and no spec answers this)
- Edge case discovery: "If a coach creates a class in the past..."

**Action flow:**
1. Identify the dev spec that should cover this scenario.
2. Add the missing Given/When/Then criterion (and rules if needed).
3. Cross-check the linked business spec — does it implicitly cover this case? If yes and the dev spec was missing it, this is a pure dev-side gap. If neither layer covered it, the business spec needs an update too (the "what should the user experience" was never stated).
4. Present updated spec(s) for approval; write test; check code; fix if needed; run regression.

### Category 6: Exploration

The user wants to understand, not change.

**Signals:**
- "How does X work?", "What specs depend on Y?", "Show me the build order"
- "Walk me through the invitation flow"
- **High-level / fuzzy questions** — "What does the auth group do?", "What's in the booking domain?", "Why do we have a notifications folder?", "Give me an overview of the platform."

**Action:**
- For fuzzy/group-level questions → **read the relevant `_overview.md` first** and answer from there. Only dive into individual capability specs if the overview doesn't cover it (and if so, flag the overview as too thin — propose updating it).
- For specific behavior questions → traverse to the relevant dev spec.
- For outcome/business questions → start in `.specflow/specs-business/`.

No spec changes unless you discover the overview itself is stale or missing.

### Category 7: Ambiguous

The request could reasonably be multiple categories OR multiple layers.

**Action:** Present the possible interpretations with concrete spec references and ask the user which they mean. Be explicit about *both* the category and the layer:

```
A few possibilities:

1. **Bug (dev layer)** — If the spec `auth.login.lockout` says lockout at 5 attempts but
   it's locking at 3, that's a bug.
2. **Spec change (dev layer)** — If you want to change the threshold from 5 to 3, that's
   a dev-spec change. The business spec `business.auth.account-protection` may still
   describe the outcome correctly — I'll re-check after the dev change.
3. **Business change** — If the security posture itself is shifting (we now treat brute-
   force more aggressively as a product stance), that's a business-spec change first,
   and dev specs follow.

Which is it?
```

### Category 8: Drift Between Layers

A request — or a change just made — invalidates the link between a business spec and its dev spec(s).

**Signals:**
- A dev spec was just modified, and the linked business spec's outcome description no longer matches reality.
- A business spec was just modified, and the linked dev specs no longer satisfy the new outcome.
- The user reports a discrepancy: "The product page says we send confirmation emails within 1 minute, but the dev spec only guarantees 'eventually'."
- A bug report (Category 2) reveals that the business spec was always describing aspirational behavior the dev layer never delivered.

**Action flow:**
1. Identify both ends of the broken link (business spec ↔ dev spec(s)).
2. Decide which side is "correct" — the question is: which layer should be updated to match the other?
   - If the business outcome is the source of truth and dev drifted → update dev specs and code.
   - If reality (dev) is the source of truth and business was aspirational → update the business spec to match (and surface this honestly to the stakeholder).
   - Often: both need partial updates.
3. Propose both updates in one change set.
4. After approval: update both layers, regenerate affected slices, run regression.

**This is a critical category.** Drift left undetected is how spec-managed projects rot — the business layer becomes marketing copy and the dev layer becomes the only truth.

### Category 9: Unmapped Spec

A request touches a spec that has no counterpart link — a dev spec missing `implements:` or a business spec missing `implemented_by:`.

**Signals:**
- You go to read the linked counterpart and the frontmatter field is absent or empty.
- A capability exists in `.specflow/specs/` but no business spec covers it.
- A business outcome exists in `.specflow/specs-business/` but no dev spec realizes it.

**Action flow:**
1. Flag the gap to the user before proceeding with the original request:
   > "Before I make this change to `.specflow/specs/booking/waitlist/queue-join.md`, I noticed it has no `implements:` link to a business spec. Either the business spec exists and the link is missing, or no business spec was ever written. Want me to (a) find and link it, (b) draft the missing business spec, or (c) proceed without mapping (mark as `unmapped: true`)?"
2. Resolve the mapping question first, then proceed with the original request.
3. If the user chooses to proceed unmapped, record the choice in the spec frontmatter so future routing knows it's intentional.

**Why this matters:** unmapped specs are invisible to stakeholder review on the business side and to engineers on the dev side. The router catching this early prevents silent divergence.

## Rules This Skill Enforces

1. **Never generate code without a dev spec.** Even small changes get a leaf spec.
2. **Never make a stakeholder-visible behavior change without a business spec.** If a real user could notice, the business layer must describe it.
3. **All changes start at the spec level.** Humans review specs (both layers); code follows.
4. **After any spec change, run coherence check before building.** Coherence includes cross-layer link integrity (no broken `implements:` / `implemented_by:`) and overview freshness.
5. **Spec changes propagate across layers.** When a dev spec changes, check the business counterpart. When a business spec changes, check all listed dev specs.
6. **After spec changes are applied, trigger test generation for affected specs.** For single changes (one bug fix, one feature), generate tests immediately for the affected spec(s). For batch changes (ingest manifest), collect all affected spec IDs and trigger a single test generation sweep after the full batch is applied. Use specflow-tests for both cases.
7. **Frame review requests in spec terms** — and name the layer: "I updated the dev spec `auth.login.lockout` (criterion 3) and the business spec `business.auth.account-protection` (success metric); the folder overview at `.specflow/specs/auth/_overview.md` didn't need to change."

## Post-Change Test Trigger

After every spec change is applied and coherence-checked:

**For single changes (Categories 2-5):**
1. Identify the affected dev spec(s).
2. Generate/update atomic tests for any new or modified acceptance criteria.
3. Generate/update the spec test if rules changed.
4. If a business spec changed: generate/update the journey test.
5. Run the affected tests and report results.

**For batch changes (ingest manifest):**
1. Collect all spec IDs that were changed, created, or had criteria modified.
2. After the LAST change in the batch is applied, trigger specflow-tests once with the
   full list of affected specs.
3. The test skill generates tests only for the affected specs (not the entire tree).
4. Run the verification pass on the new/updated tests only.
5. Report results as part of the manifest completion summary.

## Output template for your classification

When you respond to the user's request, structure your routing decision like this:

```markdown
**Classification:** Category <N> (<name>)
**Layer(s):** <Business / Dev / Both>
**Specs touched:**
  - Business: <paths or "none">
  - Developer: <paths or "none">
**Folder overview impact:** <"none" | ".specflow/specs/<domain>/_overview.md needs to mention X">
**Mapping status:** <"linked" | "unmapped — propose drafting counterpart" | "drift detected between A and B">
**Proposed action:** <one-paragraph plan>
```

For obvious cases (e.g., "fix this typo in the login error message"), be terse — don't fill out every field, just call it: "Bug, dev-only, no overview impact, mapping intact. I'll fix it."

## Reading the Spec Tree Efficiently

You don't need to read every spec file for every request:

1. **Always start with `.specflow/specs/_index.md`** (and `.specflow/specs-business/_index.md` if present). The index tells you the shape of both trees.
2. **For high-level / group questions** — read the relevant `_overview.md` first.
3. **For entity references** — grep across both trees for the entity name.
4. **For behavior questions** — read the dev spec; consult the linked business spec only if outcome framing matters.
5. **For impact analysis** — grep `depends_on:`, `implements:`, and `implemented_by:` for the changed spec ID.
6. **For mapping integrity** — when reading any spec, glance at its `implements:` / `implemented_by:` field. Missing/empty = unmapped (Category 9 territory).

See `references/impact-analysis.md` for the full impact-analysis procedure including cross-layer propagation.
