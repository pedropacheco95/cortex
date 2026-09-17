---
id: insight.promotion-mechanism
status: implemented
depends_on:
  - insight.module-contract
  - schema.validator-insight-checks
  - pulse.review-cli
implements: ../../specs-business/insight/corrections-and-memory-reach-persistence.business.md
governed_by:
  - R-001
governs:
  - "src/pulse/review.ts"
  - "src/pulse/promote.ts"
---

# Typed Pulse Gate + Promotion Mechanism

## Intent

This spec extends the pulse review CLI (`pulse.review-cli`, `src/pulse/review.ts`) from v1's append-only, cerebrum-only gate into the typed gate v2 needs (schema §4.5.1, §4.5.2, §4.10.4): five `**Type:**` values, three payload operation shapes including the new byte-exact **edit**, extended `Target:` roots (`.cortex/atlas/`, `.cortex/insight/map/`, `RULES.md`), and — the load-bearing new behaviour — `promotion` accept, which lands a gated write, injects a `source:` back-reference to the insight original, and marks that original promoted rather than deleting it. It reuses the existing gate rather than building a second one: one review queue, one S-namespace, one `dismissed.md` (v2 design §3.7). Deterministic Core (R-001); accept is transactional — a refusal applies nothing and leaves the suggestion `pending`.

## Entities

- **READS:** every `.cortex/pulse/*.md` suggestion section (schema §4.5 single S-namespace); `pulse/dismissed.md`; `cortex.config.json` (`pulse.dismissedWindowDays`); the `**Target:**` files for edit/promotion; the artefact named in a `promotion`'s `**Source:**` — an insight per-file entry or an archive `extracted/` file (Rule 5).
- **WRITES:** the accepted suggestion's `**Target:**` file (append, create, or byte-range replace per payload shape); for `promotion`, the gated target (with an injected `source:` back-reference) **and**, only when the source is an insight entry, that entry (stamping its promoted trailer, §4.10.4); the originating suggestion's `**Status:**`; `dismissed.md` on reject. Nothing else.
- **CREATES:** `dismissed.md` if absent (its §4.5 header); a new file for `**Proposed file:**`/create-shaped accepts (no clobber).

## Rules

1. **Five suggestion types (schema §4.5.1).** `pulse-accept` dispatches on `**Type:**`: `rule-candidate` (append to `.cortex/cerebrum/`, v1 behaviour), `skill-proposal` (create a new `.claude/skills/<name>/SKILL.md`, never overwrite, v1 behaviour), `promotion`, `gated-layer-update`, and `user-directed-capture`. An absent `**Type:**` is treated as `rule-candidate` (v1-era tolerance).
2. **Extended target roots (schema §4.5.1 table).** The permitted `**Target:**` root depends on the type: `rule-candidate` → `.cortex/cerebrum/`; `skill-proposal` → new `.claude/skills/<name>/SKILL.md`; `promotion` and `gated-layer-update` → `.cortex/cerebrum/`, `.cortex/atlas/`, or `RULES.md`; `user-directed-capture` → those three **plus** `.cortex/insight/map/`. `promotion` and `gated-layer-update` may **never** target `.cortex/insight/map/` (insight is ungated — its corrections are direct writes by the gaps loop, not proposals). A target outside its type's permitted root is refused (exit 1, naming the path).
3. **Three payload shapes (schema §4.5.2).** Exactly one per section: `**Proposed addition:**` (append; target MUST exist), `**Proposed file:**` (create; refuse if the target exists), and the new `**Proposed edit:**` (edit). All fenced blocks obey the longer-fence grammar (byte-exact round-trip, B-003).
4. **The edit payload (schema §4.5.2).** `**Proposed edit:**` carries a `current:` block (the exact text to replace) and a `replacement:` block. Accept locates `current:` in the target and it MUST match **byte-exact**; a `current:` resolving to zero or >1 occurrences is a hard refusal (stale or ambiguous — the target drifted since the proposal was written). Accept replaces the single located occurrence. The edit operation is what makes `gated-layer-update` (a correction to an existing rule/decision) expressible — it is the mechanism signal-4-gated requires.
5. **Promotion accept side effects (schema §4.5, §4.5.1, §4.10.4; corrected by B-020, 2026-09-17).** A `promotion`'s `**Source:**` names the **originating artefact**, and it is one of exactly two kinds, both of which MUST resolve on disk: an **insight** per-file entry (`insight/anatomy/**` or `insight/scopes/<s>/anatomy/**` — the `pulse.distil` Rule 7 producer) or an **archive** extraction file (`.cortex/archive/documents/<id>/extracted/…`, with or without the `.cortex/` prefix — the `cortex-archive-ingest` producer). On accept: (a) apply the payload (append or create) to the gated target; (b) inject a `source:` reference in the landed content pointing back at the named artefact (the citation graph records the lineage, schema §6 `source` row; an archive-derived payload already carries `provenance:` and the injected `source:` is the same path); (c) **only when the source is an insight entry**, stamp it with the promoted trailer `_(promoted <iso-date> → <gated-target-path> via S-NNN)_` — **marking, never deleting** (deletion of the redundant copy is the human's call); an archive source is never written to. An **archive**-sourced promotion additionally requires its `**Target:**` to lie under `.cortex/compass/` or `.cortex/atlas/` (Rule 2's roots minus `RULES.md` — an ingested document proposes knowledge, not project rules). A `**Source:**` naming neither kind is a refusal whose message names both accepted shapes and never a retired path (`insight/map/` is 2.0).
6. **Transactional accept (schema §4.5.2).** Any refusal — byte-mismatch on edit, clobber on create, ambiguous/stale edit, or a promotion whose named source file does not exist, or names neither an insight entry nor an archive extraction, or (archive kind) targets outside compass/atlas — applies **nothing**, changes no file, and leaves the suggestion `**Status:** pending`.
7. **Shared gate is preserved.** The S-namespace counter (`pulse/state/suggestion-counter`), `dismissed.md` suppression, duplicate-id hard error, and idempotent re-decide (all from `pulse.review-cli`) govern the typed types unchanged. Blast radius per accept: the one target file, the insight original (insight-sourced promotion only), the originating suggestion file, and `dismissed.md`.
8. **Deterministic Core** (R-001): parsing, byte-matching, and application are pure file I/O — no LLM, no network.

## Acceptance Criteria

### Each type accepts to the right target with the right operation

- **Given** `S-050 **Type:** rule-candidate` → `.cortex/cerebrum/preferences.md` (addition), `S-051 **Type:** gated-layer-update` → `.cortex/cerebrum/rules/R-014-no-camelcase-columns.md` (edit), `S-052 **Type:** user-directed-capture` → `.cortex/insight/map/conventions.md` (addition)
- **When** each is accepted
- **Then** `S-050` appends to `preferences.md`, `S-051` byte-range-replaces in `R-014-...`, `S-052` appends to `conventions.md` — each to its permitted root, each with its shape

### An edit against drifted content refuses cleanly

- **Given** `S-053 **Type:** gated-layer-update` targeting `RULES.md` whose `current:` block no longer matches the file byte-exact (the rule text drifted)
- **When** `cortex pulse-accept S-053` runs
- **Then** exit 1 reporting the stale/mismatched `current:`, no file changed, and `S-053` stays `**Status:** pending`

### An ambiguous edit refuses

- **Given** `S-054`'s `current:` block matches two occurrences in the target
- **When** it is accepted
- **Then** exit 1 (ambiguous), nothing applied, suggestion pending

### An insight-sourced promotion lands the gated write, the lineage, and the promoted marker

- **Given** `S-055 **Type:** promotion` with `**Source:**` naming `.cortex/insight/anatomy/src/deploy.ts.md` (exists) and `**Target:** .cortex/atlas/decisions/2026-07-06-deploy-runbook.md` (create)
- **When** `cortex pulse-accept S-055` runs
- **Then** the atlas decision is created carrying a `source:` reference back to `insight/anatomy/src/deploy.ts.md`
- **And** the entry `deploy.ts.md` gains the trailer `_(promoted 2026-07-06 → .cortex/atlas/decisions/2026-07-06-deploy-runbook.md via S-055)_`
- **And** `deploy.ts.md` is not deleted

### An archive-sourced promotion lands the gated write and the lineage, and touches no insight file

- **Given** `S-060 **Type:** promotion` with `**Source:** cortex-archive-ingest — archive/documents/brief/extracted/summary.md` (the file exists under `.cortex/`) and `**Target:** .cortex/atlas/stakeholders/coordinator.md` (create), the payload carrying `provenance: - derives_from: archive/documents/brief/extracted/summary.md`
- **When** `cortex pulse-accept S-060` runs
- **Then** exit 0, the stakeholder file is created carrying a `source:` reference to that extracted file, no file under `.cortex/insight/` or `.cortex/archive/` is modified, and the section reads `**Status:** accepted`
- **And** given instead `**Target:** RULES.md`, the accept exits 1 naming compass/atlas as the archive-sourced roots, nothing is written, and `S-060` stays pending

### A promotion with a missing or unrecognised source refuses transactionally

- **Given** `S-056 **Type:** promotion` whose `**Source:**` names an `insight/anatomy/` entry that does not exist, and `S-061` whose `**Source:**` is `cortex-loop — pulse/reports/session-observe.md` (neither kind)
- **When** each is accepted
- **Then** each exits 1 with a message naming both accepted source shapes and not `insight/map/`, no gated write lands, no marker is stamped, and both stay pending

### promotion and gated-layer-update may not target insight

- **Given** `S-057 **Type:** promotion` with `**Target:** .cortex/insight/map/setup.md`
- **When** it is accepted (or validated)
- **Then** it is refused — insight is not a permitted target for `promotion`/`gated-layer-update` (§4.5.1)

### The shared gate still governs the typed types

- **Given** `S-058` present in two pulse files and `S-059` already rejected in `dismissed.md` with a future `**Expires:**`
- **When** commands address them
- **Then** `S-058` is a duplicate-id hard error (exit 1 naming both files) and `S-059` stays suppressed — the v1 gate semantics are unchanged for typed suggestions

## Notes

- This extends `pulse.review-cli`; it does not fork it. The v1 accept-as-is/reject/dismiss discipline, the single S-namespace, and the verbatim-payload guarantee are inherited, and this spec adds only the type dispatch, the edit shape, the extended roots, and the promotion side effects.
- Producers (3.x): `promotion` sections come from `cortex-archive-ingest` (archive-sourced, `archive.ingest-skill`) and from `pulse.distil` Rule 7 (insight-sourced graduation); `gated-layer-update` and `user-directed-capture` come from the session-reading loops. This spec owns the *accept* runtime that satisfies them, verified against `schema.validator-insight-checks`' extended `check.pulse`. The 2.0 producer (`insight.gaps-loop`) is retired.
- **B-020 (2026-09-17).** Rules 5–6 and the promotion criteria were corrected: accept enforced the 2.0 "Source must name the insight file" clause after schema 3.0's §4.5.1 had named archive ingestion as the producer, so every archive promotion was refused. Pedro chose §4.5.1; §4.5's Source clause now agrees. OPEN: this spec's `implements:` still points at `insight.corrections-and-memory-reach-persistence`, whose promotion journey (step 4, rules 4–5) is the 2.0 insight-prose graduation schema 3.0 retired; re-homing under the archive outcome is Pedro's call, not made here.
- Build-order §4 splits this into 4a (typed parser/writer + edit payload shape) and 4b (typed accept semantics + promotion side effects); this spec is the contract for both sub-batches.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
