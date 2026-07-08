---
id: schema.validator-insight-checks
status: implemented
depends_on:
  - insight.module-contract
  - schema.validator
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by:
  - R-001
governs:
  - "src/schema/checks/**"
---

# Validator — Insight Checks + Extended Pulse Check

## Intent

This spec adds the four new Appendix A checks that hold the insight module to its contract, and extends `check.pulse` with the error-severity clauses the typed pulse gate needs — taking the catalogue from 24 checks at v1.0 to 28 at v2.0 (schema Appendix A). Contract-first: the checks precede the producers that must satisfy them (the loops and the promotion mechanism), so `insight.refresh-loop`, `insight.gaps-loop`, and `insight.promotion-mechanism` all have a mechanical verification surface. The four insight checks — `check.insight-index`, `check.insight-prose`, `check.insight-graph`, `check.insight-ownership` — flag a malformed insight artefact and pass a well-formed one; the extended `check.pulse` rejects an untyped/wrong-target/multi-payload suggestion. Deterministic Core (R-001); read-only over the tree, like the rest of the validator.

## Entities

- **READS:** `insight/_index.md`; every `insight/map/*.md` and `insight/map/*.json`; every `pulse/*.md` suggestion section. Cross-references resolve against the full project index (as `schema.validator` Rule 10).
- **WRITES:** nothing — the validator is read-only (schema §4.9 / `schema.validator` Rule 2).
- **CREATES:** the same `ValidationReport` shape (schema §6.1) — each new violation carries its `check`, `clause`, `location`, `severity`, `message`.

## Rules

1. **`check.insight-index` (schema §7.4, warning).** In addition to `check.index-shape`, the `insight/_index.md` body MUST name insight as ungated/unreviewed and reference `cortex insight`; a missing trust-model line is a `warning` (the shape itself is the `check.index-shape` error).
2. **`check.insight-prose` (schema §4.10.1, §4.10.4).** For each `insight/map/*.md`: `kind: insight-prose` and `updated` (ISO) present — missing/malformed is an `error`. If a `## Corrections` heading exists, every list item under it carries the `**<iso-date>**`, `_was:_`, and `_now:_` markers, and there is at most one `## Corrections` heading per file — malformed log or a second heading is a `warning`. A promoted trailer, when present, names an S-id and a path — malformed is a `warning`.
3. **`check.insight-graph` (schema §4.10.2).** For `graph.json`/`tags.json`/`clusters.json`: valid JSON with `schemaVersion` + `generated` (`error` if not). In `graph.json`: node ids unique and well-formed under the constellation grammar; `kind` in the closed enum and `confidence` in `high|medium|low`; every edge `rationale` non-empty (`error` on violation). An edge endpoint absent from the file's own `nodes` is a `warning` (tolerant, like the constellation's dropped-ref handling). `tags.json` keys and `clusters.json` member ids are well-formed node ids; cluster ids match `cluster:<slug>` and are unique (`error`).
4. **`check.insight-ownership` (schema §4.10.3, error).** Every file directly under `insight/map/` has extension `.md` or `.json`; the only permitted `.json` basenames are `graph.json`, `tags.json`, `clusters.json`; no `_index.md` exists under `map/`. Any other extension, an unexpected `.json` basename, or a `map/_index.md` is an `error` (the write-lane rule, enforced here and defence-in-depth at each loop's `--apply`).
5. **Extended `check.pulse` (schema §4.5, §4.5.1, §4.5.2).** Beyond the v1 header presence (`warning`), each suggestion section is now checked for: `**Type:**` present and in the enum `rule-candidate|skill-proposal|promotion|gated-layer-update|user-directed-capture` (absent → `rule-candidate` with a `warning`, v1-era tolerance; a value outside the enum → `error`); `**Target:**` root permitted **for its type** per the §4.5.1 table (a target outside the permitted root for its type → `error`); exactly one payload shape among `**Proposed addition:**` / `**Proposed edit:**` / `**Proposed file:**` (zero or >1 → `error`).
6. **Catalogue count.** With these additions the catalogue is 28 checks; the re-rooted existing checks keep their IDs unchanged (schema Appendix A).
7. **Deterministic Core** (R-001): pure structural inspection — no LLM, no network.

## Acceptance Criteria

### check.insight-prose flags a malformed corrections log

- **Given** `map/testing.md` with valid frontmatter but a `## Corrections` item missing its `_now:_` marker
- **When** the validator runs
- **Then** the report carries one `warning` from `check.insight-prose` at that file citing §4.10.1
- **And** a sibling `map/setup.md` whose corrections entries carry `**<iso-date>**`, `_was:_`, and `_now:_` produces no such violation

### check.insight-prose errors on missing frontmatter

- **Given** `map/deploy.md` whose frontmatter omits `kind: insight-prose`
- **When** the validator runs
- **Then** the report carries one `error` from `check.insight-prose` naming the missing field

### check.insight-graph flags a bad node-id and empty rationale

- **Given** `map/graph.json` with an edge whose `rationale` is `""` and a node id `not-a-valid-id`
- **When** the validator runs
- **Then** the report carries `error`s from `check.insight-graph` for the empty rationale and the malformed node id
- **And** a well-formed `graph.json` (node `anatomy:src/pulse/review.ts`, edge `kind: "mentions-same-entity"`, `confidence: "medium"`, rationale non-empty) passes clean

### check.insight-graph warns on a dangling edge endpoint

- **Given** `map/graph.json` whose edge `from` is `spec:insight.cli` (present in `nodes`) and `to` is `spec:insight.gaps-loop` (absent from `nodes`)
- **When** the validator runs
- **Then** the report carries a `warning` (not an error) from `check.insight-graph` for the dangling endpoint

### check.insight-ownership rejects an out-of-lane file

- **Given** `insight/map/notes.txt` and an unexpected `insight/map/extra.json`
- **When** the validator runs
- **Then** `check.insight-ownership` errors on both — `.txt` is not permitted and `extra.json` is not one of the three named basenames
- **And** a `map/` holding only `setup.md`, `graph.json`, `tags.json`, `clusters.json` passes

### check.pulse rejects an untyped-payload and wrong-target suggestion

- **Given** `pulse/suggestions.md` with `S-042` carrying a `**Type:** gated-layer-update` and a `**Target:** .cortex/insight/map/setup.md`
- **When** the validator runs
- **Then** `check.pulse` errors — `gated-layer-update` may not target `.cortex/insight/map/` (§4.5.1)
- **And** a section carrying two payload shapes (`**Proposed addition:**` and `**Proposed edit:**`) errors for the multi-payload violation

### check.pulse tolerates an absent type as rule-candidate

- **Given** `S-043` with no `**Type:**` line, a `.cortex/cerebrum/` target, and one `**Proposed addition:**`
- **When** the validator runs
- **Then** `check.pulse` treats it as `rule-candidate` and emits only a `warning` for the absent type (v1-era tolerance)

## Notes

- These checks are contract-first: they land before the producers (steps 6, 7, 8) so each loop and the promotion mechanism verify against them. This is the same discipline `schema.validator` set for v1.
- The extended `check.pulse` is what makes the typed pulse gate mechanically enforceable; `insight.promotion-mechanism` implements the runtime that satisfies it.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
