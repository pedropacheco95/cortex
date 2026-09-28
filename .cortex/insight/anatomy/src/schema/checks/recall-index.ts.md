---
path: src/schema/checks/recall-index.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 125
size_tokens: 1292
centrality: low
built_at_commit: "a66041b"
source_sha256: "4d2978685814919f28868efbbc09b8bde51849186c91285caf95ad1330a3e028"
---
# src/schema/checks/recall-index.ts

## Purpose
Implements `check.recall-index` (schema §4.11, new at 3.4): validates `.cortex/recall-index.json` shape, but ONLY when the file exists — like `check.constellation`, its absence is never a finding since it's a compiled, regenerable, gitignored artefact. Checks: valid JSON object; the five required top-level keys (`schemaVersion`, `generated`, `subjects`, `entries`, `counters`); `schemaVersion` a `MAJOR.MINOR` string; every `entries` value has a `kind` in the closed enum (`decision|evidence|thread|observation|rule|compass-doc|bug`) and a non-empty string `path`; every `subjects` entry carries the four required lists (`decided`/`evidence`/`threads`/`observations`, each an array of strings) plus the two optional 3.4-fifth-revision lists (`rules`/`bugs`) when present; and every id named in a subject's lists must be a key of `entries` (observation entries are looked up under the `observation.<theme>` prefix). The `rules`/`bugs` lists are tolerated-when-absent so an index written before the fifth revision stays valid until the next `cortex scan` regenerates it.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.
(No other project-internal imports — pure JSON-shape validation.)

Used by:
- src/schema/validate.ts: calls `checkRecallIndex(root)`.
- tests/atomic/schema/recall-index-check.test.ts: the dedicated atomic-layer test.

Semantically related (not imports):
- This file's `entries`-keyed-by-id, `subjects`-list-of-refs shape mirrors `check.insight-ledger`'s ledger/reverse-index pair in src/schema/checks/insight.ts — both validate a compiled cross-reference index that's regenerated from source-of-truth files elsewhere, rather than being hand-authored.

## Query pointers
If you need to understand what produces `recall-index.json` (the compiler this check validates the OUTPUT of), also read the recall-index build/compile logic outside this scope (search for `recall-index` writers) and spec `recall.recall-index`.
