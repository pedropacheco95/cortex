# Store — Overview

## What this is

The project's memory for everything the code and the specs don't say: why, who, where, what went wrong before, and how the user wants work done. It is a visible folder of plain notes that agents and people read and write alike (schema 4.0).

## What it covers

- **The agent has the project's knowledge and rules when it needs them, and keeps them current.** A short always-loaded map; one-subject files; first-class rules; facts that say how fresh they are; and a lossless move from the old hidden layout.

## Why it's grouped this way

It is one promise because each part only works with the others. A store nobody can find things in isn't used. A store that isn't kept current misleads. A new layout that loses the old facts is a regression. Specs (what the system should do) stay in their own trees. This group is about everything around them.

What deliberately does not belong here: the optional classifier layer that pushes rules at the moment they apply (Senses). It comes later and builds on the rule fields defined here.

## Related groups

- Engineering specs: `../../specs/store/`
- The old layout this replaces: `../compass/`, `../atlas/`, `../archive/`, `../insight/`, `../pulse/`
