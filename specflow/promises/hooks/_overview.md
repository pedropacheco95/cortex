# Hooks — Overview

## What this is

Just-in-time guardrails. The outcome is that the assistant gets the right nudge at the right moment — a warning before a rule-breaking change, an orientation when a session begins — without blocking the work.

## What it covers

**Outcomes written:**

- **The assistant gets the right nudge at the right moment — without blocking the work** — orientation when a session starts, a sourced warning before a rule-breaking change lands, a self-refreshing code map after every change; whisper-only, never a roadblock.

_Planned outcomes (not yet written):_

- **Guidance before reading** — a possible later refinement where the assistant gets a file's one-line summary before opening it.

## Why it's grouped this way

This group exists because knowledge only helps if it shows up when it's needed. Rules and context that sit in a document go unread; the same information delivered at the exact moment of a decision changes the outcome. Timely, non-blocking guidance is the outcome that belongs here.

What deliberately does not belong here is the content of the rules themselves or the memory behind them — those are captured elsewhere. This group is about the timing and delivery of guidance, not where the knowledge originates.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/hooks/`
- The conventions these guardrails surface: `../compass/`
- The setup that makes the assistant aware of Cortex: `../scaffolding/`
- The self-maintaining behaviour that feeds timely prompts: `../pulse/`
