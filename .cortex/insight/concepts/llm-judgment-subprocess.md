# llm-judgment-subprocess

A Core-deterministic bookend around a single LLM call: spawn `claude -p <prompt>` as an opaque subprocess, classify the outcome (auth-failure/no-binary/timeout/error/ok) before touching its output, then validate/parse the stdout with a dedicated function.

## Files

- src/loops/bug-triage.ts
- src/loops/skill-suggest.ts
- src/pulse/distil.ts

## Related concepts

- always-write-pulse-report — co-members of cluster:scheduled-loops: every LLM-judgment loop still writes its pulse report on every outcome
