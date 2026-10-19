---
about: "Jev (TypeSafe AI's hosted \"System One\" model — `POST"
permanence: changing
verified: "2026-09-24 (observed)"
origin:
  - migrated:insight/observations/jev-evaluation.md@d7ed910
  - session:0fe76333-d412-4c78-a9de-f603fe699361
aliases:
  - jev-evaluation
---

Jev (TypeSafe AI's hosted "System One" model — `POST
https://api.typesafe.ai/v1/systemone`, three primitives: Choice, Score,
Noul) was deeply investigated as a possible replacement for the hooks'
fuzzy natural-language heuristics (search-annotate, pre-read,
prompt-route, session-end) and **rejected**. Two independent RULES.md
constraints rule it out on their own, with no workaround: rule 6 (hooks
are pure file I/O, no network calls) and rule 3 (Core is deterministic —
Jev has no seed/temperature control, and even local clones like Kev and
SemIf that copy the API shape run 0.8B–9B on-device models that are
still not deterministic). Latency (70–500ms vendor-claimed, more like
149–721ms for local clones) also would not fit hooks that fire on every
Grep/Bash/Read call.

Adopting it would require changing RULES.md rules 3 and 6 themselves,
which needs Pedro's approval — the investigation's conclusion was not to
pursue that trade. The one viable use identified is outside the hooks
entirely: an offline evaluator tool to measure how accurate the current
deterministic heuristics are (not live in the hot path). Do not
re-investigate Jev or a similar hosted/local judgment-model API for the
hooks without a new signal — this ground was already covered as of
2026-09-23.

<!-- 3.x fields of insight/observations/jev-evaluation.md, carried verbatim by cortex migrate -->
```yaml
kind: insight-observation
salient: false
```
