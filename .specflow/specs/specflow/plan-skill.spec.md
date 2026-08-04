---
id: specflow.plan-skill
status: implemented
depends_on:
  - specflow.brainstorm-skill
  - specflow.cortex-awareness
  - discipline.hardening-convention
implements: ../../specs-business/specflow/nothing-is-built-before-it-is-agreed.business.md
governed_by: []
governs:
  - "skills/specflow-plan/**"
---

# `specflow-plan` — the planning half, extracted from develop

## Intent

Plan §3 item 3.2: the middle of the `brainstorm → plan → develop` spine, and the new home for
the planning half of `specflow-develop`. Develop was doing two jobs — deciding *what* to build
and *how much*, then building it — and the first job was invisible: it happened inside the
implementing agent's context and evaporated with it. Nobody could review it, and a fresh agent
could not resume it.

This spec makes the plan a **durable artefact**: bite-sized tasks with exact paths, the
acceptance criterion each satisfies, and the command that verifies it — executable by an agent
that never saw the conversation that produced it.

**Migrated in from `specflow-develop`** (the same content, re-homed, not rewritten): the
Explore step including its exploration-agent fan-out and exploration summary; the gap-analysis,
research, and implementation-plan sub-steps; `references/planning-protocol.md`; and the size
check. `specflow.develop-split` is the other half of this one change.

## Entities

- **READS:** the agreed dev spec and the business spec it `implements:`; the existing code the
  plan will touch; `.cortex/_index.md`; `cortex insight file|concept|element`;
  `.cortex/compass/rules/` including `check:` predicates; `.cortex/atlas/decisions/`.
- **WRITES:** the plan artefact — a Markdown file in the project's plan directory if one
  exists, else `plans/<YYYY-MM-DD>-<slug>.md` created at the project root.
- **CREATES:** the plan directory when absent. Nothing else; the plan proposes work, it does
  not perform it.

## Rules

1. **A plan is only a plan if a fresh agent could execute it blind.** Every task states the
   exact file paths, the change, the acceptance criterion it satisfies, and the command that
   verifies it. "Update the validator" is not a task.
2. **Bite-sized tasks.** Each task is roughly 2–5 minutes of work and leaves the project in a
   working state. A task that cannot be verified on its own is two tasks.
3. **Every task cites its criterion.** Each task names the spec acceptance criterion it
   satisfies. A task citing no criterion is either missing a criterion in the spec (route to
   `specflow-bugs` as Type 1) or is work nobody asked for.
4. **Every task names its verification command.** The exact command, not "run the tests".
5. **The plan artefact is durable and reviewable.** Written to the project's plan directory if
   one exists, else `plans/<YYYY-MM-DD>-<slug>.md`. It survives the session; it is not a
   message in a transcript.
6. **The size check lives here.** Whether the work fits one context, and where it splits, is a
   planning judgment: the plan decomposes, and `specflow-develop` executes and delegates. The
   heuristic migrated from develop's Step 3 (≤ 3 specs and ≤ 2,000 lines of relevant existing
   code → one executing agent; otherwise split) is preserved.
7. **Explore before planning, at the migrated depths.** The Explore step arrives unchanged from
   develop: insight-first for candidate files, direct reads at low depth, parallel exploration
   agents and the component diagram at Standard/Full, producing the exploration summary the
   plan is built on.
8. **Cortex awareness (Deep tier, `specflow.cortex-awareness` Rule 1).** Index-first;
   `cortex insight file|concept|element` for the files and concepts the plan will touch,
   carrying the trust caveat (inferred context, not authority — gated layers win); collect
   applicable compass rules including `check:` predicates and honour them in the plan; consult
   the atlas decisions for the touched domain.
9. **The plan does not implement.** No code is written by this skill. It hands the artefact to
   `specflow-develop`.
10. **Orchestration depth stays capped.** Until build-order-v3 step 11 (writer/verifier
    harness) ships, a plan whose execution would require Standard/Full recursive delegation is
    split into batches instead (standing authorities, plan §6).

## Acceptance Criteria

### An approved spec produces a durable task list

- **Given** an approved spec
- **When** plan runs
- **Then** it emits a durable plan artefact where every task cites the acceptance criterion it
  satisfies and the exact command that verifies it

### A task without a criterion is a signal, not a task

- **Given** a task with no acceptance criterion behind it
- **When** the plan is assembled
- **Then** the body routes it to `specflow-bugs` as a possible missing criterion rather than
  planning it silently

### The plan is executable blind

- **Given** the plan artefact
- **When** a fresh agent with no conversation history reads it
- **Then** the body requires exact paths and per-task verification such that no question needs
  asking, and states the fresh-agent test explicitly

### Tasks are bite-sized and individually verifiable

- **Given** the plan artefact
- **Then** the body requires ~2–5-minute tasks each leaving the project working, and states
  that an unverifiable task is two tasks

### The migrated planning content is present

- **Given** the shipped `skills/specflow-plan/SKILL.md` and its `references/`
- **Then** the Explore step, the exploration summary, the gap-analysis / research /
  implementation-plan sub-steps, the size check, and `references/planning-protocol.md` are all
  present in this bundle

### The plan writes nothing but the plan

- **Given** the shipped body
- **Then** it contains no instruction to write implementation code, and hands off to
  `specflow-develop`

### Cortex awareness at Deep tier

- **Given** the shipped body
- **Then** it instructs index-first reading, all three `cortex insight` verbs with the trust
  caveat, compass rules including `check:` predicates, and atlas decisions

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/specflow-plan/` is byte-identical to its `.claude/skills/`
  counterpart, and a fresh `cortex init` installs the bundle with its `references/`

## Notes

- **Engineering call recorded per standing authorities (plan-artefact location).** The plan
  doc names no output path. `.cortex/pulse/` was rejected — it is gitignored (RULES 15) and a
  plan must survive a clone; `.specflow/plans/` was rejected — it adds an unvalidated sibling
  inside spec-tree territory, which is schema surface and would need Pedro. The skill therefore
  writes to the project's existing plan directory, else creates `plans/`. Note for this repo:
  `plans_and_handoffs/` is itself gitignored (`.gitignore:27`), so Cortex's own plans are local
  working artefacts — that is Pedro's existing convention and this spec does not change it.
- Verification is atomic + spec tier (phrase-presence + packaging), per the standing
  convention in `specflow.cortex-awareness` Notes.
