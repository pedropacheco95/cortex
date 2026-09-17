---
id: core-cli.developer-sets-up-cortex-in-one-command
status: implemented
implemented_by:
  - ../../specs/core-cli/init.spec.md
  - ../../specs/core-cli/init-profile.spec.md
---

# A developer sets up Cortex on a project in one command

## Outcome

When this works, a developer points Cortex at a project, runs a single command, and walks away with a working knowledge layer: the code is mapped with a purpose line for every file, the project's conventions have a first draft, the assistant knows where everything lives from its very next session, safety nets are switched on, and the routine upkeep is staged — one named follow-up command away from live. Setup is a minute of waiting, not an afternoon of wiring.

## Who this is for

Developers and freelancers bringing a project — new or existing — under Cortex management, on their own machine.

## User Journey

1. The developer opens a terminal in the project and runs the setup command.
2. Cortex prepares its home in the project, maps the code, and fills in a description for every file — asking the assistant for help only on files the code itself doesn't explain.
3. Cortex drafts a first pass at the project's conventions from what the project already declares about itself, marked for the developer's review.
4. Cortex points the assistant at the knowledge layer, switches on the safety nets, and stages the routine upkeep's task prompts.
5. The developer reads a summary naming everything that was set up or changed, plus the one follow-up left to do: running the register command that activates the staged upkeep in the scheduling app (and the verify command that confirms it took).
6. If the project has no specifications yet, Cortex prepares the empty structure and recommends the guided way to fill it — it does not start that heavier work on its own.

## Business Rules

1. Setup never destroys existing work: whatever is already in the project is merged with or left alone, never silently overwritten. Redoing setup on an already-set-up project requires an explicit confirmation.
2. Day one ends complete: when the assistant is available to help, every mapped file gets a description before setup finishes.
3. If a part of setup cannot complete (for example, the assistant isn't available), the rest still finishes, and the summary says plainly what remains and how to finish it later.
4. Everything setup does is named in the summary — no invisible changes.
5. Setup checks its own work before declaring success.

## Success Metrics

- One command, minutes of waiting, zero manual wiring.
- The developer can list every change setup made by reading the summary alone.
- Re-running setup is safe and changes nothing that was already correct.

## Out of Scope

- Filling the specification trees with content — that is a guided, deliberate activity, recommended but never auto-started by setup.
- The ongoing upkeep itself — setup stages it and the register command activates it (`developer-runs-cortex-on-every-project`); the upkeep is its own outcome.
- Non-code project knowledge (transcripts, briefs) — ingesting those is a separate outcome.

## Notes

- Wave follow-up B (2026-09-17; `init.spec.md` Rules 3 and 10): the orientation block setup
  writes into the assistant's instructions now says two more things and one thing fewer. It
  names the sessions that coordinate, review or plan as the ones the read-first protocol
  applies to *most* — an external team's coordinator never opened the knowledge layer in
  sixteen hours because its brief said "do not read source" and nothing said the knowledge
  layer was different. It states **once**, generated from the project's own configuration,
  where durable knowledge lives (tracked, inside `.cortex/`) and that any local notes directory
  is untracked on purpose — the same team had two contradictory sentences two lines apart and
  nearly published internal notes to a public repository on the strength of the wrong one. And
  it drops the "this is not optional" insight mandate, which the project's own measurement
  showed was followed twice in fifty-five sessions. Setup also records that the repository's
  visibility is unknown until the developer says otherwise, and creates the empty identifier
  list that keeps parallel work from issuing the same rule or problem number. Business rules
  1–5 unchanged.
- The "one follow-up command" exists because the desktop app owns the real schedule registry and offers no supported way for setup to write it; setup prepares everything, and the summary names the register/verify pair that finishes the job (B-009 correction — the earlier "approve the schedule in the desktop app" confirmation described a flow the app never had).
