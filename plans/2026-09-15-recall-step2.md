# Plan — recall work, step 2: `bears_on`, schema clauses, evidence, the recall index (schema 3.4)

Date: 2026-09-15
Specs (new, draft): `.specflow/specs/schema/schema-clauses.spec.md` (`schema.schema-clauses`),
`.specflow/specs/schema/bears-on.spec.md` (`schema.bears-on`),
`.specflow/specs/atlas/evidence.spec.md` (`atlas.evidence`),
`.specflow/specs/recall/recall-index.spec.md` (`recall.recall-index`).
Specs (amended in place): `pulse.threads` Rules 4/12 + two ACs; `pulse.usage` Rule 12;
`insight.session-observe` Rule 6 + one AC; `constellation.compiler` Rule 10 + one AC;
`core-cli.init` Rule 2 + gitignore AC; `insight.refresh-loops` Rule 9 + one AC;
`schema.version-2` Rules 2/8 wording.
Business outcomes: `scaffolding.assistant-reaches-for-cortex-instead-of-guessing` (evidence,
recall index), `schema.contributor-trusts-project-knowledge` (clauses, bears_on).
Schema: `cortex-schema.md` **3.4** — header, §0 3.4 note, Decision 1, §1, §4.3, §4.5/§4.5.1,
§4.5.3, §4.9, §4.10.11, new §4.11, §6 (row + rule 6), new §6.2, §10.2, §10.4, Appendix A.
**Already written** — no schema edits in this plan.
Status: **ready to execute** (Pedro approved step 2 and the MINOR bump on 2026-09-15; specs,
schema text and this plan are the deliverable of the spec pass; no code or tests exist yet).

## Ground rules for every task

- **Tests first.** `specflow-tests` writes the test file named in the task before the
  implementation file; the task is done when the named `pnpm vitest run …` command is green.
- **R-001 governs** `src/schema/**`, `src/pulse/**`, `src/constellation/**`, `src/insight/**`
  (regex predicate: no LLM SDK import); the new specs carry `governed_by: R-001` for
  `src/atlas/**` and `src/recall/**` too. Nothing in this plan imports an SDK, spawns a
  subprocess, or touches the network.
- **RULES.md rule 7:** the only atlas writers this plan adds are human verbs (`usage --record`,
  `thread promote`) and `pulse-accept`; no loop writes `atlas/evidence/`.
- **RULES.md rule 19:** the batch-3 and seed reports must enumerate every validator check and
  scaffold row touched. The full set for this step: new `check.evidence`, `check.bears-on`,
  `check.recall-index`; amended `check.atlas` (two warnings), `check.pulse` (seventh type via
  `SUGGESTION_TYPES`), `check.layout` (`atlas/evidence` subdir), `check.insight-observations`
  (optional `bears_on` shape); `GITIGNORE_LINES` (+1), `CORTEX_INDEXES` (+`atlas/evidence`),
  `SUPPORTED_MINOR`/`SCHEMA_VERSION` (3.3→3.4).
- **Standing authorities:** engineering-call constants are already in the specs (the 12-entry
  seed cap, the 80-character title cut, the 3-character keyword floor, the `usage` evidence slug,
  `instrument: session`); do not re-decide them.
- **The version-agreement test is red until Task 0.1 lands — by design.**
  `tests/atomic/schema/version-agreement.test.ts` derives the version from `cortex-schema.md`,
  which now declares `3.4`, while `src/schema/version.ts` and `src/cli/templates.ts` still say
  `3.3`. That is B-014's mechanism working. Task 0.1 is the first thing to run.
- **Insight is stale for new files.** `cortex insight file` has no entry for
  `src/schema/refs.ts`, `src/schema/clauses.ts`, `src/schema/checks/bears-on.ts`,
  `src/schema/checks/evidence.ts`, `src/schema/checks/recall-index.ts`, `src/atlas/evidence.ts`,
  `src/recall/index.ts`, or `src/pulse/thread-cli.ts` until the next extraction; consult it for
  the files you modify (`src/schema/validate.ts`, `src/schema/checks/atlas.ts`,
  `src/schema/checks/layout.ts`, `src/schema/checks/insight.ts`, `src/pulse/types.ts`,
  `src/pulse/review.ts`, `src/pulse/usage.ts`, `src/insight/session-observe.ts`,
  `src/insight/refresh-fast.ts`, `src/constellation/compile.ts`, `src/cli/cli.ts`,
  `src/cli/init.ts`, `src/cli/templates.ts`, `src/cli/scaffold.ts`).
- **Parallel-batch caveat** (standing-authorities): a batch's own suite run can see a sibling's
  in-flight edits; only the orchestrator's full `pnpm test` after all batches is authoritative.

## Exploration summary

- **Relevant existing code:** `src/schema/index-build.ts` — `ProjectIndex` (`idToPath`,
  `pathToData`), `resolveId`, `resolveRelativePath` (the index every check receives);
  `src/schema/provenance-index.ts` — the computed-inverse pattern (`buildProvenanceIndex`,
  `derivationsOf`) and the ref patterns; `src/schema/checks/atlas.ts` — `checkAtlas` (the decision
  branch at `id.startsWith('decision.')`, the `supersedes`/`sources` loop, `isIsoDate`);
  `src/schema/checks/constellation.ts` — the only-when-file-exists shape check to mirror;
  `src/schema/checks/threads.ts` — the `bears_on` shape check idiom and `isIsoDatetime` import;
  `src/schema/checks/layout.ts` — `subDirs` list (present-tolerant); `src/schema/checks/insight.ts`
  — `checkInsightObservations`; `src/schema/validate.ts` — the flat check sequence (lines 110–151);
  `src/schema/version.ts` — `SUPPORTED_MINOR`; `src/cli/templates.ts` — `SCHEMA_VERSION` (line
  9), `GITIGNORE_LINES` (lines 29–34), `CORTEX_INDEXES` (the `'atlas'` and `'atlas/decisions'`
  entries, lines 101–136); `src/cli/init.ts` — the `CORTEX_INDEXES` scaffolding loop (line 143)
  and the constellation compile (lines 544–548); `src/cli/cli.ts` — the `scan` branch (397–408),
  the `usage` branch (152–156), `PULSE_LOOP_COMMANDS`; `src/constellation/compile.ts` —
  `assembleConstellation`, `addEdge`, `specIdToNode`, the atlas artefact loop (subfolder grouping
  is automatic); `src/pulse/types.ts` — `SUGGESTION_TYPES`, `permittedRoots`,
  `permittedRootsLabel`, `RootSpec`; `src/pulse/review.ts` — accept's create path (`mkdirSync` at
  561/657, `COMPASS_CORE_FILES` precedent at 27); `src/pulse/usage.ts` — `UsageCounts`,
  `collectUsage`, `renderUsageBody`, `runUsage`; `src/pulse/thread-cli.ts` — `PROMOTE_TARGETS`,
  `RESERVED_TARGET`, `promoteVerb`, `decisionDraft`, `parseFlags(argv, repeatable)`, `keyText`,
  `draftBody`, `splitCitation`; `src/pulse/threads.ts` — `Thread`, `updateThreadStatus`,
  `listThreads`; `src/insight/session-observe.ts` — `decisionFilePayload` (555–580),
  `candidateSectionText`, `applyObserve`; `src/insight/refresh-fast.ts` — `runInsightRefreshFast`
  and its `appendHookError` usage; `src/hooks/errors.ts` — `appendHookError`; `src/loops/report.ts`
  — `writePulseReport`.
- **Established patterns:** checks return `Violation[]` with `{ severity, check, clause,
  location: { path, key? }, message }`; "only when the file exists" checks return `[]` on
  absence; the `ProjectIndex` is built once in `validate()` and passed down; compiled artefacts
  are `JSON.stringify(x, null, 2) + '\n'`, sorted, byte-identical modulo `generated`; CLI verbs
  are `if (argv[0] === '…') { const { fn } = await import('…'); return fn(...) }`; human verbs
  that write gated files go through `parseFlags` + usage exit 2 / refusal exit 1; tests use
  fixture roots under `tests/fixtures/` helpers and `os.tmpdir()`.
- **Tech stack:** Node 18, TypeScript strict, vitest, `gray-matter`, `fast-glob`.

## Gap analysis

- **Can reuse:** everything above; no new dependency (RULES.md rule 2 not triggered).
- **Must create:** `src/schema/clauses.ts`, `src/schema/refs.ts`, `src/schema/checks/bears-on.ts`,
  `src/schema/checks/evidence.ts`, `src/schema/checks/recall-index.ts`, `src/atlas/evidence.ts`,
  `src/recall/index.ts`; tests `tests/atomic/schema/clauses.test.ts`,
  `tests/atomic/schema/refs.test.ts`, `tests/atomic/schema/bears-on-check.test.ts`,
  `tests/atomic/schema/evidence-check.test.ts`, `tests/atomic/schema/recall-index-check.test.ts`,
  `tests/atomic/atlas/evidence.test.ts`, `tests/atomic/recall/index.test.ts`,
  `tests/spec/schema/bears-on.spec.test.ts`, `tests/spec/atlas/evidence.spec.test.ts`,
  `tests/spec/recall/recall-index.spec.test.ts`.
- **Must modify:** `src/schema/version.ts`, `src/cli/templates.ts`, `src/schema/validate.ts`,
  `src/schema/checks/atlas.ts`, `src/schema/checks/layout.ts`, `src/schema/checks/insight.ts`,
  `src/pulse/types.ts`, `src/pulse/review.ts`, `src/pulse/usage.ts`, `src/pulse/thread-cli.ts`,
  `src/insight/session-observe.ts`, `src/insight/refresh-fast.ts`, `src/constellation/compile.ts`,
  `src/cli/cli.ts`, `src/cli/init.ts`; tests that pin literals: `tests/spec/schema/version-2.spec.test.ts`
  (`toBe('3.3')` → `'3.4'`, and its `it` title), `tests/spec/loops/cortex-loop-bundle.test.ts`
  ("no schema bump shipped with the merge" — Task 0.1 rewrites it to assert the merge migration's
  own version, not the package's), `tests/atomic/core-cli/init.test.ts` (the "exactly four
  paths" gitignore pins → five), `tests/spec/core-cli/init.test.ts` (dir list gains
  `atlas/evidence`; gitignore loop gains the fifth line), `tests/spec/core-cli/sync-additions.spec.test.ts`
  and `tests/spec/core-cli/sync-retirement.spec.test.ts` (the `readSchemaVersion(root)` /
  `config.schemaVersion` assertions that expect the *package* version read `'3.3'` today and must
  read `SCHEMA_VERSION`; the `makeProject(…, '3.3', …)` prior-version fixtures stay `'3.3'` — they
  model a project at the seed version and their semantics hold at 3.4), `tests/atomic/schema/validator.test.ts`
  (fixture valid tree gains nothing; verify still green).
- **Open questions (assumptions stated, proceed):** (1) `cortex insight-refresh-fast` runs in a
  non-repo as a silent no-op; the recall rebuild runs before that gate only when `.cortex/` exists
  (spec Rule 9) — a non-Cortex repo stays untouched. (2) The `sync-additions` "declared-version"
  fixtures pass `'3.3'` as a project's *prior* version; with `SCHEMA_VERSION = '3.4'`,
  `shouldInstallAbsent(bundle, '3.3')` is still `false` for every 3.3-seeded bundle, so the
  deletion-holds tests keep their meaning. If one flips, the fixture is modelling "already at the
  package version" and should pass `SCHEMA_VERSION` instead — fix the fixture, not the chain.

## Size check and batching

Four new specs plus seven amended, roughly 2,600 lines of relevant existing code — over the
one-agent heuristic, so it is **split**: one sequential seed batch, then three batches with
**disjoint file ownership** that run in parallel, each at Light depth.

```
Batch 0 (seed, sequential)  version bump + clause resolver + ref resolver + check.bears-on ─┐
                                                                                             ├─► Batch 1  evidence kind + check.evidence + usage --record + evidence-candidate + promote --to atlas/evidence
                                                                                             │            (owns src/atlas/, src/schema/checks/evidence.ts, src/pulse/types.ts, src/pulse/review.ts, src/pulse/usage.ts, src/pulse/thread-cli.ts, checks/layout.ts)
                                                                                             ├─► Batch 2  recall index compiler + entailment + check.recall-index + scan/init/post-commit wiring + gitignore
                                                                                             │            (owns src/recall/, src/schema/checks/recall-index.ts, src/insight/refresh-fast.ts, src/cli/cli.ts, src/cli/init.ts, GITIGNORE_LINES + CORTEX_INDEXES in templates.ts)
                                                                                             └─► Batch 3  bears_on seeding in promote-to-decision and session-observe + constellation edge + check.atlas warnings + observations shape
                                                                                                          (owns src/insight/session-observe.ts, src/constellation/compile.ts, src/schema/checks/atlas.ts, src/schema/checks/insight.ts)
Orchestrator: pnpm test → pnpm build → cortex sync (this repo) → cortex scan → cortex validate
```

Ownership notes: batch 0 is the only batch that edits `src/schema/validate.ts` (it wires
`check.bears-on`); batches 1 and 2 each add one `validate.ts` line for their own check —
**append-only, one line each, at the marked positions**, so the two edits do not collide.
`src/pulse/thread-cli.ts` belongs to batch 1 (the evidence target); batch 3's promote change
is confined to `decisionFilePayload` in `src/insight/session-observe.ts`, which batch 1's
`decisionDraft` already calls — batch 3 adds the optional argument, batch 1 passes it (batch 1
passes `t.bears_on` only after batch 3's signature lands; until then it compiles without the
argument — coordinate at merge). `src/cli/templates.ts` is split by region: batch 0 owns line 9
(`SCHEMA_VERSION`), batch 2 owns `GITIGNORE_LINES` and `CORTEX_INDEXES`.

---

## Batch 0 — version bump and the two resolvers (sequential seed; ~30 min)

### Task 0.1: Move the three version declarations to 3.4

**Criterion:** `schema.version-2` — "The config and validator both read 2.0" (the values track
the contract) and "The three version declarations cannot silently diverge"
**Files:** `src/schema/version.ts` (modify), `src/cli/templates.ts` (modify, line 9 only),
`tests/spec/schema/version-2.spec.test.ts` (modify), `tests/spec/loops/cortex-loop-bundle.test.ts`
(modify), `tests/atomic/schema/version-agreement.test.ts` (unchanged — it must go green)
**Change:** `SUPPORTED_MINOR = 4`; `SCHEMA_VERSION = '3.4'`; extend the `version.ts` docblock
with one paragraph ("MINOR 3 → 4: recall step 2 — `bears_on`, `schema:§N`, `atlas/evidence/`,
`evidence-candidate`, `recall-index.json`; schema §0's 3.4 note"). In `version-2.spec.test.ts`
change the three `3.3` expectations to `3.4` (`SUPPORTED_MINOR` 4, `SUPPORTED_VERSION` `'3.4'`)
and the `it` title's "MINOR 0 -> 3 by B-014" clause to "… ; 3 -> 4 by recall step 2". In
`cortex-loop-bundle.test.ts` replace the `'no schema bump shipped with the merge'` case with
`'the merge migration is dated 3.3, not the current package version'` asserting
`SKILL_MIGRATIONS.find(m => m.removed.includes('cortex-loop-atlas-staleness'))?.version === '3.3'`
— the invariant it protected (the merge needed no bump) is about the migration's date, not the
package's. Do **not** add `SKILL_MIGRATIONS`/`SKILL_ADDITIONS` entries (schema §10.4: no bundle
changes at 3.4; `tests/atomic/core-cli/skill-additions.test.ts` and `retired-bundles.test.ts`
stay green as written).
**Verify:** `pnpm vitest run tests/atomic/schema/version-agreement.test.ts tests/spec/schema/version-2.spec.test.ts tests/spec/loops/cortex-loop-bundle.test.ts tests/atomic/core-cli/skill-additions.test.ts tests/atomic/core-cli/retired-bundles.test.ts`

### Task 0.2: The clause index

**Criterion:** `schema.schema-clauses` — "A present clause resolves at every depth"; "An absent
clause does not resolve"; "A retitled section still resolves"; "Headings inside code fences are
ignored"; "Malformed refs are rejected by the grammar, not looked up"; "A project without the
schema document resolves nothing, without error"
**Files:** `tests/atomic/schema/clauses.test.ts` (create), `src/schema/clauses.ts` (create)
**Change:** Export `CLAUSE_REF_RE = /^schema:§\d+(\.\d+){0,2}$/`, `type ClauseIndex = Set<string>`,
`loadClauseIndex(root): ClauseIndex` (read `path.join(root, 'cortex-schema.md')`; on ENOENT or
any read error return an empty set; walk lines, toggle `inFence` on lines starting with three or
more backticks, and for non-fenced lines matching `/^#{2,4}\s+(\d+(?:\.\d+){0,2})[.\s]/` add the
captured number), `clauseNumber(ref): string | undefined` (strip `schema:§`; `undefined` when the
grammar fails), `clauseResolves(index, ref): boolean`. Tests build a temp `cortex-schema.md` with
the headings from the ACs, including one inside a fence.
**Verify:** `pnpm vitest run tests/atomic/schema/clauses.test.ts`

### Task 0.3: The ref resolver by shape

**Criterion:** `schema.bears-on` — "Every shape classifies to exactly one kind"; "Gated refs
resolve through the project index"; "A concept resolves from either insight layout"; "A path
resolves as a file or a directory, never outside the project"
**Files:** `tests/atomic/schema/refs.test.ts` (create), `src/schema/refs.ts` (create)
**Change:** Export `type RefKind = 'rule'|'bug'|'domain'|'concept'|'clause'|'path'|'id'`,
`GATED_KINDS: ReadonlySet<RefKind>` (`rule, bug, domain, id`), `classifyRef(ref): RefKind`
(spec Rule 1 order; `RULE_RE = /^R-\d{3,}$/`, `BUG_RE = /^B-\d{3,}$/`,
`DOMAIN_RE = /^domain\.[A-Za-z0-9][A-Za-z0-9_-]*$/`, `CONCEPT_RE = /^concept:[a-z0-9][a-z0-9-]*$/`,
`CLAUSE_REF_RE` from `clauses.ts`, path = `ref.includes('/') || ref.startsWith('.')`),
`normalisePathRef(ref)` (backslashes → `/`, strip leading `./`), `resolveRef(root, index,
clauses, ref): { kind, resolved, target? }` per spec Rule 2 (concept: `fs.existsSync` on
`.cortex/insight/concepts/<slug>.md`, else glob `.cortex/insight/scopes/*/concepts/<slug>.md`
with `fast-glob`; path: reject `path.isAbsolute` and any `..` segment, then `fs.existsSync`
relative to root — file or directory), and `refSeverity(kind): 'error'|'warning'` (Rule 3).
Tests use a temp root with `.cortex/insight/concepts/hook-safety.md`, a scoped concept, the
files from the ACs, and a stub `ProjectIndex` built with `buildIndex`.
**Verify:** `pnpm vitest run tests/atomic/schema/refs.test.ts`

### Task 0.4: `check.bears-on`

**Criterion:** `schema.bears-on` — "`check.bears-on` errors on a dangling gated ref and warns on
the rest"; "A malformed entry is an error on a gated carrier"; "Threads and observations are not
resolved by the validator"; "The clause index is loaded once for the whole run"; "No artefact
may carry a stored inverse"
**Files:** `tests/atomic/schema/bears-on-check.test.ts` (create), `tests/spec/schema/bears-on.spec.test.ts`
(create), `src/schema/checks/bears-on.ts` (create), `src/schema/validate.ts` (modify)
**Change:** `export async function checkBearsOn(root, index, clauses): Promise<Violation[]>` —
glob `.cortex/atlas/decisions/*.md` and `.cortex/atlas/evidence/*.md` (ignore `_index.md`),
skip files whose frontmatter has no `bears_on`; not a list of non-empty strings → one `error`
(`check: 'check.bears-on'`, `clause: '§6'`, key `bears_on`, message "malformed bears_on
entry …"); per entry `classifyRef` → `resolveRef`; unresolved → violation at
`refSeverity(kind)` with message `bears_on ref "${ref}" (${kind}) does not resolve` (clause
`§6.2` for `clause` kinds). In `validate.ts`: `const clauses = loadClauseIndex(root);` right
after `buildIndex`, and `allViolations.push(...await checkBearsOn(root, index, clauses));`
immediately after the `checkProvenance` line, with the comment
`// 3.4 — batch 1 adds checkEvidence below this line; batch 2 adds checkRecallIndex after checkConstellation`.
The spec test runs `validate()` over a temp project with the AC fixtures and asserts the
report's violation list; the "read once" AC spies `fs.readFileSync` for the schema path.
**Verify:** `pnpm vitest run tests/atomic/schema/bears-on-check.test.ts tests/spec/schema/bears-on.spec.test.ts tests/atomic/schema/validator.test.ts`

---

## Batch 1 — evidence: the kind, its check, and its three producers (parallel; Light)

Owns: `src/atlas/evidence.ts`, `src/schema/checks/evidence.ts`, `src/schema/checks/layout.ts`,
`src/schema/checks/pulse.ts` (one predicate, Task 1.4), `src/pulse/types.ts`, `src/pulse/review.ts`,
`src/pulse/usage.ts`, `src/pulse/thread-cli.ts`,
one appended line in `src/schema/validate.ts`, `tests/atomic/atlas/evidence.test.ts`,
`tests/atomic/schema/evidence-check.test.ts`, `tests/spec/atlas/evidence.spec.test.ts`,
`tests/atomic/pulse/usage.test.ts`, `tests/spec/pulse/usage.test.ts`,
`tests/atomic/pulse/thread-cli.test.ts`, `tests/spec/pulse/thread-cli.spec.test.ts`,
`tests/atomic/pulse/review-cli.test.ts`, `tests/atomic/schema/validator.test.ts` (the
`check.pulse` type-enum case, if it enumerates the six).

### Task 1.1: The shared evidence writer

**Criterion:** `atlas.evidence` — "An evidence file has the contract frontmatter" (the payload
half); "Only atlas/evidence is written by the producers" (the `ensureEvidenceDir` half)
**Files:** `tests/atomic/atlas/evidence.test.ts` (create), `src/atlas/evidence.ts` (create)
**Change:** Export `EVIDENCE_KINDS = ['measurement','experiment','audit'] as const`,
`EVIDENCE_DIR = 'atlas/evidence'`, `interface EvidenceFields { slug; title; kind; instrument;
window: { from; to; sessions? }; findings: { metric; value; unit? }[]; bearsOn: string[];
supersedes?: string[]; provenance?: string[]; body }`, `evidenceFilePayload(fields, now):
{ targetRel, payload }` (target `.cortex/atlas/evidence/<YYYY-MM-DD>-<slug>.md`; frontmatter in
the spec Rule 1 order — `id`, `title` (JSON-quoted), `date`, `kind`, `instrument`, `window` as a
nested map, `findings` as `- metric: …` / `  value: …` / `  unit: …` items, `bears_on`,
`supersedes` (omitted when empty), `provenance` as `- derives_from:` items (omitted when empty) —
then a blank line and the body with a trailing newline), `ensureEvidenceDir(root)` (`mkdir -p`
and write `CORTEX_INDEXES['atlas/evidence']` to `_index.md` when absent — the template is batch
2's Task 2.6; until it lands import the string from a local constant and switch at merge),
`latestEvidenceMatching(root, suffix): string | undefined` (sorted `readdirSync` filter on
`-${suffix}.md`, last). Round-trip test: payload parses with `gray-matter` to the same fields.
**Verify:** `pnpm vitest run tests/atomic/atlas/evidence.test.ts`

### Task 1.2: `check.evidence` and the layout subdir

**Criterion:** `atlas.evidence` — "An evidence file has the contract frontmatter" (the validate
half); "Every required field is enforced, at error severity"; "Id and filename must agree;
supersedes must point at evidence"; "An absent directory is not a finding"
**Files:** `tests/atomic/schema/evidence-check.test.ts` (create), `src/schema/checks/evidence.ts`
(create), `src/schema/checks/layout.ts` (modify), `src/schema/validate.ts` (modify — one line)
**Change:** `export async function checkEvidence(root): Promise<Violation[]>` — every rule in
Appendix A's `check.evidence` row, `severity: 'error'`, `clause: '§4.3'`; `isIsoDatetime` from
`src/insight/storage.ts` for datetimes and accept bare `YYYY-MM-DD` for `window.from`/`to`;
`supersedes` entries resolved relative to the file and required to sit under
`.cortex/atlas/evidence/`; tolerate an absent directory. In `layout.ts` append
`'atlas/evidence'` to `subDirs`. In `validate.ts` add
`allViolations.push(...await checkEvidence(root));` directly under the batch-0 comment line.
Test: the AC fixtures yield exactly the named errors at the named keys; a valid file yields none;
an `atlas/evidence/` without `_index.md` yields a `check.layout` error and with one yields none.
**Verify:** `pnpm vitest run tests/atomic/schema/evidence-check.test.ts tests/atomic/schema/validator.test.ts`

### Task 1.3: `cortex usage --record`

**Criterion:** `atlas.evidence` — "`usage --record` writes evidence from the same counts as the
report"; "A second recording supersedes the first"; "Nothing measurable records nothing";
`pulse.usage` Rule 12
**Files:** `tests/spec/pulse/usage.test.ts` (extend), `tests/atomic/pulse/usage.test.ts`
(extend), `src/pulse/usage.ts` (modify), `src/cli/cli.ts` (modify — the `usage` branch only,
**coordinate with batch 2**, which owns the `scan` branch: touch no other line of `cli.ts`)
**Change:** Export `usageFindings(counts): { metric; value; unit? }[]` in the spec Rule 5 fixed
order and `usageEvidenceFields(counts, now, previous?)`; extend `runUsage(root, opts & { record?:
boolean })`: after the report write, when `record` — if `!counts.readable` print
`cortex usage --record: nothing measurable — no evidence written` and return 1; else
`ensureEvidenceDir`, compute `previous = latestEvidenceMatching(root, 'usage')`, build the
payload (`slug: 'usage'`, title `Cortex usage over ${sessions} sessions (${from} to ${to})`,
`bearsOn: ['schema:§5', 'pulse.usage']`, `supersedes: previous ? [previous] : []`, body
`renderUsageBody(counts)`), refuse with exit 1 if the target exists, else write and print the
path. In `cli.ts`'s `usage` branch pass `{ record: argv.includes('--record') }`.
**Verify:** `pnpm vitest run tests/atomic/pulse/usage.test.ts tests/spec/pulse/usage.test.ts`

### Task 1.4: `evidence-candidate` in the pulse gate

**Criterion:** `atlas.evidence` — "An evidence-candidate is gated like a decision-candidate"
**Files:** `tests/atomic/pulse/review-cli.test.ts` (extend), `tests/atomic/schema/validator.test.ts`
(extend if it enumerates the enum), `src/pulse/types.ts` (modify), `src/pulse/review.ts` (modify)
**Change:** Add `'evidence-candidate'` to `SUGGESTION_TYPES`; `const ATLAS_EVIDENCE: RootSpec =
{ kind: 'dir', prefix: '.cortex/atlas/evidence/' }`; `permittedRoots('evidence-candidate')` →
`[ATLAS_EVIDENCE]`; `permittedRootsLabel` → `'.cortex/atlas/evidence/'`; export
`CREATE_ONLY_TYPES: ReadonlySet<SuggestionType> = new Set(['evidence-candidate'])` and have
`checkPulse` (`src/schema/checks/pulse.ts` — **read-only for this batch except this one
predicate call**; if the edit is larger than three lines, stop and report) emit an `error` when a
create-only type carries a non-`file` payload. In `review.ts` accept: when the type is
`evidence-candidate`, call `ensureEvidenceDir(root)` before the create write (mirror the
`COMPASS_CORE_FILES` precedent). Tests: `isTargetPermitted` truth table for the new type; accept
of a fixture section creates the file and the index; the wrong-root and wrong-payload sections
produce `check.pulse` errors.
**Verify:** `pnpm vitest run tests/atomic/pulse/review-cli.test.ts tests/atomic/schema/validator.test.ts`

### Task 1.5: `thread promote --to atlas/evidence`

**Criterion:** `atlas.evidence` — "Promote to evidence drafts a schema-valid file from a
measurement finding"; "Promote to evidence refuses the wrong kind and demands findings";
`pulse.threads` — "Promote refuses unknown targets, and never clobbers" (amended wording)
**Files:** `tests/spec/pulse/thread-cli.spec.test.ts` (modify the reserved-target case; extend),
`tests/atomic/pulse/thread-cli.test.ts` (extend), `src/pulse/thread-cli.ts` (modify)
**Change:** Delete `RESERVED_TARGET`; `PROMOTE_TARGETS = ['atlas/decisions', 'compass/bugs',
'atlas/evidence']`; `parseFlags(argv, ['--affects', '--finding', '--bears-on'])`; grammar checks
before the thread is read: `--finding`/`--bears-on` only with `--to atlas/evidence`; for
`atlas/evidence` at least one `--finding` each matching `/^([^=]+)=(.+)$/` (else usage exit 2
naming `--finding`); after `requireOpen`: kind must be `finding` and the body must contain
`**Kind:** measurement` (else exit 2 naming the kind); `bearsOn = --bears-on values ?? t.bears_on`,
empty → exit 2 naming `--bears-on`; `evidenceDraft(root, t, now, user, findings, bearsOn)` builds
`EvidenceFields` (slug `decisionSlug({ title: keyText(t) })`, `instrument: 'session'`, window
from `pulse/sessions/<id>.json` `ended` values for the first and last trail entries falling back
to `t.opened`, `sessions: t.sessions.length`, `provenance: t.sessions`, body = DRAFT line +
`draftBody(t)`) and calls `evidenceFilePayload`; then the existing no-clobber/write/answered
sequence, with `ensureEvidenceDir` before the write. Update `USAGE`. Spec test runs
`checkEvidence`, `checkAtlas`, `checkProvenance` and `checkBearsOn` over the result.
**Verify:** `pnpm vitest run tests/atomic/pulse/thread-cli.test.ts tests/spec/pulse/thread-cli.spec.test.ts`

---

## Batch 2 — the recall index and its builders (parallel; Light)

Owns: `src/recall/index.ts`, `src/schema/checks/recall-index.ts`, `src/insight/refresh-fast.ts`,
`src/cli/cli.ts` (the `scan` branch only), `src/cli/init.ts`, `src/cli/templates.ts`
(`GITIGNORE_LINES` and `CORTEX_INDEXES` only), one appended line in `src/schema/validate.ts`,
`tests/atomic/recall/index.test.ts`, `tests/spec/recall/recall-index.spec.test.ts`,
`tests/atomic/schema/recall-index-check.test.ts`, `tests/atomic/insight/refresh-fast.test.ts`,
`tests/atomic/core-cli/init.test.ts`, `tests/spec/core-cli/init.test.ts`,
`tests/spec/core-cli/sync.test.ts` (only if an index-template pin breaks).

### Task 2.1: Scan the four carriers into entries

**Criterion:** `recall.recall-index` — "Keywords are names, never bodies"; "Deterministic modulo
timestamp, and empty inputs compile" (the empty half)
**Files:** `tests/atomic/recall/index.test.ts` (create), `src/recall/index.ts` (create)
**Change:** Export the `RecallIndex`, `RecallSubject`, `RecallEntry` types (spec Rule 1);
`scanCarriers(root): Carrier[]` reading decisions, evidence, threads (`listThreads` from
`src/pulse/threads.ts`) and observations, each as `{ kind, id, path, date, title, bearsOn,
supersedes: string[] (resolved absolute paths), sources: string[] (resolved absolute paths),
status? }`, skipping unparseable frontmatter and non-list `bears_on`; `keywordsOf(title,
bearsOn)` (Rule 8: lowercase tokens ≥3 chars on `/[^a-z0-9]+/`, plus refs verbatim, sorted,
deduped); `entryOf(carrier)`. Tests: the AC titles yield the AC keyword lists; a body token never
appears; a project with none of the four directories yields `[]`.
**Verify:** `pnpm vitest run tests/atomic/recall/index.test.ts`

### Task 2.2: Subjects and the three entailment rules

**Criterion:** `recall.recall-index` — "A superseded decision keeps its entry and loses its
subjects"; "Only open threads reach a subject"; "Evidence flows through the citing decision and
directly"; "A superseded evidence file is dropped from every evidence list"; "An observation
contributes its theme"; "Unresolved refs are dropped and counted, never fatal"; "Path spellings
collapse to one subject"; "Dependencies are not closed over"
**Files:** `tests/atomic/recall/index.test.ts` (extend), `src/recall/index.ts` (extend)
**Change:** `compileRecallIndex(root): Promise<RecallIndex>` — `buildIndex(root)` +
`loadClauseIndex(root)` once; `supersededDecisions = Set` of every path any decision's
`supersedes` resolves to; likewise `supersededEvidence`; for each carrier and each `bears_on`
ref: `resolveRef` → unresolved: `droppedRefs++`; resolved: subject key = `kind === 'path' ?
normalisePathRef(ref) : ref`; push per Rules 3–6 (decision → `decided` iff not superseded;
thread → `threads` iff `status === 'open'`; evidence → `evidence` iff not superseded;
observation → `observations` theme); then for each decision with `sources` under
`.cortex/atlas/evidence/`, for each of its resolving `bears_on` subjects push the evidence id
(unless superseded). Sort and dedupe every list; sort keys; counters. `schemaVersion` from the
config, fallback `SUPPORTED_VERSION`.
**Verify:** `pnpm vitest run tests/atomic/recall/index.test.ts`

### Task 2.3: The writer and `check.recall-index`

**Criterion:** `recall.recall-index` — "The emitted file passes its own check"; "A malformed
index is an error, an absent one is nothing"; "Deterministic modulo timestamp" (the byte-identical
half)
**Files:** `tests/atomic/schema/recall-index-check.test.ts` (create),
`tests/spec/recall/recall-index.spec.test.ts` (create), `src/recall/index.ts` (extend),
`src/schema/checks/recall-index.ts` (create), `src/schema/validate.ts` (modify — one line)
**Change:** `writeRecallIndex(root): Promise<RecallIndex>` (`JSON.stringify(index, null, 2) +
'\n'` to `.cortex/recall-index.json`, `mkdir -p .cortex`). `checkRecallIndex(root): Violation[]`
mirrors `checkConstellation` (`clause: '§4.11'`, `check: 'check.recall-index'`, only when the
file exists) with spec Rule 13's rules. In `validate.ts` add
`allViolations.push(...checkRecallIndex(root));` directly after the `checkConstellation` line.
Spec test: compile twice, strip `generated`, assert byte equality; then `validate()` over the
written file → zero `check.recall-index` errors; corrupt one id → one error; delete → none.
**Verify:** `pnpm vitest run tests/atomic/schema/recall-index-check.test.ts tests/spec/recall/recall-index.spec.test.ts tests/atomic/schema/validator.test.ts`

### Task 2.4: `cortex scan` and `cortex init` build it

**Criterion:** `recall.recall-index` — "scan, init and the post-commit tier all build it;
validate does not" (the scan and init thirds)
**Files:** `tests/spec/recall/recall-index.spec.test.ts` (extend), `tests/spec/core-cli/init.test.ts`
(extend), `src/cli/cli.ts` (modify — `scan` branch only), `src/cli/init.ts` (modify)
**Change:** In the `scan` branch, after `compile('.')`: `const { writeRecallIndex } = await
import('../recall/index.js'); const recall = await writeRecallIndex('.');` and extend the summary
line with `; recall index: ${recall.counters.subjects} subject(s), ${recall.counters.entries}
entr(y|ies)`. In `init.ts`, after `await compile(absRoot)` (line 548): `await
writeRecallIndex(absRoot)` with a two-line comment citing schema §4.11. Tests: `run(['scan'])`
against a fixture root writes both files; `init` leaves `.cortex/recall-index.json` present.
**Verify:** `pnpm vitest run tests/spec/recall/recall-index.spec.test.ts tests/spec/core-cli/init.test.ts`

### Task 2.5: The post-commit tier rebuilds it

**Criterion:** `insight.refresh-loops` — "The fast tier rebuilds the recall index before its
ledger gate (3.4)"; `recall.recall-index` — "scan, init and the post-commit tier all build it"
(the post-commit third)
**Files:** `tests/atomic/insight/refresh-fast.test.ts` (extend), `src/insight/refresh-fast.ts`
(modify)
**Change:** In `runInsightRefreshFast`, as the first step after resolving `root` and confirming
`.cortex/` exists (before the ledger/`parseLedger` gate): `try { await writeRecallIndex(root) }
catch (err) { appendHookError(root, HOOK_NAME, '.cortex/recall-index.json', String(err)) }` —
never rethrow, never change the exit code. Tests: a fixture with one decision and no ledger →
index exists, exit 0, no worklist; stub `writeRecallIndex` to throw → exit 0 and one
`hook-errors.md` entry.
**Verify:** `pnpm vitest run tests/atomic/insight/refresh-fast.test.ts`

### Task 2.6: Gitignore line and the evidence index template

**Criterion:** `core-cli.init` — "Gitignore additions are exact and idempotent" (amended);
`atlas.evidence` — "Only atlas/evidence is written by the producers" (the `_index.md` template
`ensureEvidenceDir` writes)
**Files:** `tests/atomic/core-cli/init.test.ts` (modify the two gitignore pins),
`tests/spec/core-cli/init.test.ts` (modify the dir list and gitignore loop), `src/cli/templates.ts`
(modify — `GITIGNORE_LINES` and `CORTEX_INDEXES` only)
**Change:** Append `'.cortex/recall-index.json'` to `GITIGNORE_LINES` (docblock: one sentence
citing Decision 1's 3.4 amendment). Add `'atlas/evidence'` to `CORTEX_INDEXES` in the §7.1 shape,
under 300 tokens: `# Evidence — index` / **Read this when:** you need the number behind a claim —
a usage figure, an audit count, a measured before/after — or before re-measuring something. /
**What's here:** `YYYY-MM-DD-<slug>.md` — one dated measurement, experiment or audit: what was
measured (`findings`), over what window and denominator, with what `instrument`, and what it
`bears_on`. / **How to navigate:** follow `bears_on:` to the rule, spec or clause the number is
about; `supersedes:` walks the re-measurement chain (newest wins); decisions cite a file here
via `sources:`. Also add the `evidence/` line to the `'atlas'` entry's **What's here** (the
text now in this repo's `.cortex/atlas/_index.md`, byte-for-byte, so `cortex sync` reports it
current rather than localised). The init scaffolding loop picks the new key up unchanged.
Update the atomic gitignore tests to five lines and the spec dir list to include
`atlas/evidence`.
**Verify:** `pnpm vitest run tests/atomic/core-cli/init.test.ts tests/spec/core-cli/init.test.ts tests/spec/core-cli/sync.test.ts`

---

## Batch 3 — seeding the edge, the constellation, and the atlas warnings (parallel; Light)

Owns: `src/insight/session-observe.ts`, `src/constellation/compile.ts`,
`src/schema/checks/atlas.ts`, `src/schema/checks/insight.ts`,
`tests/atomic/insight/session-observe.test.ts`, `tests/atomic/constellation/compiler.test.ts`,
`tests/spec/constellation/compiler.test.ts`, `tests/atomic/schema/validator.test.ts` (atlas
warning cases), `tests/spec/schema/validator-insight-checks.spec.test.ts` (observations shape).

### Task 3.1: `decisionFilePayload` carries `bears_on`; session-observe seeds it

**Criterion:** `insight.session-observe` — "A decision-candidate's `bears_on` is seeded from the
session's read ledger (3.4)"; `pulse.threads` — "Promote to a decision drafts a schema-valid
file" (the `bears_on` clause — batch 1's `decisionDraft` passes `t.bears_on` once this signature
lands)
**Files:** `tests/atomic/insight/session-observe.test.ts` (extend), `src/insight/session-observe.ts`
(modify)
**Change:** `decisionFilePayload(candidate, now, user, bearsOn: string[] = [])` — when
non-empty, emit `bears_on:` as a YAML list after `date:` and before `provenance:`. Export
`readLedgerSeed(root, sessionIds: string[], cap = 12): string[]` (for each id read
`pulse/state/reads/<id>` if present, keep lines starting `.cortex/` or `.specflow/`, dedupe
first-seen, slice `cap`) — the same filter `openThreadsFromRecord` applies in
`src/pulse/threads.ts` (import `READ_LEDGER_PREFIXES` from there if exported; else define the
two-prefix constant once here and have threads import it — pick the direction that leaves
`src/pulse/threads.ts` untouched, since batch 1 does not own it either). In
`candidateSectionText`'s decision branch pass `readLedgerSeed(absRoot, candidate.sessionIds)`.
Tests: the AC ledger yields exactly 12 entries in order; no ledger → no `bears_on` key; the
existing decision-candidate tests stay green.
**Verify:** `pnpm vitest run tests/atomic/insight/session-observe.test.ts`

### Task 3.2: `bears_on` edges in the constellation

**Criterion:** `constellation.compiler` — "bears_on emits edges for node-shaped refs only (3.4)"
**Files:** `tests/atomic/constellation/compiler.test.ts` (extend), `tests/spec/constellation/compiler.test.ts`
(extend), `src/constellation/compile.ts` (modify)
**Change:** In the atlas artefact loop, for artefacts whose id starts `decision.` or `evidence.`,
for each `toStringList(artefact.data['bears_on'])` ref: `classifyRef` (import from
`src/schema/refs.ts`) → `rule` → `addEdge(node, `rule:${ref}`, 'bears_on')`; `bug` → `bug:`;
`domain` → `atlas:`; `id` → `specIdToNode(ref) ?? (nodeIds.has(`atlas:${ref}`) ? `atlas:${ref}`
: undefined)` (dropped-and-counted when undefined); `path`/`concept`/`clause` → `continue` (no
edge, no count). Extend the file docblock's edge list. Tests: the AC fixture yields the four
edges, exactly one dropped ref, and an `atlas:evidence` child.
**Verify:** `pnpm vitest run tests/atomic/constellation/compiler.test.ts tests/spec/constellation/compiler.test.ts`

### Task 3.3: The two decision warnings and the observations shape

**Criterion:** `atlas.evidence` — "A decision citing a pulse report is warned"; `schema.bears-on`
Rule 5's `check.atlas` half ("decision bears on nothing"); `schema.bears-on` — "Threads and
observations are not resolved by the validator" (the observations shape half)
**Files:** `tests/atomic/schema/validator.test.ts` (extend), `tests/spec/schema/validator-insight-checks.spec.test.ts`
(extend), `src/schema/checks/atlas.ts` (modify), `src/schema/checks/insight.ts` (modify)
**Change:** In `checkAtlas`'s decision branch: when `!('bears_on' in data)` push
`{ severity: 'warning', check: 'check.atlas', clause: '§4.3', key: 'bears_on', message:
'decision bears on nothing; add bears_on' }`; in the `supersedes`/`sources` loop, for
`key === 'sources'` and a resolving path, when `path.relative(path.join(root, '.cortex',
'pulse'), resolved)` does not start with `..` push a `warning` at key `sources`: `Atlas
"sources" reference "${ref}" cites a transient report; record it as evidence
(atlas/evidence/, schema §4.3)`. In `checkInsightObservations`: when `bears_on` is present and
is not a list of non-empty strings, push an `error` at key `bears_on` (clause `§4.10.11`);
otherwise nothing. Tests: a decision with no `bears_on` → one warning; with
`sources: [../../pulse/reports/usage.md]` (file present) → one warning containing "record it as
evidence"; an observation with `bears_on: [R-999]` → no violation; with `bears_on: "x"` → one
error. Note: this repo's `2026-08-05-insight-pull-only-stance-reversed.md` will carry both
warnings after this task — expected (close-out item 6).
**Verify:** `pnpm vitest run tests/atomic/schema/validator.test.ts tests/spec/schema/validator-insight-checks.spec.test.ts`

---

## Orchestrator close-out (after all batches)

1. `pnpm test` — full suite green (the authoritative run). Confirm `version-agreement` is green.
2. `pnpm build`, then `cortex sync` **in this repo** (rewrites `schemaVersion` 3.3 → 3.4 in
   `.cortex/cortex.config.json` and refreshes the CLAUDE.md marker to `v3.4`; the atlas index
   should report *current* if Task 2.6 matched its bytes), then `cortex scan` (writes
   `.cortex/recall-index.json` — confirm it is gitignored: `git status` shows no new file).
3. `cortex validate` → conformant. Expected new warnings: the 2026-08-05 decision's "bears on
   nothing" and "cites a transient report" (item 6); the four `governs`-resolves warnings on the
   new specs disappear once the governed files exist.
4. Flip `status: draft → implemented` on `schema.schema-clauses`, `schema.bears-on`,
   `atlas.evidence`, `recall.recall-index`; re-read both business specs for drift (none expected —
   nothing is injected in this step; `check.business-status` may warn on the scaffolding outcome
   until every implementer is implemented — correct signal).
5. Run `cortex usage --record` once in this repo: the first evidence file
   (`atlas/evidence/2026-09-15-usage.md`) is the recorded before-figure for step 3. Commit it
   (evidence is committed knowledge).
6. **Pedro's call, not the orchestrator's:** re-point
   `.cortex/atlas/decisions/2026-08-05-insight-pull-only-stance-reversed.md` `sources:` at the
   new evidence file and add a `bears_on` (`schema:§5`, `insight.cli`, `scaffolding.coverage-map`
   are the obvious three) — the figures the decision quotes came from a report since overwritten,
   so the narrative should say the evidence file is a re-measurement, not the original. Until
   then the two warnings stand, by design.
7. Rule-19 report: enumerate the three new checks, the four amended checks, the two scaffold
   tables (`GITIGNORE_LINES`, `CORTEX_INDEXES`), the `SUGGESTION_TYPES` entry, the three
   `validate.ts` wiring lines, and the two version constants.

## Deliberately not in this plan

- No hook reads `recall-index.json`, evidence, or `bears_on` (step 3: search-time annotation,
  PreRead marker, `cortex why`, generated index blocks).
- No SessionEnd rebuild of the recall index (threads change at session end; nothing consumes
  them from the index yet — `recall.recall-index` Notes).
- No evidence line in the SessionStart coverage map, no third `cortex usage` tracked
  subdirectory, no `check.bug` adoption of the ref resolver (`schema.bears-on` Notes).
- No `evidence-candidate` producer (the type exists; no loop measures at 3.4).
- No `SKILL_MIGRATIONS`/`SKILL_ADDITIONS` entry, no `cortex migrate` step, no `cortex.config.json`
  key (schema §10.4's 3.3→3.4 paragraph).
- No skill-bundle change beyond a one-line mention in
  `skills/cortex-loop/references/session-observe.md` that observation entries MAY carry
  `bears_on` (optional; if added, mirror to `.claude/skills/` per the test-enforced mirror) —
  the session-observe decision seed is Core-computed and the candidate JSON shape is unchanged.
