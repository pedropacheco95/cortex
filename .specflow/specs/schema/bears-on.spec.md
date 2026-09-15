---
id: schema.bears-on
status: implemented
depends_on:
  - schema.validator
  - schema.schema-clauses
  - provenance.frontmatter-check
governs:
  - "src/schema/refs.ts"
  - "src/schema/checks/bears-on.ts"
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by:
  - R-001
---

# The Forward Edge — `bears_on`

## Intent

Every row of the schema §6 citation table points backward: `implements` to the outcome a spec
serves, `source` to the decision a rule came from, `provenance` to the session or document an
artefact derives from. Nothing points **forward** from a conclusion to the thing it constrains, so
a decision is a leaf: a session reading `R-001`, `pulse.usage` or `cortex-schema.md` §5 has no way
to learn that a decision was made about it, a measurement was taken of it, or a question about it
is still open. The proposal that produced this step verified that `atlas/decisions/` was read zero
times in 41 sessions — not because the decisions were wrong, but because nothing on the path a
session actually walks led to them.

`bears_on` is that edge (schema §6, §0's 3.4 note). It is carried by the four conclusion kinds —
atlas decisions, atlas evidence (`atlas.evidence`), pulse threads (`pulse.threads`, seeded at step
1), and insight observations (schema §4.10.11) — and names, as a mixed list resolved by shape, the
subjects it bears on: a rule, a bug, a spec, a domain term, an insight concept, a clause of the
schema, or a file. This spec owns the **ref grammar and resolver** shared by every carrier, and the
validator check for the two gated carriers. The inverse (`decided_by`, `evidenced_by`,
`threads_on`) is never stored; it is computed into the recall index (`recall.recall-index`), the
same way the provenance index computes `derived_by` (`provenance.frontmatter-check`).

## Entities

- **READS:** the `ProjectIndex` (`src/schema/index-build.ts` — every indexed id and path);
  `.cortex/insight/concepts/*.md` and `.cortex/insight/scopes/*/concepts/*.md` (concept
  existence); the clause index (`schema.schema-clauses`); the project tree (path refs);
  `.cortex/atlas/decisions/*.md` and `.cortex/atlas/evidence/*.md` (the gated carriers, for
  `check.bears-on`).
- **WRITES:** nothing — resolver and check are read-only.
- **CREATES:** `Violation`s under `check.bears-on` (schema §6, Appendix A).

## Rules

1. **Shape classification is total and ordered.** `classifyRef(ref: string): RefKind` in
   `src/schema/refs.ts` returns exactly one of `rule | bug | domain | concept | clause | path | id`
   by testing, in this order: `/^R-\d{3,}$/` → `rule`; `/^B-\d{3,}$/` → `bug`;
   `/^domain\.[A-Za-z0-9][A-Za-z0-9_-]*$/` → `domain`; `/^concept:[a-z0-9][a-z0-9-]*$/` →
   `concept`; `schema.schema-clauses` Rule 1's grammar → `clause`; a string containing `/` or
   starting with `.` → `path`; anything else → `id`. Every non-empty string classifies; the empty
   string is malformed (Rule 5). The order matters only where shapes could overlap (`domain.x`
   before `id`; a path containing `R-001` is a path).

2. **Resolution by kind.** `resolveRef(root, index, clauses, ref): { kind, resolved: boolean,
   target?: string }`:
   - `rule`, `bug`, `domain`, `id` → `index.idToPath.get(ref)` is defined (the global index of
     schema §6 rule 4 — for `id` this is normally a dev or business spec, but any indexed id
     resolves: a decision id, a stakeholder id, an evidence id). `target` is the project-relative
     path.
   - `concept` → `.cortex/insight/concepts/<slug>.md` exists, or any
     `.cortex/insight/scopes/<scope>/concepts/<slug>.md` exists (the same two locations
     `cortex insight concept` searches, `insight.cli`). `target` is the first found.
   - `clause` → `clauseResolves(clauses, ref)` (`schema.schema-clauses` Rule 3).
   - `path` → the ref, with any leading `./` stripped and backslashes normalised to `/`, exists
     relative to the project root as a file **or directory** (a decision may bear on
     `src/hooks/`). Absolute paths and `..` segments never resolve (a `bears_on` ref is
     project-relative by definition). `target` is the normalised ref.

3. **Severity by kind, fixed here for every carrier.** `gatedKinds = rule | bug | domain | id` —
   an unresolved ref of a gated kind is an `error` on a gated carrier; `concept | clause | path`
   unresolved is a `warning` on every carrier. The reasoning: a rule, bug, spec or term id that
   does not resolve is a typo or a deletion in a committed, validated tree and must be fixed; a
   concept may not have been extracted yet (insight is ungated and absent on a fresh project); a
   file may have moved; a clause may be stale (`schema.schema-clauses` Rule 5). One table, one
   place — a carrier never invents its own severity.

4. **`check.bears-on` covers the two gated carriers only.** For every `atlas/decisions/*.md` and
   `atlas/evidence/*.md` (skipping `_index.md`): when `bears_on` is present it MUST be a list of
   non-empty strings (`error` otherwise, key `bears_on`); each entry is classified and resolved per
   Rules 1–3, an unresolved entry producing one violation at the Rule 3 severity whose message
   names the ref, its classified kind, and the carrier file. Threads (`check.threads`) and
   observations (`check.insight-observations`) stay **shape-checked only**: they are ungated,
   their producers seed paths mechanically from read ledgers that may name files since moved, and
   a warning per stale path on a transient ledger would be noise. The recall compiler resolves
   those and drops what does not resolve (`recall.recall-index` Rule 2).

5. **Malformed entries.** An empty string, a non-string, or a `schema:`-prefixed string that fails
   the clause grammar is an `error` on a gated carrier (message: "malformed bears_on entry").
   The `check.atlas` warnings for decisions — no `bears_on` at all, or a `sources:` under
   `.cortex/pulse/` — are `check.atlas`'s (schema §4.3); this check never duplicates them.

6. **Deterministic Core** (R-001). Resolution is file existence and set lookup; the clause index
   is loaded once per run (`schema.schema-clauses` Rule 3) and passed in; the project index is the
   one `validate()` already builds. No LLM, no network.

7. **The inverse is computed, never stored.** No artefact carries `decided_by`, `evidenced_by` or
   `threads_on`; no check accepts them. The materialised inverse is
   `.cortex/recall-index.json` (`recall.recall-index`, schema §4.11), rebuilt from the forward
   lists. This mirrors the provenance index (`provenance.frontmatter-check`), for the same reason:
   a stored inverse goes stale the moment either side is edited.

8. **Constellation edges are the compiler's.** Which `bears_on` refs become `constellation.json`
   edges (ids → nodes; paths, concepts, clauses → nothing, uncounted) is
   `constellation.compiler` Rule 10; this spec fixes only the grammar the compiler classifies with.

## Acceptance Criteria

### Every shape classifies to exactly one kind

- **Given** the refs `R-001`, `B-014`, `domain.insight`, `concept:hook-safety`, `schema:§5`,
  `src/pulse/usage.ts`, `.cortex/compass/rules/R-001-core-no-llm-calls.md`, `pulse.usage`
- **When** each is classified
- **Then** the kinds are `rule, bug, domain, concept, clause, path, path, id` respectively

### Gated refs resolve through the project index

- **Given** a project with rule `R-001`, bug `B-014`, domain term `domain.insight`, dev spec
  `pulse.usage` and business spec `schema.contributor-trusts-project-knowledge`
- **When** `resolveRef` runs for each id and for `R-999`
- **Then** the five resolve with `target` equal to their file paths and `R-999` does not

### A concept resolves from either insight layout

- **Given** `.cortex/insight/concepts/hook-safety.md` and
  `.cortex/insight/scopes/cli/concepts/verb-dispatch.md`, and no `insight/` at all in a second
  project
- **When** `concept:hook-safety`, `concept:verb-dispatch` and `concept:missing` are resolved in
  the first project and `concept:hook-safety` in the second
- **Then** the first two resolve, the third does not, and the second project's ref does not
  resolve and raises no exception

### A path resolves as a file or a directory, never outside the project

- **Given** files `src/pulse/usage.ts` and directory `src/hooks/`
- **When** `src/pulse/usage.ts`, `./src/hooks/`, `src/gone.ts`, `../etc/passwd` and
  `/etc/passwd` are resolved
- **Then** the first two resolve (targets `src/pulse/usage.ts`, `src/hooks/`), the last three do not

### `check.bears-on` errors on a dangling gated ref and warns on the rest

- **Given** `.cortex/atlas/decisions/2026-09-15-x.md` with
  `bears_on: [R-999, concept:nope, schema:§99, src/gone.ts, pulse.usage]`
- **When** `cortex validate` runs
- **Then** the report carries one `check.bears-on` `error` naming `R-999` (kind rule), three
  `check.bears-on` warnings naming `concept:nope`, `schema:§99` and `src/gone.ts`, and nothing for
  `pulse.usage`; `conformant` is false

### A malformed entry is an error on a gated carrier

- **Given** a decision with `bears_on: ["", "schema:§ 5"]` and another with `bears_on: R-001`
  (a scalar, not a list)
- **When** `cortex validate` runs
- **Then** each file carries a `check.bears-on` `error` at key `bears_on`

### Threads and observations are not resolved by the validator

- **Given** `.cortex/pulse/threads/T-001-x.md` with `bears_on: ["src/gone.ts", "R-999"]` and
  `.cortex/insight/observations/scale.md` with the same list
- **When** `cortex validate` runs
- **Then** no `check.bears-on` violation is reported for either file (their own checks pass them
  as well-shaped lists)

### The clause index is loaded once for the whole run

- **Given** a project with four decisions carrying eight `schema:` refs between them
- **When** `cortex validate` runs
- **Then** `cortex-schema.md` is read once (`schema.schema-clauses` — "The document is read once
  per run")

### No artefact may carry a stored inverse

- **Given** a decision whose frontmatter carries `decided_by: [R-001]`
- **When** `cortex validate` runs
- **Then** the key is not recognised by any check (no violation, no resolution) and the recall
  index ignores it — the inverse exists only in `recall-index.json`

## Notes

- **Why `id` falls back to the whole index, not just specs.** The lead-in was "spec id → dev or
  business spec", and that is the common case; but a decision may legitimately bear on another
  decision's subject by naming that decision, and the global index already answers "does this id
  exist" for every kind at once (§6 rule 4). Restricting the fallback to specs would need a second
  index for no gain. What the fallback does *not* do is guess a kind from a prefix it does not
  know: `decision.x` resolves because the index holds it, not because the resolver knows about
  decisions.
- **`affects` on bugs.** Schema §6 says bug `affects` resolves by shape too; today `check.bug`
  only checks that it is a list. This resolver is written so `check.bug` *can* adopt it later —
  deliberately not done in this step (it would turn existing warnings-by-omission into errors on
  every project's bug ledger without a migration).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
