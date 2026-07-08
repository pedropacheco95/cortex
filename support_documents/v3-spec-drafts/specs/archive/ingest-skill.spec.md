---
id: archive.ingest-skill
status: draft
depends_on:
  - migration.compass-rename
implements: ../../specs-business/archive/documents-are-captured-and-authoritative.business.md
governed_by: []
governs:
  - ".claude/skills/cortex-archive-ingest/**"
  - ".cortex/archive/**"
---

# `cortex-archive-ingest` — the one ingestion skill with type routing

## Intent

This spec is the load-bearing archive contract (build-order-v3 step 3, sub-steps 3a/3b): the `.cortex/archive/` module layout, the `archive/types/*.yaml` document-type schema format the skill routes on, and the `cortex-archive-ingest` Claude Code skill that runs the 8-step ingestion workflow (schema-v3-addendum §A3, design §6). Ingested documents are authoritative by definition — the user chose to ingest them — so extraction writes structured content directly into the document's own `extracted/` directory, never into pulse. The one place ingestion touches the pulse gate is the yes/no change-plan step (step 6): proposing rules/specs/decisions is always a separate, human-reviewed act (RULES 7), never a side effect of capture. The atlas-only `cortex-ingest` skill re-homes into this one as its atlas-routing extraction strategy (design §6.6) — this spec is also where that fold-in lands.

## Entities

- **READS:** the document handed to the skill (any supported source format); `archive/types/*.yaml` (classification hints + extraction contract, A3.3); `archive/documents/<slug>/metadata.yaml` on a version-update run (to diff against, §6.5); `archive/register.md`.
- **WRITES:** `archive/documents/<slug>/extracted/**` (structured content, per the selected type's `extraction.outputs`, A3.3); `archive/register.md` (append/update the document's entry); on the yes-path, a change-plan proposal into `.cortex/pulse/*.md` as typed suggestion sections (`Type: rule-candidate | user-directed-capture | promotion`-shaped, per schema §4.5 — the exact type each proposed artefact takes is a plan-application detail, but every proposal is typed and gated, never a direct write).
- **CREATES:** `archive/documents/<slug>/` (a new document directory: `source.<ext>`, `metadata.yaml`, `extracted/`) on first ingestion of a document; a new sibling `archive/documents/<slug-vN>/` directory when a newer version supersedes an existing one (the old directory is preserved, not renamed away, A3.2 `status: superseded`).

## Rules

1. **One skill, internal type routing (design §6.3).** `cortex-archive-ingest` handles every document type via a single entry point; a new document type is supported by adding a file under `archive/types/`, never by modifying the skill.
2. **Classification is declared or inferred (design §6.4 step 2).** If the user names a type, the skill selects that `types/<id>.yaml` directly. Otherwise it infers the type by matching the document's extension and content against each type file's `classification.hints`/`classification.extensions` (schema-v3-addendum §A3.3). A type file with `classification.explicit: false` cannot be user-declared — inference only.
3. **The document directory layout is fixed (schema-v3-addendum §A3.1).** Every ingested document lives at `archive/documents/<slug>/` with exactly three things: `source.<ext>` (verbatim, gitignored), `metadata.yaml` (machine-readable, committed), and `extracted/` (structured output, committed, shaped by the type's `extraction.outputs`).
4. **The 8-step workflow (design §6.4) runs in order:** (1) invoke with a document, optionally declaring type; (2) classify; (3) store the source + initial `metadata.yaml`; (4) run the type's extraction strategy into `extracted/`; (5) ask clarifying questions inline if the document is materially ambiguous (direct conversation, never a pulse suggestion); (6) the yes/no change-plan gate; (7) on yes, apply the approved plan, creating/updating rules, specs, and decisions, each carrying a `provenance:` back-reference to this document (stamped by `provenance.frontmatter-check`, wired in per build-order-v3 step 4 — this spec creates the artefacts, the provenance spec completes the stamp); (8) update `register.md` with the new document and its derivations.
5. **The yes/no gate is a real fork, not a formality (design §6.4 step 6).** "No" ends the workflow at ingestion — the document and its extraction are stored and referenceable, and no proposal is drafted. "Yes" drafts a change plan for the user to review and adjust before anything is proposed.
6. **Downstream changes are always proposed through the pulse gate, never applied directly (RULES 7, design §6.4 step 7).** Even after the user says "yes" and approves a drafted plan, applying that plan to `compass/`, `.specflow/`, or `atlas/` goes through the existing typed pulse-accept machinery (schema §4.5, salvaged per design §8.2) — ingestion is a second producer feeding that gate, not a second gate.
7. **Document version updates diff against the prior version and preserve it (design §6.5).** A new version of an already-ingested document is diffed against the prior version's extracted content; new/changed/removed items are surfaced; changed items trigger a reverse-lookup (via provenance, once §4/A6 lands) for downstream artefacts to flag; the prior version's directory is kept with `status: superseded`, never deleted or overwritten.
8. **The atlas-only extraction is a strategy, not a separate skill (design §6.6).** The former `cortex-ingest` skill's behaviour — extracting stakeholders, decisions, and domain terms from a transcript/RFP/brief into atlas — becomes the `strategy: atlas` extraction routine for atlas-shaped types (`archive/types/*.yaml` with `extraction.strategy: atlas`); sources land under `archive/documents/<slug>/source.*`, not `atlas/sources/`. The standalone `cortex-ingest` skill is retired once this fold-in ships (build-order-v3 step 9 completes the retirement; this spec defines the strategy it retires into).
9. **`register.md` is always current (design §6.2, §6.4 step 8).** Every ingestion or version update updates `register.md` — one human-readable index of every document, active and superseded, and (once provenance lands) what each has produced downstream.

## Acceptance Criteria

### A declared-type document is classified, stored, and extracted

- **Given** a user invokes the skill on `client-spec-v2.0.pdf`, declaring type `client-spec`
- **When** the skill runs
- **Then** `archive/documents/client-spec-v2-0/` is created with `source.pdf`, a `metadata.yaml` (`kind: client-spec`, `status: active`, `ingested_at` set), and `extracted/` populated per `types/client-spec.yaml`'s declared `extraction.outputs` (e.g. `extracted/requirements/*.md`, `extracted/summary.md`)

### An undeclared document is classified by inference

- **Given** a user invokes the skill on a `.txt` transcript with no declared type, and `types/meeting-transcript.yaml` declares `classification.hints: ["action item", "we agreed"]`
- **When** the transcript's content matches those hints
- **Then** the skill selects `meeting-transcript` as the type and proceeds with that type's extraction strategy, without the user having named it

### A new document type requires no skill change

- **Given** a new `archive/types/regulatory-filing.yaml` is added declaring `classification.hints` and an `extraction.strategy`
- **When** a matching document is ingested
- **Then** the skill routes to it correctly with zero changes to the `cortex-archive-ingest` skill's own instructions or code

### The document directory layout is enforced

- **Given** any successfully ingested document
- **When** its directory is inspected
- **Then** it contains exactly `source.<ext>`, `metadata.yaml`, and `extracted/` — no other top-level entries — and `check.archive-layout` passes

### The yes/no gate: "no" stops at ingestion

- **Given** a kickoff-meeting transcript is ingested and extraction completes
- **When** the skill asks whether to draft a change plan and the user answers "no"
- **Then** the document and its `extracted/decisions.md`/`extracted/open-questions.md` remain stored and referenceable, `register.md` records the document, and no pulse suggestion is written

### The yes/no gate: "yes" drafts a plan, reviewed before proposal

- **Given** the same ingestion, but the user answers "yes"
- **When** the skill analyzes the extracted content
- **Then** it drafts a change plan (e.g. "add rule: sessions expire after 30 minutes," sourced from `extracted/requirements/GT-CLIENT-001-session-expiry.md") and presents it for review/adjustment before anything is proposed to the pulse gate

### Approved plan changes are proposed, never applied directly

- **Given** the user approves the drafted plan from the previous scenario
- **When** the skill applies the approved plan
- **Then** the resulting rule/spec/decision creation is proposed through the existing typed pulse-accept machinery (a `## S-NNN` suggestion section with `**Target:**` inside `compass/`, `atlas/`, or `.specflow/`) — the artefact is not written directly to its gated home until a human runs `pulse-accept`

### A version update diffs, surfaces changes, and preserves the prior version

- **Given** `client-spec-v2.0` is already ingested (`status: active`) and the user ingests `client-spec-v2.1.pdf` as an update
- **When** the skill diffs `client-spec-v2.1`'s extraction against `client-spec-v2.0`'s
- **Then** it reports new/changed/removed requirements, `client-spec-v2.0/` gains `status: superseded` in its `metadata.yaml` and is NOT deleted, `client-spec-v2.1/` becomes the new active document with `supersedes: [documents/client-spec-v2.0/]`, and the same yes/no gate offers to draft an update plan

### `register.md` reflects every ingestion

- **Given** any successful ingestion or version update
- **When** the workflow completes (step 8)
- **Then** `register.md` lists the document (or updates its existing entry to show the new active/superseded pair)

### The atlas-only strategy folds in, not stands alone

- **Given** a transcript is ingested and routed to a `types/*.yaml` file declaring `extraction.strategy: atlas`
- **When** extraction runs
- **Then** stakeholders, decisions, and domain terms are extracted into `extracted/` under this document (not into `atlas/sources/`), using the same stakeholder/decision/domain-term extraction logic the former standalone `cortex-ingest` skill used — confirming the fold-in preserves behaviour rather than dropping it

## Notes

- **OPEN:** the exact reverse-lookup mechanism step 7/§6.5 step 3 uses to find downstream artefacts on a version update depends on `provenance.frontmatter-check`'s backward-traversal index (not yet built when this spec alone is implemented) — this spec's version-update acceptance criteria assert the diff-and-preserve behavior; the "flag downstream artefacts for review" behavior is only fully exercisable once `provenance.frontmatter-check` ships (this spec's `depends_on` intentionally does not include it — build-order-v3 sequences provenance's stamping as completing this spec's step 7, not blocking it, per build-order-v3 spine fact 3).
- **OPEN:** the exact shape of the yes-path change-plan's presentation (inline conversation vs. a written `.cortex/pulse/*.md` draft prior to the gate) is left to implementation; the acceptance criteria constrain only the observable contract (review before propose, propose through the existing gate, never a direct gated write).
- This spec implements schema-v3-addendum §A3 (layout, `metadata.yaml`, `types/*.yaml`) in full; it does not implement §A6 (provenance stamping) — that is `provenance.frontmatter-check`'s contract, consumed here at step 7.
