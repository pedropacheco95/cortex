---
id: specflow.insight-awareness
status: implemented
depends_on:
  - insight.cli
  - specflow.cortex-awareness
governs:
  - "skills/specflow-develop/**"
  - "skills/specflow-tests/**"
  - "skills/specflow-ingest/**"
  - "skills/specflow-new-project/**"
  - "skills/specflow-onboard-codebase/**"
implements: ../../specs-business/specflow/developer-gets-spec-work-grounded-in-project-memory.business.md
governed_by: []
---

# Insight-Awareness Pass over the SpecFlow Skills

## Intent

The v2 follow-up to `specflow.cortex-awareness` (v2 design §7.2): the SpecFlow skills that produce or route work gain an **insight-query step** in their existing `## Cortex Awareness` section, so they pull the ungated, inferred/observed knowledge layer (`cortex insight`) alongside the gated layers they already read. Awareness is added to existing bodies, never rewriting what works — minimal diffs, calibrated to what each skill produces. The load-bearing constraint is the trust framing: insight is **ungated/unreviewed** (v2 design §2), so every step frames a hit as a *lead to verify*, never as authoritative over gated cerebrum/atlas/`RULES.md`. This pass is distinct from the mechanical `.specflow/` path rewrite (`specflow.reorg` step 1b): that was find-and-replace; this is judgment-bearing prompt content.

## Entities

- **READS:** the current skill bodies (`skills/specflow-*/SKILL.md` and `.claude/skills/` mirrors) whose Cortex-awareness sections this pass extends.
- **WRITES:** the package `skills/specflow-{develop,tests,ingest,new-project,onboard-codebase}/SKILL.md` bundles (source of truth) and their project-local `.claude/skills/` copies (synced byte-identical).
- **CREATES:** nothing else — the deliverable is prompt content plus the awareness-test extension.

## Rules

1. **Per-skill insight-query contracts (calibrated to output):**

   | Skill | Required insight awareness (mechanically assertable in the body) |
   |---|---|
   | `specflow-develop` | Before planning/coding, when `.cortex/insight/` exists: `cortex insight query <topic>` for the task's domain (setup/testing/conventions/deploy prose) and `cortex insight neighbors <node-id>` for inferred related code; treat every hit as an **ungated lead to confirm against anatomy/cerebrum**, never a gated rule. |
   | `specflow-tests` | Before generating tests: `cortex insight query <domain>` (e.g. `testing`) to surface recorded testing conventions in the ungated layer; gated cerebrum rules and `check:` predicates (from `specflow.cortex-awareness`) still govern — insight only supplements. |
   | `specflow-ingest` | When routing a source: `cortex insight query` to check whether the ungated layer already covers the material — avoid re-capturing what the gaps loop already recorded; stabilized insight graduates via the promotion path (v2 design §3.7), not by re-ingest. |
   | `specflow-new-project` | Name `insight/` as a scaffolded module that fills over time (the gaps/refresh loops); nothing to query on a blank project — a one-line awareness note only. |
   | `specflow-onboard-codebase` | Name `cortex insight` as the ungated complement to the scanned anatomy: onboarding populates specs/anatomy, the insight loops populate `insight/` later — an awareness note, no required read (a fresh onboard has an empty `map/`). |

2. **Ungated trust framing is mandatory (v2 design §2).** Every insight-query step states that insight is ungated/unreviewed and must be confirmed against the gated layers before it drives a decision. A step that names `cortex insight` without the trust caveat does not satisfy this spec.

3. **Additive, minimal diffs.** Each body gains its insight step inside the existing `## Cortex Awareness` section (or an adjacent clearly-delimited note); existing workflow content and the `specflow.cortex-awareness` instructions are not restructured. `specflow-new-project`/`specflow-onboard-codebase` get the smallest possible touch (one note).

4. **Package + local in lockstep.** The five edited bundles are byte-identical between `skills/` (source of truth) and `.claude/skills/` — the `specflow.cortex-awareness` byte-identity AC continues to hold. The skill **count is unchanged** (24 bundles — this pass edits, adds none).

5. **No behavioural code changes.** Prompts and the awareness test only; Core untouched. `cortex insight` is already implemented (`insight.cli`); this pass documents its use, it does not change it.

## Acceptance Criteria

### Each benefiting skill carries its insight-query contract

- **Given** the five updated bodies (`specflow-develop`, `specflow-tests`, `specflow-ingest`, `specflow-new-project`, `specflow-onboard-codebase`)
- **When** each is checked against the Rule 1 table
- **Then** every body names `cortex insight` in an instruction matching its row, and each carries the Rule 2 ungated-trust caveat

### specflow-develop names both query and neighbors

- **Given** the updated `specflow-develop` body
- **Then** it instructs `cortex insight query` for prose topics AND `cortex insight neighbors` for inferred related code, both framed as ungated leads

### The ungated caveat is present, not just the command

- **Given** any of the five updated bodies
- **Then** near each `cortex insight` instruction the body states insight is ungated/unreviewed and must be confirmed against the gated layers (cerebrum/atlas/`RULES.md`) before it drives a decision

### Package and local copies stay byte-identical

- **Given** the round's final state
- **When** each edited `skills/specflow-*/` bundle is compared to its `.claude/skills/` counterpart
- **Then** every file is byte-identical (the `specflow.cortex-awareness` packaging AC still holds), and the packaged bundle count is unchanged at 24

### The unedited skills are untouched

- **Given** the six specflow skills not in Rule 1 (`bugs`, `change-router`, `deep-onboard`, `lint`, `spec-editor`, `viewer`)
- **Then** their bodies gain no insight instruction this pass — awareness is added only where it materially improves the output (business Rule 3)

## Notes

- Verification is atomic + spec tier only (prompt-structure assertions), same as `specflow.cortex-awareness`: behavioural verification of insight-awareness in live sessions is journey-tier, deferred post-v2. The rule-19 enumeration of every skill's diff is the compensating control.
- `specflow-change-router` is deliberately **not** in scope: it routes by which gated module a request touches; insight is a producer-fed ungated layer, and routing on unreviewed inference would weaken the gate. Orientation-via-insight for the router is a post-v2 candidate.
- Journey-layer tests deferred to v1.1 pending real-session verification infrastructure (project-wide convention).
- **2026-08 extension.** This spec's ACs describe the bodies edited in *that* pass. The
  superpowers-absorption round added `specflow-plan` and `specflow-brainstorm` to the
  benefiting set (their insight contracts are specified in `specflow.plan-skill` and
  `specflow.brainstorm-skill`) and added `specflow-request-review` / `specflow-receive-review`
  to the set that carries no insight instruction (`specflow.review-pair`). The
  `BENEFITING`/`EXCLUDED` lists in `tests/spec/specflow/insight-awareness.test.ts` were updated
  accordingly; the ACs here were not rewritten, because they are a record of that round.
