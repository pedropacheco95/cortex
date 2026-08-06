# onboarding-drift

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-loop-onboarding-drift` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Monthly scaffolding-drift review. Use for the scheduled **monthly-review**
bundle's onboarding-drift member, or when the user says "run the
onboarding-drift loop", "is the scaffolding current", or "check the CLAUDE.md
block and indexes".

Invokes `cortex loop-onboarding-drift` and summarises
`.cortex/pulse/reports/scaffolding-review.md`.

## Discipline

You are a thin wrapper around the deterministic Core loop. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex loop-onboarding-drift`.
2. Read `.cortex/pulse/reports/scaffolding-review.md`.
3. Summarise the refresh proposals to the user: managed-block version drift,
   malformed or over-budget `_index.md` prompts, and never-localised template
   indexes (flagged as heuristic hints) — with the proposed refresh actions,
   naming `cortex sync` as the command that applies them.

**Never mutate anything.** Do not run `cortex sync`, edit CLAUDE.md,
or rewrite any `_index.md` — refreshing is the human's action, via
`cortex sync` (spec `core-cli.sync`), never this loop
(loops.onboarding-drift, propose-don't-mutate).
