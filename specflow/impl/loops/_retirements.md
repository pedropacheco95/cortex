# Retirements for the 4.0 task and skill set

**Read this when:** you are deciding what leaves with the 3.x loops and the old skills, or checking whether a behaviour survived.

This file is plan item 11. Part 1 lists the 16 specs the plan retires; they carry `status: retired` in this change. Part 2 lists every spec in `loops/` with the task that replaces it. Pedro retired the 10 it marks (sitting item 10); `loops.session-reading` stays. Part 3 names every behaviour with no new home, split into what an earlier decision drops and what the G2 sitting settled. Part 4 is what else moves.

**Scope.** A retirement applies to a 4.0 store. The old skills leave the package in Round 2 and installing or syncing removes them (P12), so a project still on a 3.x store keeps only the 3.x Core commands until its migration is accepted. Each retired spec keeps its `implements:` link, and its business spec keeps the `implemented_by:` line (`check.xref-symmetry`). `check.business-status` ignores retired implementers.

## Part 1. Retired by the plan

| Spec | New home | Lost (see Part 3) |
|---|---|---|
| `specflow.brainstorm-skill` | `specflow.spec-skill` (Iron Law, steps 1 and 7, Rule 7) | L1 |
| `specflow.plan-skill` | `specflow.spec-skill` (Waves, `test:` per criterion, *Today*) | D4, L2 |
| `specflow.develop-split` | quick path under the `## Specs` block; none as a skill | D2, D5 |
| `specflow.entry-gate` | routing sentence in the `## Specs` block (`store.managed-block`) | D1 |
| `specflow.review-pair` | `specflow.review-skill` | L3 |
| `specflow.tests-red-green` | none | D6 |
| `specflow.bugs-root-cause-gate` | none; a bug is a quick-path ticket; filing moves to `store.remember-skill` (P14) | D3 |
| `specflow.intent-reconcile` | `specflow.spec-skill` Rule 14 (every quoted ask maps to a criterion or an open question); `store.remember-skill` Rule 11 (verbatim capture from documents) | L5, closed by P16 |
| `specflow.reorg` | done work; `specflow.port` makes the next move and governs `src/paths.ts` | none |
| `specflow.cortex-awareness` | `MAP.md`, the managed block; the skills it edited are gone | none |
| `specflow.insight-awareness` | none needed: 4.0 has no insight layer | none |
| `specflow.store-v4-awareness` | the write gate and bug filing (P14) in `store.remember-skill`; Rule 9 (digest) in `store.remember-skill`; Rule 10 in `specflow.lint`; Rule 5 overturned by P12 and P15 (`cortex-register-tasks` stays) | L5, closed by P16: Rule 8's record is dropped |
| `archive.ingest-skill` | `store.remember-skill` source digest and spec requests (D16) | D7, L8 |
| `atlas.ingest-skill` | already superseded; same home | none beyond L8 |
| `insight.extract-skill` | none: dropped by decision 2026-10-14 | D8 |
| `loops.cortex-loop-bundle` | `cortex-learn`, `cortex-fresh`, `cortex-quality` by name | L9 |

## Part 2. Every spec in `loops/`

| Spec | Replaced by | What carries over | Decision |
|---|---|---|---|
| `loops.atlas-staleness` | fresh | Old cited decision → `aged` with `citedBy`; dead cross-ref → `check.links` | retired (L10) |
| `loops.bug-triage` | none | nothing | retired (D3) |
| `loops.cortex-loop-bundle` | the three skills | see Part 1 | **retired by the plan** |
| `loops.lint-scheduled` | quality | Validator pass → `cortex specs lint` in `## Specs` | retired (L11) |
| `loops.onboarding-drift` | fresh | Block version lag → `scaffolding`; `_index.md` signals have no subject in 4.0 | retired |
| `loops.rule-decay` | fresh | Dead `governs:` → `deadRules` on `match.paths` | retired (L12) |
| `loops.session-reading` | none: **keep** | `loops.learn-task` and `pulse.usage` depend on it | **keep** |
| `loops.skill-suggest` | none | already superseded into `pulse.distil`, itself superseded at 4.0 | retired (L13) |
| `loops.spec-drift` | quality | Newer governed file → rotation tie-break, then a fresh reviewer | retired (L14) |
| `loops.test-runner` | quality (runs and reports only) | Runs the suite; failures to `now/quality-failures.md` | retired (D9) |
| `loops.verify-scheduled` | quality | Criterion-to-test coverage through INDEX | retired (L15) |
| `loops.writer-verifier` | none | only consumer is test-runner | retired with test-runner (D9) |

**Beside `loops/`, already superseded at 4.0, nothing to do here:** `pulse.hygiene`, `pulse.distil`, `pulse.review-cli`, `pulse.threads`, `insight.refresh-loops`. `insight.session-observe` is partly superseded; its banner says `cortex-remember` does its capture at session end, and `cortex-learn` is now the backstop for that, so the banner wants one line added. All of them are reached through `cortex-loop`, whose removal ends them as scheduled work. They are not retired here.

## Part 3. Behaviours with no new home

### Dropped by a recorded decision

| # | Behaviour | Decision |
|---|---|---|
| D1 | The nine-category request classification and "no skill applies" as a stated routing act | decision log, Step 3 table: routing sentence replaces it |
| D2 | Two-stage per-task review and the five-round ladder, `BLOCKED` as a successful outcome, the definition of load-bearing | same table; C5, D2 |
| D3 | Root-cause-first bug diagnosis, the seven-type taxonomy, daily triage with fill-only classification | same table: a bug is a quick-path ticket |
| D4 | The plan file, 2–5 minute tasks, the size heuristic | S4, EGM replaces plan; the spec is the design document |
| D5 | Per-wave fresh implementer | C5 |
| D6 | Watch-the-test-fail-first, delete code written before its test, fake-test scan, the four-layer test generator | same table; C3 approved the drafts without it. Rule (a) checks only that a test changed |
| D7 | Type-routed ingestion (`archive/types/`), the yes/no change-plan gate | D16 |
| D8 | Insight extraction (scopes, recursion, fragments) | 2026-10-14 |
| D9 | Code-writing test-runner: tiers, classification gate, verified fix on a branch, five-field PR, case file, suppression; the writer/verifier harness | 10-20 draft; returns if `loops.quality-task` shows failures unfixed for more than a week |

D3 and D6 left `diagnoses-and-tests-mean-what-they-say` with nothing behind it; Pedro retired it (P13).

### Settled at the G2 sitting

| # | Behaviour | Was in | Outcome |
|---|---|---|---|
| L1 | One question per message; offer two or three approaches with a recommendation | `brainstorm-skill` Rules 2, 4 | accepted (item 11): `specflow-spec` lists options under *Open questions* |
| L2 | Collecting a rule's machine-checkable `check:` predicate into the work | `plan-skill` Rule 8 | accepted (item 11): 4.0 rules have no `check:` |
| L3 | Verifying a review received from someone else before applying it, disagreement settled by evidence | `review-pair` Rules 5, 6 | decided (item 9): one line in `specflow.review-skill`; the plan says receive-review is absorbed there, and its Rule 7 covers only its own findings |
| L4 | closed by P14: `store.remember-skill` files and closes bugs; fresh counts and ages open pitfalls (`openPitfalls`) | `store-v4-awareness` Rule 7, `bug-triage` | none |
| L5 | closed by P16: the red-test pin and the `change-request` record are dropped. `specflow.spec-skill` Rule 14 accounts for every quoted ask, `store.remember-skill` Rule 11 keeps its words, and `a-specific-ask-is-not-generalised-away` is folded into `nothing-is-built-before-it-is-agreed`. `archive.intent-register` and `check.archive-intent-register` stay live with no writer | `intent-reconcile`, `store-v4-awareness` Rule 8 | none |
| L6 | withdrawn: `specflow.port` now governs `src/paths.ts` | `reorg` `governs:` | none |
| L7 | closed by P12: the old skills leave the package in Round 2, and installing or syncing removes them | `store-v4-awareness` Rule 5 | none |
| L8 | Updating a document: diff against the prior version, find what was derived from it. A single register of documents | `archive.ingest-skill` Rules 7, 9 | accepted (item 11); the 2026-11-17 review checks whether facts or asks were lost (D16) |
| L9 | One Tier D listing entry: three skills cost more resident characters than one. `/cortex-loop <name>` as an entry | `cortex-loop-bundle` Rule 9 | accepted (item 11) |
| L10 | Archive candidates: old sources nothing references | `atlas-staleness` | accepted (item 11): `history/` never goes stale (S1) |
| L11 | Daily cadence for spec lint and coverage: a break now surfaces within a week, and at commit by `cortex check` | `lint-scheduled`, `verify-scheduled`, promised daily in the business spec | accepted (item 11); the business spec is amended |
| L12 | A rule with no `match.paths` has no decay signal; `source:` resolution has no 4.0 meaning | `rule-decay` | accepted (item 11) |
| L13 | Spotting a workflow repeated across sessions and proposing a skill | `skill-suggest`, then the `pulse.distil` skill lens | accepted (item 11) |
| L14 | A dated list of every suspect spec with its three readings. Rotation reviews five specs a week | `spec-drift` | accepted (item 11); the at-rest review reads more deeply |
| L15 | A journey test per business spec, scenario `covers:` completeness, "Deferred by decision" gaps, tests at their conventional paths | `verify-scheduled` | accepted (item 11): promises are outside the test check (P7), and tags replace the path convention. The old four-layer tree stops being checked by anything |

## Part 4. What else moves

**Business specs left with no live implementer.** `specflow/diagnoses-and-tests-mean-what-they-say` is retired (P13), and `specflow/a-specific-ask-is-not-generalised-away` is retired and folded into `nothing-is-built-before-it-is-agreed` (P16). A spec serves one promise, so the sitting's re-point (item 12) could not happen as written. Pedro settled the rest at item 31 (2026-11-05): fold all seven. Six are retired, and each keeps its `implemented_by:` list as a record:

| Promise | Folded into | What is kept | What is not |
|---|---|---|---|
| `specflow/craft-review-never-substitutes-for-a-test` | `nothing-is-built-before-it-is-agreed`, Rules 8 to 10 | Tests decide correctness; a finding's shape; checking a review received | Craft advice on naming and structure |
| `specflow/developer-gets-spec-work-grounded-in-project-memory` | `nothing-is-built-before-it-is-agreed`, Rule 7 | A spec session starts from what the project holds | Generated tests that carry conventions (D6) |
| `atlas/developer-turns-raw-sources-into-project-memory` | `store.agent-has-knowledge-when-it-needs-it`, Rule 9 | Digest, untouched original, facts naming their source | Refresh on a second hand-over (L8) |
| `loops/developer-gets-test-failures-fixed-or-explained` | `developer-knows-the-specs-stay-sound`, Rule 6 | Failures are reported, dated, until they pass | The fix, the case file, the classification (D9) |
| `compass/developer-gets-bugs-triaged-without-asking` | `developer-gets-upkeep-proposals-without-asking`, Rule 5 | A filed bug is counted, aged and closed only on evidence | Daily classification and its second opinion (D3) |
| `loops/developer-trusts-changes-the-system-writes` | `developer-gets-upkeep-proposals-without-asking`, Rule 6 | Nothing scheduled changes code, tests or specs | The worker, the blind judge, verified proposals (D9) |

Not folded: `anatomy/contributor-gets-a-legible-codebase`. Its outcome is a map built from the code with no hand-written documentation. Its banner names the insight layer as the home, and 4.0 has none (D8). The store holds what the code can't say, which is the opposite outcome, so no live promise can carry it. It stays as it is until Pedro rules.

**Live specs with `depends_on` a retired spec.** Ids still resolve, so nothing breaks: `schema.version-2` → `reorg`; `archive.intent-register`, `provenance.frontmatter-check` → `archive.ingest-skill`; `insight.refresh-loops`, `insight.session-observe` → `insight.extract-skill`.

**Code.** No code changes here. A retired spec may still `governs:` live code: `src/loops/*`, `src/harness/**` and `src/archive/*` serve 3.x stores and their CLI verbs stay. The plan removes skills, not these. Removing them belongs with the release that retires 3.x, and is not in this batch.

**Skills.** Installing or syncing removes the old skills and updates everything (P12); `core-cli.sync` is amended by Session 2 for that. `cortex-register-tasks` is not among them: it stays as the tenth skill and the main route, `cortex tasks register` is the app-quit fallback, and sync writes the task prompts and only prints `/cortex-register-tasks` when tasks are unregistered (P15; `core-cli.tasks-register` Rules 12, 17 and 18). `cortex migrate --accept` still lists superseded bundles (`store.migrate` Rule 18).

**Round 2 tests.** Tests that pin retired behaviour go with the skills, last (plan section 7). Beyond the five files the plan names, these name retired skills: everything under `tests/atomic/specflow/` and `tests/spec/specflow/` for the retired specs, `tests/atomic/core-cli/skill-additions.test.ts`, `tests/atomic/core-cli/retired-bundles.test.ts`, `tests/atomic/hooks/session-start.test.ts`, and `tests/spec/core-cli/sync-retirement.spec.test.ts`.
