---
id: decision.2026-07-10-model-tiering-for-the-five-consolidated-scheduled-task-bundl
title: "Model tiering for the five consolidated scheduled-task bundles"
date: 2026-07-10T10:54:03.209Z
provenance:
  - derives_from: claude-sessions/pedropacheco1/3bac199d-2d61-471f-b48b-f91c871cd282
---

When consolidating 14 individual scheduled loops into 5 bundles, a two-tier model assignment was chosen: Sonnet 5 for daily, weekly-quality, test-runner, and monthly-review (their judgment tasks don't need extra reasoning depth), and Opus 4.8 specifically for weekly-curation (pulse-distil + rule-decay) because its output shapes the compass rules governing every future session — worth the cost since it runs only weekly. Haiku 4.5 stays an independent sub-tier for the cheap significance-triage subprocess inside insight-refresh-daily, and the post-commit fast tier stays fully deterministic/LLM-free. Encoded in src/cli/templates.ts SCHEDULED_TASKS and src/cli/tasks-register.ts TaskPlanEntry.model.
