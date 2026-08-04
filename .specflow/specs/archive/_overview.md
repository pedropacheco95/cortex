# Archive — Overview

## What this is

The engineering specs for the `.cortex/archive/` module (v3, build-order-v3 step 3): the systematic ingestion home for every authoritative source document — client specs, contracts, transcripts, compliance documents, RFCs — kept verbatim under `archive/documents/<slug>/` with machine-readable metadata and structured extractions, indexed in `register.md`, and routed by document type through one skill.

## What it covers

- `archive.ingest-skill` — the load-bearing archive contract: the module layout (`documents/<slug>/` with `source.<ext>` + `metadata.yaml` + `extracted/`), the `archive/types/*.yaml` document-type schema the skill routes on, and the `cortex-archive-ingest` skill's 8-step workflow — classify (declared or inferred), store verbatim, extract, the yes/no change-plan gate, version-update diffing with supersession preserved, and `register.md` upkeep. The former atlas-only `cortex-ingest` skill is folded in as the `atlas` extraction strategy (build-order-v3 step 9).

## Why it's grouped this way

Ingested documents are authoritative by definition — the user chose to ingest them — so extraction writes directly into the document's own `extracted/` directory, never through the pulse gate; the one gated moment is the explicit yes/no change-plan step, because proposing rules/specs/decisions is always a separate, human-reviewed act. Keeping the layout, the type schema, and the skill in one domain keeps that authority boundary — capture is direct, downstream change is gated — in one place. A new document type is a new `types/*.yaml` file, never a new skill.

## Related groups

- Business outcomes for this domain: `../../specs-business/archive/`
- The provenance chain from derived artefacts back to these documents: `../provenance/`
- The review gate the yes-path change plan proposes through: `../pulse/`
- The knowledge base atlas-shaped extractions feed: `../atlas/`

- `archive.intent-register` — the frozen-intent-anchor register (schema §4.4.3) and its validator check.
