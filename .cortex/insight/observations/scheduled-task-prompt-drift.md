---
kind: insight-observation
updated: 2026-09-06T01:20:00Z
salient: true
sessions:
  - claude-sessions/pedropacheco1/3885d16d-c73e-4b00-9867-71aafcc75a91
  - claude-sessions/pedropacheco1/d97506f5-d147-4dd2-829c-1131fb83ed23
  - claude-sessions/pedropacheco1/2e498599-40da-4415-bd91-93d104ffac1b
  - claude-sessions/pedropacheco1/b6fa9d2b-cc7e-472d-a709-12d5dd22d38a
---

The five deployed scheduled-task prompt files under
`~/.claude/scheduled-tasks/cortex-*/SKILL.md` (what the Desktop app actually
fires — distinct from this repo's own `src/cli/templates.ts` source and the
`.claude/skills/cortex-loop/references/*.md` the current skill reads) have
drifted from the code and skill they describe, confirmed independently
across at least three bundles:

- **`monthly-review`** (2026-09-01): the deployed text describes
  `onboarding-drift` as comparing the codebase against `.specflow/specs/`
  for missing/orphaned governing specs. `src/loops/onboarding-drift.ts`
  implements no such check — its four checks are `checkClaudeMdVersion`,
  `checkIndexHeadings`, `checkIndexBudgets`, `checkTemplateIdentical`
  (template/budget hygiene only). The deployed text also declares schema
  3.0 (actual: 3.3) and names the wrong report path.
- **`daily`** (2026-09-04, 2026-09-05): the deployed text names five
  retired standalone skills (e.g. `cortex-pulse-hygiene`) instead of the
  current single `cortex-loop` skill + `references/*.md`, and gives the
  pre-reorg report paths (e.g. `.cortex/pulse/hygiene-report.md` instead of
  the actual `.cortex/pulse/reports/hygiene.md`). The 2026-09-05 read
  additionally caught the deployed text still claiming spec-drift
  "classif[ies] findings per the seven-type taxonomy" when the current
  skill reference (and this loop's actual behaviour) is report-only, no
  classification.

**Root cause, confirmed by code (2026-09-02 four-agent audit, `b6fa9d2b`):**
`writeScheduledTasks` in `src/cli/scaffold.ts` has a preserve-if-exists
branch that never refreshes an existing payload file once one is on disk —
only `--force` rewrites it. All five deployed payloads are a snapshot from
around 2026-07-20, predating the 2026-08-06 rewrite of `src/cli/templates.ts`
(the single-`cortex-loop`-skill consolidation) by observed weeks. Every
`cortex sync`/`cortex init` run since then has silently left the stale
payloads in place. The same audit flagged a second consequence worth
knowing: the Desktop app wrapper reportedly permits a scheduled session to
write only what its own task-file text names — so the stale daily payload,
which never mentions `insight/observations/`, may be actively suppressing
session-observe's real (and primary) output path in stricter enforcement,
not just describing it inaccurately.

**Practical implication for any session running one of these bundles:**
the live `<scheduled-task>` prompt you receive is not authoritative for
"what does member X actually do" — follow the current `cortex-loop` skill's
`references/*.md` (or the CLI verb's own behaviour) instead, exactly as the
2026-09-04/09-05 sessions did, and don't be alarmed when the two disagree —
it's expected until someone regenerates the payloads.

**Fix (not yet applied):** regenerate all five payloads from the current
`src/cli/templates.ts` (or run `cortex-register-tasks` again after a
`cortex sync --force`-equivalent refresh), and add a payload-hash check to
`writeScheduledTasks` so a template change is detected and reflowed instead
of silently preserved forever.
