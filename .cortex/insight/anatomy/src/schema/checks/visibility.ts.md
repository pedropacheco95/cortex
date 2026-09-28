---
path: src/schema/checks/visibility.ts
extracted_at: 2026-09-22T18:00:00Z
extraction_level: 2
size_lines: 247
size_tokens: 2518
centrality: low
built_at_commit: "a66041b"
source_sha256: "f60bd5eb30b36ba7e68b468714ed1e8c7939444344d89cb9fbf0df9f52938449"
---
# src/schema/checks/visibility.ts

## Purpose
Implements `check.visibility` (schema §10.1, RULES.md rule 20): when `cortex.config.json`'s `visibility.repo` is `public`, scans every tracked `.md`/`.yaml` file under `.cortex/compass/` and `.cortex/atlas/` line by line for five pinned shapes of operational specifics — an IPv4 address, a hostname in an infrastructure context, a `host:port`, an `ssh user@host` target, or an account identifier (12-digit AWS account, `arn:aws:…`, a GCP service-account email, `--project=`/`projects/` flags) — and emits ONE warning per matching line naming the most specific family (via `VISIBILITY_REPORT_ORDER`: ssh > account > port > ipv4 > host). "Tracked" is determined by replaying the root and `.cortex/.gitignore` patterns through the `ignore` package rather than spawning `git` (R-001). Files matched by a `visibility.allow` glob are skipped whole and recorded in the validation report's `notes`. Each file caps at `VISIBILITY_MAX_LINES_PER_FILE` (20) individual line warnings, then collapses the rest into one `… and N more lines` warning. Never errors, never fixes anything (Rule 6) — output is deterministic (sorted paths, ascending lines) across runs.

## Connections
Uses:
- src/schema/types.ts: `Violation` type.
(External deps only otherwise: `picomatch` for `visibility.allow` glob matching, and the CJS `ignore` package loaded via `createRequire` the same way src/insight/exclude.ts does.)

Used by:
- src/schema/validate.ts: calls `checkVisibility(root, notes)`.
- tests/atomic/schema/visibility-check.test.ts: the dedicated atomic-layer test; also the source that "pins" the five regex shapes per this file's own docstring.

Semantically related (not imports):
- src/insight/exclude.ts uses the identical CJS-`ignore`-via-`createRequire` loading pattern this file copies — worth checking together if that loading approach ever needs to change (e.g. an ESM-native replacement for `ignore`).
- src/schema/checks/config.ts's `checkConfig` validates the shape of the `visibility` block (`repo`/`allow`) that this file's `readVisibility` reads at runtime — a malformed `visibility.repo` value is `check.config`'s error, not this file's concern (this file just falls back to `repo: 'unknown'` and no-ops).

## Query pointers
If you need to change or extend the five pinned regex families, also read: tests/atomic/schema/visibility-check.test.ts (the AC pins) and RULES.md rule 20. If you need the `visibility.repo`/`visibility.allow` config shape validation, also read: src/schema/checks/config.ts.
