# Migration — Overview

## What this is

The knowledge layer's parts are named for what they hold, and every fact lives in exactly one place. The outcome is that anyone opening the project's knowledge layer — developer, contributor, or the assistant itself — can tell what each module is for from its name alone, and never finds two copies of the same fact quietly disagreeing.

## What it covers

- **Modules are named for what they hold, and every fact lives in one place** — the enforcement module is named for its role (a compass tells the project which way to go), not for a metaphor; the duplicated decisions record is consolidated into the project's memory as its single home, with everything that depended on it pointing there instead of holding a copy; and nothing that was already true — identifiers, filed history — changed identity along the way.

## Why it's grouped this way

This group exists because names and duplicates are where knowledge systems quietly rot: a metaphor-named module makes every newcomer pay a translation tax, and a fact stored twice will eventually be true once. Fixing both is one promise — the structure tells the truth about itself — delivered as a deliberate, verified transition rather than an accumulation of partial renames. It stands apart from the modules it touched so their descriptions can say what is, while this group records that the change was made completely and losslessly.

What deliberately does not belong here: the new capabilities that arrived alongside the reshaping — document capture, traceable origins, the rebuilt understanding layer — each of those is its own outcome.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/migration/`
- The renamed enforcement module: `../compass/`
- The single home decisions consolidated into: `../atlas/`
- The traceable origins that replaced inline copies: `../provenance/`
