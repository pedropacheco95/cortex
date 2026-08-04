---
id: discipline.verification-skill
status: implemented
depends_on:
  - core-cli.init
implements: ../../specs-business/discipline/the-developer-can-trust-done.business.md
governed_by: []
governs:
  - "skills/verification-before-completion/**"
---

# `verification-before-completion` — the evidence gate before any completion claim

## Intent

A Bucket-2 discipline primitive both process profiles invoke (plan §1, §3 item 1.1): before an
agent claims work is complete, correct, fixed, or passing, it must hold evidence produced in
the current turn that the claim is true. The skill is a gate function plus two tables — a
claim→required-evidence table that says what counts, and a rationalization table that answers
the excuses an agent generates when it wants to skip the gate.

The mechanism is grafted from Superpowers, not vendored: the Iron Law and rationalization-table
technique are transplanted into a skill written in Cortex's own voice, using Cortex commands
(`pnpm test`, `cortex validate`) and Cortex paths. The upstream skill is not copied.

This skill is process-agnostic by construction. Nothing in it may require a spec tree to exist.

## Entities

- **READS:** nothing from the knowledge layer as a precondition — the gate operates on the
  agent's own pending claim and the evidence it can produce by running a command. It may read
  `.cortex/compass/` rules when a project-specific verification command is recorded there.
- **WRITES:** nothing. The skill produces a decision (claim allowed / must verify first /
  claim must be narrowed) and, on the verify path, the cited command output in the agent's
  own report.
- **CREATES:** nothing.

## Rules

1. **The Iron Law is one line and inviolable.** The skill body opens with
   `NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE`, immediately followed by the
   letter-and-spirit clause that pre-blocks loophole-lawyering, per the
   `skills/_conventions/hardening.md` recipe (`discipline.hardening-convention`).
2. **Fresh means this turn, after the last change.** Evidence produced before the most recent
   edit is evidence about a state that no longer exists. A test run from earlier in the session
   does not discharge the gate.
3. **The gate is a function, not a vibe.** The body states an explicit procedure: name the
   claim → look it up in the claim→evidence table → check whether that evidence exists from
   this turn → if not, obtain it before speaking; if it cannot be obtained, narrow the claim to
   what is actually supported and say what was not verified.
4. **The claim→evidence table is explicit.** At minimum it covers: "tests pass" → the test
   command run this turn with its output; "the bug is fixed" → the failing case re-run and now
   passing; "it builds" → the build command run this turn; "the spec/schema is valid" →
   `cortex validate` run this turn; "I didn't change X" → the diff inspected.
5. **A rationalization table is mandatory.** A two-column `| Thought/Excuse | Reality |` table
   listing the excuses that actually defeat this gate under pressure — "it's a trivial change",
   "the tests passed earlier", "it obviously works", "the user is waiting", "I'll verify at the
   end" — each with its rebuttal. This is the enforcement engine, not decoration.
6. **Narrowing is the escape hatch, not skipping.** When evidence genuinely cannot be obtained
   (no test exists, the environment is unavailable), the skill directs the agent to state the
   limit explicitly. It never authorises an unqualified claim.
7. **No profile dependency.** The body must not require `.specflow/`, a spec tree, or any
   Bucket-3 artefact to run. Cortex-layer reads are optional enrichment only.
8. **Package + local in lockstep.** The bundle ships from the package `skills/` directory and
   the project-local `.claude/skills/` copy is byte-identical, per `specflow.cortex-awareness`
   Rule 3's convention extended to non-`specflow-*` bundles.

## Acceptance Criteria

### The Iron Law and its letter-and-spirit clause are present

- **Given** the shipped `skills/verification-before-completion/SKILL.md`
- **When** its body is read
- **Then** it contains the line `NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE` and,
  after it, the clause stating that violating the letter is violating the spirit

### The gate requires fresh evidence before a "tests pass" claim

- **Given** an agent about to claim "tests pass"
- **When** it has not run the test command in the current turn
- **Then** the skill requires it to run the command and cite the output before making the claim

### The claim→evidence table covers the named claim kinds

- **Given** the shipped body
- **When** its claim→evidence table is checked
- **Then** it maps at least the five Rule-4 claim kinds to the evidence each requires

### The rationalization table answers the pressure excuses

- **Given** the shipped body
- **When** its rationalization table is checked
- **Then** it is a two-column `Thought/Excuse` → `Reality` table containing at least the five
  Rule-5 excuses, each with a rebuttal

### An unverifiable claim is narrowed, not skipped

- **Given** a claim whose evidence cannot be obtained in the current environment
- **When** the gate runs
- **Then** the body directs the agent to narrow the claim and state what was not verified,
  and contains no instruction permitting an unqualified claim

### The skill runs without a spec tree

- **Given** the shipped body
- **When** it is checked for Bucket-3 preconditions
- **Then** no step requires `.specflow/`, a spec, or a process-profile artefact to exist

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/verification-before-completion/` is byte-identical to its
  `.claude/skills/` counterpart, and a fresh `cortex init` installs the bundle

## Notes

- Verification is atomic + spec tier only: phrase-presence assertions over the shipped body
  plus the packaging conformance check. Behavioural verification that an agent actually honours
  the gate in a live session is journey-tier, deferred post-v1 per the standing convention
  (same acknowledgement as `specflow.cortex-awareness` Notes). The plan's §0 "Cut" removed the
  behavioural eval harness that would have closed this gap; phrase-presence is the agreed
  substitute.
- The skill is deliberately not named `specflow-*`: the prefix denotes the spec-first profile,
  and this bundle belongs to neither profile exclusively.
