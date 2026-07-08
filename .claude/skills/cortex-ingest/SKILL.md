---
name: cortex-ingest
description: >-
  Retired — moved into cortex-archive-ingest. Use this when the user says
  "ingest this transcript", "ingest this RFP", "ingest this brief", "ingest
  this email", "ingest this design doc", "add this to project memory",
  "capture this call", "remember this decision", "log these stakeholders", or
  drops any raw document — trigger cortex-archive-ingest instead.
---

# cortex-ingest (retired)

This skill has moved. Invoke **`cortex-archive-ingest`** instead for all
document ingestion, including the atlas-only sources this skill used to
handle (transcripts, RFPs, briefs) — that behaviour is now the `atlas`
extraction strategy inside `cortex-archive-ingest` (design §6.6). See
`.claude/skills/cortex-archive-ingest/SKILL.md`.
