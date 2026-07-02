---
id: R-003
title: Dev spec `implements:` is singular, never a list
source:
  - ../../../cortex-schema.md
  - ../../../cortex-design.md
governs:
  - "specs/**/*.spec.md"
related_specs:
  - schema.validator
confidence: STATED
check:
  kind: regex
  applies_to: "specs/**/*.spec.md"
  pattern: "implements:\\s*\\n\\s*-\\s"
  expect: absent
---

# R-003 — Dev spec `implements:` is singular, never a list

Keep `implements:` a single value; note secondary outcomes under Notes instead.

Severity: error. Every dev leaf spec's `implements:` frontmatter carries exactly one value — a single relative path to the one business spec it primarily serves (schema §4.6, §6; design §8.1). The YAML list form (`implements:` followed by `- ` entries) is a violation even with one entry.

Many-to-one is a spec-decomposition smell, not a linking style: if a leaf genuinely serves a second outcome, note it under Notes ("Also supports:") and keep `implements:` singular. The validator enforces this as an error; this rule catches it at write time, before the file lands.
