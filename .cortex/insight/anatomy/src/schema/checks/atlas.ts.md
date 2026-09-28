---
path: src/schema/checks/atlas.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 137
size_tokens: 2029
centrality: medium
built_at_commit: "a66041b"
source_sha256: "dd2747d0d0d9cf8d91371541c86338a31532db876206e08e56bd2913e4f7a902"
---
# src/schema/checks/atlas.ts

## Purpose
Validates `.cortex/atlas/` artefacts (schema §4.4): every markdown file under the atlas module (excluding `_index.md`/`_overview.md`) must carry an `id`, and — depending on the id's prefix (`decision.`, `stakeholder.`, `domain.`) — the type-specific required fields (`title`+`date`, `name`+`role`, `term`+`definition` respectively). A decision additionally gets a §4.3 warning when its `bears_on` is absent or empty (a decision nothing points forward from is a leaf nothing reaches — shape/resolution of a present list is `check.bears-on`'s job, not this file's). `supersedes`/`sources`/`compass_rules`/`related_specs` reference fields are all checked for resolution via the project index, with one extra rule for decisions: a `sources` entry that resolves under `.cortex/pulse/` is a warning (pulse reports are overwritten every run, so the citation would dangle) rather than an error, steering authors toward `atlas/evidence/` instead. A separate carve-out (B-006) exempts raw files directly under `atlas/sources/` from the blanket id requirement — only their `.meta.md` sidecars are id-bearing, validated by the internal `checkSourceMeta` helper against a fixed `kind` enum (`transcript|rfp|slack|pdf|design-doc|other`) and an ISO-date `captured` field.

## Connections
Uses:
- src/schema/index-build.ts: `ProjectIndex` type, `resolveId`, `resolveRelativePath` — resolve the cross-reference fields (`supersedes`/`sources`/`compass_rules`/`related_specs`) against the whole-project id/path index.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkAtlas(root, index)` as part of the full validation run.
- tests/atomic/insight/session-observe.test.ts: exercises this check indirectly as part of session-observe's audit surface.
- tests/spec/pulse/thread-cli.spec.test.ts: integrated-slice coverage alongside the other atlas/compass checks.

Semantically related (not imports):
- src/schema/checks/compass.ts shares the same gray-matter-parse-then-validate-frontmatter-by-id-prefix pattern (there, `R-`/`B-` prefixes instead of `decision.`/`stakeholder.`/`domain.`).
- src/schema/checks/evidence.ts and src/schema/checks/bears-on.ts together take over what atlas evidence/decision artefacts used to be checked for here alone — `checkAtlas`'s decision `bears_on`-presence warning is deliberately NOT duplicated by `check.bears-on`, which only resolves entries that already exist.

## Query pointers
If you need to understand the atlas sources sidecar exemption (B-006), also read: this file's `checkSourceMeta` helper, and the atlas domain docs under `.cortex/atlas/`. If you need the full decision `bears_on` contract, also read src/schema/checks/bears-on.ts (resolution) alongside this file (presence).
