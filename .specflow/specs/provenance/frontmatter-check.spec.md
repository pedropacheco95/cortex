---
id: provenance.frontmatter-check
status: implemented
depends_on:
  - archive.ingest-skill
  - migration.compass-rename
implements: ../../specs-business/provenance/every-rule-traces-to-its-source.business.md
governed_by: []
governs:
  - "src/schema/provenance-index.ts"
  - ".cortex/compass/rules/**"
  - ".specflow/specs/**"
  - ".specflow/specs-business/**"
  - ".cortex/atlas/decisions/**"
---

# `provenance:` / `derives_from:` frontmatter + `check.provenance`

## Intent

This spec is build-order-v3 step 4 (design §7, schema-v3-addendum §A6): the `provenance:` frontmatter field carrying `derives_from:` entries, added to compass rules, both spec trees, and atlas decisions; the three source-type reference forms and their differing resolution semantics; and `check.provenance`, the validator check that enforces resolution and maintains the backward-traversal index that answers "what derives from this source." Provenance is a natural extension of the existing curated citation graph (schema §6) — same frontmatter-cross-reference mechanism, same resolves-checking machinery — adding exactly one new capability: traversing *backward* from a source to its derivations. This spec also completes the `derives_from` stamping on artefacts `archive.ingest-skill`'s step-7 plan-application creates (build-order-v3 spine fact 3), and upgrades the plain references `migration.compass-rename`'s decisions-single-home step left behind into validated provenance (build-order-v3 step 2b / F8).

## Entities

- **READS:** `provenance:` frontmatter on every compass rule (`compass/rules/*.md`), every dev spec (`.specflow/specs/**/*.spec.md`), every business spec (`.specflow/specs-business/**/*.business.md`), and every atlas decision (`atlas/decisions/*.md`); the referenced targets themselves, to confirm they resolve — `archive/documents/**` (source or extracted paths) and `atlas/decisions/**`.
- **WRITES:** the backward-traversal index (a derived, machine-maintained artefact — its exact storage location is an implementation detail of this spec, e.g. alongside the constellation compiler's output; it is regenerated from the forward `provenance:` references, never hand-edited).
- **CREATES:** nothing gated. `check.provenance` is a read-and-index check, not a content-writing one. The `provenance:` field itself is created by whichever process authors the rule/spec/decision (a human, or `archive.ingest-skill`'s plan-application step) — this spec defines the field's contract and validates it, it does not author it.

## Rules

1. **`provenance:` is an optional list; each entry has exactly one key, `derives_from` (schema-v3-addendum §A6.1).** v3 uses exactly one relationship type — no `informed_by`/`contradicted_by` taxonomy (design §7.3; a future refinement, out of scope here).
2. **Absence means authored directly, not unknown origin (design §7.3, schema-v3-addendum §A6.1).** A rule/spec/decision with no `provenance:` field is not flagged, warned about, or treated as incomplete — it is a complete, valid statement that no external authority is being claimed.
3. **Three source-type reference forms, each with its own resolution rule (design §7.2, schema-v3-addendum §A6.2):**
   - **Archive path** (`archive/documents/<slug>/extracted/...` or `.../source.<ext>`) — MUST resolve to an existing file; unresolved is an `error`.
   - **Atlas decision** (`atlas/decisions/<slug>.md`) — MUST resolve to an existing decision file; unresolved is an `error`.
   - **Claude Code session** (`claude-sessions/<user>/<session-id>`) — cited, not resolved. Not stored in Cortex; `check.provenance` validates only that the reference is well-formed (matches the `claude-sessions/<user>/<id>` shape) and never attempts to look it up or fail it for being unretrievable.
4. **`check.provenance` validates every `provenance:` entry (schema-v3-addendum §A6.3):** exactly one key (`derives_from`) per entry; archive-path and atlas-decision references resolve (`error` if not); `claude-sessions/*` references are shape-checked only. A malformed entry (missing `derives_from`, an extra key, or a reference matching none of the three forms) is an `error`.
5. **The backward-traversal index is maintained by this check, not a separate process (schema-v3-addendum §A6.3, design §7.4).** Every resolvable `derives_from` target (archive path or atlas decision) is indexed to the artefact(s) citing it, so a query "what derives from `archive/documents/client-spec-v2.0/extracted/requirements/GT-CLIENT-001-session-expiry.md`" returns every rule/spec/decision whose `provenance:` cites it, without a manual project-wide search.
6. **Drift detection on source change (design §7.4, §6.5 step 3).** When an archive document is superseded with changed requirements, or an atlas decision is revisited, the backward-traversal index is the mechanism that surfaces every rule/spec/decision citing the changed source — this is a read against the index, not a new write path; the index itself does not decide what changed, it only answers what depends on what.
7. **Provenance reuses the existing citation-graph machinery (schema §6), not a parallel system (design §7.4).** `provenance:` entries are validated with the same frontmatter-cross-reference discipline as `implements`/`depends_on`/`governs` — this spec adds a field and a backward index, not a second validation pipeline.
8. **Compass-rule-cites-decision-via-provenance (schema-v3-addendum §A2.2).** A compass rule that derives from an atlas decision does not restate the decision's reasoning inline — it carries `provenance: - derives_from: atlas/decisions/<slug>.md` and the reasoning is read by following that reference. `atlas/decisions/*.md` frontmatter's `compass_rules:` field is the forward half of this same citation (the decision listing rules derived from it); this spec's `provenance:` field is the backward half from the rule's side.

## Acceptance Criteria

### A rule with archive provenance resolves cleanly

- **Given** `compass/rules/R-042-session-expiry.md` carries `provenance: - derives_from: archive/documents/client-spec-v2.0/extracted/requirements/GT-CLIENT-001-session-expiry.md`, and that file exists
- **When** `check.provenance` runs
- **Then** the entry passes with no error, and the backward index records `R-042` as a derivation of that archive path

### A rule with a dangling archive reference is caught

- **Given** a rule's `provenance:` names `archive/documents/client-spec-v9.9/extracted/requirements/GT-CLIENT-999-nonexistent.md`, which does not exist
- **When** `check.provenance` runs
- **Then** it reports an `error` naming the unresolved reference and the rule

### An atlas-decision reference resolves and is indexed

- **Given** a dev spec carries `provenance: - derives_from: atlas/decisions/2026-04-12-db-naming.md`, and that decision file exists
- **When** `check.provenance` runs
- **Then** the entry passes, and querying the backward index for that decision includes this dev spec

### A Claude-session reference is cited, not resolved

- **Given** a business spec carries `provenance: - derives_from: claude-sessions/pedro/abc123def`
- **When** `check.provenance` runs
- **Then** the entry passes because the shape matches `claude-sessions/<user>/<id>` — no lookup is attempted, and a session id that doesn't correspond to any retrievable transcript is NOT an error

### A malformed provenance entry is rejected

- **Given** an atlas decision's frontmatter carries `provenance: - informed_by: atlas/decisions/2026-01-01-x.md` (wrong key) or `provenance: - derives_from: not-a-real-path-shape`
- **When** `check.provenance` runs
- **Then** it reports an `error` — wrong key, or a reference matching none of the three source-type forms

### Absence of provenance is not a violation

- **Given** a compass rule with no `provenance:` field at all
- **When** `check.provenance` runs
- **Then** it passes with no warning or error — absence means "authored directly"

### The backward-traversal index answers a renegotiation query

- **Given** three artefacts — a rule, a dev spec, and an atlas decision — all carry `provenance: - derives_from: archive/documents/client-spec-v2.0/extracted/requirements/GT-CLIENT-001-session-expiry.md`
- **When** the backward-traversal index is queried for that archive path
- **Then** all three artefacts are returned, and none are missed

### Drift surfaces downstream artefacts when a source is superseded

- **Given** `client-spec-v2.0` is superseded by `client-spec-v2.1` (via `archive.ingest-skill`'s version-update workflow, §6.5) and `GT-CLIENT-001-session-expiry.md`'s requirement changed between versions
- **When** the version-update workflow consults the backward-traversal index for the changed requirement's path
- **Then** every rule/spec/decision citing that path is surfaced for review — none silently continue enforcing a superseded requirement unnoticed

### Archive-ingestion-created artefacts are stamped with provenance

- **Given** `archive.ingest-skill`'s step 7 creates a new compass rule from an approved change plan sourced from an ingested document
- **When** the rule is written (on `pulse-accept` of the proposal, per `archive.ingest-skill` Rule 6)
- **Then** the created rule's frontmatter carries `provenance: - derives_from: <the source document's extracted path>`, and `check.provenance` passes it as a resolving reference

### A migration-era decision citation upgrades to validated provenance

- **Given** `migration.compass-rename`'s decisions-single-home step left a compass rule with a plain reference to `atlas/decisions/<slug>.md` in its body text (not yet in `provenance:` frontmatter)
- **When** this spec's frontmatter contract is applied to that rule
- **Then** the plain reference is expressed as `provenance: - derives_from: atlas/decisions/<slug>.md`, and `check.provenance` validates it exactly as any other atlas-decision reference

## Notes

- **OPEN:** the exact storage location/format of the backward-traversal index (e.g. a standalone JSON artefact vs. computed on demand vs. folded into the constellation compiler's output) is left to implementation — schema-v3-addendum §A6.3 requires the check to "maintain/validate" it but does not fix its file shape; this spec's acceptance criteria constrain the *query contract* (given a source, return every citing artefact), not the storage mechanism.
- **OPEN:** whether `check.provenance` runs as part of the general `cortex validate` pass or as a dedicated `cortex insight`-adjacent query path is an implementation choice; either satisfies this spec's acceptance criteria.
- This spec does not implement a provenance *taxonomy* (`informed_by`/`contradicted_by`/etc.) — design §7.3 and §11 name that as a deliberate future refinement, out of v3 scope.
- Dependency on `archive.ingest-skill` reflects build-order-v3's resolution of the archive/provenance sequencing (spine fact 3, F2): archive creates the artefacts this spec's stamping and indexing complete; this spec does not depend on archive's yes/no-gate UX, only on the shape of what it creates.
