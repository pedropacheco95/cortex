---
id: migration.decisions-single-home
status: implemented
depends_on:
  - migration.compass-rename
implements: ../../specs-business/migration/the-modules-name-what-they-hold.business.md
governed_by: []
governs:
  - "src/schema/**/*.ts"
  - ".cortex/compass/rules/**/*.md"
  - ".cortex/atlas/decisions/**/*.md"
---

# Decisions single-home — removing the `cerebrum`/`compass` duplicate

## Intent

v1/v2 carried `atlas/decisions/` and `cerebrum/decisions.md` as "the same data, two views" — a framing that accumulates drift the moment one copy is edited without the other. This spec removes the duplicate: **decisions live only in `atlas/decisions/`.** A compass rule that derives from a decision no longer restates it inline; it cites it via `provenance: - derives_from: atlas/decisions/<slug>.md`. It implements addendum §A2 and design §4.2, and is the second half of build-order-v3 step 2 (sub-batch 2b), landing only after `migration.compass-rename` (2a) is green — the rename must land first so this spec's citations point at the final `compass/` path.

**The provenance citation this spec produces is provisional, not validated, at the point this spec lands.** Addendum §A6's `check.provenance` does not exist until the later `provenance.frontmatter-check` spec (build-order-v3 step 4). Per build-order-v3 flag F8, this spec writes the `provenance:`/`derives_from:` field in its final shape, but no validator check resolves it yet — that upgrade from plain reference to validated reference is step 4's job, not this spec's.

## Entities

- **READS:** `.cortex/cerebrum/decisions.md` (left in place, untouched, by `migration.compass-rename`'s rule 2); `.cortex/atlas/decisions/*.md` (the sole home this spec confirms); every `.cortex/compass/rules/R-NNN-*.md` file, to detect which ones inline decision text that duplicates a `cerebrum/decisions.md` entry.
- **WRITES:** the compass rule files whose bodies inlined decision text — each such rule's frontmatter gains a `provenance:` list entry and its body's inlined copy is replaced by a citation pointer; the corresponding `atlas/decisions/<slug>.md` files — each gains (or already carries) a `compass_rules:` list entry naming the rule(s) that cite it (the field renamed from `cerebrum_rules`, addendum §A2.2).
- **CREATES:** a new `atlas/decisions/<slug>.md` entry for any decision that existed in `cerebrum/decisions.md` but had no corresponding atlas entry — reconciliation, not just deletion, so consolidating the duplicate never loses a fact (business rule 4 of `migration.the-modules-name-what-they-hold`).
- **DELETES:** `.cortex/cerebrum/decisions.md` (the file this spec removes; it never transits through `compass/decisions.md` — see `migration.compass-rename` rule 2 and its Notes).

## Rules

1. **`cerebrum/decisions.md` is removed, not renamed.** This spec deletes the file directly from the path `migration.compass-rename` left it at. `compass/decisions.md` MUST NOT exist before, during, or after this spec's change (consistent with `migration.compass-rename` rule 2).
2. **No decision content is lost in the removal.** Every decision entry in `cerebrum/decisions.md` that has no matching entry under `atlas/decisions/` is migrated into a new `atlas/decisions/YYYY-MM-DD-<slug>.md` file (schema §4.4 shape) before the source file is deleted. An entry already mirrored in atlas is not duplicated again — it is simply confirmed present.
3. **`atlas/decisions/` becomes the sole decisions home.** After this spec, no code path, hook, skill, or scaffolding text reads or writes decision content anywhere but `atlas/decisions/`.
4. **Inline-copied decision text in a compass rule is replaced by a provenance citation, not deleted outright.** Where a rule's body inlined a decision's reasoning (verbatim or paraphrased) that also lived in `cerebrum/decisions.md`, the rule's frontmatter gains a `provenance:` list with a `derives_from: atlas/decisions/<slug>.md` entry, and the inlined text in the rule's body is replaced with a short pointer directing the reader to follow the citation for the full narrative (design §4.2; addendum §A2.2, §A6.1 field shape).
5. **The citation is written in its final shape but is not yet validator-checked.** `check.provenance` does not exist until `provenance.frontmatter-check` (build-order-v3 step 4). This spec's `provenance:` entries MUST use the exact field shape addendum §A6.1 specifies, so step 4 needs no rewrite — only new enforcement — but this spec's own acceptance criteria do not require a `check.provenance` pass, because the check doesn't exist yet.
6. **Rules with no decision linkage are untouched.** A compass rule that never inlined or referenced `cerebrum/decisions.md` content keeps its frontmatter and body byte-identical (aside from the earlier compass-rename path move).
7. **Many-to-one citation is permitted.** If more than one rule inlined the same decision's text, each rule gets its own `derives_from` entry pointing at the same atlas decision file — the citation is not deduplicated away, and neither rule is treated as the "canonical" citer.
8. **The atlas-side field renames `cerebrum_rules` → `compass_rules`.** Every `atlas/decisions/*.md` file's `cerebrum_rules:` frontmatter field (the forward half of the citation — decision to rules) is renamed `compass_rules:`, keeping the same list content, whether or not this spec adds new entries to it (addendum §A2.2).
9. **Validator green after the removal.** `cortex validate` reports zero errors on the resulting tree: `check.atlas` passes with the renamed field and any newly-added `provenance:`/`compass_rules:` entries; no check flags a dangling reference to the removed `decisions.md`.
10. **No silent destruction.** Every rule-body edit under rule 4 is a targeted replacement of the specific inlined passage, not a wholesale rewrite of the rule; every atlas file touched is an append or field rename, never a deletion of existing decision content.

## Acceptance Criteria

### `.cortex/cerebrum/decisions.md` — never renamed, deleted directly from its original path

- **Given** `.cortex/cerebrum/decisions.md` exists (left untouched by `migration.compass-rename`) and `.cortex/compass/` has no `decisions.md`
- **When** the decisions-single-home migration runs
- **Then** neither `.cortex/cerebrum/decisions.md` nor `.cortex/compass/decisions.md` exists afterward

### No decision content is lost — reconciliation before deletion

- **Given** `cerebrum/decisions.md` contains a decision entry ("2026-03-02 — chose Postgres over SQLite for local dev") with no corresponding file under `atlas/decisions/`
- **When** the migration runs
- **Then** a new `atlas/decisions/2026-03-02-postgres-over-sqlite.md` file exists, conforming to schema §4.4, carrying that decision's narrative
- **And** the original `cerebrum/decisions.md` entry is not duplicated a second time if it already existed in atlas under a different file

### Atlas is confirmed the sole decisions home

- **Given** the migration has completed
- **When** any hook, skill, or scaffolding text is searched for a decisions-content reference
- **Then** every such reference resolves only into `.cortex/atlas/decisions/` — none references `compass/decisions.md` or `cerebrum/decisions.md`

### Inline-copied decision text becomes a provenance citation

- **Given** `compass/rules/R-014-no-camelcase.md` whose body inlined the reasoning from decision `2026-04-12-db-naming` (also present in `cerebrum/decisions.md`)
- **When** the migration runs
- **Then** `R-014-no-camelcase.md`'s frontmatter gains `provenance:` with a `derives_from: atlas/decisions/2026-04-12-db-naming.md` entry
- **And** the inlined decision text is replaced in the rule's body by a short pointer to follow the citation
- **And** `atlas/decisions/2026-04-12-db-naming.md` is unchanged in its own narrative content

### The citation lands provisional — no `check.provenance` gate yet

- **Given** the same `R-014-no-camelcase.md` after this migration
- **When** `cortex validate` runs (at this point in the build order, before `provenance.frontmatter-check` ships)
- **Then** validation does not fail or warn on the `provenance:` field's resolvability, because `check.provenance` does not exist yet
- **And** the field's shape exactly matches addendum §A6.1, so no rewrite is needed when `check.provenance` is added later

### Rules with no decision linkage are untouched

- **Given** `compass/rules/R-020-no-console-log.md`, which never referenced `cerebrum/decisions.md`
- **When** the migration runs
- **Then** `R-020-no-console-log.md`'s frontmatter and body are byte-identical to their state immediately after `migration.compass-rename` (i.e., unchanged except for the earlier path move)

### Many rules citing the same decision each get their own citation

- **Given** both `R-014-no-camelcase.md` and `R-015-no-camelcase-migrations.md` inlined the same `2026-04-12-db-naming` decision text
- **When** the migration runs
- **Then** both rules carry their own `derives_from: atlas/decisions/2026-04-12-db-naming.md` entry
- **And** neither rule's citation is dropped in favor of the other's

### The atlas-side field renames without content loss

- **Given** `atlas/decisions/2026-04-12-db-naming.md` with frontmatter `cerebrum_rules: [R-014]`
- **When** the migration runs and adds `R-015` as a new citer
- **Then** the file's frontmatter reads `compass_rules: [R-014, R-015]` — the field renamed, the prior entry preserved, the new one appended

### Validator green after the removal

- **Given** the fully migrated repo (dogfooded on this repository)
- **When** `cortex validate` runs
- **Then** it reports zero errors, `check.atlas` passes on every decision file's `compass_rules` field, and no check flags a dangling reference to the removed `decisions.md`

## Notes

- **Resolved:** `cerebrum/decisions.md` is deleted directly from its pre-rename location — it never exists at `compass/decisions.md` (`migration.compass-rename` rule 2 excludes it from the directory move entirely). This spec's step runs after that rename has landed, as its own step in the same overall migration sequence.
- **OPEN:** the detection method for "a rule's body inlined a decision's text" (exact-substring match, paraphrase-judgment, or a human-curated list going into this migration) is left to the implementation — this spec's acceptance criteria are agnostic to the detection mechanism, only to the resulting citation shape and content preservation.
- This spec's `provenance:` field shape is locked by addendum §A6.1 precisely so that `provenance.frontmatter-check` (build-order-v3 step 4) needs only to add validation, never to rewrite what this spec wrote.
- Depends on `migration.compass-rename` landing first (both as a formal `depends_on` entry and because its citations must point at `compass/rules/*` and the addendum's `compass_rules` spelling must already be in force).
