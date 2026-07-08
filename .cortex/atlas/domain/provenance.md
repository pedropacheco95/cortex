---
id: domain.provenance
term: provenance
definition: A frontmatter field on persistent artefacts (compass rules, both spec trees, atlas decisions) that lists the authorizing sources an artefact traces to, each as a derives_from entry pointing at an archive document, a Claude Code session id, or an atlas decision. Provenance is optional — its absence means "authored directly" — and it enables source-change drift detection, backward citation-graph queries, and audit. For v1 the only relationship type is derives_from.
sources:
  - ../sources/cortex-v3-reframe.md
---
