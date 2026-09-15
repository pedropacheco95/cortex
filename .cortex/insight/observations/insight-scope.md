---
kind: insight-observation
updated: 2026-09-06T01:20:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/9c6cdd6d-65db-46dd-998f-2232f2b016bb
  - claude-sessions/pedropacheco1/67da915c-1080-40a7-a0a8-ece57da80042
  - claude-sessions/pedropacheco1/09124a88-f17c-456b-9005-164bc9d793d7
  - claude-sessions/pedropacheco1/797a3f69-2c76-4d6a-86b4-3a9dd6910913
  - claude-sessions/pedropacheco1/3cde3a93-2188-49fa-b41b-eac6de3a81ac
  - claude-sessions/pedropacheco1/d3f0bc08-35e2-4c69-bd4f-4d120632e173
  - claude-sessions/pedropacheco1/f2a2b32d-7342-4527-99e4-a7716db566b6
  - claude-sessions/pedropacheco1/24a8c676-da90-4f8c-ad2f-c3891847195b
  - claude-sessions/pedropacheco1/ae5057ae-3fe3-45c6-9754-8d06a4d6ac47
  - claude-sessions/pedropacheco1/d868fb89-e74c-487e-ad98-0c63eae7aed9
  - claude-sessions/pedropacheco1/d97506f5-d147-4dd2-829c-1131fb83ed23
  - claude-sessions/pedropacheco1/2e498599-40da-4415-bd91-93d104ffac1b
---

Cortex's own `.cortex/insight/` layer is scoped to `src/` only —
`anatomy/` has a single `src/` subtree. More precisely: this project runs
the fully flat/unscoped insight layout (no `scopes/` directory, no
`scope-registry.yaml` — a full `insight-refresh-full` collect reports "0
scopes"), and the `src/`-only coverage is a hard L1 skip-list exclusion,
not a registry that partially covers some non-`src/` paths. The daily and
full insight-refresh loops routinely flag 150-200 non-`src/` files as
"dirty" or "new" every cycle (`tests/`, `.specflow/`, `.claude/skills/`,
`skills/`, root docs); these are expected to sit `pending` indefinitely
rather than get extracted. This is not a defect — `.cortex/`,
`.specflow/`, and `.claude/` are hard-excluded at L1 as skip-listed
(insight is about the code, not the knowledge layer, specs, or skill
bundles), and expanding scope to cover tests/skills/docs is a deliberate
judgment call the unattended daily loop is not chartered to make on its
own.

A direct consequence worth knowing before reaching for `cortex insight`
on a "why" question: the query surface cannot see `.cortex/compass/` or
`.cortex/atlas/` at all (`cortex insight concept <compass-concept>` →
"no such concept"; `cortex insight file <path-under-compass>` → "no
insight entry") — and a blind experiment comparing insight-informed vs.
code-only agents on identical questions found compass/atlas citations
were exactly where insight's only outright wins came from (a verbatim
decision, a deferred-debt record, a gated/ungated definition), while
insight lost or tied on code-focused questions it should have won given
its whole purpose. If a "why was this built this way" question comes up,
grep `compass/` and `atlas/` directly — `cortex insight` will not find
it even if it exists.
