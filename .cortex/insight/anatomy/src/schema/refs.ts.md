---
path: src/schema/refs.ts
extracted_at: 2026-09-22T09:54:56Z
extraction_level: 2
size_lines: 134
size_tokens: 1402
centrality: high
built_at_commit: "a66041b"
source_sha256: "f860ba03537a0b22c5a3156c9df890103165eeed29f3028e6eb44c44712a90ca"
---
# src/schema/refs.ts

## Purpose
Implements the `bears_on` ref grammar and resolver (schema §6, new at 3.4; spec `schema.bears-on` Rules 1–3), shared by every carrier that needs to classify and resolve a reference string. `classifyRef` is total and ordered — it classifies any non-empty string into exactly one of `rule | bug | domain | concept | clause | path | id` by shape — and `resolveRef` then resolves it through the surface appropriate to that kind: gated kinds (rule/bug/domain/id) against the project-global `ProjectIndex`, `concept` against `.cortex/insight/concepts/` (flat or scoped), `clause` against the per-run clause index, and `path` against the filesystem (rejecting absolute paths and `..` segments). `refSeverity` fixes severity per kind in one place (Rule 3): an unresolved gated kind is always `error`; concept/clause/path misses are `warning`. Read-only, deterministic (R-001) — file existence and set lookups only.

## Connections
Uses:
- src/schema/clauses.ts: imports `CLAUSE_REF_RE`, `clauseNumber`, `clauseResolves`, `ClauseIndex` to classify and resolve the `clause` ref kind.
- src/schema/index-build.ts: imports the `ProjectIndex` type — `resolveRef`'s gated-kind branch looks up `index.idToPath` (which, per index-build.ts's current duplicate-id handling, is absent for any id carried by more than one file).

Used by:
- src/constellation/compile.ts: Rule 10's edge classification, per this file's own header comment, classifies constellation edges by the ref kind this module computes.
- src/recall/cli.ts, src/recall/index.ts, src/recall/query.ts: the recall compiler resolves `bears_on` and other ref forms through `classifyRef`/`resolveRef`.
- src/schema/checks/bears-on.ts: the gated `bears_on` check on decisions and evidence uses `resolveRef`/`refSeverity` to decide error vs. warning per ref kind.
- tests/atomic/schema/refs.test.ts: unit tests for classification and resolution across all seven ref kinds.
