---
id: R-001
title: Spec files carry schema-checked frontmatter
source:
  - ../../atlas/decisions/2026-07-01-sample-decision.md
governs:
  - ".specflow/specs/**/*.spec.md"
confidence: STATED
provenance:
  - derives_from: archive/documents/sample-client-spec/extracted/summary.md
  - derives_from: atlas/decisions/2026-07-01-sample-decision.md
---

# R-001 — Spec files carry schema-checked frontmatter

Keep every dev spec's frontmatter conformant to the schema — the validator is
the trust surface (see the decision this rule derives from, cited via
`provenance:` rather than restated).
