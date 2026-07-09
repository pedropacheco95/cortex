---
path: src/insight/entry.ts
extracted_at: 2026-07-08T18:30:00Z
extraction_level: 3
size_lines: 160
size_tokens: 1535
centrality: high
built_at_commit: "8248c76"
source_sha256: "2e92254786db0bde3555be1b094676925cc5c79a15b3eb411a4b4f51921b98ad"
---
# src/insight/entry.ts

## Purpose

Defines and validates the per-file "understanding entry" contract (§4.10.2) — the frontmatter shape (path, extracted_at, extraction_level, size_lines, size_tokens, centrality, built_at_commit, source_sha256) and the canonical section vocabulary (Purpose / Main players / Insights / File map / Connections / Query pointers), with L3 requiring Purpose+Main players+Connections at minimum and L2 requiring Purpose+Connections. `parseEntry` is the single deterministic, pure function every other insight module relies on to load and shape-check one entry.

## Main players

- `parseEntry` (lines 100–159) — parses raw markdown+frontmatter via gray-matter, validates every required field's type/enum/pattern, and checks the level-appropriate minimum sections are present; returns a typed `ParseResult<InsightEntry>`. [critical]
- `entrySections` (lines 86–93) — extracts `## `-heading titles from a body in document order via regex. [supporting]
- `ENTRY_SECTIONS` / `L2_REQUIRED_SECTIONS` / `L3_REQUIRED_SECTIONS` (lines 27–41) — the canonical section vocabulary and the per-level minimum-section constants. [critical]
- `isCentrality` / `isExtractionLevel` (lines 43–49) — type guards for the `centrality` and `extraction_level` frontmatter enums. [supporting]

## Insights

Pure module by explicit design (module header: "NO fs, NO LLM") — every caller reads the file content itself and only passes the raw string in; this keeps parseEntry testable and embeddable in both the query engine and the refresh/audit loops. `## File map` is optional below roughly the 500-line threshold and its absence is never a validation error (line 37) — a detail easy to miss when hand-writing entries, since the L3 minimum only actually requires Purpose+Main players+Connections. `parseEntry` is the sole enforcement point for the §4.10.2 contract: every consumer (query engine reads, refresh-daily validates re-extracted candidates, session-observe audits post-enrichment shape) shares this one validator, so a change to required sections here silently changes what all of them accept or reject.

## Connections

Uses:
- src/insight/storage.ts: `isIsoDatetime`, `isSha256`, and the shared `ParseResult<T>` type for frontmatter field validation.

Used by:
- src/insight/query.ts: calls `parseEntry` and reuses `ENTRY_SECTIONS` to load and order an entry's sections for the `file` query.
- src/insight/refresh-daily.ts: calls `parseEntry` to validate each re-extracted candidate entry before reconciling the ledger.
- src/insight/session-observe.ts: calls `parseEntry` to confirm a touched entry still parses after the skill's ungated enrichment.
- src/schema/checks/insight.ts: uses `parseEntry` as part of the schema-conformance check suite (outside this scope).

## Query pointers

If you need to change the entry frontmatter or section contract, also read: src/insight/storage.ts (the shared validators it imports), src/insight/query.ts (the primary reader), src/insight/session-observe.ts (the enrichment auditor that depends on the section boundaries staying stable).
