---
id: specflow.brainstorm-skill
status: implemented
depends_on:
  - specflow.cortex-awareness
  - discipline.hardening-convention
implements: ../../specs-business/specflow/nothing-is-built-before-it-is-agreed.business.md
governed_by: []
governs:
  - "skills/specflow-brainstorm/**"
---

# `specflow-brainstorm` — the spec-first front of the spine

## Intent

Plan §3 item 3.1: the first stop in the `brainstorm → plan → develop` spine. It takes a
half-formed idea and produces an **agreed design that lands as a spec** — not a dated design
document. That terminal state is what makes this the spec-first skin over the superpowers
brainstorm mechanism rather than a copy of it: superpowers' brainstorm ends at a design doc
because its profile has no spec tree; specflow's ends at `.specflow/specs/` because that is
where this profile keeps agreements.

The mechanisms grafted (plan §2): HARD-GATE, one-question-at-a-time, 2–3 approaches with a
recommendation, and a scope check that decomposes an over-large ask before exploring it.

## Entities

- **READS:** `.cortex/_index.md`; existing specs in both trees that neighbour the idea (to
  find out whether this is new behaviour or a change to agreed behaviour); `.cortex/atlas/
  decisions/` for decisions that already constrain the area; `.cortex/compass/rules/` for
  rules the idea would violate; `cortex insight` for the surrounding code where it exists.
- **WRITES:** nothing directly. The agreed design is handed to `specflow-spec-editor`, which
  owns spec files (RULES: spec edits route through spec-editor).
- **CREATES:** nothing itself. Downstream, via spec-editor: a dev spec under
  `.specflow/specs/` and the business spec it `implements:` if that outcome is not yet
  articulated. Optionally an `.cortex/atlas/decisions/` entry for the narrative of *why* this
  approach was chosen over the alternatives.

## Rules

1. **HARD-GATE: no implementation until the design is agreed and a spec exists.** The gate
   carries the "this one is too simple to need a spec" anti-pattern paragraph.
2. **One question at a time.** One question per message, multiple-choice where the options are
   genuinely enumerable. A batch of questions is a way of avoiding the decision about which
   question matters, and it reliably produces answers to the easy ones only.
3. **Scope check first.** Before exploring, assess whether the ask is one behaviour or several.
   An ask that spans several behaviours is decomposed and the pieces are named, so the
   conversation is about one of them at a time (RULES 13: one behaviour per leaf spec).
4. **Two or three approaches, with a recommendation.** Real alternatives with their trade-offs,
   not one plan and two strawmen — and the skill states which it would choose and why. A
   recommendation is not a decision: the developer chooses.
5. **Terminal state is a spec.** The agreed design is handed to `specflow-spec-editor` to
   create or update the dev spec and, if missing, the business spec it implements. The skill
   does **not** write a dated design document under `docs/` — that is the superpowers
   profile's artefact, and producing both is how the two trees drift.
6. **Existing agreements are surfaced, not overwritten.** When the idea touches behaviour an
   existing spec already governs, or contradicts a recorded atlas decision or compass rule,
   the skill says so before proposing approaches. Silently re-deciding a recorded decision is
   the failure this rule exists to prevent.
7. **Rationalization table.** A `| Thought/Excuse | Reality |` table answering the excuses that
   defeat the gate: the user already knows what they want, it is a one-line change, asking
   questions is slow, they said "just do it", the design is obvious from the request.
8. **Cortex awareness (Moderate tier, `specflow.cortex-awareness` Rule 1).** Index-first;
   read the atlas decisions and compass rules bearing on the area before proposing; use
   `cortex insight` for the surrounding code where it exists, with the trust caveat (inferred
   context, not authority — the gated layers win).

## Acceptance Criteria

### No code before an agreed design and a spec

- **Given** "let's build X" in a specflow project
- **When** brainstorm runs
- **Then** the body forbids writing implementation code until the design is agreed and a spec
  exists, and states this as an explicit HARD GATE

### Questions arrive one at a time

- **Given** an idea with several open decisions
- **When** the skill explores it
- **Then** the body requires one question per message, preferring multiple choice, and states
  why a batch of questions fails

### An over-large ask is decomposed before exploration

- **Given** an ask spanning several behaviours
- **When** the scope check runs
- **Then** the body requires naming the pieces and taking them one at a time rather than
  exploring the whole

### Approaches come with a recommendation

- **Given** a scoped idea
- **When** the skill proposes approaches
- **Then** the body requires two or three real alternatives with trade-offs plus a stated
  recommendation, and states that the developer chooses

### The terminal state is a spec, not a design doc

- **Given** an agreed design
- **When** brainstorm finishes
- **Then** the body hands off to `specflow-spec-editor` for the dev spec and its business
  spec, and contains no instruction to write a dated design document

### Existing agreements are surfaced first

- **Given** an idea that contradicts a recorded atlas decision or an existing spec
- **When** brainstorm runs
- **Then** the body requires surfacing the conflict before proposing approaches

### The rationalization table answers the gate's excuses

- **Given** the shipped body
- **Then** it carries a `Thought/Excuse` → `Reality` table with at least the five Rule-7
  excuses answered

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/specflow-brainstorm/` is byte-identical to its
  `.claude/skills/` counterpart, and a fresh `cortex init` installs the bundle

## Notes

- Verification is atomic + spec tier (phrase-presence + packaging), per the standing
  convention in `specflow.cortex-awareness` Notes.
- The insight-query contract for this skill lives here rather than in
  `specflow.insight-awareness`, whose ACs describe the specific set of bodies edited in that
  earlier pass. That spec's Notes record the extension.
