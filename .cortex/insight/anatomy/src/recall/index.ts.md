---
path: src/recall/index.ts
extracted_at: 2026-09-22T09:55:44Z
extraction_level: 2
size_lines: 703
size_tokens: 7206
centrality: low
built_at_commit: "a66041b"
source_sha256: "c4c5945d9324c727dfb5e46d4540ccf8d3577b93031a74852a117022a06088b2"
---

## Purpose

The recall index compiler — builds `.cortex/recall-index.json` (schema
§4.11, new at 3.4; spec `recall.recall-index`), the file every other recall
module reads or writes against. It scans seven carrier kinds (decisions,
evidence, threads, observations, rules, the four compass documents, bugs)
and inverts their `bears_on` / `affects` / `governs` relations into a
per-subject index: for each subject key, the current decisions, non-
superseded evidence (direct and inherited through a citing decision's
`sources:`), open threads, observation themes, derived rule subjects, and
open/triaged bugs. Currency rules live here and nowhere else: superseded
decisions/evidence, non-open threads, and resolved bugs keep their `entries`
row but reach no subject. It is pure assembly (`compileRecallIndex` reads,
writes nothing) with a thin writer (`writeRecallIndex`) that is the only
function allowed to touch the file. Despite being the shared foundation the
other three recall files (`cli.ts`, `index-blocks.ts`, `query.ts`) and
`src/hooks/pre-read.ts` all import from — by far the largest in-edge count of
the group — its scope-local `centrality_tier` is recorded as `low`; that is
an L1 ranking input taken as given here, not re-derived, but it reads as an
anomaly worth the orchestrator's attention (see report).

## Connections

Uses:
- `src/pulse/threads.ts`: `keyText`, `listThreads`, `THREADS_DIR` — scans and
  titles thread carriers, and locates their files on disk.
- `src/schema/clauses.ts`: `loadClauseIndex`, `ClauseIndex` — the clause
  resolver passed into ref resolution for `bears_on` entries shaped like
  `schema:§…`.
- `src/schema/index-build.ts`: `buildIndex`, `ProjectIndex` — the project-wide
  index used to resolve a carrier's `bears_on` refs to concrete subject keys.
- `src/schema/refs.ts`: `classifyRef`, `normalisePathRef`, `resolveRef` — ref
  classification and resolution shared with the rest of the ref-handling
  code.
- `src/schema/version.ts`: `SUPPORTED_VERSION` — fallback `schemaVersion` when
  `.cortex/cortex.config.json` is absent or unreadable.

Used by:
- `src/hooks/pre-read.ts`: reads the compiled index (via `query.ts`'s loader)
  to build the PreRead recall marker.
- `src/recall/cli.ts`: imports `RECALL_ENTRY_KINDS`, `recallIndexPath`, and
  the shared types for the `why`/`recall` verbs.
- `src/recall/index-blocks.ts`: imports the `RecallIndex`/`RecallSubject`
  types to render the generated atlas blocks.
- `src/recall/query.ts`: imports `recallIndexPath`, `RECALL_ENTRY_KINDS`,
  `STOP_TOKENS`, and the shared types for the loader, tokeniser and matcher.
- A wide band of tests (`tests/atomic/recall/*`, `tests/atomic/hooks/*`,
  `tests/spec/recall/*`, `tests/spec/hooks/*`,
  `tests/spec/compass/bug-currency.spec.test.ts`,
  `tests/fixtures/recall-query.ts`) exercising both the compiler and its
  consumers.

Semantically related (not imports):
- `src/schema/checks/layout.ts` shares `index-blocks.ts`'s `words × 1.3`
  token estimator so the compiler-adjacent budget check and the writer never
  disagree on what fits — an intentional duplication, not an import, because
  the writer must not depend on the validator.
