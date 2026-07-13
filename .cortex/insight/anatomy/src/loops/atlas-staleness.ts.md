---
path: src/loops/atlas-staleness.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 255
size_tokens: 2279
centrality: low
built_at_commit: "fd7b55b"
source_sha256: "079675a5ce64f38676894562e11f2625e15a565c6d465eac1ce409b4f5c53edb"
---

## Purpose

Implements `cortex loop-atlas-staleness`, the monthly project-memory review loop (spec `loops.atlas-staleness`, design §11.4 item 6): it scans `.cortex/atlas/**` and produces three kinds of findings written to `.cortex/pulse/reports/atlas-review.md` — (a) decisions older than a 180-day threshold (`ATLAS_STALE_AGE_DAYS`) that are still cited by rules or other atlas entries ("re-verify candidates"), (b) raw sources older than the threshold that nothing references ("archive candidates", ageing from the sibling `.meta.md`'s `captured` field or file mtime), and (c) atlas entries whose own `sources:`/`supersedes:`/`compass_rules:` cross-references no longer resolve ("dead cross-references"). It builds a citation map by reading compass rules' `source:` fields and atlas entries' `sources:`/`supersedes:` fields, resolving each reference via the shared index-build resolver rather than reimplementing reference resolution. It is strictly propose-don't-mutate and deterministic Core (R-001) — it never edits the atlas, only writes the review report (now under the reorganized `pulse/reports/` zone, not the pulse root).

## Connections

Uses:
- `src/loops/report.ts` — `writePulseReport`, used to land `atlas-review.md` with standard report framing.
- `src/schema/index-build.ts` — `buildIndex`, `resolveId`, `resolveRelativePath`, the shared cross-reference resolution machinery reused (not reimplemented) to check whether `sources:`/`supersedes:`/`compass_rules:` references resolve.

Used by: (none src-internal — no importers in the given data; invoked only via CLI/scheduled task)
