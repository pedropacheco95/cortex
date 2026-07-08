# Anatomy — Overview

> **SUPERSEDED at v3 (build-order-v3 step 7):** the outcomes in this folder are now delivered by the insight layer (design §5.10). Every spec carries a supersession banner; retained for lineage.

## What this is

An always-current map of the code. The outcome is that a developer, or their AI assistant, can see what every file is for and how the files connect — without having to read the whole codebase first.

## What it covers

**Outcomes written:**

- **A codebase Claude can read without manual documentation** — point Cortex at the code and get a per-file map (purpose, size, governing specs) that stays current on its own, with descriptions generated only where the code doesn't already explain itself.

- **The map improves during normal work** — reading a file invites a correction only when the map's belief is wrong; corrections are captured silently and outrank bulk-generated descriptions.

_Planned outcomes (not yet written):_

- **Visible connections** — see how pieces relate and depend on one another, instead of inferring it by hand.
- **Faster orientation** — newcomers and assistants get up to speed without spelunking through everything.

## Why it's grouped this way

This group exists because understanding a codebase usually means reading it — slowly, repeatedly, and never completely. An accurate, up-to-date map removes that tax: the developer and the assistant both start from a shared understanding of what exists and how it fits together. That orientation is the outcome that belongs here.

What deliberately does not belong here is judgement about whether the code is right — rules, conventions, and known problems are a separate outcome. This group answers "what is here and how is it connected," not "is it correct" or "why was it done this way."

## Related groups

- Engineering specs that implement these outcomes: `../../specs/anatomy/`
- The conventions applied on top of the map: `../compass/`
- The memory of why the code is the way it is: `../atlas/`
- The visible, navigable view of the project: `../constellation/`
