---
kind: cerebrum-preferences
generated: 2026-07-02T14:56:17.730Z
confidence: EXTRACTED
status: draft
---

# Preferences — DRAFT for human review

> Drafted deterministically by `cortex init` from project metadata
> (package.json, tsconfig.json, eslint config, pyproject.toml, README.md).
> These are **not accepted rules** until a human reviews and edits this file.

- Package name: `cortex`
- Module system: ESM (`"type": "module"`)
- Dependencies: `fast-glob`, `gray-matter`, `ignore`, `picomatch`, `tree-sitter-wasms`, `web-tree-sitter`
- Language: TypeScript
- Test runner: vitest
- Script `build`: `tsc -p tsconfig.json`
- Script `test`: `vitest run`
- TypeScript strict mode: enabled
- TS module: `NodeNext`
- TS target: `ES2022`

## Curated conventions (human-added)

- **Resolved bugs remain filed.** A bug's `status:` transitions to `resolved` with a Resolution section added to the body; the file is never deleted. The ledger is durable history — resolved bugs are design-refinement evidence and feed future pattern extraction.

- **Prefer "required with a well-defined empty-state value" over "optional" when defining schema fields.** Optional-but-meaningful fields get silently omitted — `governs:` was optional and 17 dev specs shipped without it, blinding spec-drift and spec_links until a loop caught it. Not enforceable as a check; a preference for future schema decisions. (Pedro, 2026-07-02)

- **Sequence coordinated writer+parser+schema changes explicitly; never implement in parallel.** Order: schema amendment first (defines the contract), then parser (reads per contract), then writer (emits per contract), then a regression AC exercising the round-trip. Half-shipped coordinated changes break existing artifacts silently. First exercise: B-003's fence-grammar fix. (Pedro, 2026-07-02)
