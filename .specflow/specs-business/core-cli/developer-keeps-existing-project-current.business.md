---
id: core-cli.developer-keeps-existing-project-current
status: draft
implemented_by:
  - ../../specs/core-cli/sync.spec.md
---

# A developer keeps an existing Cortex project current

## Outcome

When this works, a project already under Cortex management never silently rots. If the assistant stops using Cortex — because the orientation block in CLAUDE.md never made it in, or was lost — one command puts it back, with nothing else in the file disturbed. If the developer upgrades the Cortex package, one command brings the project's skills, scheduled-upkeep prompts, and orientation content up to what's actually installed, and says exactly what it changed. Neither repair nor upgrade requires starting over: no re-running day-1 setup, no forcing an overwrite, no risk to the project's own accumulated knowledge.

## Who this is for

Developers running Cortex on a project that already has a `.cortex/` — set up days, months, or a package upgrade ago — who need it repaired or brought current without touching what they've built up since.

## User Journey

1. The developer notices the assistant isn't reading `.cortex/` at all — nothing in its answers reflects the project's rules or specs. They run the keep-current command. It finds CLAUDE.md missing its Cortex orientation block, writes it in, and leaves everything else in the file untouched. The next session, the assistant orients itself correctly.
2. Later, the developer upgrades the installed Cortex package and runs the same command. It brings the project's skill bundles, scheduled-upkeep prompts, and orientation templates in line with what the new package ships, and the summary names exactly what changed — which skills upgraded, which were left alone because the developer had modified them, which prompts refreshed.
3. On a project whose `.cortex/` was scaffolded under a much older major version of Cortex, the command recognises the gap is too wide to bridge safely, refuses to touch the scaffolding, and points the developer at the dedicated migration command instead of half-upgrading something it no longer fully understands.

## Business Rules

1. Repair and upgrade never require redoing setup: the command works on a project that already has `.cortex/`, and never demands a from-scratch confirmation to do its job.
2. Nothing the developer or the project's own upkeep has customized is silently overwritten — content the developer edited is left alone and named in the summary, not clobbered as part of an upgrade.
3. The project's accumulated knowledge is never in scope: rules, project memory, ingested documents, and inferred understanding are exactly as the developer left them before and after.
4. Everything the command does is named in the summary — no invisible changes, matching the same transparency day-1 setup gives.
5. A version gap too wide to bridge safely is refused, not partially applied — the developer is pointed at the dedicated upgrade path instead.

## Success Metrics

- A project with a missing or stale CLAUDE.md block is repaired in one command, with the rest of the file byte-identical to before.
- After a package upgrade, one command run brings scaffolding current and the summary alone tells the developer everything that changed.
- Re-running the command on an already-current project changes nothing.

## Out of Scope

- Bringing a project under Cortex management for the first time — that's day-1 setup (`developer-sets-up-cortex-in-one-command`).
- Bridging a major schema version gap — that's the dedicated migration path; this command only ever recognises the gap and defers to it.
- Any change to the project's rules, project memory, ingested documents, or inferred understanding — those are never this command's business.

## Notes

- The motivating case: a project under Cortex management whose CLAUDE.md carries no managed block at all, so the assistant simply never engages with `.cortex/` — until now, the only writer of that block was day-1 setup, which refuses to run again on an existing project. This command is the safe, standing repair path day-1 setup couldn't offer.
