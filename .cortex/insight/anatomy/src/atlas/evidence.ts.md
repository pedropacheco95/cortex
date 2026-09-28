---
path: src/atlas/evidence.ts
extracted_at: 2026-09-22T09:55:29Z
extraction_level: 2
size_lines: 171
size_tokens: 1816
centrality: medium
built_at_commit: "a66041b"
source_sha256: "9b9dbada7318c2af2b9376095bf59a2d24a288444376cbebe5d4e7db29b57ccf"
---
# src/atlas/evidence.ts

## Purpose

The shared evidence writer (schema §4.3 — `atlas/evidence/`, new at 3.4; spec `atlas.evidence` Rule 4), the single place all three producers of an evidence file (`cortex usage --record`, `cortex thread promote --to atlas/evidence`, and `pulse-accept` of an `evidence-candidate`) render the artefact so they cannot drift on its shape. `evidenceFilePayload` renders the §4.3 frontmatter in Rule 1's exact field order (`id`, `title`, `date`, `kind`, `instrument`, `window`, `findings`, `bears_on`, then optional `supersedes`/`provenance`) followed by the narrative body, using `yamlScalar`/`yamlValue` to hand-roll YAML-safe scalar quoting (plain style unless the value would misparse as another YAML type or contains `: `/leading `-`/trailing whitespace). `ensureEvidenceDir` creates `.cortex/atlas/evidence/` with its `_index.md` (from the shipped `CORTEX_INDEXES` template, falling back to a hardcoded copy `EVIDENCE_INDEX_FALLBACK` kept in sync by hand) when the directory is absent — RULES rule 9, the directory never exists without its index — and never overwrites an existing index. `latestEvidenceMatching` finds the lexicographically greatest `*-<suffix>.md` filename for the `supersedes` re-measurement chain (newest wins by date-prefixed filename ordering). Deterministic Core (R-001): string rendering and `fs` only, no LLM, no network, no subprocess.

## Connections

Uses:
- src/cli/templates.ts — `CORTEX_INDEXES` supplies the shipped `atlas/evidence` `_index.md` template text; a hardcoded fallback exists in this file for when the templates entry hasn't landed yet.

Used by:
- src/pulse/review.ts — `ensureEvidenceDir` is called when `pulse-accept` lands an `evidence-candidate` proposal, creating the directory before the loop's own payload is written.
- src/pulse/thread-cli.ts — `ensureEvidenceDir`, `evidenceFilePayload`, and the `EvidenceFinding` type back `cortex thread promote --to atlas/evidence` (the human verb).
- src/pulse/usage.ts — imports `ensureEvidenceDir`, `evidenceFilePayload`, `latestEvidenceMatching`, `EvidenceFields`, `EvidenceFinding` to implement `cortex usage --record`, including its `supersedes` re-measurement lookup.
- src/schema/checks/evidence.ts — imports `EVIDENCE_KINDS` to validate an evidence file's `kind` field against the closed enum.
- tests/atomic/atlas/evidence.test.ts — mocked unit coverage of the rendering and directory-creation functions.
- tests/spec/atlas/evidence.spec.test.ts — integrated-slice coverage against a real `.cortex/atlas/evidence/` fixture tree.
