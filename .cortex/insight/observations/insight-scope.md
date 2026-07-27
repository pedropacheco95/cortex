---
kind: insight-observation
updated: 2026-07-26T01:10:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/9c6cdd6d-65db-46dd-998f-2232f2b016bb
  - claude-sessions/pedropacheco1/67da915c-1080-40a7-a0a8-ece57da80042
  - claude-sessions/pedropacheco1/09124a88-f17c-456b-9005-164bc9d793d7
  - claude-sessions/pedropacheco1/797a3f69-2c76-4d6a-86b4-3a9dd6910913
  - claude-sessions/pedropacheco1/3cde3a93-2188-49fa-b41b-eac6de3a81ac
  - claude-sessions/pedropacheco1/d3f0bc08-35e2-4c69-bd4f-4d120632e173
---

Cortex's own `.cortex/insight/` layer is scoped to `src/` only — `anatomy/`
has a single `src/` subtree, and the scope registry does not cover
`tests/`, `.specflow/`, `.claude/skills/`, `skills/`, or root docs. The
daily and full insight-refresh loops routinely flag 150-170 non-`src/`
files as "dirty" or "new" every cycle; these are expected to sit
`pending` indefinitely rather than get extracted. This is not a defect —
`.cortex/`, `.specflow/`, and `.claude/` are hard-excluded at L1 as
skip-listed (insight is about the code, not the knowledge layer, specs,
or skill bundles), and expanding scope to cover tests/skills/docs is a
deliberate judgment call the unattended daily loop is not chartered to
make on its own.
