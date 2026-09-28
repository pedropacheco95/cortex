---
path: src/recall/cli.ts
extracted_at: 2026-09-22T09:55:44Z
extraction_level: 2
size_lines: 408
size_tokens: 4686
centrality: medium
built_at_commit: "a66041b"
source_sha256: "7ed6cd7d79cc3ec8cdd91be52fe17cb55d9814a6884c1d6e0d6601fbbcf77b81"
---

## Purpose

Implements the two pull-side recall CLI verbs, `cortex why <ref> [--json]` and
`cortex recall <word…> [--kind k]` (spec `recall.why`, schema §4.11
"Consumers"). `why` resolves a ref (path, id, or the schema document, which
aggregates every `schema:§…` subject) to its recall subject and renders the
current decisions, evidence, open threads, observation themes, bugs and rules
that bear on it as a short deterministic listing or as sorted-key JSON;
`recall` searches the same index by keyword. Rule 4 permits exactly two reads
outside the index — an evidence file's `findings` frontmatter and a bug
file's currency fields (`status`, `owner`, `fix_in_flight`, `found_at_commit`)
— both bounded to the entries already listed, never a directory scan, and
degrading to an "unreadable" marker on failure. The module is Deterministic
Core: index read, string matching, sorting, and per-listed-file frontmatter
parses only — no LLM, network, or subprocess calls.

## Connections

Uses:
- `src/recall/index.ts`: imports `RECALL_ENTRY_KINDS` (for `--kind` grammar
  validation and usage text), `recallIndexPath`, and the `RecallEntry` /
  `RecallEntryKind` / `RecallIndex` / `RecallSubject` types the index is
  shaped by.
- `src/recall/query.ts`: imports `candidateKeys`, `clearRecallIndexCache`,
  `keywordMatches`, `loadRecallIndex`, `tokenise` — the shared loader and
  matching primitives `why`/`recall` build on rather than re-implementing.
- `src/schema/clauses.ts`: `CLAUSE_REF_RE`, `SCHEMA_DOC_FILENAME` — to detect
  a `schema:§…`-shaped ref or the schema document filename and route it
  through `aggregateClauses` instead of a single subject lookup.
- `src/schema/refs.ts`: `classifyRef`, `normalisePathRef` — classifies the
  `why <ref>` argument (path vs. id) and normalises path refs before subject
  resolution.

Used by:
- `tests/atomic/recall/cli.test.ts`: unit-level coverage of grammar parsing,
  ref resolution, listing/JSON rendering and the two bounded reads.
- `tests/spec/recall/why.spec.test.ts`: spec-level acceptance test for
  `recall.why`.
