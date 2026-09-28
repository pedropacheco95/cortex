---
path: src/schema/checks/bears-on.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 91
size_tokens: 999
centrality: high
built_at_commit: "a66041b"
source_sha256: "07f46eafda95d3f9e51cf67a26167609a428ae2174bbc463f96b180b128124e0"
---
# src/schema/checks/bears-on.ts

## Purpose
Implements `check.bears-on` (schema §6/§6.2, new at 3.4): the forward-edge check on the two GATED carriers, `.cortex/atlas/decisions/*.md` and `.cortex/atlas/evidence/*.md` (skipping `_index.md`), for any file whose frontmatter carries a `bears_on` key. A `bears_on` that isn't a list is one error; an entry that's empty, non-string, or a `schema:`-prefixed string failing the clause grammar (`CLAUSE_REF_RE`) is one error per malformed entry; every other entry is classified by shape (`classifyRef`) and resolved (`resolveRef`) — an unresolved entry produces one violation whose severity is `error` for rule/bug/domain/id refs and `warning` for concept/clause/path refs (clause misses cite §6.2, everything else §6). The check deliberately does NOT touch threads (`check.threads`) or observations (`check.insight-observations`), which stay shape-checked only and ungated, nor does it repeat `check.atlas`'s "decision has no bears_on at all" warning or its "sources under pulse/" warning — this file only resolves entries that already exist.

## Connections
Uses:
- src/schema/clauses.ts: `CLAUSE_REF_RE`, `ClauseIndex` type — the clause-reference grammar and the pre-loaded clause index (loaded once by `validate()` per Rule 6, not per-check).
- src/schema/index-build.ts: `ProjectIndex` type — passed through to `resolveRef` for id-based ref resolution.
- src/schema/refs.ts: `classifyRef`, `refSeverity`, `resolveRef` — the shared ref-kind classification and resolution logic this check is a thin driver over; the actual "does this ref resolve" work lives there, not here.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkBearsOn(root, index, clauses)`.
- tests/atomic/insight/session-observe.test.ts: exercises this check as part of session-observe's audit surface.
- tests/atomic/schema/bears-on-check.test.ts: the dedicated atomic-layer test for this check.
- tests/spec/pulse/thread-cli.spec.test.ts: integrated-slice coverage.

Semantically related (not imports):
- src/schema/checks/threads.ts and src/schema/checks/insight.ts's `checkInsightObservations` both carry their own `bears_on` fields but validate them shape-only — this file is the only one of the three that actually resolves references, because only decisions/evidence are "gated" carriers (§6).

## Query pointers
If you need to understand ref classification/resolution end to end (not just this check's use of it), also read: src/schema/refs.ts. If you need the clause-reference grammar, also read: src/schema/clauses.ts. If you need to understand why threads/observations are excluded, also read: src/schema/checks/threads.ts and the `bears_on` section of src/schema/checks/insight.ts's `checkInsightObservations`.
