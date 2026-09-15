---
id: schema.schema-clauses
status: implemented
depends_on:
  - schema.validator
governs:
  - "src/schema/clauses.ts"
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by:
  - R-001
---

# Addressable Schema Clauses — `schema:§N[.M[.K]]`

## Intent

Every validator violation already cites a clause of `cortex-schema.md` (`§4.6`, `§4.10.11`, `§6`),
so the grammar for naming a section of the contract exists and is used on every run. What does not
exist is a way for an artefact to *point at* a clause: a decision that reversed the §5 pull-only
stance, or a measurement of the §5 coverage map, has no ref form that resolves. This spec makes the
clause grammar a reference form (schema §6.2) — `schema:` + `§` + one to three dot-separated
integers — and owns the resolver: a deterministic scan of the schema document's headings, read once
and cached per validate run, returning found-or-not. It is the smallest piece of the recall work
(step 2) and the one `schema.bears-on` and `recall.recall-index` both call.

## Entities

- **READS:** `cortex-schema.md` at the project root (heading lines only).
- **WRITES:** nothing.
- **CREATES:** an in-memory clause index (`Set<string>` of heading numbers) per validate run;
  never persisted.

## Rules

1. **Grammar.** A clause ref is the string `schema:§` followed by one, two or three integers
   separated by single dots — `schema:§5`, `schema:§4.11`, `schema:§4.10.11`. The regex is
   `/^schema:§\d+(\.\d+){0,2}$/`. Anything else beginning `schema:` is malformed (a `warning`
   naming the ref, from whichever check carries it — Rule 6). Whitespace is not tolerated inside
   the ref.

2. **Resolution is a heading scan.** The document is `cortex-schema.md` at the project root
   (never elsewhere; a project without it resolves nothing). A ref `schema:§A[.B[.C]]` resolves
   iff a markdown heading line exists whose text, after the `#` run and a space, **starts with**
   the number `A`, `A.B`, or `A.B.C` followed by a space or a full stop (`## 6. Cross-reference`,
   `### 6.2 Addressable`, `#### 4.10.11 Project-context`). The title after the number is not part
   of the match, so a retitled section still resolves. Headings inside fenced code blocks are
   skipped (a fence toggles a skip state, line by line). Appendix headings (`## Appendix A`) and
   the unnumbered decisions list under §0 carry no number and are not addressable.

3. **Read once, cached per run.** `loadClauseIndex(root)` reads the document once and returns a
   `ClauseIndex` (the set of every numbered heading found, e.g. `{"1","2","2.1",…,"6.2"}`);
   `clauseResolves(index, ref)` is a pure set lookup. Every check and the recall compiler take the
   index as an argument — the document is never re-read per ref. Two runs over the same document
   agree.

4. **Deterministic Core** (R-001): file read and string matching only. No LLM, no network.

5. **Unresolved is a warning, never an error.** The schema is revised in place (atlas decision
   2026-07-10) and sections may in principle be renumbered at a MAJOR; a ref that no longer
   resolves must surface as a warning that names the ref and the citing file so a human can
   re-point it, not fail the tree. The severity is fixed here so that every carrier applies it
   identically (`schema.bears-on` Rule 5, `check.bears-on`).

6. **Renumbering discipline (schema §6.2).** Sections are appended, never renumbered, within a
   MAJOR; a removed section leaves its number vacant. This is a documentation rule the resolver
   relies on, recorded in the schema so the constraint is visible to whoever edits it.

## Acceptance Criteria

### A present clause resolves at every depth

- **Given** a `cortex-schema.md` containing the headings `## 6. Cross-reference conventions`,
  `### 6.2 Addressable schema clauses` and `#### 4.10.11 Project-context observations`
- **When** `loadClauseIndex(root)` runs and `clauseResolves` is asked for `schema:§6`,
  `schema:§6.2` and `schema:§4.10.11`
- **Then** all three resolve

### An absent clause does not resolve

- **Given** the same document
- **When** `clauseResolves` is asked for `schema:§6.9` and `schema:§99`
- **Then** neither resolves

### A retitled section still resolves

- **Given** the heading `### 6.2 Something else entirely`
- **When** `schema:§6.2` is resolved
- **Then** it resolves — the number, not the title, is the key

### Headings inside code fences are ignored

- **Given** a document whose only `### 7.9` line sits inside a ```` ``` ```` fenced block
- **When** `schema:§7.9` is resolved
- **Then** it does not resolve

### Malformed refs are rejected by the grammar, not looked up

- **Given** the refs `schema:6`, `schema:§`, `schema:§4.10.11.2` and `schema:§ 5`
- **When** each is tested against the grammar
- **Then** none matches, and `clauseResolves` is never consulted for them

### The document is read once per run

- **Given** a validate run over a project with 30 clause refs across decisions and evidence files
- **When** the run completes
- **Then** `cortex-schema.md` was opened exactly once (a read spy on the index loader), and every
  resolution was a lookup against the cached index

### A project without the schema document resolves nothing, without error

- **Given** a project root with no `cortex-schema.md`
- **When** `loadClauseIndex(root)` runs
- **Then** it returns an empty index and no exception; every clause ref is then reported as
  unresolved by its carrier's check at `warning` severity

## Notes

- **Why a `warning`.** The alternative — error on a dangling clause ref — would let a schema
  edit break `cortex validate` for every project carrying evidence, which is exactly the coupling
  the in-place-revision decision warned against. A warning that names itself is findable and
  fixable; an error is a wall.
- **Not addressable on purpose:** Appendix A rows and §0 decisions. Both are tables and lists
  whose stable handles are check ids and decision numbers, not section numbers; a `bears_on`
  entry that wants to point at a check names its clause instead.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
