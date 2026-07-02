# Loops — Overview

## What this is

Knowledge that compounds across autonomous runs. The outcome is that automated, unattended work builds on what previous runs learned instead of starting cold every time — and the user still reviews proposals before they land.

## What it covers

**Outcomes written:**

- **A developer benefits from what past sessions already taught** — repeated corrections and preferences surface as cited proposals instead of being said a fourth time; strictly local, strictly this project.

- **A developer can trust a change the system wrote without reading every line** — independent blind judgment on every automated change, bounded retries, nothing lands without an explicit apply.

_Planned (not yet written):_

- **Runs that remember** — each unattended run starts from what earlier ones discovered, not from scratch.
- **Learning that accumulates** — value builds up over many runs rather than resetting each time.
- **Less repeated groundwork** — automation stops re-learning the same things.
- **Proposals before they land** — the user reviews what automated work produces before it's adopted.

## Why it's grouped this way

This group exists because unattended automation that forgets everything between runs wastes effort and repeats mistakes. When each run inherits the understanding of the ones before it, the work compounds and gets steadily more useful. That carry-forward of learning across autonomous runs is the outcome that belongs here.

What deliberately does not belong here is the ongoing, interactive upkeep of knowledge during normal sessions — that's the self-maintaining outcome in its own group. This group is specifically about unattended runs and how their learning carries forward, with the user reviewing before adoption.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/loops/`
- The interactive self-maintenance that keeps knowledge honest: `../pulse/`
- The memory these runs draw on and contribute to: `../atlas/`
- The conventions that guide and constrain the runs: `../cerebrum/`
