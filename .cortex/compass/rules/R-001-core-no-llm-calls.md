---
id: R-001
title: Cortex Core makes no LLM calls
source:
  - ../../../RULES.md
  - ../../../cortex-design.md
governs:
  - "src/schema/**/*.ts"
  - "src/insight/**/*.ts"
  - "src/constellation/**/*.ts"
  - "src/pulse/**/*.ts"
  - "src/sessions/**/*.ts"
  - "src/harness/**/*.ts"
  - "src/loops/**/*.ts"
related_specs:
  - schema.validator
  - anatomy.scanner
confidence: STATED
check:
  kind: regex
  applies_to: "src/{schema,insight,constellation,pulse,sessions,harness,loops}/**/*.ts"
  pattern: "@anthropic-ai/|['\"]openai['\"]|['\"]@google/genai['\"]|['\"]cohere-ai['\"]"
  expect: absent
---

# R-001 — Cortex Core makes no LLM calls

Never import an LLM SDK in Core — split the feature: Core marks, a Skill fills.

Severity: error. Core (`src/schema/`, `src/insight/`) is deterministic: file I/O, schema enforcement, parsing — never an LLM SDK import or API call. Agentic behaviour belongs to Skills; the only sanctioned boundary is an opaque subprocess spawned by `cortex init` (design §3.1, §7.2 as amended; RULES.md rule 3; `core-cli.init` Rule 6).

No `@anthropic-ai/*`, `openai`, or any other LLM SDK import may appear in governed files. If a Core feature seems to need model judgment, the design is wrong — split it: Core marks, a Skill fills.
