---
id: R-002
title: Bug ledger entries use the seven-type taxonomy
source:
  - ../../../cortex-design.md
  - ../../../cortex-schema.md
governs:
  - ".cortex/cerebrum/bugs/**/*.md"
related_specs:
  - schema.validator
confidence: STATED
check:
  kind: regex
  applies_to: ".cortex/cerebrum/bugs/**/B-*.md"
  pattern: "type:\\s*(missing-criterion|incomplete-rule|wrong-rule|missing-dev-spec|missing-business-spec|layer-drift|test-defect)"
  expect: present
---

# R-002 — Bug ledger entries use the seven-type taxonomy

Set `type:` to one of the seven taxonomy values — free-form categories break triage.

Severity: error. Every bug file under `.cortex/cerebrum/bugs/` carries `type:` with exactly one of the seven SpecFlow values (design §2; schema §4.3): `missing-criterion`, `incomplete-rule`, `wrong-rule`, `missing-dev-spec`, `missing-business-spec`, `layer-drift`, `test-defect`.

A bug is not a spec — it is a signal that something in the spec-and-implementation chain is broken, and the `type:` names which link. Free-form categories (`logic`, `ux`, …) are not permitted; they break triage routing (`cortex-loop-bug-triage`) and the citation graph.
