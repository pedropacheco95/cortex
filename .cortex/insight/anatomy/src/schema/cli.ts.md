---
path: src/schema/cli.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 50
size_tokens: 400
centrality: medium
built_at_commit: "8248c76"
source_sha256: "2aa04f355ed3943c6b0ac8ef5bb37d6b16a5e77b1ab784cf3f317e5458f51321"
---
# src/schema/cli.ts

## Purpose
The `cortex validate` CLI entrypoint. `run(argv)` parses `--json` and a positional target path (default `.`), calls `validate()`, and prints either raw JSON or a human-readable report via the internal `formatReport` (schema version, conformant yes/no, error/warning counts, then each violation's severity/check-id/clause/location/message). Returns process exit code 0 if conformant, 1 otherwise. The bottom guard (`scriptUrl.endsWith(scriptPath)`) makes this module runnable directly as a script while still being importable without side effects elsewhere.

## Connections
Uses:
- src/schema/types.ts: `ValidationReport` type (for `formatReport`'s input).
- src/schema/validate.ts: `validate` — the actual validation logic this CLI wraps.

Used by:
- (none src-internal — this is a terminal CLI entrypoint with `importedBy: []`, invoked externally as the `cortex validate` verb, not imported by other source modules.)

## Query pointers
If you need to understand what `validate()` actually checks, also read: src/schema/validate.ts.
