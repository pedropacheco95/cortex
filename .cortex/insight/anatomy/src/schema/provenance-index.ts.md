---
path: src/schema/provenance-index.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 153
size_tokens: 1635
centrality: low
built_at_commit: "8248c76"
source_sha256: "cbbd16860a15e04ea649680f4a0da35a7a75bd2f7623c31b66c337c0a41386ab"
---
# src/schema/provenance-index.ts

## Purpose
Implements the provenance scanner and backward-traversal index (schema §6, addendum A6): scans the four provenance-bearing artefact kinds (compass rules, dev specs, business specs, atlas decisions) for an optional `provenance:` frontmatter field, and builds a reverse map from a cited source ref (e.g. an archive document path or atlas decision path) to every artefact that cites it via `derives_from` — answering "what depends on this source?" without a manual project-wide search. The index is explicitly computed on demand and never persisted: the schema mandates the query contract but leaves storage shape open, and a freshly recomputed index can never go stale. Deterministic Core module — file I/O only, no LLM calls, per rule R-001.

## Main players
- `scanProvenanceCarriers` (lines 67–107) — scans all four artefact kinds for files with a `provenance` frontmatter key present (absence is never recorded — "authored directly" is not a finding). [critical]
- `buildProvenanceIndex` (lines 129–143) — builds the full reverse ref→carriers map by scanning and inverting `derives_from` entries. [critical]
- `derivationsOf` (lines 150–152) — the query contract itself: given a source ref, return every citing artefact (empty array if none). [critical]
- `provenanceRefResolves` (lines 53–60) — resolves a `.cortex/`-relative archive/atlas ref to an existing file on disk. [supporting]
- `wellFormedDerivesFrom` (lines 110–121) — extracts only well-formed `derives_from` string values from a raw (possibly malformed) `provenance` array, silently skipping malformed entries (shape validation is check.provenance's job, not this module's). [supporting]

## Insights
- This module and src/schema/checks/provenance.ts deliberately share the exact same `scanProvenanceCarriers` call rather than each doing their own scan — this is a design decision to keep the forward validation (checks/provenance.ts) and the backward index in sync by construction, not an accidental duplication opportunity.
- `wellFormedDerivesFrom` silently drops malformed provenance entries rather than surfacing them — this module optimizes for "give me the resolvable graph edges" and pushes ALL error reporting to check.provenance, meaning this module alone will never surface a malformed provenance entry to a caller.

## Connections
Uses:
- src/paths.ts: `SPECS_GLOB`, `BUSINESS_GLOB`.

Used by:
- src/schema/checks/provenance.ts: imports `scanProvenanceCarriers`, `provenanceRefResolves`, and the three ref-pattern regexes to run the forward validation check.

## Query pointers
If you need to understand the forward validation (error-reporting) side of provenance, also read: src/schema/checks/provenance.ts (the check that shares this module's scan).
