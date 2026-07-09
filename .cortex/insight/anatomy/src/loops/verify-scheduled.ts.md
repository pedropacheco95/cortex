---
path: src/loops/verify-scheduled.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 2
size_lines: 308
size_tokens: 3009
centrality: low
built_at_commit: "8248c76"
source_sha256: "c9fe95f95093d660a9577206a13e7c70e4c581e59412b3264a3d1025cf6f5441"
---

## Purpose

Implements `cortex loop-specflow-verify`, the daily scheduled test-coverage verification loop (spec `loops.verify-scheduled`, design §11.4 item 9): it checks that every spec has the tests it is owed by schema §3 path conventions — existence and coverage only, never actually running tests (that is the test-runner's job). It scans dev leaf specs (those carrying `implements:`) for missing atomic/spec-layer test files at either the fully-mirrored or domain-level conventional path (capability level optional per §2.1), scans business specs for a missing journey-layer test and for absence from any scenario spec's `covers:` list (the §8.2 completeness constraint, deliberately owned here rather than by the validator per schema Decision 4), and distinguishes genuine journey gaps from deliberately deferred ones by matching a spec's `## Notes` section against declared journey-deferral conventions (`/journey[- ]layer tests deferred/i` or `/deferred to v1\.1/i`), propagating a dev-spec's deferral to the business spec it implements. It always-writes `.cortex/pulse/verification-report.md` and exits 0 regardless of findings — deterministic Core (R-001), read-only against the spec/test trees.

## Connections

Uses:
- `src/loops/report.ts` — `writePulseReport`, used to land `verification-report.md`.
- `src/paths.ts` — `specsRoot`, `businessRoot`, the canonical dev-spec and business-spec root resolvers used to walk both trees.

Used by: (none src-internal — no importers in the given data; invoked only via CLI/scheduled task)
