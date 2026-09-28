---
path: src/schema/checks/registry.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 127
size_tokens: 1190
centrality: medium
built_at_commit: "a66041b"
source_sha256: "ed0cfc4c64df0029f92b9f5b65559e7d2148058c44e969eac2a204ba97891698"
---
# src/schema/checks/registry.ts

## Purpose
Implements `check.id-registry` (schema Appendix A, 3.4 fifth revision; §4.1/§4.2/§10.4): cross-checks `compass/registry.md` against the `R-*.md`/`B-*.md` files actually on disk in `compass/rules/` and `compass/bugs/`. Findings: the registry being absent while ≥1 rule/bug file exists is a warning naming `cortex sync`; a line that's neither blank, a `#` comment, nor `<id> <slug>` is an error with its line number; the same id registered twice is an error naming both lines; a file whose id appears on no registry line is an error naming `cortex id next <kind>` (the id-collision scenario this check exists to catch); a registered id with no matching file is a warning (could be another branch, or reserved); and a line out of ascending order within its kind, or a rule line appearing below a bug line, is a warning (hand-edited, nothing broken yet). The slug written after each id is explicitly never compared against the filename — it's informational only. All findings are read-only.

## Connections
Uses:
- src/compass/registry.ts: `REGISTRY_FILE`, `parseRegistry`, `filesOnDisk`, `kindOfId`, `IdKind` — this file is a thin validator wrapper; the actual registry-file parsing, on-disk file enumeration, and id-kind classification all live in registry.ts, not here.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkIdRegistry(root)`.
- tests/atomic/schema/registry-check.test.ts: the dedicated atomic-layer test.
- tests/spec/pulse/thread-cli.spec.test.ts: integrated-slice coverage.

Semantically related (not imports):
- src/schema/checks/compass.ts's `checkRules`/`checkBugs` validate each R-NNN/B-NNN FILE's own frontmatter shape; this file instead cross-checks the FILE SET against the separate `compass/registry.md` ledger — the two are complementary concerns on the same directories (per-file shape vs. cross-file id bookkeeping).

## Query pointers
If you need the id-allocation and registry-file grammar itself (not just this check's use of it), also read: src/compass/registry.ts. If you need the per-file rule/bug frontmatter contract this check assumes is separately valid, also read: src/schema/checks/compass.ts.
