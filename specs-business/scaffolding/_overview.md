# Scaffolding — Overview

## What this is

Cortex that actually gets used, not just installed. The outcome is that from the very first session, the assistant knows Cortex exists, knows where the project's knowledge lives, and knows when to consult it — so answers stay grounded.

## What it covers

_No business specs written yet — this tree is scaffolded structure only. Planned outcomes:_

- **Awareness from session one** — the assistant knows Cortex is present without being told each time.
- **A clear path to the knowledge** — it knows where the project's understanding lives.
- **A sense of when to look** — it consults that knowledge at the right moments instead of guessing.
- **Grounded answers** — responses draw on the project's real context rather than assumptions.

## Why it's grouped this way

This group exists because a knowledge system that isn't consulted is worthless, no matter how good it is. The gap between "installed" and "actually used" is bridged by making the assistant aware of Cortex and wiring it into how a session starts. Ensuring the knowledge is reached for, not bypassed, is the outcome that belongs here.

What deliberately does not belong here is the content of the knowledge or the moment-to-moment prompts during work — those are separate outcomes. This group is about establishing presence and the habit of consulting, not the guidance itself.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/scaffolding/`
- The just-in-time guidance delivered during work: `../hooks/`
- The tool a developer uses to set this up: `../core-cli/`
- The knowledge the assistant is pointed toward: `../anatomy/`
