---
path: src/schema/checks/index-completeness.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 90
size_tokens: 889
centrality: low
built_at_commit: "a66041b"
source_sha256: "bbcf98e35b19f3d558551bcd4c8488a769af094c5348cf632eecb16c5c3b2da5"
---
# src/schema/checks/index-completeness.ts

## Purpose
Implements `check.index-completeness` (validator Rule 14, wave follow-up A, schema Appendix A §7.1): checks that `compass/rules/_index.md` references every `R-NNN` file on disk in `compass/rules/`, and likewise `compass/bugs/_index.md` against every `B-NNN` file in `compass/bugs/`. An id "counts as referenced" if its literal token appears anywhere in the index body, OR it falls inside a same-prefix range written with an en dash, em dash, hyphen, or backtick-wrapped dash (`R-001–R-003`, tolerating this repo's own `B-001`–`B-020` style). An index that has collapsed to fit its token budget — a `… and N more` tail or a generated `<!-- cortex:recall:start` block — is treated as complete without scanning further, since a collapsed index can't literally enumerate every id by design. Absence of the directory or the index file itself is `check.index-present`'s finding, not this one's; missing ids produce a single `warning` per directory naming up to 5 missing ids plus a `…` tail.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.
(No other project-internal imports — this file is self-contained apart from Node's `fs`/`path`.)

Used by:
- src/schema/validate.ts: calls `checkIndexCompleteness(root)`.
- tests/atomic/schema/index-completeness.test.ts: the dedicated atomic-layer test.

Semantically related (not imports):
- src/schema/checks/layout.ts's `checkIndexPresent`/`checkIndexShape` own the adjacent "does `_index.md` exist / does it have the right headings" checks; this file assumes the index exists and instead checks its content stays in sync with what's on disk — the three checks together cover presence, shape, and completeness as three separate concerns on the same file.

## Query pointers
If you need the full `_index.md` contract (presence + shape + completeness together), also read: src/schema/checks/layout.ts.
