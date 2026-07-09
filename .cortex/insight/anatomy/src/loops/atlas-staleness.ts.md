---
path: src/loops/atlas-staleness.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 256
size_tokens: 2275
centrality: low
built_at_commit: "8248c76"
source_sha256: "d6ed7eb917a9ab0909e5c2c23bb58320f0fe60cf9aa5be18f295da04f2262edf"
---

## Purpose

Implements `cortex loop-atlas-staleness`, the monthly project-memory review loop (spec `loops.atlas-staleness`, design §11.4 item 6): it scans `.cortex/atlas/**` and produces three kinds of findings written to `.cortex/pulse/atlas-review.md` — (a) decisions older than a 180-day threshold (`ATLAS_STALE_AGE_DAYS`) that are still cited by rules or other atlas entries ("re-verify candidates"), (b) raw sources older than the threshold that nothing references ("archive candidates", ageing from the sibling `.meta.md`'s `captured` field or file mtime), and (c) atlas entries whose own `sources:`/`supersedes:`/`compass_rules:` cross-references no longer resolve ("dead cross-references"). It builds a citation map by reading compass rules' `source:` fields and atlas entries' `sources:`/`supersedes:` fields, resolving each reference via the shared index-build resolver rather than reimplementing reference resolution. It is strictly propose-don't-mutate and deterministic Core (R-001) — it never edits the atlas, only writes the review report.

## Connections

Uses:
- `src/loops/report.ts` — `writePulseReport`, used to land `atlas-review.md` with standard report framing.
- `src/schema/index-build.ts` — `buildIndex`, `resolveId`, `resolveRelativePath`, the shared cross-reference resolution machinery reused (not reimplemented) to check whether `sources:`/`supersedes:`/`compass_rules:` references resolve.

Used by: (none src-internal — no importers in the given data; invoked only via CLI/scheduled task)
