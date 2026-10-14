---
about: Bug ledger entries use the seven-type taxonomy
permanence: changing
verified: "2026-07-24 (told)"
origin:
  - migrated:compass/rules/R-002-bugs-seven-type-taxonomy.md@d7ed910
aliases:
  - R-002
  - R-002-bugs-seven-type-taxonomy
applies_when: "When the agent does work this rule governs: bug ledger entries use the seven-type taxonomy"
scope:
  - action
match: { commands: [], paths: [".cortex/compass/bugs/**/*.md"] }
source: user@2026-07-24
---

# R-002 — Bug ledger entries use the seven-type taxonomy

Set `type:` to one of the seven taxonomy values — free-form categories break triage.

Severity: error. Every bug file under `.cortex/compass/bugs/` carries `type:` with exactly one of the seven SpecFlow values (design §2; schema §4.3): `missing-criterion`, `incomplete-rule`, `wrong-rule`, `missing-dev-spec`, `missing-business-spec`, `layer-drift`, `test-defect`.

A bug is not a spec — it is a signal that something in the spec-and-implementation chain is broken, and the `type:` names which link. Free-form categories (`logic`, `ux`, …) are not permitted; they break triage routing (`cortex-loop-bug-triage`) and the citation graph.

<!-- 3.x fields of compass/rules/R-002-bugs-seven-type-taxonomy.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../../cortex-schema.md
related_specs:
  - schema.validator
confidence: STATED
check:
  kind: regex
  applies_to: ".cortex/compass/bugs/**/B-*.md"
  pattern: "type:\\s*(missing-criterion|incomplete-rule|wrong-rule|missing-dev-spec|missing-business-spec|layer-drift|test-defect)"
  expect: present
```
