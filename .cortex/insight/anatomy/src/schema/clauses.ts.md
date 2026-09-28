---
path: src/schema/clauses.ts
extracted_at: 2026-09-22T09:54:56Z
extraction_level: 2
size_lines: 108
size_tokens: 1108
centrality: high
built_at_commit: "a66041b"
source_sha256: "a98385b6ff92ef8bb345b00299c96fdb9208f8b4e95b9ac83864006aa2313d65"
---
# src/schema/clauses.ts

## Purpose
Implements the addressable schema-clause grammar `schema:§N[.M[.K]]` (schema §6.2, spec `schema.schema-clauses`, new at 3.4): `loadClauseIndex` reads `cortex-schema.md` once per run and returns the set of every numbered heading (`## 6.`, `### 6.2`, `#### 4.10.11`) found outside fenced code blocks, so a `bears_on` list can cite a clause and have it resolve by number regardless of the heading's current title. `loadClauseHeadings` is a 3.4-second-revision sibling that keeps the heading TEXT alongside the number, for `hooks.search-annotate` Rule 5e's token match. `clauseNumber`/`clauseResolves` are the pure parse/lookup pair every carrier calls. Deterministic Core (R-001): one file read and string matching, no LLM, no network; a project without `cortex-schema.md` resolves nothing without throwing.

## Connections
Uses:
- (none src-internal)

Used by:
- src/schema/refs.ts: imports `CLAUSE_REF_RE`, `clauseNumber`, `clauseResolves`, `ClauseIndex` to classify and resolve the `clause` ref kind inside `classifyRef`/`resolveRef`.
- src/schema/validate.ts: calls `loadClauseIndex(root)` exactly once per validation run (the "read once, cached per run" rule) and threads the resulting `ClauseIndex` into `checkBearsOn`.
- src/schema/checks/bears-on.ts: consumes the `ClauseIndex` built by validate.ts to resolve `bears_on` clause refs on the two gated carriers (decisions, evidence).
- src/hooks/pre-read.ts: uses `loadClauseHeadings` (number + title, not just number) for the search-annotate Rule 5e token match against `cortex-schema.md` headings.
- src/recall/cli.ts, src/recall/index.ts, src/recall/query.ts: the recall compiler and CLI resolve clause refs against the index this module builds, per the module's own doc comment ("every check and the recall compiler take the index as an argument").
- tests/atomic/schema/clauses.test.ts, tests/atomic/schema/refs.test.ts, tests/atomic/schema/bears-on-check.test.ts, tests/atomic/insight/session-observe.test.ts, tests/spec/pulse/thread-cli.spec.test.ts: exercise the clause grammar/resolution directly or via its consumers.
