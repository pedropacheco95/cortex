---
id: specflow.entry-gate
status: implemented
depends_on:
  - specflow.cortex-awareness
  - core-cli.init-profile
  - hooks.session-start
  - discipline.hardening-convention
implements: ../../specs-business/specflow/nothing-is-built-before-it-is-agreed.business.md
governed_by: []
governs:
  - "skills/specflow-entry/**"
---

# `specflow-entry` — the process gate above the profile

## Intent

Plan §3 item 5.2, authorised 2026-08-05. `specflow-change-router` was doing gate work under a
routing name. "Change router" describes half the job — it implies the input is a *change*, so a
question, an exploration, or a stakeholder "why does this exist" reads as out of scope, and the
skill quietly stops being the entry point it claims to be in its own description ("this skill
runs first — no exceptions").

The rename to `specflow-entry` matches the name to the job, and the content gains the two things
that make a gate hold rather than merely exist: an explicit **priority rule** (process skills
before implementation skills) and a **rationalization table** answering the excuses that get it
skipped. The classification machinery — the two-tree model, the nine categories, the three axes,
the Cortex-module awareness — is unchanged.

The gate is re-armed each session by a line in the SessionStart payload (`hooks.session-start`,
schema §5). That line is a **pointer, not enforcement**: hooks warn-never-block (RULES 6).

## Entities

- **READS:** unchanged — both spec trees, `_overview.md` folder docs, the Cortex module indexes
  (`compass/`, `atlas/`, `insight/`) as part of classification.
- **WRITES:** nothing. It classifies and routes; the skill it routes to does the work.
- **CREATES:** nothing.

## Rules

1. **The bundle is `skills/specflow-entry/`.** A rename, not a rewrite: the directory moves with
   `git mv` and the `references/` and `evals/` files travel with it. No redirect stub is left —
   the old name never shipped to an external user, and a stub would be a second entry point,
   which is exactly what a gate must not have.
2. **Iron Law.** The body opens with `FIND AND RUN THE RIGHT SKILL BEFORE DOING THE WORK
   YOURSELF`, followed by the letter-and-spirit clause.
3. **Process before implementation.** The body carries an explicit priority rule: when more than
   one skill could apply, the process skill runs first, because an implementation skill run
   first has already decided the question the process skill existed to answer. The rule is
   stated as a table mapping situation → what runs first → what follows.
4. **"No skill applies" is a routing decision.** The body requires stating it explicitly when it
   is the answer. Arriving there silently is indistinguishable from never having classified.
5. **The gate routes; it does not do the downstream work.** Unchanged from the router's existing
   boundary, restated so the rename cannot be read as widening scope.
6. **Rationalization table.** Answers the excuses that defeat an entry gate: too small to
   classify, I already know which skill, the user said just do it, I'll classify after reading
   the code, no skill fits perfectly, it's a question not a change.
7. **The classification contract is preserved verbatim** — the two-layer spec model, the three
   classification axes, all nine categories, the enforced rules, the post-change test trigger,
   the output template, and the Deep-tier Cortex-module awareness
   (`specflow.cortex-awareness` Rule 1).
8. **Every reference moves with it.** Other skills, both spec trees, the test bundle lists, the
   design and build-order documents, and this repo's CLAUDE.md name `specflow-entry` after this
   change; no tracked file still routes a reader to `specflow-change-router`.

## Acceptance Criteria

### The gate runs first, and says so

- **Given** any request in a specflow project
- **When** a session starts
- **Then** the SessionStart payload carries the entry line, and the body's Iron Law requires
  classifying before doing the work

### Process skills outrank implementation skills

- **Given** a request that more than one skill could serve
- **When** the gate classifies it
- **Then** the body requires the process skill to run first, and gives the situation → first →
  next mapping for at least brainstorm, plan, bugs, and verification

### "No skill applies" is stated, not assumed

- **Given** a request no skill fits
- **Then** the body requires saying so explicitly as a routing decision

### The rationalization table answers the gate's excuses

- **Given** the shipped body
- **Then** it carries a `Thought/Excuse` → `Reality` table with at least the six Rule-6 excuses
  answered

### The classification machinery survived the rename

- **Given** the shipped `skills/specflow-entry/SKILL.md`
- **Then** the two-layer spec model, the three axes, all nine categories, the enforced-rules
  section, the post-change test trigger, the output template, and the Cortex Awareness block
  are all still present, and `references/impact-analysis.md` still ships in the bundle

### No tracked file still points at the old name

- **Given** the repository after this change
- **When** it is searched for `specflow-change-router`
- **Then** the only matches are historical records — the design and build-order documents and
  archived atlas sources — and no skill, spec, test, index, or CLAUDE.md routes a reader there

### Package and local copies are identical

- **Given** the round's final state
- **Then** every file under `skills/specflow-entry/` is byte-identical to its `.claude/skills/`
  counterpart, and a fresh `cortex init` installs the bundle with its `references/`

## Notes

- The gate mechanism is Bucket-1 in the plan's three-bucket table (§1) — "the gate mechanism"
  is listed under Cortex Core — while *this* gate's content is spec-first and therefore
  Bucket-3. The resolution: the **mechanism** (a SessionStart line that re-arms "find the right
  skill first") lives in Core and is profile-scoped; the **skill it points at** is the profile's.
  A future `superpowers` profile supplies its own gate skill and the same mechanism points at
  that instead.
- Verification is atomic + spec tier (phrase-presence + packaging + the hook's own tests), per
  the standing convention in `specflow.cortex-awareness` Notes.
