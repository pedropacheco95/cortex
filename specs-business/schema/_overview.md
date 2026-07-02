# Schema — Overview

## What this is

A single, stable contract that everything else trusts. The outcome is that every part of the system, and every contributor, agrees on how project knowledge is shaped and named, so the pieces compose instead of drifting apart.

## What it covers

**Outcomes written:**

- **A contributor can trust the project's knowledge is consistent** — mistakes that break the agreed shape are caught and named the moment they appear, rather than piling up unnoticed.

_Planned outcomes (not yet written):_

- **One shared shape for knowledge** — everyone describes the same thing the same way, so nothing gets lost in translation between parts of the system.
- **Names that mean the same thing everywhere** — a term used in one place carries the same meaning in every other, removing ambiguity.
- **Stability you can build on** — the contract changes deliberately and visibly, so work done today still fits tomorrow.

## Why it's grouped this way

This group exists because a system that understands a codebase is only as trustworthy as the agreement underneath it. When the foundational shape of knowledge is shared and stable, every other capability — the map of the code, the captured rules, the memory of decisions — can rely on it without re-checking or re-negotiating. That shared agreement is the outcome that belongs here.

What deliberately does not belong here is anything a person actually does day to day. This group is about the agreement itself, not the tool that uses it, the map it produces, or the checks that enforce it — those are separate outcomes with their own homes.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/schema/`
- The tool people use to act on this contract: `../core-cli/`
- Proof the project is understood, built on this contract: `../constellation/`
