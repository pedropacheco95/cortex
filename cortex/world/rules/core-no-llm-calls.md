---
about: Cortex Core makes no LLM calls
permanence: changing
verified: "2026-07-24 (told)"
origin:
  - migrated:compass/rules/R-001-core-no-llm-calls.md@d7ed910
aliases:
  - R-001
  - R-001-core-no-llm-calls
applies_when: "When the agent does work this rule governs: cortex Core makes no LLM calls"
scope:
  - action
match: { commands: [], paths: ["src/schema/**/*.ts", "src/insight/**/*.ts", "src/constellation/**/*.ts", "src/pulse/**/*.ts", "src/sessions/**/*.ts", "src/harness/**/*.ts", "src/loops/**/*.ts"] }
source: user@2026-07-24
---

# R-001 — Cortex Core makes no LLM calls

Never import an LLM SDK in Core — split the feature: Core marks, a Skill fills.

Severity: error. Core (`src/schema/`, `src/insight/`) is deterministic: file I/O, schema enforcement, parsing — never an LLM SDK import or API call. Agentic behaviour belongs to Skills; the only sanctioned boundary is an opaque subprocess spawned by `cortex init` (design §3.1, §7.2 as amended; RULES.md rule 3; `core-cli.init` Rule 6).

No `@anthropic-ai/*`, `openai`, or any other LLM SDK import may appear in governed files. If a Core feature seems to need model judgment, the design is wrong — split it: Core marks, a Skill fills.

<!-- 3.x fields of compass/rules/R-001-core-no-llm-calls.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../../RULES.md
  - ../../../cortex-v3-design.md
related_specs:
  - schema.validator
  - anatomy.scanner
confidence: STATED
check:
  kind: regex
  applies_to: "src/{schema,insight,constellation,pulse,sessions,harness,loops}/**/*.ts"
  pattern: "@anthropic-ai/|['\"]openai['\"]|['\"]@google/genai['\"]|['\"]cohere-ai['\"]"
  expect: absent
```
