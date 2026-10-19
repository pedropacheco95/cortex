---
about: "Dev spec `implements:` is singular, never a list"
permanence: changing
verified: "2026-07-24 (told)"
origin:
  - migrated:compass/rules/R-003-implements-singular.md@d7ed910
aliases:
  - R-003
  - R-003-implements-singular
applies_when: "When the agent does work this rule governs: dev spec `implements:` is singular, never a list"
scope:
  - action
match: { commands: [], paths: [".specflow/specs/**/*.spec.md"] }
source: user@2026-07-24
---

# R-003 — Dev spec `implements:` is singular, never a list

Keep `implements:` a single value; note secondary outcomes under Notes instead.

Severity: error. Every dev leaf spec's `implements:` frontmatter carries exactly one value — a single relative path to the one business spec it primarily serves (schema §4.6, §6; design §8.1). The YAML list form (`implements:` followed by `- ` entries) is a violation even with one entry.

Many-to-one is a spec-decomposition smell, not a linking style: if a leaf genuinely serves a second outcome, note it under Notes ("Also supports:") and keep `implements:` singular. The validator enforces this as an error; this rule catches it at write time, before the file lands.

<!-- 3.x fields of compass/rules/R-003-implements-singular.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../../cortex-schema.md
related_specs:
  - schema.validator
confidence: STATED
check:
  kind: regex
  applies_to: ".specflow/specs/**/*.spec.md"
  pattern: "implements:\\s*\\n\\s*-\\s"
  expect: absent
```
