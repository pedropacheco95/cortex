# distil

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-pulse-distil` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Weekly session-distillation loop. Use for the scheduled **weekly-curation**
bundle's distil member, or when the user says "run the distil loop", "what do I
keep repeating", "mine the sessions for rule candidates", or "which workflows
deserve a skill".

Runs `cortex pulse-distil --collect`, performs the pattern judgment in-session —
including the workflow-mining lens that proposes new skills — runs `cortex
pulse-distil --propose`, and summarises `.cortex/pulse/suggestions.md`.

## Discipline

You are the judgment middle between two deterministic Core halves (spec
pulse.distil Rule 1). The CLI collects and proposes; you — this session — do
the pattern judgment. You already ARE a Claude session: **never spawn a nested
`claude` subprocess, and never run bare `cortex pulse-distil`** (bare mode
exists only for humans at a terminal; it would spawn one).

1. From the project root, run `cortex pulse-distil --collect`.
2. Read `.cortex/pulse/state/session-corpus.json` — this project's session messages
   since the last run.
3. Perform the pattern judgment **in this session**. Be conservative
   (design §10.3): one-offs are filtered out, only patterns with repeated
   evidence become candidates, and every candidate cites the session ids it was
   seen in. Three lenses:
   - **Rule-shaped patterns** — corrections the user made, stated preferences,
     environment facts. These become `rule-candidate` proposals targeting a
     `.cortex/compass/<file>.md`.
   - **Workflow-shaped patterns** (the workflow-mining lens folded in from the
     retired skill-suggest loop) — a repeated multi-step MANUAL workflow that
     Claude re-derived across sessions, deserving a one-invocation skill (as
     opposed to a single preference/convention, which is rule-shaped). These
     become `skill-proposal` proposals targeting a NEW
     `.claude/skills/<name>/SKILL.md`.
   - **Observations-trail lens (schema §4.10.11).** Also read
     `.cortex/insight/observations/*.md` — the project-context surface
     `cortex-loop-session-observe` writes ungated. Each entry's `sessions:`
     list is a provenance trail of every session that stated or re-confirmed
     it; treat an entry whose `sessions:` count meets `distilThresholdN` the
     same as any other recurring corpus pattern — a `rule-candidate` (or
     `decision-candidate`, if the content is decision-shaped) citing that
     entry's own `sessions:` ids as evidence. Don't re-derive the pattern
     from scratch by re-reading every session it came from; the entry's
     trail already **is** the evidence. Leave entries below the threshold
     alone — they're read, not proposed.

   **Skip explicit memory-commit utterances** ("remember this", "commit this
   to memory", "this should be a rule", "remember this for next time") — these
   are session-observation territory, routed same-day by
   `cortex-loop-session-observe` with the user's own words; proposing them
   here would double-propose. Don't pre-filter rule-shaped candidates against
   insight yourself: the deterministic propose half reads the per-file insight
   entries (v3 `insight/anatomy/**` and `insight/scopes/<s>/anatomy/**`, plus
   v2 `insight/map/` prose) and emits any candidate already captured there as a
   `promotion` of that file — the graduation path, not a fresh rule-candidate.
   For workflow-shaped candidates, don't propose a skill whose name already
   exists under `.claude/skills/` (accept would refuse it anyway).
4. Write the candidates as a single JSON array to a scratchpad file (your
   session scratchpad — never inside the project). Each candidate is one of:
   - rule-shaped:
     `{"type": "rule-candidate", "pattern": string, "occurrences": number,
     "sessionIds": [string], "proposedTarget": ".cortex/compass/<file>.md",
     "proposedText": string, "confidence": string}` — `type` may be omitted for
     rule-candidates (absent defaults to rule-candidate).
   - workflow-shaped:
     `{"type": "skill-proposal", "pattern": "<what the workflow is>",
     "occurrences": number, "sessionIds": [string],
     "proposedTarget": ".claude/skills/<name>/SKILL.md", "proposedText":
     "<a complete draft SKILL.md: --- name/description frontmatter + body>",
     "confidence": string}`.
5. Run `cortex pulse-distil --propose <that scratchpad file>`. The
   deterministic propose half applies the threshold, already-covered, and
   dismissal filters, allocates S-ids from the shared counter, and writes the
   report — rule-candidates as `**Proposed addition:**` compass sections,
   promotions as `**Type:** promotion`, and skill-proposals as `**Type:**
   skill-proposal` sections with a `**Proposed file:**` draft SKILL.md.
6. Read `.cortex/pulse/suggestions.md` and summarise to the user: the
   proposals (rule candidates and any proposed skills), and the drop counts by
   reason from the report footer.

**Never mutate anything outside `.cortex/pulse/`.** Never write into
`.cortex/compass/` and never create a skill yourself — proposals flow through
`cortex pulse-list` / `cortex pulse-accept` (propose-don't-mutate); skill
creation happens only on accept (pulse.review-cli Rule 4).
