# Observations — index

**Read this when:** you need project-wide context a session stated in passing —
scope decisions, operational gotchas, working style — that never became a rule
or a decision, before assuming the codebase alone will tell you.

**What's here:**
- `insight-scope.md` — what `.cortex/insight/` does and does not cover.
- `headless-cli-hang.md` — headless `cortex` invocation gotcha in unattended runs.
- `session-observe-audit-false-positive.md` — a recurring daily-bundle audit false positive.
- `weekly-quality-bundle-race.md` — a cross-member race incident in the weekly-quality bundle.
- `root-doc-drift.md` — CLAUDE.md and cortex-schema.md carry stale/dead claims about project state.
- `cortex-binary-is-pnpm-link.md` — the global `cortex` binary is a pnpm link to this repo, not a published install.
- `insight-full-regen-coherence-check.md` — how to safely bless a weekly full-refresh pass without hand-regenerating stores.
- `l4-graph-lags-anatomy-silently.md` — the graph can miss whole files while `--report` still blesses it clean.
- `session-observe-agent-stall.md` — parallel subagent dispatch for reading unobserved sessions has stalled; prefer reading them directly in-session.
- `scheduled-task-silent-noop.md` — a scheduled-bundle session can die mid-run (silent no-act, dropped connection, OAuth expiry) with nothing surfacing the miss.
- `scheduled-task-prompt-drift.md` — the deployed `~/.claude/scheduled-tasks/` prompts have drifted from the code/skills they describe; root cause identified.
- `session-start-digest-gist-truncation.md` — the SessionStart observations digest truncates gists at the first period in a path, live on every session.
- `edge-confirmation-sha-format.md` — edge `confirmed_at_commit` carries two sha formats; the aging check compares exactly.

**How to navigate:** each file is one current-truth observation, not a log. Check
`sessions:` for the frequency trail and `salient:` for stated-forcefully emphasis —
an entry qualifying on either surfaces in the SessionStart digest. Where this
conflicts with a compass rule or a spec, the gated layer wins — this is inferred,
not curated.
