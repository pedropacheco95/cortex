---
id: archive.intent-register
status: implemented
depends_on:
  - archive.ingest-skill
  - schema.validator
implements: ../../specs-business/archive/documents-are-captured-and-authoritative.business.md
governed_by: []
governs:
  - "src/schema/checks/archive.ts"
  - "src/archive/formats.ts"
---

# The intent register — frozen anchors over the citation graph

## Intent

Fork 2 of the 2026-08 absorption round (`plans_and_handoffs/plans/2026-08-03.md` §0.5,
Phase 4.1). Spec-derived tests stay the durable contract. But a specific thing a stakeholder
said — "the password needs one uppercase" — is routinely *generalised away* by the spec that
absorbs it ("passwords meet the complexity policy"), and once generalised, nothing in the suite
pins the original ask. Nobody notices, because every test passes.

The register is the audit trail for that. A verbatim ask is pinned by a **frozen intent-anchor
test**; once a spec-derived test demonstrably subsumes the anchor, the anchor is retired from
the suite and preserved here as words. If nothing subsumes it, the entry is flagged and a
missing-criterion bug is filed.

It is a **thin changelog over the citation graph** — it links to where the intent landed and
which test covers it. It holds no copies of tests, and it is never a second test suite to
maintain.

This spec owns the **artefact and its validation** (Core, deterministic). The semantic judgment
— does this spec test subsume that anchor? — belongs to `specflow.intent-reconcile` (a Skill),
because Core makes no LLM calls (RULES 3).

## Entities

- **READS:** `.cortex/archive/intent-register.yaml`; the project index (to resolve `landing`
  dev-spec ids and compass rule ids); `.cortex/compass/bugs/B-*.md` (to resolve `flagged_bug`);
  the working tree (to resolve `covering_spec_test` paths).
- **WRITES:** nothing. This is a validator check plus the format parser.
- **CREATES:** nothing. The file is optional and is created by the reconciliation skill, not by
  Core.

## Rules

1. **The register is `.cortex/archive/intent-register.yaml`** — standalone YAML (like
   `metadata.yaml`, schema §4.4.1), committed, a sibling of `register.md`. It is a **separate
   artefact** from `register.md`, which indexes ingested documents; this indexes stated intents.
2. **The file is optional.** A project without one validates clean. `check.archive-intent-register`
   returns no violations when it is absent — the same "spine" tolerance every new-module check
   follows (schema §1).
3. **Entry shape (schema §4.4.3).** Each entry requires `id` (`IR-NNN`, unique within the file),
   `stated_intent` (verbatim, never paraphrased), `date` (ISO `YYYY-MM-DD`), `anchor_test`, and
   `status`.
4. **Three statuses, each with its own required evidence.** `pending` — the anchor is written
   and RED, reconciliation has not run; it is the only status that may omit `landing`.
   `reconciled` — requires `landing` **and** `covering_spec_test`. `flagged` — requires
   `landing` **and** `flagged_bug`. The per-status evidence requirement is what makes the
   register auditable instead of decorative.
5. **Links resolve or it is an error.** `landing` resolves either to a dev-spec id via the
   project index — and, when written as `<id>#<criterion-heading>`, that heading must exist as
   an `### ` heading in that spec — or to a compass rule id (`R-NNN`) resolving to a file under
   `compass/rules/`. `covering_spec_test`'s `<path>` part must exist on disk. `flagged_bug`
   must resolve to a `compass/bugs/B-*.md` file.
6. **Shape logic lives in `src/archive/formats.ts`**, not in the check — the same
   single-source-of-truth arrangement the other three archive checks already use, so the
   reconciliation skill and the validator agree on the format by construction.
7. **Additive only.** Nothing existing changes. A 3.0 or 3.1 project validates clean under the
   3.2 validator (schema §10.2); no migration ships.
8. **Core does not judge subsumption.** This spec's code never decides whether a test covers an
   intent — only whether the claim that it does is well-formed and its links resolve.

## Acceptance Criteria

### A well-formed register validates clean

- **Given** an `intent-register.yaml` whose entries carry required fields and resolving links
- **When** `cortex validate` runs
- **Then** it reports no `check.archive-intent-register` violations

### An absent register is not a violation

- **Given** a project with no `.cortex/archive/intent-register.yaml`
- **When** `cortex validate` runs
- **Then** no `check.archive-intent-register` violation is raised

### A dangling landing is an error

- **Given** an entry whose `landing` names a dev-spec id that does not exist
- **When** `cortex validate` runs
- **Then** it raises a `check.archive-intent-register` error naming the entry id and the
  unresolved landing

### A landing criterion that does not exist in the spec is an error

- **Given** an entry whose `landing` is `<spec-id>#<criterion>` where the spec resolves but has
  no such `### ` heading
- **Then** it raises an error naming the entry and the missing criterion

### A reconciled entry without its covering test is an error

- **Given** an entry with `status: reconciled` and no `covering_spec_test`
- **Then** it raises an error; and given one whose `covering_spec_test` path does not exist on
  disk, it also raises an error

### A flagged entry without a resolving bug is an error

- **Given** an entry with `status: flagged` and no `flagged_bug`, or one naming a bug id with no
  file under `compass/bugs/`
- **Then** it raises an error

### A pending entry needs no landing

- **Given** an entry with `status: pending` and no `landing`
- **Then** no violation is raised for the missing landing

### Malformed entries are caught

- **Given** a register with a duplicate `IR-NNN`, a malformed id, a non-ISO `date`, an unknown
  `status`, or a non-list `entries`
- **Then** each raises a `check.archive-intent-register` error naming the problem

### A 3.1 project still validates clean

- **Given** a project declaring `schemaVersion: "3.0"` or `"3.1"` with no register
- **When** the 3.2 validator runs
- **Then** it is conformant — the bump is additive (schema §10.2)

## Notes

- **Schema-version discrepancy, surfaced not silently fixed.** `cortex-schema.md` declared
  `3.1` while `src/schema/version.ts` still declares `SUPPORTED_MINOR = 0` and this project's
  `cortex.config.json` says `3.0`. This spec follows the existing precedent — the 3.1 addition
  (`insight/observations/`) also shipped its check without touching `version.ts` — and does
  **not** change those constants: `SUPPORTED_MINOR` participates in the §10.3 mismatch gate,
  so bumping it changes validation behaviour for every project and is a rippling change that
  needs Pedro. Flagged for a decision rather than decided here.
- The plan's Files list for 4.1 named `.cortex/archive/types/<register>.yaml`. That path is
  the *ingestion document-type registry* (schema §4.4.2) — a register of stated intents is not
  an ingested document type. The plan's Change line ("define the register artefact kind") is
  what was implemented; the Files line was a drafting slip and is recorded here as such.
