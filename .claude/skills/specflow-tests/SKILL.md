---
name: specflow-tests
description: 'Generate and run the four-layer test suite. "write tests", "generate tests from specs".'
---

# Specflow Testing

## When to use

Complete testing framework for Specflow projects. Builds the test infrastructure first, then
generates tests across four layers (Atomic, Spec, Journey, Scenario) via delegated agents per
domain, then hands off to a separate verification agent that runs all tests, performs
adversarial quality checks, and loops until everything passes. A test that does not execute is
not a test. Use this skill for: generating tests from specs, setting up test infrastructure,
creating test fixtures, designing scenario tests, running test suites, or auditing coverage.

## The Iron Law

NO TEST ENTERS THE SUITE UNTIL IT HAS BEEN WATCHED FAILING FOR THE RIGHT REASON

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this test does not need watching, that construction is the violation.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## Core Principle

**A test that does not execute is not a test.** A test file that exists but throws on
import, crashes on setup, or stubs its assertions with `expect(true).toBe(true)` is
documentation, not a test. Testing is not complete until every test runs, passes or
fails for legitimate reasons, and the verification agent confirms quality.

**A test that has only ever been seen passing is not yet evidence.** Green tells you nothing
on its own: the test may be right, may assert nothing, or may be exercising a different path
than the one it names. All three look identical from the outside. The one cheap moment to tell
them apart is before the implementation exists — see *Watch it fail correctly* below.

## Agent Architecture

This skill delegates to three types of agents. Each has a distinct scope and context.

| Agent | Context contains | Does NOT contain | Spawned by |
|---|---|---|---|
| Infrastructure agent | Project stack, package files, configs | Specs, test files | Orchestrator |
| Generation agent (per domain) | That domain's specs + fixtures + conventions | Other domains, test results | Orchestrator |
| Verification agent | Test files + spec tree | Generation context, fixture internals | Orchestrator |
| Blind reader (per domain per layer) | Test files only | Specs, fixtures, generation context | Verification agent |

**The verification agent is separate from the generation agents.** It reads the tests
with fresh eyes — it wasn't involved in writing them. The blind reader sub-agents it
spawns have even less context — they see only the test code, nothing else.

## Cortex Awareness

When the project has a `.cortex/` directory, read the knowledge layer before generating
(skip this section cleanly when `.cortex/` is absent):

1. **Compass rules become test assertions (design §8.4 bridge 1).** Before generating
   tests for a spec, read the compass rules that apply to it: the rule IDs in the
   spec's `governed_by:` frontmatter plus any `.cortex/compass/rules/R-*.md` whose
   `governs` globs match the spec's governed files. **Incorporate each rule's `check:`
   predicate into the generated atomic and spec tests** — the predicate (regex / grep /
   AST pattern with `expect: absent|present`) becomes an executed assertion over the
   governed files, not a comment.
2. **Insight for the governed files.** Run `cortex insight file <path>` for the
   governed files of the spec under test (matched via the spec's `governs:` globs,
   when `.cortex/insight/` exists); the entries' Purpose lines tell generation agents
   what each file does without whole-file reads.
3. **Layout conventions.** The four-tier layout (atomic/spec/journey/scenario) and the
   scenario `covers:` mechanism follow cortex-schema §3 and §4.8 — generated files must
   land in that layout, and every scenario spec must carry a resolvable `covers:` list.
4. **Verification output home (design §8.5).** The verification report lands at
   `.cortex/pulse/reports/verification.md` — never `tests/verification-report.md`. The
   pulse directory is where transient process outputs live and where the scheduled
   specflow-verify loop expects to find it.
5. **Insight queries (when `.cortex/insight/` exists).** Before generating tests, run
   `cortex insight concept <name>` for the domain under test (e.g.
   `cortex insight concept testing` for recorded testing conventions, plus the spec's
   own domain concept) and `cortex insight file <path>` for each module being tested —
   the per-file entry (purpose, main players, connections) tells generation agents
   what to exercise without whole-file reads. Both support `--json`. Insight is
   inferred context, not authority — the gated compass rules and their `check:`
   predicates (step 1) and the specs still govern; they win on conflict. If
   `.cortex/insight/` is absent or a query returns nothing, generate without it —
   never block on missing insight.

## How It Works: Five Phases

### Phase 0: Build Test Infrastructure

**Before writing any test, build the platform that runs them.** Spawn an infrastructure
agent that:

1. **Reads the project stack.** Language, framework, test runner, ORM, frontend framework,
   package manager, monorepo layout.

2. **Creates test runner configuration.** Jest with correct presets (`jest-preset-angular`
   for Angular, `ts-jest` for TypeScript, JSDOM for frontend), or Vitest, pytest, RSpec —
   whatever the project uses. Separate configs per layer if needed.

3. **Creates the integration harness.** Database setup/teardown, API server bootstrap
   (real Strapi test instance, Express test server, etc.), container orchestration. The
   harness must actually start and stop the server — not throw a placeholder error.

4. **Creates fixture factory infrastructure.** Base classes, helper functions, seed
   script runners. Actual fixture data comes in Phase 2.

5. **Writes and runs smoke tests.** One trivial test per layer:
   - Atomic: `test('smoke', () => expect(1+1).toBe(2))`
   - Spec: same, using the integrated config
   - Journey: bootstrap harness, hit one endpoint, assert response, teardown
   - Scenario: same as journey with full sandbox config

   **All smoke tests must pass before proceeding.** If the journey smoke test can't
   bootstrap the server, fix the harness. If the Angular smoke test can't resolve
   `@angular/core`, fix the Jest config. Do not proceed until all 4 pass.

### Phase 1: Gather Information and Design Test Data

Two agents in parallel:

**Agent 1 — Read specs:** Dev specs (rules, criteria, entity references), business specs
(outcomes, journey steps, `implemented_by:`).

**Agent 2 — Read code:** Model/migration/schema files for field names, types, constraints,
defaults, relationships. Specs only reference entity NAMES — the code has the fields.

Then four passes to produce test data (see `references/test-data-architecture.md`):
entity inventory (from code), state catalog (from specs), relationship graph (from both),
temporal state map (from journey/scenario steps). Generate fixture factories and seed
scripts wired into the Phase 0 infrastructure.

### Phase 2: Generate Tests (parallel, per domain)

Spawn one generation agent per domain. Each receives that domain's specs, the fixture
factories, the test conventions, and the infrastructure config.

#### What each layer tests

**Atomic** — One test per acceptance criterion. Mocked dependencies. Tests one
Given/When/Then in isolation.

**Spec** — Tests the dev spec as a whole. NOT a sequential replay of criteria. Verifies:
- **Rule interactions** — do the rules work together?
- **Entity reference accuracy** — does code actually read/write the claimed entities?
- **Implementation completeness** — does code implement ALL numbered rules?
- **State accumulation** — after multiple operations, is cumulative state consistent?

A spec test that replays criteria in sequence is wrong — it duplicates the atomic layer.
Spec tests use integrated dependencies (real slice, mocked externals beyond the boundary).

**Journey** — Follows a business spec's User Journey end-to-end with real infrastructure.
Each step touches a different dev spec's slice.

**Scenario** — A realistic workflow crossing multiple business specs. Full sandbox. Every
business spec must appear in at least one scenario's `covers:` list.

#### Watch it fail correctly

Every new test is run **before** its implementation exists, and its failure is read.

1. Write the test.
2. Run it. It must fail.
3. **Read the failure message.** Is this the failure the test exists to produce — the assertion
   you wrote, failing on the value you meant to check?
4. Only then write the implementation.

Step 3 is the whole mechanism, and it is the step that gets skipped. "It failed" is not the
observation; *why* it failed is. A test that fails on any of these is **broken, not red**:

- `Cannot find module` / import error — the test never ran
- `undefined is not a function` — a misspelled symbol or an unbuilt export
- a fixture or factory that does not exist
- a crash in `beforeEach` / setup, before the assertion is reached
- a failure in a *different* assertion than the one under test

A broken test goes green the moment you fix the breakage — regardless of whether the behaviour
is right. It has proved nothing, and it will sit in the suite forever looking like it has.
Fix the test, re-run it, and observe the *right* failure before moving on.

**Delete premature code.** If implementation code was written before its test, delete it and
rewrite it after the test is red. Do not keep it, do not adapt it, do not "use it as a starting
point". Code that already exists pulls the test toward describing what the code does rather
than what the spec requires — you will write an assertion that passes on the first run and
learn nothing. Deleting twenty lines you already wrote feels wasteful; shipping a suite that
agrees with the implementation by construction is what it costs to avoid it.

**Record the observation.** For each generated test, the verification report notes that it was
watched failing for the right reason before it went green. A test that was only ever seen
passing is reported as **unverified**, not silently counted as covered.

| Thought/Excuse | Reality |
|---|---|
| "The code already exists, so writing the test first is pointless." | Then the test is being written to agree with the code, which is the failure mode, not an exception to it. Delete the code or accept that this test verifies nothing but its own consistency. |
| "It failed, that's good enough — I don't need to read why." | Half of first-run failures are import errors, typos, and missing fixtures. You are one `Cannot find module` away from a test that goes green on a fix that has nothing to do with the behaviour. |
| "Running it twice is slow." | Run the one test, not the suite. The second run is the only evidence you will ever get that the assertion can distinguish right from wrong. |
| "The assertion is obviously correct." | Obviously-correct assertions are how `expect(result).toBeDefined()` ends up guarding a function that returns the wrong value. Obvious to you is not the same as sensitive to the bug. |
| "Deleting working code to rewrite it is wasteful." | The code is not working — nothing has verified it. You are protecting an unverified artefact at the cost of the only mechanism that would have verified it. |

#### Rules for generation agents

- Use fixtures and harness from Phases 0 and 1. No inline mock setup that bypasses infra.
- Watch every new test fail for the right reason before implementing against it (above).
- Every test must have real assertions. `expect(true).toBe(true)` is forbidden.
- If a test cannot be written because infrastructure doesn't support it (e.g., needs
  Playwright), do NOT write a stub. Flag the gap: "criterion X needs [capability]."
- If a spec is `status: draft`, either write real tests that will fail until code exists
  (TDD), or don't write the test and report the gap honestly. Never write a skip/stub.

### Phase 3: Execute, Verify, and Fix (verification agent)

**Hand off to a separate verification agent.** The orchestrator does not verify its own
work. The verification agent receives: all test files, the spec tree, and the test
runner configuration. It did NOT participate in generating the tests.

The verification agent runs a loop:

#### 3a. Execute all tests

Run every test. Classify results:

| Result | Meaning | Action |
|---|---|---|
| Pass | Assertions hold | Done |
| Fail — assertion | Legitimate failure (code bug or spec wrong) | Document, do NOT make test pass |
| Fail — execution | Test crashes (import, setup, teardown) | Fix the test |
| Fail — infrastructure | Harness won't start, DB unavailable | Phase 0 incomplete — report back |
| Skip | Marked as skip | NOT counted as coverage |

**Exit criterion:** Zero execution failures, zero infrastructure failures.

#### 3b. Fake test scan

Scan every test file for forbidden patterns (see `references/verification-protocol.md`):
`expect(true).toBe(true)`, empty bodies, skip markers, TODO/FIXME, `pass` as only
statement. **Any hit = FAIL. No exceptions.** Not for "documented stubs," not for
"audit tests," not for "will be wired later."

If the test can't have real assertions, the correct action is to delete it and report
the coverage gap honestly.

#### 3c. Coverage completeness

Four invariants. **Only executing tests with real assertions count.**

```
Atomic: [N]/[N] criteria covered by executing tests
Spec: [N]/[N] dev specs covered
Journey: [N]/[N] business specs covered
Scenario: [N]/[M] business specs in executing scenario covers:
Gaps: [list — what's not covered and why]
```

Honest gaps are acceptable. Counting stubs or skips as coverage is FAIL.

#### 3d. Adversarial quality check (100% — not sampled)

The verification agent spawns blind reader sub-agents — one per domain per layer. Each
blind reader receives ONLY the test files for its scope — NO access to specs, fixtures,
or generation context.

**Atomic blind reader:** Describes what each test sets up, does, and asserts.
Comparator checks against the criterion's Given/When/Then. Catches: wrong boundary
values, insufficient assertions, mismatched state.

**Spec blind reader:** Describes what invariants and rules the test exercises, what
entity writes it checks. Comparator checks: does it exercise ALL numbered rules? Does
it verify entity writes? Is it a criteria replay? **If the test looks like "criterion 1,
then 2, then 3 in order" — FLAG AS WRONG.**

**Journey blind reader:** Describes the journey steps and infrastructure used.
Comparator checks: does each step match the business spec journey? Real infra or mocked?
Outcome verified at each step? Any `jest.mock` in a journey test = suspect.

**Scenario blind reader:** Describes which outcomes each step exercises. Comparator
checks: does each step reach the claimed business outcome, or just touch an endpoint?
`POST /bookings` without asserting a booking was created = false coverage.

**Every test is checked. Not a sample.**

#### 3e. Fix and re-verify

If any check fails:
1. Fix execution errors (rewrite broken tests)
2. Remove or rewrite fake tests (delete stubs, report gaps honestly)
3. Fix adversarial mismatches (correct assertions, redesign criteria-replay spec tests)
4. Re-run from 3a

**Loop until all checks pass.**

#### 3f. Verification report

The verification agent writes `.cortex/pulse/reports/verification.md`:

```markdown
# Test Verification Report

## Execution results
- Total tests: [N]
- Passed: [N]
- Failed (assertion — legitimate): [N]
- Failed (execution — test error): [N] ← must be 0
- Failed (infrastructure): [N] ← must be 0
- Skipped: [N] (NOT counted as coverage)

## Fake test check
- Files scanned: [N]
- Clean: [N]
- Failures: [list] ← must be 0

## Red-first observation
- Watched failing for the right reason before implementation: [N]
- Unverified (only ever seen passing): [list] ← reported, never silently counted as covered

## Coverage completeness
- Atomic: [N]/[N] criteria covered by executing tests
- Spec: [N]/[N] dev specs covered
- Journey: [N]/[N] business specs covered
- Scenario: [N]/[M] business specs in executing scenario covers:
- Gaps: [list with justification]

## Adversarial quality check (100%)
- Atomic: [N] checked, [N] correct, [N] mismatches
- Spec: [N] checked, [N] correct, [N] criteria-replay flagged
- Journey: [N] checked, [N] correct, [N] mock leakage
- Scenario: [N] checked, [N] correct, [N] false coverage

## Verdict: PASS / FAIL
```

**PASS requires:** zero execution errors, zero fake tests, zero adversarial mismatches.
Coverage gaps are acceptable if honestly reported with justification.

### Phase 4: Report

Final output: the verification report from Phase 3 (after PASS), placed at
`.cortex/pulse/reports/verification.md`. The orchestrator presents it to the human.

## Test Output Structure

```
tests/
├── jest.config.ts (or vitest.config, pytest.ini, etc.)
├── setup/
│   ├── harness.ts
│   ├── db-setup.ts
│   └── smoke.test.ts
├── fixtures/
│   ├── factories/
│   └── seeds/
├── atomic/{domain}/{capability}/{leaf}.test.{ext}
├── spec/{domain}/{capability}/{leaf}.test.{ext}
├── journey/{business-domain}/{outcome}.test.{ext}
├── scenario/
│   ├── specs/{scenario-name}.md
│   └── {scenario-name}.test.{ext}
└── docker-compose.test.yml
```

The verification report is not part of the `tests/` tree — it lands at
`.cortex/pulse/reports/verification.md` (design §8.5).

## The Coverage Constraint

**Every business spec must appear in at least one executing scenario's `covers:` list.**
A scenario that exists as a file but doesn't run doesn't count.

## Reference Files

| File | Read when |
|---|---|
| `references/test-data-architecture.md` | Phase 1 — fixture generation |
| `references/test-layers.md` | Phase 2 — layer rules, naming, structure |
| `references/scenario-design.md` | Phase 2 — scenario design, coverage |
| `references/verification-protocol.md` | Phase 3 — full verification process |
| `references/environment-provisioning.md` | Phase 0 — infrastructure setup |
