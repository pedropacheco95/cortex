---
id: B-019
title: Two compass rules (or two bugs) carrying the same id pass `cortex validate` as conformant — `check.xref-unique` only scans the two spec trees, and the project index silently keeps the last file
type: incomplete-rule
severity: high
status: open
affects:
  - schema.validator
  - src/schema/checks/xref.ts
  - src/schema/index-build.ts
proposed_fix: >-
  Add a Rule to schema.validator (which governs src/schema/**/*.ts and today has no
  rule about id uniqueness at all - Rules 5(d) and 8 cover resolution only) stating
  schema §6 global rule 1 in the spec's own words: every `id` is unique within its
  kind across everything the project index scans - dev and business specs combined,
  compass rules, compass bugs, atlas artefacts, scenario specs - a duplicate is an
  `error` from `check.xref-unique` naming every file that carries the id, and the
  index never silently discards a duplicate. Add three ACs (two R-NNN files with one
  id; two B-NNN files with one id; two specs with one id - the last one already has
  a criterion-less test at tests/atomic/schema/validator.test.ts:516) and atomic
  tests beside that one. Then fix the code: have buildIndex record id -> files[]
  (or a `duplicates` map) while it scans its full pattern list, and make
  checkXrefUnique read duplicates from the index it already receives instead of
  re-globbing SPECS_GLOB + BUSINESS_GLOB. Two adjacent follow-ups the external
  brief asked for, NOT filed here: (a) check.rule verifying the H1 number agrees
  with `id:` (filename <-> id is already enforced at compass.ts:61; the H1 is not
  checked anywhere); (b) an index-completeness warning when compass/rules/_index.md
  or compass/bugs/_index.md omits a rule or bug present on disk.
opened: 2026-09-16T16:55:00Z
---

# B-019 — duplicate rule and bug ids pass `cortex validate`

## Evidence

Reproduced 2026-09-16 with the installed binary (pnpm shim → this repo's `dist/`,
schema 3.4) in a fresh `HOME=<tmp> cortex init --no-llm --yes` project under
`/private/tmp/claude-502/…/dupid-repro/proj`, deleted afterwards.

Planted, one kind at a time, then all together:

- `compass/rules/R-026-first.md` and `R-026-second.md`, both `id: R-026`, the second's
  H1 reading `# R-027 — Second rule`, both with a resolving `source:` and a matching
  `governs:` glob.
- `compass/bugs/B-001-first.md` and `B-001-second.md`, both `id: B-001`.
- `.specflow/specs/dom/leaf-a/leaf-a.spec.md` and `dom/leaf-b/leaf-b.spec.md`, both
  `id: dom.leaf`, linked from one business spec.

Results:

```
rules + bugs only:      Conformant: YES   Errors: 0, Warnings: 0   "No violations found."
rules + bugs + specs:   [ERROR] check.xref-unique (§6)  Duplicate ID "dom.leaf" found in:
                        .specflow/specs/dom/leaf-a/leaf-a.spec.md, .specflow/specs/dom/leaf-b/leaf-b.spec.md
                        (plus check.id-matches-path on each spec) — nothing about R-026 or B-001
control (dangling path): [ERROR] check.rule (§4.2) R-026-second.md:source
                        Rule source "../../../MISSING.md" does not resolve
```

So: duplicate **spec** ids are caught; duplicate **rule** ids and duplicate **bug** ids
are not, by any check, at any severity; path resolution on the same rule file works.
The zero-warning result is stronger than the orchestrator's report (which saw
governs-resolves warnings from an unrelated cause). Atlas and scenario-spec ids sit
behind the same omission (chain step 2) and were not separately exercised.

The external project on schema 3.3 hit exactly this: two `R-026` rules, found four
separate times by four sessions in one night, each session re-allocating "the next
R-NNN" from a source that disagreed with the disk.

## The chain that broke

1. `checkXrefUnique` (`src/schema/checks/xref.ts:72-109`) receives the `ProjectIndex`
   but ignores it. Lines 76–79 re-glob **only** `SPECS_GLOB` and `BUSINESS_GLOB`,
   build a local `id → files[]` map over those files, and report entries with more
   than one file. Rules, bugs, atlas and scenario specs are never in the map.
2. `buildIndex` (`src/schema/index-build.ts:22-29`) *does* scan
   `.cortex/compass/rules/R-*.md`, `.cortex/compass/bugs/B-*.md`, `.cortex/atlas/**/*.md`
   and `tests/scenario/specs/*.md` — but line 41 is `idToPath.set(data['id'], file)`:
   a `Map<string, string>`, so the second `R-026` silently overwrites the first, and
   the information that two files claimed the id is discarded before any check runs.
   Every `resolveId('R-026')` — `governed_by`, `affects`, `bears_on`,
   `compass_rules`, `related_specs` — then resolves to whichever file fast-glob
   returned last, with no signal.
3. `check.rule` (`src/schema/checks/compass.ts:41-62`) validates each rule file in
   isolation: `id` matches `R-NNN` and matches the *filename* prefix. Both
   `R-026-first.md` and `R-026-second.md` satisfy that, so per-file checks are
   genuinely clean. Nothing in `compass.ts` looks at the H1 (`# R-027 — …` passes),
   and nothing looks across files. Same shape for `check.bug` (lines 118–138).
4. `validate.ts:87` builds the index once and `:133` calls `checkXrefUnique(root, index)`
   — the wiring is right; the check simply does not use what it is given.
5. Origin: `git log -- src/schema/checks/xref.ts` shows the check unchanged since the
   v1 foundation commit (`84ca2bd`) apart from path re-rooting. It was written when
   the index's pattern list was the two spec trees; the list grew (rules, bugs,
   atlas, scenario) and the check's private glob never followed. Nothing recent
   caused this.

## Why `incomplete-rule` and not `missing-criterion` or `test-defect`

Diagnostic tree, node 1: a dev spec governs — `schema.validator` declares
`governs: src/schema/**/*.ts`, which is where the check lives, and Appendix A of the
schema lists `check.xref-unique — global ID uniqueness — §6 — error`. Node 2: does
the spec have a rule covering the case? **No.** Rules 1–11 never mention uniqueness:
Rule 5(d) is "cross-reference *resolution* across the citation graph", Rule 8 is
"every path … must resolve". Schema §6 global rule 1 ("every `id` across specs,
compass/rules, compass/bugs and atlas is unique within its kind … Duplicate →
`error`") exists only in the contract; the spec that implements the contract never
imported it, so the implementer had no sentence to be wrong against when the glob
was narrowed to specs. That is an absent rule (Type 2), not a stated rule lacking a
Given/When/Then (Type 1).

Not `test-defect`: the one existing test ("two specs with same ID → fires",
`tests/atomic/schema/validator.test.ts:516`) is correct for what it tests; it has no
criterion to misread because there is none. It was derived from the schema, not the
spec, which is itself a symptom of the missing rule.

**Severity high, not critical.** Nothing is destroyed and `ls | sort` finds the
duplicate by hand. But the validator's one promise — "conformant" means the knowledge
layer has the agreed shape — is silently false for two of the five id kinds the
schema names, and while it is false every id-keyed reference to the duplicated id
resolves to an arbitrary one of the two files (chain step 2), the constellation
would emit two `rule:R-026` nodes against §4.9's globally-unique node ids, and the
next allocator re-derives a colliding number. Four rediscoveries in one night is the
measured cost.

## Drift check

`schema.contributor-trusts-project-knowledge` (business): outcome — mistakes "get
caught and named the moment they appear"; business rule 2 — every reported problem
says where it is and which agreement it breaks. The dev spec does not contradict
this; it under-delivers it for one facet the contract defines. No Type 6 drift; the
business spec is not invalidated and needs no change in the fix round.

## Reproduction

```
mkdir -p /tmp/x && cd /tmp/x && HOME=/tmp/xhome cortex init --no-llm --yes >/dev/null
for s in first second; do printf -- '---\nid: R-026\ntitle: %s\nsource: [../../../RULES.md]\ngoverns: ["src/**/*.ts"]\n---\n# R-026 — %s\n' $s $s > .cortex/compass/rules/R-026-$s.md; done
echo '# r' > RULES.md; mkdir src; echo 'export const x=1;' > src/x.ts
HOME=/tmp/xhome cortex validate | tail -3   # Conformant: YES, Errors: 0
```

Same with two `B-001-*.md` files. Clean up `/tmp/x` and `/tmp/xhome` afterwards.

### Change Plan

**Spec to modify:** `.specflow/specs/schema/validator.spec.md`
**Change type:** Add rule + acceptance criteria (Type 2)

**Add this rule (after Rule 11):**

12. **ID uniqueness.** Every `id` is unique within its kind across everything the
    project index scans — dev and business specs (combined, across both trees),
    compass rules, compass bugs, atlas artefacts, scenario specs (schema §6 global
    rule 1). A duplicate is an `error` from `check.xref-unique` at each file that
    carries the id, naming every other file that carries it. The project index
    never silently discards a duplicate: uniqueness is derived from the same scan
    that resolves ids, not from a second, narrower one.

**Add these criteria:**

### Two compass rules with one id are rejected
- **Given** a conformant tree plus `compass/rules/R-026-first.md` and `R-026-second.md`, both `id: R-026`, each individually valid under `check.rule`
- **When** the validator runs
- **Then** the report contains an `error` from `check.xref-unique` naming both files, and the tree is non-conformant

### Two bugs with one id are rejected
- **Given** the same tree plus `compass/bugs/B-001-first.md` and `B-001-second.md`, both `id: B-001`
- **When** the validator runs
- **Then** the report contains an `error` from `check.xref-unique` naming both files

### Two specs with one id are rejected
- **Given** two dev specs in different directories both declaring `id: schema.validator`
- **When** the validator runs
- **Then** the report contains an `error` from `check.xref-unique` naming both files (this criterion adopts the existing test at `tests/atomic/schema/validator.test.ts:516`)

**Then:**
1. Coherence check — Rule 12 sits beside Rule 8 (resolution) and must not duplicate `check.rule` / `check.bug`'s per-file id-vs-filename checks (`compass.ts:61`, `:137`), which stay where they are.
2. Atomic tests for the two new criteria in `tests/atomic/schema/validator.test.ts` beside the spec-duplicate test (same `makeTmpFixture` pattern); update `tests/spec/schema/` accordingly.
3. Run them — both new tests must fail today (rules + bugs report zero violations).
4. Fix: in `src/schema/index-build.ts` collect `id → files[]` during the single scan (expose it on `ProjectIndex`, keep `idToPath` for callers); in `src/schema/checks/xref.ts` make `checkXrefUnique` iterate that map and drop its private glob. Report at every duplicate's location, not only `files[0]`.
5. Rule-19 report: the change touches `check.xref-unique`, the `ProjectIndex` type, and — if the location changes — the violation count for the existing spec test; enumerate all three.
6. Run `pnpm test:atomic` and `pnpm test:spec` for `schema`.

**Adjacent follow-ups (proposed, not filed — each is its own bug or spec change):**

- **Rule-number agreement across filename, `id:` and H1.** `check.rule` already
  enforces filename ↔ `id:` (`compass.ts:61`). It never reads the H1, so
  `# R-027 — …` under `id: R-026` passes. Candidate: a `warning` (the H1 is prose,
  §4.1 does not mandate its shape) from `check.rule` when a `# R-NNN` heading is
  present and disagrees with `id`. Same for `check.bug` and `# B-NNN`.
- **Index completeness.** A rule or bug on disk that `compass/rules/_index.md` or
  `compass/bugs/_index.md` does not mention → `warning` from `check.index-present`
  or a new `check.index-complete`. This is how a duplicate stays invisible: each
  session reads the index, allocates the next number from it, and never sees the
  file the previous session added.

### Related

- B-014 (schema-version declaration lag) and B-008 (index-present flagging transient
  dirs) are the earlier rounds where a validator check's scope drifted from the
  schema's; this is the same family in `check.xref-unique`.

### Resolution

(open)

### External evidence

First reported by an external Cortex adopter on schema 3.3, whose coordinator's 2026-09-14
improvement brief is ingested as `archive.parallel-wave-brief-2026-09-14`. There, two
`compass/rules/R-026-*.md` files shared one id, `cortex validate` reported 16 unrelated errors
and none was this, and four parallel sessions rediscovered the collision independently in one
evening — the measured cost of the defect. The brief also asks for the two adjacent follow-ups
listed above (H1 agreement, index completeness). Claims, asks and the ingestion-day
verification against 3.4: `.cortex/archive/documents/parallel-wave-brief-2026-09-14/extracted/`
(`evidence.md` E-02 and V-02, `asks.md` A-01–A-03, `contradictions.md` X-02).