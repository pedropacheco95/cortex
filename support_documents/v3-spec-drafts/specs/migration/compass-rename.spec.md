---
id: migration.compass-rename
status: draft
depends_on: []
implements: ../../specs-business/migration/the-modules-name-what-they-hold.business.md
governed_by: []
governs:
  - "src/schema/**/*.ts"
  - "src/cli/**/*.ts"
  - "src/scaffold/**/*.ts"
  - ".claude/skills/**/*.md"
  - "CLAUDE.md"
  - "loop.md"
---

# `cerebrum` → `compass` — the module rename

## Intent

`cerebrum` was a brain-metaphor name for a module that holds rules, conventions, and the bug ledger — governance-shaped content, not brain-metaphor content. `compass` names the role instead: the thing that tells the project which way it must go at the enforcement layer (design §3.2, §4.1). This spec is the mechanical rename and its ripple: the directory move, every path-constant and validator-check re-root that reads it, the scaffolding and skill/loop text that names it, and the coupled version-gate activation to schema 3.0 (build-order-v3 step 2, sub-batch 2a). It implements addendum §A1 in full except A2 (decisions single-home), which is a separate, dependent spec (`migration.decisions-single-home`).

**Precondition, not a spec dependency.** This spec has no `depends_on` entry, but it cannot be executed until `cortex-schema-v3-addendum.md` is folded into `cortex-schema.md` as the contract in force (build-order-v3 step 1) — every re-root here is re-rooting *to* the addendum's `compass` spelling, which does not exist as a contract clause until that fold lands. This is a build-sequencing precondition, not an inter-spec dependency, because the addendum is a contract document, not a dev spec with an `id` this field can reference.

## Entities

- **READS:** the existing `.cortex/cerebrum/` tree (`preferences.md`, `environment.md`, `do-not-repeat.md`, `standing-authorities.md`, `rules/`, `bugs/`); every Core path constant and validator check that names `cerebrum` (`check.rule`, `check.bug`, `check.layout`, `check.index-shape`, `check.rule-governs-resolves`, the PreWrite enforcement read, the constellation node-id grammar and Level-1 group id); the CLAUDE.md managed block; every `_index.md`; `loop.md` (if present); the hook payload templates; every skill/loop bundle that names `cerebrum/` in its instructions (at minimum `cortex-loop-rule-decay`, `cortex-pulse-distil`, `specflow-bugs`).
- **WRITES:** the renamed `.cortex/compass/` tree (a directory move, not a re-derivation — file content is untouched); every re-rooted path constant and validator-check definition; the re-rooted CLAUDE.md managed block, `_index.md` files, `loop.md`, and hook payload templates; the re-rooted skill/loop instruction text; `.cortex/cortex.config.json` (`schemaVersion` → `"3.0"`, coupled per build-order-v3 step 2).
- **CREATES:** nothing new — this is a rename-and-re-root spec. No new artefact shape is introduced (contrast `migration.decisions-single-home`, which removes an artefact).

## Rules

1. **Directory move, content-preserving, `decisions.md` excepted.** `.cortex/cerebrum/` moves to `.cortex/compass/` as a directory rename covering every file in `cerebrum/` **except** `decisions.md` (rule 2): every other file's content, frontmatter, and filename are byte-identical before and after, except for the path prefix itself. After this spec's change, `.cortex/cerebrum/` contains nothing but `decisions.md`, awaiting removal by the dependent spec.
2. **`decisions.md` is excluded from this move.** Per design §4.2 and build-order-v3 step 2's sequencing note ("the file is removed rather than renamed-then-removed"), `cerebrum/decisions.md` is deliberately left at its original path and is **not** carried into `compass/`. It is deleted in place by the dependent spec `migration.decisions-single-home`, so it never exists at `compass/decisions.md`. `compass/` MUST NOT contain a `decisions.md` at any point this spec's changes are observed.
3. **Rule and bug identifiers are unchanged.** `R-NNN`/`B-NNN` ids, their filenames, and their constellation node-id prefixes (`rule:R-NNN`, `bug:B-NNN`) are content-keyed, not path-keyed (addendum §A1, §A1.4). Nothing in this rename touches an `id` field or a node prefix.
4. **Every validator check that reads cerebrum re-roots its read path to `compass/`, keeping its check ID.** `check.rule`, `check.bug`, `check.layout`, `check.index-shape`, `check.rule-governs-resolves` change only what path they read; their names are unchanged (addendum §A0.3's reconciliation note: no check is literally named `check.cerebrum-*`, so nothing is renamed — only re-rooted).
5. **The PreWrite enforcement read re-roots.** The `PreToolUse (Write/Edit)` hook's rule lookup reads `.cortex/compass/rules/` instead of `.cortex/cerebrum/rules/`; the warning payload text is unchanged (addendum §A1.5).
6. **The constellation node-id grammar's module-path spelling re-roots.** `cerebrum:<file>` becomes `compass:<file>`; the `module` enum value `cerebrum` becomes `compass`; the Level-1 constellation group id `cerebrum` becomes `compass`. Content-keyed prefixes (`rule:`, `bug:`) are unaffected (addendum §A1.4).
7. **Scaffolding re-roots.** The CLAUDE.md managed block, every `_index.md` that names cerebrum (most directly `compass/_index.md` itself, per addendum §A1.7), `loop.md`'s "never mutate gated content" wording, and the hook payload templates all read `compass/` after this change. Content outside the CLAUDE.md managed block is never touched.
8. **Skill and loop instruction text re-roots.** Every cortex-* loop and specflow-* skill bundle whose instructions name `cerebrum/` is rewritten to name `compass/`. A repo-wide search for the literal string `cerebrum` across `.claude/skills/**` and loop instruction text MUST return no matches after this change, other than in explicitly preserved historical/changelog text.
9. **Version-gate activation is coupled to this rename, not sequenced separately.** `.cortex/cortex.config.json` `schemaVersion` moves to `"3.0"` and the validator's `supportedMajor` becomes `3` in the same change as the directory move and re-roots (build-order-v3 step 2, spine fact 2). The repo MUST NOT pass through an intermediate state where the config declares `3.0` while paths are still `cerebrum/`, or vice versa.
10. **Checks for not-yet-existing v3 modules tolerate absence.** Any check this spec's neighbors will later add (`check.archive-*`, `check.insight-*`, `check.provenance`) is out of scope here, but this spec's re-rooted checks MUST NOT themselves start requiring `archive/` or the rebuilt `insight/` to exist — this rename activates the 3.0 version gate on its own, before those modules land (build-order-v3 spine fact 2).
11. **RULES 19 — the change report enumerates every touched surface.** The change report accompanying this spec's implementation MUST list every `check.*` whose read-root changed, every scaffolding file rewritten (by path), and every skill/loop bundle file touched (by path) — not merely "renamed the cerebrum directory." A report naming only the directory move while three validator checks and five skill files also changed underneath it is the exact failure mode RULES 19 exists to prevent.
12. **No silent destruction.** Every write this spec performs is either a directory move (rule 1) or an in-place text re-root (rules 4–9); nothing is deleted except as explicitly carved out by rule 2, and that deletion belongs to the dependent spec, not this one.

## Acceptance Criteria

### The directory move is content-preserving and complete

- **Given** a project with `.cortex/cerebrum/` containing `preferences.md`, `environment.md`, `do-not-repeat.md`, `standing-authorities.md`, `rules/R-014-no-camelcase.md`, and `bugs/B-031-camelcase-column.md`
- **When** the compass-rename migration runs
- **Then** `.cortex/compass/` contains every one of those files with byte-identical content and filenames
- **And** `.cortex/cerebrum/` no longer exists

### `decisions.md` is excluded from the move, not renamed-then-removed

- **Given** the same project also has `.cortex/cerebrum/decisions.md`
- **When** the compass-rename migration runs
- **Then** `.cortex/compass/decisions.md` does **not** exist at any point during or after this spec's change
- **And** `.cortex/cerebrum/decisions.md` remains exactly where it was, untouched, for `migration.decisions-single-home` to remove

### Rule and bug identifiers survive unchanged

- **Given** `rules/R-014-no-camelcase.md` (frontmatter `id: R-014`) and `bugs/B-031-camelcase-column.md` (frontmatter `id: B-031`) under `.cortex/cerebrum/`
- **When** the migration runs
- **Then** the corresponding files under `.cortex/compass/rules/` and `.cortex/compass/bugs/` carry identical `id` frontmatter (`R-014`, `B-031`) and identical filenames
- **And** the constellation node ids `rule:R-014` and `bug:B-031` are unchanged after a re-compile

### Validator checks re-root and pass, keeping their IDs

- **Given** the renamed tree
- **When** `cortex validate` runs
- **Then** `check.rule`, `check.bug`, `check.layout`, `check.index-shape`, and `check.rule-governs-resolves` read paths under `compass/`
- **And** none of them is renamed to a `check.compass-*` form
- **And** all five report zero errors against the renamed tree

### PreWrite enforcement reads compass

- **Given** a rule under `.cortex/compass/rules/` whose `governs` glob matches a file about to be written
- **When** the `PreToolUse (Write/Edit)` hook fires
- **Then** it reads the rule from `.cortex/compass/rules/` (not `.cortex/cerebrum/rules/`)
- **And** the emitted warning text is unchanged in shape from the pre-rename payload contract

### Node-id grammar module-path re-spells; content-keyed prefixes don't

- **Given** the constellation compiler runs after the rename
- **When** it emits a node sourced from a compass core file (e.g. `preferences.md`)
- **Then** the node id reads `compass:preferences.md` (not `cerebrum:preferences.md`)
- **And** a node for `R-014` still reads `rule:R-014`, and for `B-031` still reads `bug:B-031`
- **And** the Level-1 constellation group id is `compass`

### Scaffolding surfaces re-root without disturbing unrelated content

- **Given** a CLAUDE.md with a `<!-- cortex:start -->…<!-- cortex:end -->` managed block naming `cerebrum/`, plus author-written prose above and below the block
- **When** the migration runs
- **Then** the managed block names `compass/` and the author's prose outside the block is byte-identical to before
- **And** every module `_index.md` and `loop.md` (if present) that named `cerebrum/` now names `compass/`
- **And** `check.claude-md`, `check.loop-md`, and `check.index-shape` all pass

### Skill and loop instruction text is fully re-rooted

- **Given** `cortex-loop-rule-decay`, `cortex-pulse-distil`, and `specflow-bugs` (and any other bundle) whose instructions name `cerebrum/`
- **When** the migration runs
- **Then** a case-sensitive search for the literal string `cerebrum` across `.claude/skills/**` and all loop instruction text returns zero matches, excluding any content explicitly marked as historical/changelog

### Version-gate activation is atomic with the rename

- **Given** the renamed tree, mid-migration
- **When** the migration's single commit lands
- **Then** `.cortex/cortex.config.json` `schemaVersion` reads `"3.0"` and the validator's `supportedMajor` is `3` in that same commit
- **And** there is no intermediate, separately-observable state where the config says `3.0` but any path still reads `cerebrum/`, or where every path reads `compass/` but the config still says `2.0`

### Change report enumerates every touched surface (RULES 19)

- **Given** the migration's change report
- **When** it is checked against the actual diff
- **Then** it names every `check.*` whose read-root changed, every scaffolding file rewritten, and every skill/loop file touched, individually by path
- **And** it does not merely state "renamed cerebrum to compass" without the enumeration

### Full regression is green, dogfooded on this repo

- **Given** this repository, with the migration applied to its own `.cortex/`
- **When** `cortex validate` runs
- **Then** it reports zero errors
- **And** any warnings present are pre-existing and unrelated to this rename

## Notes

- **OPEN:** the exact mechanics of "content-preserving directory move" (a literal filesystem move vs. a copy-then-delete performed by Core) are implementation-defined; either satisfies this spec's acceptance criteria as long as content and identifiers survive byte-identical.
- **Resolved:** `decisions.md` never lands at the `compass/` path at all — it is excluded from this move entirely (rule 2) and is deleted directly from `.cortex/cerebrum/decisions.md` by the dependent spec `migration.decisions-single-home`, as its own step after this rename has landed. This is the "removed rather than renamed-then-removed" reading design §4.2 prefers, now unambiguous across both migration specs.
- This spec's change report is the artefact addendum §A0 (the change ledger) is checked against; the addendum's own A0.2/A0.3 tables are the reviewer's checklist for completeness.
- Depends, at the build-sequencing level (not the `depends_on` field), on `cortex-schema-v3-addendum.md` being folded into the live contract first (build-order-v3 step 1).
