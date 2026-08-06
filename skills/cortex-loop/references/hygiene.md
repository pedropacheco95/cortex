# hygiene

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-pulse-hygiene` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Daily deterministic hygiene sweep. Use for the scheduled **daily** bundle's
hygiene member, or when the user says "run the hygiene loop", "hygiene sweep",
"project health check", or asks what unfinished or broken state the project has.

Invokes `cortex pulse-hygiene` and summarises
`.cortex/pulse/reports/hygiene.md`.

## Discipline

You are a thin wrapper around the deterministic Core sweep. The CLI does the
work; you run it, read it, and report it.

1. From the project root, run `cortex pulse-hygiene`.
2. Read `.cortex/pulse/reports/hygiene.md`.
3. Summarise the findings to the user, section by section (branches, PRs,
   insight drift, compass dead references, spec orphans, aged TODOs), and
   name any skipped checks and the thresholds from the report footer.

**Never mutate anything.** Do not edit compass, atlas, insight, the spec
trees, or the report itself — the report is the CLI's write, and acting on
findings is the human's decision (propose-don't-mutate, cortex-schema.md
§4.5). Mid-conversation drop-off detection is deferred; do not attempt it.
