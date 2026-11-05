# Compass — Overview

## What this is

Conventions that get enforced and mistakes that don't recur. The outcome is that a project's rules, decisions, and known problems are captured once and applied automatically, so the same mistake can't be made twice silently. This group was renamed from its brain-metaphor name at v3 — a compass tells the project which way it must go, and the name now says so.

## What it covers

- **Filed problems classify themselves and point at their fix** — daily triage of the bug ledger; human classifications never overwritten, divergences reported.

_Planned outcomes:_

- **Rules captured once** — a convention is written down a single time and then upheld everywhere.
- **Automatic enforcement** — the project's standards are applied without someone having to remember and police them.
- **Mistakes that don't repeat** — once a problem is known, it can't quietly happen again.

## Why it's grouped this way

This group exists because knowledge of "how we do things here" usually lives in people's heads and erodes the moment they're busy or gone. Capturing rules, decisions, and known problems once — and having them applied automatically — turns hard-won lessons into a standing safeguard. That durable, self-applying discipline is the outcome that belongs here.

What deliberately does not belong here is the record of why a decision was made or who made it — that history belongs to the project's memory. Since the naming-and-single-home consolidation, every decision narrative lives in exactly one place — the project's memory — and the enforcement layer points at it rather than keeping a copy that could drift.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/compass/`
- The memory of why the rules exist: `../atlas/`
- The just-in-time nudges that surface these rules: `../hooks/`
- The naming-and-single-home consolidation that shaped this group: `../migration/`
