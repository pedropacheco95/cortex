---
path: src/constellation/compile.ts
extracted_at: 2026-09-22T09:55:29Z
extraction_level: 2
size_lines: 472
size_tokens: 4640
centrality: high
built_at_commit: "a66041b"
source_sha256: "30f5dc8c9e3852c4a75edf68a5df5b6ba9eaec6e51c7bf0f55c18372f224ec24"
---
# src/constellation/compile.ts

## Purpose

The constellation compiler (spec `constellation.compiler`; schema §4.9, v3.0). Reads the three curated knowledge surfaces — compass (rules, bugs, the four core files; `decisions.md` deliberately excluded, decisions live solely in `atlas/decisions/`), atlas (leaf artefacts with a frontmatter `id`, grouped by subfolder), and both spec trees (dev + business) — builds the §6 citation graph, groups nodes into the three v3.0 top-level constellations (compass/atlas/specs; `anatomy` was removed as a node-emitting module and absorbed into insight, which never enters `constellation.json`), and writes `.cortex/constellation.json` deterministically. `assembleConstellation` is the pure in-memory half (no write), reused by the insight-refresh loop to borrow the exact same node-id set for its inferred graph rather than re-deriving identity; `compile` wraps it with the single side-effecting `constellation.json` write. Structural/semantic edges from insight's `graph.json` are deliberately excluded — this is the curated citation graph, not code structure or inferred understanding (Rule 5, design §12.7). Nine edge kinds are emitted, one per producing frontmatter field: `implements`, `depends_on`, `governed_by`, `source`, `related_specs`, `compass_rules`, `supersedes`, `sources`, and — new at 3.4 (Rule 10) — `bears_on`, the forward edge from an atlas decision or evidence node to whatever its ref names, classified by shape via `classifyRef` (rule/bug/domain/id resolve to edges; path/concept/schema shapes are not nodes and are silently skipped, uncounted, like a `governs:` glob). Every reference resolution goes through `addEdge`, which drops and counts (`droppedRefs`) any edge whose endpoint node was never emitted — the module never fails on a broken reference; complaining about it is `check.constellation`'s job. Tolerant of every missing surface (Rule 9) and deterministic modulo the `generated` timestamp (Rule 7): nodes, edges, and group children are all explicitly sorted before assembly.

## Connections

Uses:
- src/paths.ts — `specsRoot`, `businessRoot`, `SPECS_GLOB`, `BUSINESS_GLOB` locate the two spec trees on disk.
- src/schema/refs.ts — `classifyRef` classifies a `bears_on` reference's shape (rule/bug/domain/id/path/concept/schema) to decide whether and how it becomes an edge.

Used by:
- src/constellation/server.ts — imports the `Constellation`/`ConstellationGroup`/`ConstellationGroupChild`/`ConstellationNode` types (type-only) for the compiled map it serves/filters; does not import `compile` itself.
- tests/atomic/constellation/compiler.test.ts, tests/atomic/constellation/renderer.test.ts, tests/atomic/schema/constellation.test.ts — mocked unit coverage of node/edge emission and the schema shape.
- tests/fixtures/constellation-harness.ts — shared test-fixture harness building temp `.cortex/` trees for constellation tests.
- tests/spec/constellation/compiler.test.ts, tests/spec/constellation/insight-preset.test.ts, tests/spec/constellation/renderer.test.ts — integrated-slice coverage against real fixture trees.

Semantically related (not imports):
- src/cli/init.ts and src/cli/cli.ts dynamically import `compile` (not captured as a static resolvedImport here) for `cortex init`'s Rule 3 skeleton step and the `cortex scan` verb respectively — evidence: both files' dynamic-import call sites name `../constellation/compile.js`.
