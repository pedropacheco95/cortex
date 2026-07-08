# Core CLI — Overview

## What this is

A fast, predictable command-line tool. The outcome is that a developer sets Cortex up on a project in one step and runs everyday operations — scanning, checking status, reviewing suggestions — without surprises and without waiting on an AI.

## What it covers

**Outcomes written:**

- **A developer sets up Cortex on a project in one command** — one command, minutes of waiting, a complete day-1 knowledge layer, a summary naming every change, and nothing existing destroyed.

- **A developer runs Cortex on every project without collisions** — scoped, scannable task names; each project sees only its own; one-command migration for legacy names.

_Planned outcomes (not yet written):_

- **Everyday operations that just work** — common actions complete fast and behave the same way every time.
- **No waiting on an AI for routine work** — the tool stays responsive because the basics don't depend on a model thinking first.
- **Clear, reviewable suggestions** — when Cortex proposes something, the developer sees it plainly and decides.

## Why it's grouped this way

This group exists because trust in a tool comes from speed and predictability. If setup is fiddly or routine commands feel slow or unpredictable, the developer stops reaching for it. Keeping the everyday surface fast and dependable — and independent of an AI for the basics — is the outcome that belongs here.

What deliberately does not belong here is the intelligence behind the scenes: building the map of the code, enforcing conventions, or keeping knowledge current. Those are real outcomes, but they live in their own groups. This group is purely about the dependable front door a developer uses.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/core-cli/`
- The shared contract the tool relies on: `../schema/`
- The map the tool builds and refreshes: `../anatomy/`
- The self-maintaining behaviour it surfaces: `../pulse/`
