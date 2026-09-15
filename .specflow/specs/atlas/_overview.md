# Atlas — Overview

## What this is

The project knowledge base, following the Karpathy LLM Wiki pattern. It is the narrative/why view of the project and the home for non-code source material.

## What it covers

**Specs written:**

- `atlas.ingest-skill` — the shipped `cortex-ingest` skill bundle: verbatim source preservation + §4.4-conformant extraction (stakeholders, decisions, domain terms) with mandatory provenance, atlas-only write boundary, post-write validation. Includes the `cortex validate` CLI rider. (SUPERSEDED at v3 — folded into `archive.ingest-skill`; retained for lineage.)
- `atlas.evidence` — (schema 3.4, recall step 2) the `atlas/evidence/` artefact kind: a measurement, experiment or audit as gated, committed knowledge with typed findings, a window, an instrument and a required `bears_on`; `check.evidence`; the three producers — `cortex usage --record` and `cortex thread promote --to atlas/evidence` (human verbs, direct write) and the `evidence-candidate` pulse type (loops, gated); and the `check.atlas` warning for a decision that cites a transient pulse report instead.

_Planned (not yet written):_

- `stakeholders/` — who the project serves
- `decisions/` — human-readable narrative decisions, cross-linked to compass (and, since 3.4, pointing forward via `bears_on` — `schema.bears-on`)
- `domain/` — problem-domain terms and glossary
- `sources/` — raw transcripts, RFPs, PDFs, and design docs

## Why it's grouped this way

Atlas holds the narrative *why* and the raw source material behind the project. The enforcement view of decisions — the machine-checkable, write-time-enforced version — lives in `compass/`; atlas holds the human-readable story those records summarise. Code structure lives in `anatomy/`, not here; atlas is for non-code sources.

Keeping raw sources here (rather than scattered) gives every other domain a single place to cite when a convention, rule, or spec needs to point back to its origin.

## Related groups

- Business outcomes for this domain: `../../specs-business/atlas/`
- Enforcement view of decisions: `../compass/`
- Code structure (not narrative): `../anatomy/`
