---
path: src/recall/query.ts
extracted_at: 2026-09-22T09:55:44Z
extraction_level: 2
size_lines: 629
size_tokens: 7170
centrality: high
built_at_commit: "a66041b"
source_sha256: "4aa968eb173b218f8b790a7fdf6aa238cfec3155e2fe4d516290e069754c9562"
---

## Purpose

The shared recall query module — the single loader, tokeniser, candidate-key
expander, keyword matcher and pointer-line formatter that every consumer of
`.cortex/recall-index.json` calls through (schema §4.11 "Consumers", §5
"Recall pointer lines"; owned by `hooks.search-annotate` Rule 12). Its four
consumers are `cortex hook search-annotate`, the PreRead recall marker,
`cortex why`/`cortex recall`, and the generated atlas index blocks — one
grammar shared by all: `Recall: …`, `Decided: … · Open: …`, and the PreRead
marker form, each budget-bounded (`POINTER_BUDGET_CHARS`,
`POINTER_MAX_LINES`) and fail-open (a missing, unparseable or mis-shaped
index loads as `null`, cached, never thrown or logged). Everything here is
index-only except one deliberate exception: `candidateKeys` reads
`cortex-schema.md`'s heading lines (via `loadClauseHeadings`) to match clause
subjects by heading text for the schema document target. Deterministic Core:
string matching, set operations, one JSON read per process per root.

## Connections

Uses:
- `src/recall/index.ts`: `recallIndexPath`, `RECALL_ENTRY_KINDS`,
  `STOP_TOKENS`, and the `RecallEntry`/`RecallEntryKind`/`RecallIndex`/
  `RecallSubject` types — the index shape `loadRecallIndex`'s `probeShape`
  validates against and the stop-list `tokenise` shares with the compiler.
- `src/schema/clauses.ts`: `CLAUSE_REF_RE`, `clauseNumber`,
  `loadClauseHeadings`, `SCHEMA_DOC_FILENAME` — power the one non-index read,
  matching schema clause subjects by heading text.
- `src/schema/refs.ts`: `BUG_RE`, `CONCEPT_RE`, `DOMAIN_RE`, `RULE_RE`,
  `normalisePathRef` — the ref-shape regexes `tokenise` and `candidateKeys`
  use to recognise `R-NNN`, `B-NNN`, `concept:`, `domain.` and path refs.

Used by:
- `src/hooks/pre-read.ts`: builds the PreRead recall marker from
  `loadRecallIndex`, `candidateKeys` and `markerLine`.
- `src/hooks/prompt-route.ts`: uses `fitOpenLines`/`openLine` and the fired-
  memory helpers for the `Open:` line grammar (Rule 9).
- `src/hooks/search-annotate.ts`: the primary owner-consumer — drives
  `selectPointers`, `tokenise`, `candidateKeys` and `keywordMatches` to
  produce `Recall:`/`Decided:` pointer lines.
- `src/recall/cli.ts`: `why`/`recall` verbs call `candidateKeys`,
  `clearRecallIndexCache`, `keywordMatches`, `loadRecallIndex`, `tokenise`.
- A wide band of tests (`tests/atomic/hooks/*`, `tests/atomic/recall/*`,
  `tests/spec/hooks/*`, `tests/spec/recall/why.spec.test.ts`,
  `tests/spec/compass/bug-currency.spec.test.ts`).
