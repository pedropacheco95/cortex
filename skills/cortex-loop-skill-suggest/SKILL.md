---
name: cortex-loop-skill-suggest
description: >-
  Weekly workflow-mining loop for a Cortex project. Use for the scheduled
  skill-suggest task, or when the user says "run the skill-suggest loop",
  "which workflows deserve a skill", or "suggest new skills". Reuses the
  shared session corpus, performs the workflow judgment in-session, runs
  `cortex loop-skill-suggest --propose`, and summarises
  .cortex/pulse/skill-suggestions.md.
---

# cortex-loop-skill-suggest

You are the judgment middle between two deterministic Core halves (spec
loops.skill-suggest Rule 1) — distil's workflow-mining sibling. You already
ARE a Claude session: **never spawn a nested `claude` subprocess, and never
run bare `cortex loop-skill-suggest`** (bare mode would spawn one).

1. Check for `.cortex/pulse/.session-corpus.json` — the shared corpus produced
   by distil's collect (design §11.5: reused, not re-collected). If it is
   absent or stale, run `cortex loop-skill-suggest --collect` from the project
   root.
2. Read the corpus and perform the workflow judgment **in this session**: find
   repeated multi-step workflows Claude re-derived across sessions that
   deserve to become one-invocation skills. Be conservative: one-offs are
   filtered out; cite the session ids each workflow was seen in.
3. For each candidate, draft a complete SKILL.md (frontmatter with `name:`
   matching the slug and a `description:`, plus an instruction body).
4. Write the candidates as a JSON array to a scratchpad file (your session
   scratchpad — never inside the project). Each candidate is exactly
   `{"workflowName": "<slug>", "occurrences": number, "sessionIds": [string],
   "draftSkillMd": "<the complete SKILL.md>"}`.
5. Run `cortex loop-skill-suggest --propose <that scratchpad file>`. The
   deterministic propose half applies the threshold, existing-skill dedup, and
   dismissal filters, allocates S-ids from the shared counter, and writes the
   report with each draft targeting a **new** `.claude/skills/<name>/SKILL.md`.
6. Read `.cortex/pulse/skill-suggestions.md` and summarise to the user: the
   proposed skills and the drop counts by reason from the report footer.

**Never create a skill yourself.** Skill creation happens only via
`cortex pulse-accept` (pulse.review-cli Rule 4) — this loop only proposes.
Never mutate anything outside `.cortex/pulse/`.
