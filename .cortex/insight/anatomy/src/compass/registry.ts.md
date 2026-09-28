---
path: src/compass/registry.ts
extracted_at: 2026-09-22T09:55:29Z
extraction_level: 2
size_lines: 306
size_tokens: 2893
centrality: high
built_at_commit: "a66041b"
source_sha256: "fd8af8a4ef538480656d80cb287215e39208e4f1cf072dbd27063712fee36db9"
---
# src/compass/registry.ts

## Purpose

The id registry — `.cortex/compass/registry.md` (schema §4.1, §4.2, §10.4; spec `schema.id-registry`, 3.4 fifth revision; filed to resolve B-019, two branches independently allocating the same `R-`/`B-` number and each passing `cortex validate` alone). Every rule and bug id is issued by appending one `<id> <slug>` line to this committed, append-only file, so a same-number collision becomes a git merge conflict instead of a silent validator gap. The module owns the full lifecycle: `parseRegistry` reads the append-only grammar (`REGISTRY_LINE_RE`: `[RB]-\d{3,} [a-z0-9-]+`), skipping the verbatim `REGISTRY_HEADER` or any non-id-shaped leading prose, and reports malformed lines and duplicate ids by line number; `filesOnDisk`/`idsOnDisk`/`diskEntries` cross-check the registry against the actual `R-*.md`/`B-*.md` files in `compass/rules` and `compass/bugs`; `buildRegistryFromDisk` renders a fresh registry purely from disk (the Rule 6 migration path for a pre-registry project); `ensureRegistry` creates the file from disk when absent and is a no-op existence check otherwise (never re-sorts or regenerates an existing file); `allocateId` is the writer-facing entry point — takes the max of the registry's own ids and the disk's filenames, appends `<kind>-<max+1>` at the end of that kind's block (rules stay grouped before bugs via `insertLine`'s block-aware insertion point), and returns the new id; `registerId` is the counterpart for a writer that already chose its own id (e.g. `pulse-accept` landing a new rule file) — idempotent against a matching or `reserved` slug, and reports a `conflict` (writing nothing) when the same id was claimed under a different slug. Deterministic Core throughout (R-001): `fs`/`path`, a numeric max, one append — no git spawned, since the merge conflict is git's job, not this module's.

## Connections

Uses:
- (none src-internal — pure `fs`/`path`)

Used by:
- src/cli/init.ts — `ensureRegistry` creates the registry (built from disk) as part of `cortex init`'s Rule 3 skeleton step.
- src/cli/sync.ts — `ensureRegistry` re-runs the same once-only creation for `cortex sync` (spec `core-cli.sync` Rule 15).
- src/insight/session-observe.ts — `readRegistry` reads the current ids to cross-reference session-observed rule/bug references.
- src/pulse/review.ts — `findRegistered`/`registerId` reconcile an accepted proposal's chosen id against the registry.
- src/pulse/thread-cli.ts — `allocateId` mints the next `R-`/`B-` number when a thread is promoted to a rule or bug.
- src/schema/checks/registry.ts — imports `REGISTRY_FILE`, `parseRegistry`, `filesOnDisk`, `kindOfId`, `IdKind` to implement `check.xref-unique`/the registry-vs-disk validator check.
- tests/atomic/compass/registry.test.ts, tests/atomic/core-cli/id-next.test.ts, tests/atomic/core-cli/init.test.ts, tests/atomic/core-cli/sync.test.ts, tests/atomic/insight/session-observe.test.ts, tests/atomic/pulse/review-cli.test.ts, tests/atomic/pulse/thread-cli.test.ts, tests/atomic/schema/registry-check.test.ts — mocked unit coverage of individual exports.
- tests/fixtures/validator-tmp.ts — test-fixture helper building temp registries for validator tests.
- tests/spec/compass/bug-currency.spec.test.ts, tests/spec/core-cli/sync.test.ts, tests/spec/pulse/thread-cli.spec.test.ts, tests/spec/recall/index-blocks.spec.test.ts, tests/spec/schema/id-registry.spec.test.ts — integrated-slice coverage against real `.cortex/` fixture trees.
