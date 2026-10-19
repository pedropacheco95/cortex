---
about: "How the user wants work done here: working preferences and conventions"
permanence: changing
verified: "2026-09-17 (told)"
origin:
  - migrated:compass/preferences.md#12@d7ed910
  - migrated:compass/preferences.md#13@d7ed910
  - migrated:compass/preferences.md#14@d7ed910
  - migrated:compass/preferences.md#15@d7ed910
  - migrated:compass/preferences.md#16@d7ed910
---

## Curated conventions (human-added)

- **Resolved bugs remain filed.** A bug's `status:` transitions to `resolved` with a Resolution section added to the body; the file is never deleted. The ledger is durable history — resolved bugs are design-refinement evidence and feed future pattern extraction.

- **Prefer "required with a well-defined empty-state value" over "optional" when defining schema fields.** Optional-but-meaningful fields get silently omitted — `governs:` was optional and 17 dev specs shipped without it, blinding spec-drift and spec_links until a loop caught it. Not enforceable as a check; a preference for future schema decisions. (Pedro, 2026-07-02)

- **Sequence coordinated writer+parser+schema changes explicitly; never implement in parallel.** Order: schema amendment first (defines the contract), then parser (reads per contract), then writer (emits per contract), then a regression AC exercising the round-trip. Half-shipped coordinated changes break existing artifacts silently. First exercise: B-003's fence-grammar fix. (Pedro, 2026-07-02)

When running a grep-clean verification sweep over src/ (e.g. confirming no stale path/string references remain after a rename or reorg), use `grep -a`. At least one source file (src/constellation/compile.ts) contains non-ASCII bytes and is treated as binary by plain grep, which silently skips it with no error — producing a false-clean result.

- **A session that dispatches work reads the knowledge layer first — more, not less, than one that edits.** Team leads, reviewers and planners in this repo receive everything as a claim rather than as a file, so "do not read source" must never be generalised into "do not read `.cortex/`". Before dispatching or judging a task, open `compass/_index.md` and `compass/environment.md`, and route the relevant `_index.md` to the worker. Motivated by an external Cortex adopter whose coordinator never opened `compass/` in a 16-hour six-session wave while `environment.md` held the answer to the night's most expensive unknown (`archive/documents/parallel-wave-brief-2026-09-14/extracted/claims.md`, C-01/C-02; ingested 2026-09-16).
