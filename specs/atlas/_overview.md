# Atlas — Overview

## What this is

The project knowledge base, following the Karpathy LLM Wiki pattern. It is the narrative/why view of the project and the home for non-code source material.

## What it covers

_No specs written yet — this tree is scaffolded structure only. Planned coverage:_

- `stakeholders/` — who the project serves
- `decisions/` — human-readable narrative decisions, cross-linked to cerebrum
- `domain/` — problem-domain terms and glossary
- `sources/` — raw transcripts, RFPs, PDFs, and design docs

## Why it's grouped this way

Atlas holds the narrative *why* and the raw source material behind the project. The enforcement view of decisions — the machine-checkable, write-time-enforced version — lives in `cerebrum/`; atlas holds the human-readable story those records summarise. Code structure lives in `anatomy/`, not here; atlas is for non-code sources.

Keeping raw sources here (rather than scattered) gives every other domain a single place to cite when a convention, rule, or spec needs to point back to its origin.

## Related groups

- Business outcomes for this domain: `../../specs-business/atlas/`
- Enforcement view of decisions: `../cerebrum/`
- Code structure (not narrative): `../anatomy/`
