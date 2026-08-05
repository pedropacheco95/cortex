---
path: src/archive/formats.ts
extracted_at: 2026-08-05T01:00:00Z
extraction_level: 3
size_lines: 400
size_tokens: 2629
centrality: low
built_at_commit: "c667a9a"
source_sha256: "c9b7445cd6840bfba025a938ca9f790d2a7534d65eb7eed9e166508ef04bbce8"
---
# src/archive/formats.ts

## Purpose
Defines the shared types and pure parse/validate helpers for the three archive-module YAML shapes described in cortex-schema.md — `metadata.yaml` (§4.4.1, per-document status/version/supersedes), `types/*.yaml` (§4.4.2, document-type classification plus the extraction-output contract), and, new at schema 3.2, `intent-register.yaml` (§4.4.3, the pending/reconciled/flagged status machine for stated stakeholder intents) — reusing gray-matter's own YAML engine (by wrapping raw content in `---` frontmatter delimiters) rather than adding a new top-level YAML dependency. Pure module: no fs, no LLM; callers read files and pass in already-in-memory strings.

## Connections
Uses:
- (none src-internal)

Used by:
- src/insight/storage.ts: consumes only `parseYamlDocument`, the shared standalone-YAML parsing primitive
- src/schema/checks/archive.ts: calls `parseArchiveMetadata`, `parseArchiveTypeDef`, and (new) `parseIntentRegister` to validate `.cortex/archive/` documents, type declarations, and the intent register

## Main players
- `parseArchiveMetadata` / `parseArchiveTypeDef` — the two original §4.4.1/§4.4.2 parsers; unchanged in shape, still the source of truth `src/schema/checks/archive.ts` builds on.
- `parseIntentRegister` — new §4.4.3 parser: validates `entries[]` shape only (id form `IR-NNN`, ISO calendar date, status enum, per-status evidence field presence). Deliberately does NOT resolve whether `covering_spec_test`/`flagged_bug`/`landing` links actually point at real files — that cross-file resolution is left to the validator check, which has the project index this pure parser doesn't.
- `INTENT_STATUSES` / `IntentStatus` — the three-status enum (`pending | reconciled | flagged`) new callers should import rather than re-declaring.
- `coerceIsoDate` (internal) — mirrors `coerceString` but for the register's `date` field, handling gray-matter's habit of parsing an unquoted YAML date into a JS `Date`.

## Insights
- The per-status evidence rule is enforced only at shape level here: `reconciled` needs `landing` + `covering_spec_test`, `flagged` needs `landing` + `flagged_bug`, `pending` needs neither. A caller adding a fourth status must update this function's if-chain by hand — there's no data-driven table.
- `coerceString` and the newer `coerceIsoDate` both exist to absorb gray-matter's YAML-scalar coercion (unquoted numbers/dates becoming `number`/`Date` instead of `string`) — a recurring shape-validation motif across all three parsers in this file, not unique to the register.
